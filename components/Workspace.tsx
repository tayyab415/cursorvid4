
import React, { useRef, useState, useEffect } from 'react';
import { WorkspaceItem } from '../types';
import { Upload, Film, Image as ImageIcon, Music, Trash2, X, Volume2, FolderOpen, Grid, Plus, MousePointer2 } from 'lucide-react';

interface WorkspaceProps {
  isOpen: boolean;
  onClose: () => void;
  items: WorkspaceItem[];
  onImport: (files: FileList) => void;
  onDeleteItem: (id: string) => void;
  onAddMedia: () => void; 
  className?: string;
  isPickingMode?: boolean; // New Prop
  onPick?: (id: string, name: string) => void; // New Prop
}

export const Workspace: React.FC<WorkspaceProps> = ({ 
  isOpen, 
  onClose,
  items, 
  onImport, 
  onDeleteItem,
  onAddMedia,
  className,
  isPickingMode = false,
  onPick
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  
  // Selection & Preview State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<WorkspaceItem | null>(null);

  // Handle Keyboard Shortcuts (Space to Preview, Esc to Close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.code === 'Space') {
        if (selectedId && !previewItem) {
          e.preventDefault();
          const item = items.find(i => i.id === selectedId);
          if (item) setPreviewItem(item);
        } else if (previewItem) {
          e.preventDefault();
          setPreviewItem(null);
        }
      }

      if (e.code === 'Escape') {
        if (previewItem) setPreviewItem(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedId, previewItem, items]);

  // Click outside to deselect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && !(e.target as HTMLElement).closest('[data-workspace-item]')) {
        setSelectedId(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImport(e.dataTransfer.files);
    }
  };

  const handleItemDragStart = (e: React.DragEvent, item: WorkspaceItem) => {
    if (isPickingMode) {
        e.preventDefault();
        return;
    }
    e.dataTransfer.setData('application/json', JSON.stringify({
      origin: 'workspace',
      item: item
    }));
    e.dataTransfer.effectAllowed = 'copy';
    setSelectedId(item.id);
  };

  const renderThumbnail = (item: WorkspaceItem) => {
    if (item.type === 'image') {
      return <img src={item.url} className="w-full h-full object-cover" alt={item.name} />;
    }
    if (item.type === 'video') {
      return (
        <video 
          src={`${item.url}#t=0.1`} 
          className="w-full h-full object-cover" 
          muted 
          preload="metadata"
          disablePictureInPicture
        />
      );
    }
    if (item.type === 'audio') {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 transition-colors">
          <Volume2 className="w-6 h-6 text-neutral-500 mb-2" />
          <div className="flex items-center justify-center gap-0.5 opacity-50 h-4">
             {[4, 8, 3, 6, 9, 5].map((h, i) => (
               <div key={i} className="w-0.5 bg-neutral-400 rounded-full" style={{ height: `${h * 2}px` }} />
             ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div 
      className={`bg-neutral-900 flex flex-col border-r border-neutral-800 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)] overflow-hidden relative z-[160] ${className}`}
      style={{ width: isOpen ? '320px' : '0px', minWidth: isOpen ? '320px' : '0px' }}
    >
      <div className="flex flex-col h-full min-w-[320px]"> 
        
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-neutral-800 bg-neutral-900/50">
            <div className="flex items-center gap-2 text-neutral-300">
                <FolderOpen size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">Project Files</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded text-neutral-500 hover:text-white transition-colors">
                <X size={14} />
            </button>
        </div>

        {/* Upload Drop Zone / Add Media Button */}
        <div className="p-4 pb-2">
            <div 
                className={`w-full h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all group relative overflow-hidden
                ${isDraggingOver ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-800 hover:border-neutral-600 hover:bg-neutral-800/50'} 
                ${isPickingMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!isPickingMode) onAddMedia();
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Visuals */}
                <div className="p-2 rounded-full bg-neutral-800 group-hover:bg-neutral-700 transition-colors mb-2 pointer-events-none">
                    <Plus className="w-4 h-4 text-neutral-400 group-hover:text-blue-400" />
                </div>
                <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-300 pointer-events-none">Add Media / Generate</span>
                <span className="text-[9px] text-neutral-600 mt-1 pointer-events-none">or drag files here</span>
            </div>
        </div>

        {/* File Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {items.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-neutral-700 select-none">
                    <Grid className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-xs text-neutral-600">No media yet</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3 pb-20">
                    {items.map(item => {
                    const isSelected = selectedId === item.id;
                    const pickingClass = isPickingMode 
                        ? 'hover:ring-2 hover:ring-blue-500 hover:scale-[1.02] cursor-crosshair' 
                        : 'cursor-grab active:cursor-grabbing';

                    return (
                        <div 
                        key={item.id}
                        data-workspace-item
                        draggable={!isPickingMode}
                        onDragStart={(e) => handleItemDragStart(e, item)}
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if (isPickingMode && onPick) {
                                onPick(item.id, item.name);
                                return;
                            }
                            setSelectedId(item.id); 
                        }}
                        onDoubleClick={(e) => { 
                            e.stopPropagation(); 
                            if (!isPickingMode) setPreviewItem(item); 
                        }}
                        className={`
                            group relative aspect-square rounded-lg overflow-hidden bg-black border transition-all
                            ${pickingClass}
                            ${isSelected && !isPickingMode ? 'ring-2 ring-blue-500 border-transparent' : 'border-neutral-800 hover:border-neutral-600'}
                        `}
                        >
                        {renderThumbnail(item)}
                        
                        {/* Hover Overlay */}
                        {!isPickingMode && (
                            <div className={`absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2`}>
                                <div className="flex justify-end mb-auto pt-1 pr-1">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }}
                                        className="p-1 bg-black/60 hover:bg-red-500 rounded text-white/70 hover:text-white transition-colors"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Picking Overlay */}
                        {isPickingMode && (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-blue-900/40">
                                <div className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                                    <MousePointer2 size={12} /> Pick
                                </div>
                            </div>
                        )}

                        {/* Metadata Bar */}
                        <div className="absolute bottom-0 inset-x-0 bg-neutral-900/90 p-1.5 border-t border-neutral-800">
                            <p className="text-[10px] text-neutral-300 truncate font-medium">{item.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                {item.type === 'video' && <Film size={8} className="text-blue-400" />}
                                {item.type === 'image' && <ImageIcon size={8} className="text-purple-400" />}
                                {item.type === 'audio' && <Music size={8} className="text-green-400" />}
                                <span className="text-[9px] text-neutral-500 font-mono">{item.duration.toFixed(1)}s</span>
                            </div>
                        </div>
                        </div>
                    );
                    })}
                </div>
            )}
        </div>
      </div>

      {/* Preview Overlay (Attached to the side or full screen) */}
      {previewItem && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setPreviewItem(null)}
        >
          <div className="relative max-w-4xl max-h-[80vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
             {previewItem.type === 'video' && <video src={previewItem.url} controls autoPlay className="max-w-full max-h-[70vh] rounded-lg shadow-2xl" />}
             {previewItem.type === 'image' && <img src={previewItem.url} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl" alt="" />}
             {previewItem.type === 'audio' && (
                 <div className="bg-neutral-900 p-8 rounded-2xl border border-neutral-800 flex flex-col items-center gap-4">
                     <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center"><Music size={32} className="text-green-500" /></div>
                     <audio src={previewItem.url} controls autoPlay />
                 </div>
             )}
             <p className="mt-4 text-white font-medium text-lg">{previewItem.name}</p>
             <button className="mt-8 px-6 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-full text-white text-sm transition-colors" onClick={() => setPreviewItem(null)}>Close Preview</button>
          </div>
        </div>
      )}
    </div>
  );
};
