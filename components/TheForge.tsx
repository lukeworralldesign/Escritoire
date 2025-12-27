import React, { useState, useRef, useEffect } from 'react';
import { ThemeColors } from '../types';

interface TheForgeProps {
  onSave: (content: string) => void;
  theme: ThemeColors;
  onFocusChange?: (focused: boolean) => void;
  initialContent?: string;
  isEditing?: boolean;
  onCancelEdit?: () => void;
}

const TheForge: React.FC<TheForgeProps> = ({ 
    onSave, 
    theme, 
    onFocusChange, 
    initialContent = '', 
    isEditing = false,
    onCancelEdit 
}) => {
  const [content, setContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(initialContent);
    if (isEditing && initialContent && textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(initialContent.length, initialContent.length);
    }
  }, [initialContent, isEditing]);

  useEffect(() => {
    if (!isEditing && window.innerWidth > 768) {
       textareaRef.current?.focus();
    }
  }, [isEditing]);

  const handleFocus = () => {
    setIsFocused(true);
    if (onFocusChange) onFocusChange(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (onFocusChange) onFocusChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Intercept Enter (without Shift) to save, matching "New Note" behavior
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
    }
    if (e.key === 'Escape' && isEditing && onCancelEdit) {
        onCancelEdit();
    }
  };

  const handleSubmit = () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    
    // Call the parent save handler
    onSave(trimmedContent);
    
    if (isEditing) {
      // For edit mode, we want to "close" the interaction
      // Blur the textarea to dismiss mobile keyboards and close the focus state
      textareaRef.current?.blur();
      // App.tsx handles setEditingNoteId(null) which switches isEditing to false
    } else {
      // Clear local state immediately for instant feedback, matching "New Note" behavior
      setContent('');
      // Maintain focus for rapid-fire input
      textareaRef.current?.focus();
    }
  };

  const ringColor = isEditing ? 'ring-[#FFB74D]' : theme.focusRing;
  const buttonBg = isEditing ? 'bg-[#FFB74D]' : theme.primaryBg;
  const buttonText = isEditing ? 'text-[#4E342E]' : theme.onPrimaryText;

  // Manually handle placeholder color if dynamic class doesn't work well for placeholders
  const placeholderStyle = theme.key === 'flash' ? { '--placeholder-color': '#DFB6B1' } : { '--placeholder-color': '#8E9099' };

  return (
    <div className={`w-full mb-8 transition-all duration-500 ease-[cubic-bezier(0.05,0.7,0.1,1.0)] ${isFocused ? 'scale-[1.02]' : 'scale-100'}`}>
      <style>
        {`
          .forge-textarea::placeholder {
             color: var(--placeholder-color);
             opacity: 0.5;
          }
        `}
      </style>
      <div 
        className={`
            flex flex-col overflow-hidden
            ${theme.surface}
            rounded-[2rem] 
            transition-all duration-300
            ${isFocused || isEditing ? `ring-2 ${ringColor} shadow-xl shadow-black/30` : ''}
        `}
        style={placeholderStyle as any}
      >
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={isEditing ? "Modifying entry..." : "New note..."}
          enterKeyHint="send"
          className="w-full h-48 md:h-56 bg-transparent p-6 text-xl md:text-2xl text-[#E3E2E6] forge-textarea focus:outline-none resize-none leading-relaxed"
        />

        <div className="flex items-center justify-end px-6 pb-6 gap-4">
             {isEditing && (
                 <button 
                    onClick={onCancelEdit}
                    className="text-xs font-bold uppercase tracking-widest text-[#FFB4AB] hover:bg-[#3F1111] px-4 py-2 rounded-full transition-colors"
                 >
                     Cancel
                 </button>
             )}

             <span className={`text-xs font-medium tracking-wide ${theme.subtleText} transition-opacity duration-300 ${content.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
                {content.length} chars
             </span>

            <button
                onClick={handleSubmit}
                disabled={!content.trim()}
                className={`
                    flex items-center justify-center
                    h-14 w-14 rounded-[16px]
                    transition-all duration-300 ease-in-out
                    ${content.trim() 
                        ? `${buttonBg} ${buttonText} shadow-md hover:shadow-lg hover:scale-105 active:scale-95` 
                        : 'bg-black/20 text-white/10 cursor-not-allowed'}
                `}
            >
                {isEditing ? (
                    <span className="material-symbols-rounded text-2xl">save</span>
                ) : (
                    <span className="material-symbols-rounded text-2xl">send</span>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};

export default TheForge;