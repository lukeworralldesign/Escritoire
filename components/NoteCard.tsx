import React, { useState, useEffect } from 'react';
import { Note, ThemeColors, getCategoryStyle } from '../types';
import { reformatNoteContent } from '../services/geminiService';

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onEdit: (note: Note) => void;
  onAiError?: () => void;
  theme: ThemeColors;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, onDelete, onUpdate, onEdit, onAiError, theme }) => {
  const [isReformatting, setIsReformatting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!showDeleteConfirm) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDeleteConfirm(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showDeleteConfirm]);

  const handleExportToObsidian = async () => {
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

  const handleExportToKeep = async () => {
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

  const handleReformat = async () => {
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
        }
    } catch (e) {
        console.error("Reformatting failed", e);
        if (onAiError) onAiError();
    } finally {
        setIsReformatting(false);
    }
  };

  const handleUndo = () => {
    if (note.originalContent) {
        onUpdate(note.id, {
            content: note.originalContent,
            originalContent: undefined
        });
    }
  };

  const style = getCategoryStyle(note.category);

  return (
    <div className="masonry-item group relative">
      <div className={`${theme.key === 'pro' ? 'bg-[#1E2228]' : 'bg-[#302221]'} rounded-[1.5rem] p-5 border ${theme.surfaceBorder} overflow-hidden transition-all hover:bg-opacity-80 hover:shadow-xl hover:shadow-black/20 duration-300`}>
        
        <div className="flex justify-between items-start mb-4">
          <span 
            className="px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase shadow-sm"
            style={{ backgroundColor: style.bg, color: style.text }}
          >
            {note.category}
          </span>
          
          <div className="flex items-center gap-1">
            {note.aiStatus === 'processing' && (
               <div className={`w-2 h-2 mr-2 rounded-full ${theme.primaryBg} animate-pulse`}></div>
            )}
            
            <button
                onClick={() => onEdit(note)}
                className={`w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 ${theme.subtleText} hover:${theme.primaryText} transition-colors`}
                title="Edit Note"
            >
                <span className="material-symbols-rounded text-[18px]">edit</span>
            </button>
            
            {note.originalContent && (
                <button
                    onClick={handleUndo}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-[#334B4F] text-[#A6EEFF] hover:bg-[#4E676B] hover:shadow-md transition-all duration-300 animate-in zoom-in-50 spin-in-90 active:scale-95"
                    title="Undo AI Reformat"
                >
                    <span className="material-symbols-rounded text-[18px]">undo</span>
                </button>
            )}

            <button
                onClick={handleReformat}
                disabled={isReformatting || note.aiStatus === 'processing'}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                    isReformatting 
                        ? `${theme.primaryText} animate-pulse` 
                        : `${theme.subtleText} hover:bg-white/5 hover:${theme.primaryText}`
                }`}
                title="Reformat with Gemini"
            >
                <span className="material-symbols-rounded text-[20px]">auto_awesome</span>
            </button>

            <button 
                onClick={() => setShowDeleteConfirm(true)}
                className={`w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 ${theme.subtleText} hover:text-[#FFB4AB] transition-colors`}
                aria-label="Confirm delete"
            >
                <span className="material-symbols-rounded text-[18px]">delete</span>
            </button>
          </div>
        </div>

        <h3 className="text-xl font-bold text-[#E3E2E6] mb-2 leading-tight">
          {note.headline}
        </h3>
        
        <p className={`${theme.subtleText} text-base font-normal leading-relaxed mb-6 whitespace-pre-wrap transition-opacity duration-300 ${isReformatting ? 'opacity-50' : 'opacity-100'}`}>
          {note.content}
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
            {note.tags.map((tag, idx) => (
            <span key={idx} className={`${theme.primaryText} text-xs font-medium opacity-80`}>
                #{tag.replace(/^#+/, '')}
            </span>
            ))}
        </div>

        <div className="flex gap-2">
          <button 
            onClick={handleExportToKeep}
            className={`flex-1 py-3 px-2 rounded-full ${theme.secondaryBg} ${theme.secondaryText} text-[11px] font-bold uppercase tracking-wider ${theme.secondaryHover} transition-colors flex items-center justify-center gap-2 shadow-sm`}
          >
            <span className="material-symbols-rounded text-lg">keep</span>
            To Keep
          </button>
          <button 
            onClick={handleExportToObsidian}
            className={`flex-1 py-3 px-2 rounded-full border border-white/10 ${theme.surface} ${theme.primaryText} text-[11px] font-bold uppercase tracking-wider hover:bg-white/5 transition-colors flex items-center justify-center gap-2 shadow-sm`}
          >
            <span className="material-symbols-rounded text-lg">diamond</span>
            To Obsidian
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-sm bg-black/40 animate-in fade-in duration-200">
            <div className="bg-[#601410] w-full max-w-sm rounded-[2rem] p-8 shadow-2xl border border-[#8C1D18] animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-[#3F1111] flex items-center justify-center mb-6 text-[#FFB4AB]">
                        <span className="material-symbols-rounded text-3xl">delete</span>
                    </div>
                    <h4 className="text-2xl font-bold text-[#FFFFFF] mb-2 tracking-tight">Delete Note?</h4>
                    <p className="text-[#FFDAD6] mb-8 leading-relaxed px-4 opacity-90">
                        This record will be permanently purged from the local store. This cannot be undone.
                    </p>
                    
                    <div className="flex flex-col w-full gap-3">
                        <button 
                            onClick={() => onDelete(note.id)}
                            className="w-full py-4 rounded-full bg-[#B3261E] text-[#FFB4AB] font-bold uppercase tracking-widest text-xs hover:bg-[#FFB4AB] hover:text-[#601410] active:scale-95 transition-all shadow-lg"
                        >
                            Confirm Purge
                        </button>
                        <button 
                            onClick={() => setShowDeleteConfirm(false)}
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

export default NoteCard;