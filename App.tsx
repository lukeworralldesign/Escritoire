import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Note, ModelTier, ThemeColors, getCategoryStyle } from './types';
import { setModelTier as setServiceTier, getLocalEmbedding, initLocalEmbedder } from './services/geminiService';
import TheForge from './components/TheForge';
import NoteCard from './components/NoteCard';
import FidgetStar from './components/FidgetStar';
import ContextManager from './components/ContextManager';
import DataTransfer from './components/DataTransfer';
import { processNoteWithAI } from './services/geminiService';
// @ts-ignore
import { create, insert, search, remove, update } from '@orama/orama';

const LOCAL_STORAGE_KEY = 'escritoire_v1';

const THEMES: Record<ModelTier, ThemeColors> = {
  flash: {
    key: 'flash', 
    bg: '#221716', 
    surface: 'bg-[#302221]', 
    surfaceHover: 'hover:bg-[#3D2C2A]', 
    surfaceBorder: 'border-[#4E3A37]/40', 
    primaryText: 'text-[#EBDC91]', 
    primaryBg: 'bg-[#EBDC91]', 
    onPrimaryText: 'text-[#383000]', 
    secondaryBg: 'bg-[#914C45]', 
    secondaryHover: 'hover:bg-[#A65E56]', 
    secondaryText: 'text-[#FFDAD6]', 
    accentHex: '#FFB4A9', 
    focusRing: 'ring-[#EBDC91]', 
    border: 'border-[#EBDC91]', 
    subtleText: 'text-[#DFB6B1]'
  },
  pro: {
    key: 'pro', 
    bg: '#111318', 
    surface: 'bg-[#1A1C22]', 
    surfaceHover: 'hover:bg-[#252A32]', 
    surfaceBorder: 'border-[#3F4759]/40', 
    primaryText: 'text-[#D0E4FF]', 
    primaryBg: 'bg-[#D0E4FF]', 
    onPrimaryText: 'text-[#00315C]', 
    secondaryBg: 'bg-[#3F4858]', 
    secondaryHover: 'hover:bg-[#4B5669]', 
    secondaryText: 'text-[#D7E3F8]', 
    accentHex: '#A8C7FF', 
    focusRing: 'ring-[#A8C7FF]', 
    border: 'border-[#A8C7FF]', 
    subtleText: 'text-[#C2C7CF]'
  }
};

const LOGO_VARIATIONS = [
  { wght: 400, wdth: 100, slnt: 0, GRAD: 0, ROND: 0 },
  { wght: 400, wdth: 100, slnt: -10, GRAD: 0, ROND: 0 },
  { wght: 1000, wdth: 100, slnt: 0, GRAD: 0, ROND: 0 },
  { wght: 1000, wdth: 100, slnt: 0, GRAD: 100, ROND: 100 },
];

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [geminiError, setGeminiError] = useState(false);
  const [logoVarIdx, setLogoVarIdx] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showOverview, setShowOverview] = useState(false);
  const [modelTier, setModelTier] = useState<ModelTier>('flash');
  const [oramaDb, setOramaDb] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<string[] | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isReloadingEmbeddings, setIsReloadingEmbeddings] = useState(false);
  const [reloadProgress, setReloadProgress] = useState<{ current: number, total: number } | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [focusedNote, setFocusedNote] = useState<Note | null>(null);

  // Initialize Orama and Neural Model
  useEffect(() => {
    const initEngine = async () => {
      setIsIndexing(true);
      try {
        await initLocalEmbedder(); 
        const db = await create({
          schema: {
            content: 'string',
            headline: 'string',
            category: 'string',
            tags: 'string[]',
            embedding: 'vector[384]' 
          }
        });
        setOramaDb(db);
      } catch (e) {
        console.error("Engine Init Failed", e);
      } finally {
        setIsIndexing(false);
      }
    };
    initEngine();
  }, []);

  // Sync Notes to Orama
  useEffect(() => {
    if (!oramaDb || isReloadingEmbeddings) return;
    const syncNotes = async () => {
      for (const note of notes) {
        if (note.embedding && note.embedding.length === 384) {
          try {
            await insert(oramaDb, {
              id: note.id,
              content: note.content,
              headline: note.headline,
              category: note.category,
              tags: note.tags,
              embedding: note.embedding
            });
          } catch (e) {
            // Document might already exist
          }
        }
      }
    };
    syncNotes();
  }, [notes, oramaDb, isReloadingEmbeddings]);

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        setNotes(JSON.parse(saved));
      } catch (e) { console.error("Load failed", e); }
    }
    const storedTier = localStorage.getItem('note_forge_model_tier') as ModelTier;
    const validTier = ['flash', 'pro'].includes(storedTier) ? storedTier : 'flash';
    setModelTier(validTier);
    setServiceTier(validTier);
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    const theme = THEMES[modelTier];
    document.body.style.backgroundColor = theme.bg;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) metaThemeColor.setAttribute('content', theme.bg);
    setServiceTier(modelTier);
  }, [modelTier]);

  const handleNoteSave = useCallback(async (content: string) => {
    if (editingNoteId) {
      setNotes(prev => prev.map(n => n.id === editingNoteId ? { ...n, content, aiStatus: 'processing' } : n));
      const aiResult = await processNoteWithAI(content);
      const embedding = await getLocalEmbedding(content);
      setNotes(prev => prev.map(n => n.id === editingNoteId ? { ...n, ...aiResult, embedding: embedding || n.embedding, aiStatus: 'completed' } : n));
      setEditingNoteId(null);
      setEditContent('');
    } else {
      const newId = crypto.randomUUID();
      const newNote: Note = {
        id: newId, content, timestamp: Date.now(), aiStatus: 'processing', category: '...', headline: 'Analyzing...', tags: []
      };
      setNotes(prev => [newNote, ...prev]);
      try {
        const aiResult = await processNoteWithAI(content);
        const embedding = await getLocalEmbedding(content);
        setNotes(current => current.map(n => n.id === newId ? { ...n, aiStatus: 'completed', ...aiResult, embedding: embedding || undefined } : n));
      } catch {
        setGeminiError(true);
        setNotes(current => current.map(n => n.id === newId ? { ...n, aiStatus: 'error', category: 'Unsorted', headline: 'Note ' + new Date().toLocaleTimeString() } : n));
      }
    }
  }, [editingNoteId]);

  const handleReloadEmbeddings = async () => {
    if (isReloadingEmbeddings || notes.length === 0) return;
    setIsReloadingEmbeddings(true);
    setReloadProgress({ current: 0, total: notes.length });
    
    try {
      const updatedNotes = [...notes];
      for (let i = 0; i < updatedNotes.length; i++) {
        setReloadProgress({ current: i + 1, total: notes.length });
        try {
          const emb = await getLocalEmbedding(updatedNotes[i].content);
          if (emb) {
            updatedNotes[i] = { ...updatedNotes[i], embedding: emb };
          }
        } catch (e) {
          console.error(`Failed to embed note ${i}`, e);
        }
      }
      setNotes(updatedNotes);
      
      const db = await create({
        schema: {
          content: 'string', headline: 'string', category: 'string', tags: 'string[]', embedding: 'vector[384]' 
        }
      });
      setOramaDb(db);
    } catch (err) {
      console.error("Batch re-embedding failed", err);
    } finally {
      setIsReloadingEmbeddings(false);
      setTimeout(() => setReloadProgress(null), 3000);
    }
  };

  const handleImportNotes = (importedNotes: Note[]) => {
    setNotes(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const newUniqueNotes = importedNotes.filter(n => !existingIds.has(n.id));
      return [...newUniqueNotes, ...prev];
    });
  };

  const handleCloseFocus = useCallback(() => {
    setFocusedNote(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    setNoteToDelete(null);
    if (focusedNote?.id === id) {
      handleCloseFocus();
    }
  };

  useEffect(() => {
    if (!oramaDb || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const runSearch = async () => {
      const queryEmbedding = await getLocalEmbedding(searchQuery);
      const results = await search(oramaDb, {
        term: searchQuery,
        limit: 20,
        boost: { headline: 2, category: 1.5 },
        ...(queryEmbedding ? {
          vector: {
            property: 'embedding',
            value: queryEmbedding,
            similarity: 0.6 
          }
        } : {})
      });
      setSearchResults(results.hits.map((h: any) => h.id));
    };
    const timer = setTimeout(runSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, oramaDb]);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    if (searchResults) {
      return notes
        .filter(n => searchResults.includes(n.id))
        .sort((a, b) => searchResults.indexOf(a.id) - searchResults.indexOf(b.id));
    }
    return notes.filter(n => n.content.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [notes, searchQuery, searchResults]);

  const theme = THEMES[modelTier];
  const logoVar = LOGO_VARIATIONS[logoVarIdx];

  const scrollToNote = (id: string) => {
    setShowOverview(false);
    setTimeout(() => {
      const el = document.getElementById(`note-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const placeholderColorClass = modelTier === 'flash' ? 'placeholder-[#DFB6B1]' : 'placeholder-[#8E9099]';

  return (
    <div className="min-h-full pb-20 pt-safe-top transition-colors duration-500 relative overflow-x-hidden">
      <style>{`
        @keyframes fizzle-blur-in { 0% { opacity: 0; transform: scale(0.99); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes staggered-materialize { 0% { transform: translateY(16px); filter: blur(10px); opacity: 0; } 100% { transform: translateY(0); filter: blur(0px); opacity: 1; } }
        @keyframes spotlight-pop { 0% { transform: scale(0.95) translateY(10px); opacity: 0; } 100% { transform: scale(1) translateY(0); opacity: 1; } }
        .anti-alias-container { perspective: 3000px; -webkit-font-smoothing: antialiased; }
        .anti-alias-item { will-change: transform, opacity; backface-visibility: hidden; }
      `}</style>

      <header className={`pt-10 pb-6 px-5 max-w-5xl mx-auto flex items-center justify-between transition-opacity duration-400 ${isFocusMode || focusedNote ? 'opacity-10 blur-sm pointer-events-none' : 'opacity-100'}`}>
        <div className="flex flex-col">
          <h1 
            onClick={() => setLogoVarIdx(p => (p + 1) % LOGO_VARIATIONS.length)} 
            className="text-3xl md:text-5xl text-[#E3E2E6] tracking-tight cursor-pointer select-none transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ 
                fontVariationSettings: `"wght" ${logoVar.wght}, "wdth" ${logoVar.wdth}, "slnt" ${logoVar.slnt}, "GRAD" ${logoVar.GRAD}, "ROND" ${logoVar.ROND}` 
            }}
          >
            Escritoire
          </h1>
          <div className={`flex items-center gap-2 ${theme.primaryText} text-[10px] font-bold uppercase tracking-[0.2em] mt-2 opacity-60`}>
             {isIndexing || isReloadingEmbeddings ? (
                <span className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${theme.primaryBg} animate-ping`}></div> 
                    {isReloadingEmbeddings ? 'Neural Rebuild' : 'Index Initializing'}
                </span>
             ) : (
                "WRITING ASSISTANT"
             )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {notes.length > 0 && <FidgetStar sizeClass="w-8 h-8" colorClass={geminiError ? 'text-[#FFB4AB]' : theme.primaryText} />}
          <button onClick={() => setShowOverview(true)} className={`w-12 h-12 rounded-full ${theme.primaryBg} ${theme.onPrimaryText} flex items-center justify-center font-black text-lg shadow-xl transition-all active:scale-90`}>{notes.length}</button>
        </div>
      </header>

      <main className="px-5 max-w-5xl mx-auto">
        <div className={`mb-10 relative group transition-opacity duration-400 ${isFocusMode || focusedNote ? 'opacity-10 blur-sm pointer-events-none' : 'opacity-100'}`}>
          <div className={`absolute inset-y-0 left-6 flex items-center pointer-events-none ${theme.subtleText} group-focus-within:${theme.primaryText} transition-colors opacity-40`}>
            <span className="material-symbols-rounded">search</span>
          </div>
          <input 
            type="text" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            placeholder="Search knowledge..." 
            className={`w-full ${theme.surface} h-16 pl-16 pr-8 rounded-[1.5rem] text-[#E3E2E6] ${placeholderColorClass} focus:outline-none focus:ring-2 ${theme.focusRing} transition-all shadow-lg border border-white/5`} 
          />
        </div>

        <TheForge onSave={handleNoteSave} theme={theme} onFocusChange={setIsFocusMode} initialContent={editContent} isEditing={!!editingNoteId} onCancelEdit={() => setEditingNoteId(null)} />

        <div className={`mt-10 transition-all duration-400 ${isFocusMode || focusedNote ? 'opacity-10 blur-sm pointer-events-none' : 'opacity-100'}`}>
          <div className="flex items-center gap-6 mb-8">
            <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${theme.subtleText} opacity-30`}>{searchQuery ? 'Neural Matching' : 'Recent Collections'}</span>
            <div className="h-[1px] flex-1 bg-white/5"></div>
          </div>
          <div className="masonry-grid">
            {filteredNotes.map(note => (
              <div id={`note-${note.id}`} key={note.id} className="masonry-item anti-alias-item">
                <NoteCard note={note} onDelete={(id) => setNotes(p => p.filter(n => n.id !== id))} onUpdate={(id, up) => setNotes(p => p.map(n => n.id === id ? {...n, ...up} : n))} onEdit={(n) => {setEditingNoteId(n.id); setEditContent(n.content); window.scrollTo({top:0, behavior:'smooth'})}} onFocus={(n) => setFocusedNote(n)} theme={theme} isFocused={false} />
              </div>
            ))}
          </div>
        </div>
        
        <div className={`transition-all duration-400 ${isFocusMode || focusedNote ? 'opacity-10 blur-sm pointer-events-none' : 'opacity-100'}`}>
          <ContextManager modelTier={modelTier} onTierChange={setModelTier} theme={theme} />
          
          <div className="flex flex-row items-stretch justify-center gap-4 mt-8 mb-20 w-full">
            <DataTransfer notes={notes} onImport={handleImportNotes} theme={theme} className="flex-[1.5]" />

            {notes.length > 0 && (
              <div className={`p-1 flex-1 flex rounded-full border border-white/5 ${theme.surface} shadow-lg transition-colors duration-500 h-12`}>
                <button
                  onClick={handleReloadEmbeddings}
                  disabled={isReloadingEmbeddings}
                  className={`
                    w-full inline-flex items-center justify-center gap-2 h-full rounded-full
                    ${theme.primaryBg} ${theme.onPrimaryText} transition-all duration-500
                    ${isReloadingEmbeddings ? 'cursor-wait opacity-80' : 'active:scale-95 hover:brightness-110'}
                    text-[10px] font-black uppercase tracking-[0.2em] shadow-md
                  `}
                >
                  <span className={`material-symbols-rounded text-lg ${isReloadingEmbeddings ? 'animate-spin' : ''}`}>sync</span>
                  <span>
                    {isReloadingEmbeddings 
                      ? `${Math.round((reloadProgress?.current || 0) / (reloadProgress?.total || 1) * 100)}%` 
                      : 'Embeddings'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {showOverview && (
        <div 
          className="fixed inset-0 z-[9999] overflow-y-auto anti-alias-container backdrop-blur-sm" 
          style={{ 
            backgroundColor: 'rgba(0,0,0,0.6)', 
            animation: 'fizzle-blur-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards' 
          }}
        >
          <div className="max-w-5xl mx-auto px-5 w-full min-h-full flex flex-col">
            <div className="pt-10 pb-6 flex items-center justify-between flex-shrink-0">
              <div className="flex flex-col">
                <h1 
                  className="text-3xl md:text-5xl text-[#E3E2E6] tracking-tight transition-all duration-700"
                  style={{ fontVariationSettings: `"wght" ${logoVar.wght}, "wdth" 100, "slnt" 0` }}
                >
                  Escritoire-Grid
                </h1>
                <div className={`flex items-center gap-2 ${theme.primaryText} text-[10px] font-bold uppercase tracking-[0.2em] mt-2 opacity-60`}>
                  {notes.length} RECORDS INDEXED
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowOverview(false)} 
                  className={`w-12 h-12 rounded-full ${theme.surface} flex items-center justify-center text-[#E3E2E6] shadow-xl active:scale-90 border border-white/10 hover:bg-white/10 transition-all`}
                >
                  <span className="material-symbols-rounded text-2xl">close</span>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-24 mt-4">
              {notes.map((note, index) => {
                const style = getCategoryStyle(note.category);
                return (
                  <div 
                    key={note.id} 
                    onClick={() => { setShowOverview(false); setFocusedNote(note); }} 
                    className={`${theme.surface} p-5 rounded-[2.5rem] cursor-pointer border border-white/10 transition-all hover:scale-[1.02] hover:shadow-2xl hover:brightness-110 flex flex-col gap-2 h-auto min-h-[140px] shadow-2xl anti-alias-item group relative overflow-hidden`} 
                    style={{ animation: `staggered-materialize 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.015}s both` }}
                  >
                    <div className="flex justify-between items-center flex-shrink-0 relative z-10">
                      <span 
                        className="px-2 py-0.5 rounded text-[8px] uppercase font-black tracking-widest shadow-sm"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {note.category}
                      </span>
                      <button 
                          onClick={(e) => { e.stopPropagation(); setNoteToDelete(note); }}
                          className="w-6 h-6 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-black/20 transition-all"
                      >
                          <span className="material-symbols-rounded text-lg">delete</span>
                      </button>
                    </div>
                    <h3 className="text-base font-bold text-[#E3E2E6] leading-snug line-clamp-4 tracking-tight relative z-10" style={{ fontVariationSettings: '"wght" 600' }}>{note.headline}</h3>
                    <div className="mt-auto flex justify-between items-center relative z-10">
                       <div className={`w-1.5 h-1.5 rounded-full ${theme.primaryBg} opacity-30`}></div>
                       <span className="text-[9px] font-bold uppercase tracking-tighter opacity-40 text-[#E3E2E6]">{new Date(note.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {focusedNote && (
        <div 
          className="fixed inset-0 z-[10000] flex items-center justify-center p-6 backdrop-blur-2xl bg-black/40 animate-in fade-in duration-300"
          onClick={handleCloseFocus}
        >
          <div 
            className="w-full max-w-2xl relative" 
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'spotlight-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            <NoteCard 
                note={focusedNote} 
                onDelete={(id) => deleteNote(id)} 
                onUpdate={(id, up) => {
                  setNotes(p => p.map(n => n.id === id ? {...n, ...up} : n));
                  setFocusedNote(prev => prev ? {...prev, ...up} : null);
                }} 
                onEdit={(n) => { handleCloseFocus(); setEditingNoteId(n.id); setEditContent(n.content); }} 
                theme={theme} 
                isFocused={true}
            />
          </div>
        </div>
      )}

      {noteToDelete && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 backdrop-blur-md bg-black/60 animate-in fade-in duration-300">
            <div className="bg-[#601410] w-full max-w-sm rounded-[2.5rem] p-8 shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-[#8C1D18] animate-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-[#3F1111] flex items-center justify-center mb-6 text-[#FFB4AB]">
                        <span className="material-symbols-rounded text-3xl">delete</span>
                    </div>
                    <h4 className="text-2xl font-bold text-[#FFFFFF] mb-2 tracking-tight">Purge Entry?</h4>
                    <p className="text-[#FFDAD6] mb-8 leading-relaxed px-4 opacity-90">
                        "{noteToDelete.headline}" will be permanently removed from the neural store.
                    </p>
                    
                    <div className="flex flex-col w-full gap-3">
                        <button 
                            onClick={() => deleteNote(noteToDelete.id)}
                            className="w-full py-4 rounded-full bg-[#B3261E] text-[#FFB4AB] font-bold uppercase tracking-widest text-xs hover:bg-[#FFB4AB] hover:text-[#601410] active:scale-95 transition-all shadow-lg"
                        >
                            Confirm Purge
                        </button>
                        <button 
                            onClick={() => setNoteToDelete(null)}
                            className="w-full py-4 rounded-full bg-transparent text-[#FFDAD6] font-bold uppercase tracking-widest text-xs hover:bg-black/20 active:scale-95 transition-all"
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

export default App;