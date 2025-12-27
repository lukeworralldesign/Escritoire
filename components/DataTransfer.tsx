import React, { useRef } from 'react';
import { Note, ThemeColors } from '../types';

interface DataTransferProps {
  notes: Note[];
  onImport: (importedNotes: Note[]) => void;
  theme: ThemeColors;
  className?: string;
}

const DataTransfer: React.FC<DataTransferProps> = ({ notes, onImport, theme, className = "" }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (notes.length === 0) return;
    
    const dataStr = JSON.stringify(notes, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `escritoire-backup-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const imported = JSON.parse(content) as Note[];
        
        if (Array.isArray(imported)) {
          if (imported.length > 0 && (!imported[0].content || !imported[0].id)) {
            throw new Error("Invalid note format");
          }
          onImport(imported);
        }
      } catch (err) {
        console.error("Import failed:", err);
        alert("Failed to import notes. Please ensure the file is a valid escritoire export.");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className={`flex items-center rounded-full border border-white/5 ${theme.surface} p-1 shadow-lg transition-colors duration-500 h-12 ${className}`}>
      <button
        onClick={handleImportClick}
        className={`flex-1 flex items-center justify-center gap-2 h-full rounded-full hover:bg-white/5 active:scale-95 transition-all text-[10px] font-black uppercase tracking-[0.2em] ${theme.primaryText}`}
      >
        <span className="material-symbols-rounded text-lg">upload</span>
        IMPORT
      </button>
      
      <div className="w-[1px] h-6 bg-white/10 mx-1"></div>

      <button
        onClick={handleExport}
        disabled={notes.length === 0}
        className={`flex-1 flex items-center justify-center gap-2 h-full rounded-full hover:bg-white/5 active:scale-95 transition-all text-[10px] font-black uppercase tracking-[0.2em] ${theme.primaryText} disabled:opacity-20 disabled:cursor-not-allowed`}
      >
        <span className="material-symbols-rounded text-lg">download</span>
        EXPORT
      </button>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/json"
        className="hidden"
      />
    </div>
  );
};

export default DataTransfer;