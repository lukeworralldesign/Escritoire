
import { GoogleGenAI, Type } from "@google/genai";
import { AIReponse, ModelTier } from "../types";
// @ts-ignore
import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js for browser environment
// This prevents the library from trying to find model files on the local server
env.allowLocalModels = false;
env.useBrowserCache = true;

// Module-level state
let currentTier: ModelTier = 'flash';
let localEmbedder: any = null;

export const setModelTier = (tier: ModelTier) => {
  currentTier = tier;
};

// Initialize local embedding model for instant search
export const initLocalEmbedder = async () => {
  if (localEmbedder) return localEmbedder;
  try {
    // We force remote loading by setting env.allowLocalModels = false above.
    // This model is used for local vector search (Orama).
    localEmbedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return localEmbedder;
  } catch (e) {
    console.error("Local embedder initialization failed. This usually happens if the model CDN is unreachable or blocked.", e);
    // Return null so the app gracefully degrades to standard text search
    return null;
  }
};

export const getLocalEmbedding = async (text: string): Promise<number[] | null> => {
  try {
    const model = await initLocalEmbedder();
    if (!model) return null;
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data) as number[];
  } catch (e) {
    console.error("Local embedding generation failed", e);
    return null;
  }
};

const TAG_LIBRARY = `
Work, Personal, Urgent, To-Do, Ideas, Goals, Project, Meeting, Finance, Health, Travel, Home, Shopping, Tech, Learning, Reference, Archive, Journal, Events, Family, Friends, Career, Education, Books, Movies, Music, Art, Design, Code, Marketing, Sales, Legal, Taxes, Bills, Recipes, Fitness, Meditation, Hobbies, Gaming, News, Politics, Science, History, Geography, Languages, DIY, Maintenance, Vehicles, Pets, Garden, Important, Later, Waiting, Research, Inspiration, Review, Draft, Final, Security
`;

const getContextPDF = (): string | null => {
  try {
    return localStorage.getItem('note_forge_context_pdf');
  } catch (e) {
    console.error("Failed to retrieve context PDF", e);
    return null;
  }
};

export const getTextEmbedding = async (text: string): Promise<number[] | undefined> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.embedContent({
            model: 'text-embedding-004',
            content: text,
        });
        return response.embedding.values;
    } catch (e) {
        console.warn("Cloud embedding failed, falling back to local", e);
        const local = await getLocalEmbedding(text);
        return local || undefined;
    }
}

export const processNoteWithAI = async (content: string): Promise<AIReponse> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const pdfContext = getContextPDF();
    const modelName = currentTier === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    const embeddingPromise = getTextEmbedding(content);

    const parts: any[] = [];
    if (pdfContext) {
      parts.push({ inlineData: { mimeType: 'application/pdf', data: pdfContext } });
      parts.push({ text: `Analyze the USER NOTE in the context of the attached PDF document (Reference Manual).` });
    } else {
      parts.push({ text: `Analyze the USER NOTE.` });
    }

    parts.push({ text: `TAG LIBRARY: ${TAG_LIBRARY}` });
    parts.push({ text: `USER NOTE: "${content}"` });

    const contentPromise = ai.models.generateContent({
      model: modelName,
      contents: [{ parts }],
      config: {
        systemInstruction: `You are an automated Knowledge Engine Librarian. 
        Analyze the note and provide metadata using ONLY the provided TAG LIBRARY.
        RULES:
        - Category: Functional category (Character, Lore, Tech, Transit, Mission, or Personal).
        - Headline: MAX 5 words.
        - Tags: 3-5 tags from TAG LIBRARY.
        OUTPUT FORMAT: JSON ONLY.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            headline: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["category", "headline", "tags"]
        }
      },
    });

    const [response, embedding] = await Promise.all([contentPromise, embeddingPromise]);
    const result = JSON.parse(response.text || '{}');
    return {
      category: result.category || 'General',
      headline: result.headline || 'New Entry',
      tags: result.tags || [],
      embedding: embedding
    };
  } catch (error) {
    console.error("Processing failed:", error);
    throw error;
  }
};

export const reformatNoteContent = async (content: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const pdfContext = getContextPDF();
    const modelName = currentTier === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    const parts: any[] = [];
    if (pdfContext) {
      parts.push({ inlineData: { mimeType: 'application/pdf', data: pdfContext } });
      parts.push({ text: "Use the attached PDF as the authoritative source." });
    }
    parts.push({ text: `ORIGINAL NOTE: "${content}"` });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts }],
      config: {
        systemInstruction: `Reformat notes in authoritative, concise encyclopedic style. 
        No markdown, single paragraph. AUTHORITATIVE tone.`
      }
    });
    return response.text || content;
  } catch (error) {
    console.error("Reformat failed", error);
    throw error;
  }
};
