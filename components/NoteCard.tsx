import React, { useState, useEffect, useRef } from 'react';
import { Note, ThemeColors, getCategoryStyle } from '../types';
import { reformatNoteContent, synthesizeNoteContent } from '../services/geminiService';
import { GoogleGenAI } from "@google/genai";

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onEdit: (note: Note) => void;
  onFocus?: (note: Note) => void;
  onAiError?: () => void;
  theme: ThemeColors;
  isFocused?: boolean;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, onDelete, onUpdate, onEdit, onFocus, onAiError, theme, isFocused = false }) => {
  const [isReformatting, setIsReformatting] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  
  // Chat Lab State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused && !isChatLoading) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isFocused]);

  useEffect(() => {
    if (!showDeleteConfirm && !showUndoConfirm) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDeleteConfirm(false);
        setShowUndoConfirm(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showDeleteConfirm, showUndoConfirm]);

  const handleExportToObsidian = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const noteBody = note.content;
    const sanitizedHeadline = note.headline.replace(/[\\/:"*?<>|]/g, '').trim().substring(0, 50);
    const fileName = sanitizedHeadline || `Note-${note.id.substring(0, 8)}`;
    const obsidianUri = `obsidian://new?name=${encodeURIComponent(fileName)}&content=${encodeURIComponent(noteBody)}`;

    try {
      await navigator.clipboard.writeText(noteBody);
    } catch (e) {
      console.warn("Clipboard write failed during Obsidian export", e);
    }
    
    window.location.href = obsidianUri;
  };

  const handleExportToKeep = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const title = note.headline;
    const text = note.content;
    const fullText = `${title}\n\n${text}`;

    try {
      await navigator.clipboard.writeText(fullText);
    } catch (e) {
      console.error("Clipboard failed", e);
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: fullText,
        });
      } catch (err) {
        console.debug("Share operation cancelled or failed", err);
      }
    }
  };

  const handleReformat = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReformatting) return;
    setIsReformatting(true);
    const originalContent = note.content;
    
    try {
        const newContent = await reformatNoteContent(note.content);
        if (newContent) {
            onUpdate(note.id, { 
                content: newContent,
                originalContent: originalContent
            });
            scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (e) {
        console.error("Reformatting failed", e);
        if (onAiError) onAiError();
    } finally {
        setIsReformatting(false);
    }
  };

  const handleUndoRequest = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowUndoConfirm(true);
  };

  const confirmUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (note.originalContent) {
        onUpdate(note.id, {
            content: note.originalContent,
            originalContent: undefined
        });
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setShowUndoConfirm(false);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const history = chatMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          ...history,
          { role: 'user', parts: [{ text: userMsg }] }
        ],
        config: {
          systemInstruction: `You are a helpful Note Assistant. 
          Current Note Context:
          - Headline: ${note.headline}
          - Category: ${note.category}
          - Content: "${note.content}"
          
          Help the user expand, refine, or transform this note. 
          Focus on providing ADDITIONAL information or specific improvements. 
          DO NOT repeat the existing note content unless necessary for context. 
          No markdown, single paragraph. Authoritative, concise encyclopedic style. 
          AUTHORITATIVE tone. No em-dashes (—).`,
        }
      });

      const aiText = response.text || "I'm sorry, I couldn't generate a response.";
      setChatMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error) {
      console.error("Chat error:", error);
      setChatMessages(prev => [...prev, { role: 'model', text: "Connection error. Please ensure you are online." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleApplySuggestion = async (text: string) => {
    if (isSynthesizing) return;
    setIsSynthesizing(true);
    
    // UI Feedback: Scroll up immediately to show the "Synthesizing" overlay in the content area
    if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }

    try {
        // Build limited history context for the synthesizer to respect constraints like word counts
        const recentHistory = chatMessages
            .slice(-4) 
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
            .join("\n");

        const mergedContent = await synthesizeNoteContent(note.content, text, recentHistory);
        
        onUpdate(note.id, { 
            content: mergedContent, 
            originalContent: note.content 
        });
        
        setChatMessages(prev => [...prev, { role: 'model', text: "Integrated into note." }]);
    } catch (e) {
        console.error("Synthesis integration failed", e);
    } finally {
        setIsSynthesizing(false);
    }
  };

  const style = getCategoryStyle(note.category);

  return (
    <div className={`${isFocused ? 'w-full max-h-[90vh] flex flex-col' : 'group relative'}`}>
      <div 
        onClick={() => !isFocused && onFocus?.(note)}
        className={`
            ${theme.key === 'pro' ? 'bg-[#1E2228]' : 'bg-[#302221]'} 
            rounded-[2.5rem] p-6 border ${theme.surfaceBorder} overflow-hidden transition-all duration-300 flex flex-col
            ${isFocused ? 'shadow-2xl ring-2 ring-white/10 p-6 md:p-10 h-full' : 'cursor-pointer hover:bg-opacity-80 hover:shadow-xl hover:shadow-black/20 h-auto'}
        `}
      >
        
        {/* Header Section */}
        <div className="flex justify-between items-start mb-5 flex-shrink-0">
          <div className="flex flex-col gap-1">
            <span 
                className="px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase shadow-sm inline-block w-fit"
                style={{ backgroundColor: style.bg, color: style.text }}
            >
                {note.category}
            </span>
            {isFocused && (
                <span className={`${theme.subtleText} text-[10px] opacity-40 font-bold uppercase tracking-tighter mt-2`}>
                    {new Date(note.timestamp).toLocaleString()}
                </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {(note.aiStatus === 'processing' || isSynthesizing) && (
               <div className={`w-2.5 h-2.5 mr-2 rounded-full ${theme.primaryBg} animate-pulse`}></div>
            )}
            
            <button
                onClick={(e) => { e.stopPropagation(); onEdit(note); }}
                className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 ${theme.subtleText} hover:${theme.primaryText} transition-all active:scale-90`}
                title="Edit Note"
            >
                <span className="material-symbols-rounded text-[20px]">edit</span>
            </button>
            
            {note.originalContent && (
                <button
                    onClick={handleUndoRequest}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-[#334B4F] text-[#A6EEFF] hover:bg-[#4E676B] hover:shadow-md transition-all duration-300 animate-in zoom-in-50 spin-in-90 active:scale-90"
                    title="Undo Changes"
                >
                    <span className="material-symbols-rounded text-[20px]">undo</span>
                </button>
            )}

            <button
                onClick={handleReformat}
                disabled={isReformatting || note.aiStatus === 'processing'}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${
                    isReformatting 
                        ? `${theme.primaryText} animate-pulse` 
                        : `${theme.subtleText} hover:bg-white/5 hover:${theme.primaryText} active:scale-90`
                }`}
                title="AI Reformat"
            >
                <span className="material-symbols-rounded text-[22px]">auto_awesome</span>
            </button>

            <button 
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 ${theme.subtleText} hover:text-[#FFB4AB] transition-all active:scale-90`}
                aria-label="Confirm delete"
            >
                <span className="material-symbols-rounded text-[20px]">delete</span>
            </button>
          </div>
        </div>

        {/* Content Area - Natural Height in Grid, Scrollable in Focus */}
        <div 
          ref={scrollContainerRef}
          className={`
          ${isFocused ? 'flex-1 overflow-y-auto no-scrollbar min-h-0 px-2' : 'h-auto'} 
          pr-1 mb-4 relative
        `}>
          <h3 className={`
            ${isFocused ? 'text-3xl md:text-5xl mb-6' : 'text-xl mb-3'} 
            font-bold text-[#E3E2E6] leading-tight sticky top-0 py-1 
            ${theme.key === 'pro' ? 'bg-[#1E2228]' : 'bg-[#302221]'} 
            z-10 transition-colors tracking-tight
          `}>
            {note.headline}
          </h3>
          
          <div className="relative">
            <p className={`
                ${theme.subtleText} 
                ${isFocused ? 'text-xl md:text-2xl leading-relaxed mb-8' : 'text-base leading-normal mb-4'} 
                font-normal whitespace-pre-wrap transition-all duration-500
                ${(isReformatting || isSynthesizing) ? 'opacity-30 blur-[2px] scale-[0.99]' : 'opacity-100 scale-100'}
            `}>
                {note.content}
            </p>
            {isSynthesizing && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 bg-black/20 backdrop-blur-md p-6 rounded-3xl border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className={`w-8 h-8 rounded-full border-2 border-t-transparent ${theme.primaryText.replace('text-', 'border-')} animate-spin`}></div>
                        <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${theme.primaryText}`}>Synthesizing...</span>
                    </div>
                </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
              {note.tags.map((tag, idx) => (
              <span key={idx} className={`${theme.primaryText} text-[10px] font-black tracking-widest uppercase opacity-80 bg-white/5 px-3 py-1 rounded-full`}>
                  #{tag.replace(/^#+/, '')}
              </span>
              ))}
          </div>

          {/* Chat History Section (Focus Mode Only) */}
          {isFocused && (
            <div className="mt-8 pt-10 border-t border-white/5 space-y-8">
              <div className="flex items-center gap-3">
                 <span className={`material-symbols-rounded text-2xl ${theme.primaryText}`}>chat_bubble</span>
                 <h4 className="text-sm font-black uppercase tracking-[0.2em] text-[#E3E2E6] opacity-60">ESCRITOIRE</h4>
              </div>

              <div className="space-y-5 max-w-full">
                {chatMessages.length === 0 && (
                   <p className={`${theme.subtleText} text-base opacity-40 italic ml-1`}>Ask for expansions, research, or style transformations...</p>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                    <div className={`
                      max-w-[90%] p-5 px-6 rounded-[2rem] text-sm md:text-base leading-relaxed
                      ${msg.role === 'user' 
                        ? `${theme.secondaryBg} ${theme.secondaryText} rounded-tr-none shadow-md` 
                        : 'bg-black/40 text-[#E3E2E6] rounded-tl-none border border-white/5 shadow-xl'}
                    `}>
                      {msg.text}
                    </div>
                    {msg.role === 'model' && msg.text.length > 20 && !msg.text.includes("Integrated into note") && (
                      <button 
                        onClick={() => handleApplySuggestion(msg.text)}
                        disabled={isSynthesizing}
                        className={`mt-3 ml-2 text-[10px] font-black uppercase tracking-[0.2em] ${theme.primaryText} hover:underline flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20`}
                      >
                        <span className="material-symbols-rounded text-base">add_circle</span>
                        Commit to Note
                      </button>
                    )}
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex items-center gap-2.5 animate-pulse p-4">
                     <div className={`w-2.5 h-2.5 rounded-full ${theme.primaryBg}`}></div>
                     <div className={`w-2.5 h-2.5 rounded-full ${theme.primaryBg} delay-75`}/><div className={`w-2.5 h-2.5 rounded-full ${theme.primaryBg} delay-150`}></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Persistent Bottom Bar (Focus Mode Only) */}
        {isFocused && (
          <div className="flex-shrink-0 flex flex-col gap-5 mt-auto pt-6 border-t border-white/5">
            {/* Chat Input Group */}
            <div className="relative">
              <div className={`
                w-full bg-black/50 rounded-full flex items-center border border-white/10 
                transition-all duration-300 focus-within:border-white/30 focus-within:ring-2 ${theme.focusRing}
              `}>
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask the Escritoire..."
                  className="flex-1 bg-transparent h-16 pl-8 pr-4 text-base text-[#E3E2E6] focus:outline-none placeholder-white/20"
                />
                <div className="pr-2 py-2">
                  <button 
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isChatLoading}
                    className={`
                      w-12 h-12 rounded-full flex items-center justify-center transition-all 
                      ${chatInput.trim() ? `${theme.primaryBg} ${theme.onPrimaryText} shadow-2xl active:scale-90` : 'text-white/10'}
                    `}
                  >
                    <span className="material-symbols-rounded text-2xl">north_east</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Actions Aligned - Perfectly Rounded Pills */}
            <div className="flex gap-4">
              <button 
                onClick={handleExportToKeep}
                className={`flex-1 py-4 px-6 rounded-full ${theme.secondaryBg} ${theme.secondaryText} text-[11px] font-black uppercase tracking-[0.25em] ${theme.secondaryHover} transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95`}
              >
                <span className="material-symbols-rounded text-xl">push_pin</span>
                TO KEEP
              </button>
              <button 
                onClick={handleExportToObsidian}
                className={`flex-1 py-4 px-6 rounded-full border border-white/20 ${theme.surface} ${theme.primaryText} text-[11px] font-black uppercase tracking-[0.25em] hover:bg-white/10 transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95`}
              >
                <span className="material-symbols-rounded text-xl">diamond</span>
                TO OBSIDIAN
              </button>
            </div>
          </div>
        )}

        {/* Standard Footer Actions (Grid Mode Only) - Perfectly Rounded Pills */}
        {!isFocused && (
          <div className="flex gap-2.5 flex-shrink-0 pt-2">
            <button 
              onClick={handleExportToKeep}
              className={`flex-1 py-3 px-2 rounded-full ${theme.secondaryBg} ${theme.secondaryText} text-[10px] font-black uppercase tracking-[0.2em] ${theme.secondaryHover} transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-95`}
            >
              <span className="material-symbols-rounded text-lg">push_pin</span>
              TO KEEP
            </button>
            <button 
              onClick={handleExportToObsidian}
              className={`flex-1 py-3 px-2 rounded-full border border-white/10 ${theme.surface} ${theme.primaryText} text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/5 transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-95`}
            >
              <span className="material-symbols-rounded text-lg">diamond</span>
              TO OBSIDIAN
            </button>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 backdrop-blur-md bg-black/60 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#4a0e0b] w-full max-w-sm rounded-[3rem] p-10 shadow-2xl border border-[#8C1D18] overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-full bg-[#3F1111] flex items-center justify-center mb-8 text-[#FFB4AB]">
                        <span className="material-symbols-rounded text-4xl">delete_forever</span>
                    </div>
                    <h4 className="text-2xl font-black text-[#FFFFFF] mb-3 tracking-tight uppercase">Purge Entry?</h4>
                    <p className="text-[#FFDAD6] mb-10 leading-relaxed px-4 opacity-80 text-sm">
                        This record will be permanently wiped from the neural core.
                    </p>
                    
                    <div className="flex flex-col w-full gap-4">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                            className="w-full py-5 rounded-full bg-[#B3261E] text-white font-black uppercase tracking-[0.3em] text-[11px] hover:bg-[#FFB4AB] hover:text-[#601410] active:scale-95 transition-all shadow-2xl"
                        >
                            Confirm Purge
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
                            className="w-full py-5 rounded-full bg-transparent text-[#FFDAD6] font-black uppercase tracking-[0.3em] text-[11px] hover:bg-white/5 active:scale-95 transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {showUndoConfirm && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 backdrop-blur-md bg-black/60 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className={`${theme.key === 'pro' ? 'bg-[#1E2530]' : 'bg-[#334B4F]'} w-full max-w-sm rounded-[3rem] p-10 shadow-2xl border ${theme.surfaceBorder} overflow-hidden animate-in zoom-in-95 duration-200`}>
                <div className="flex flex-col items-center text-center">
                    <div className={`w-20 h-20 rounded-full ${theme.key === 'pro' ? 'bg-blue-900/30' : 'bg-cyan-900/30'} flex items-center justify-center mb-8 text-[#A6EEFF]`}>
                        <span className="material-symbols-rounded text-4xl">undo</span>
                    </div>
                    <h4 className="text-2xl font-black text-[#E3E2E6] mb-3 tracking-tight uppercase">Revert Changes?</h4>
                    <p className={`${theme.subtleText} mb-10 leading-relaxed px-4 opacity-80 text-sm`}>
                        Restore the original version of this entry? Current AI refinements will be discarded.
                    </p>
                    
                    <div className="flex flex-col w-full gap-4">
                        <button 
                            onClick={confirmUndo}
                            className={`w-full py-5 rounded-full ${theme.primaryBg} ${theme.onPrimaryText} font-black uppercase tracking-[0.3em] text-[11px] hover:brightness-110 active:scale-95 transition-all shadow-2xl`}
                        >
                            Confirm Revert
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowUndoConfirm(false); }}
                            className={`w-full py-5 rounded-full bg-transparent text-[#E3E2E6] font-black uppercase tracking-[0.3em] text-[11px] hover:bg-white/5 active:scale-95 transition-all`}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default NoteCard;