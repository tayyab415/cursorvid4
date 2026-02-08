
import React, { useRef, useEffect, useState } from 'react';
import { Clip, Transition } from '../types';
import { X, Plus, Image as ImageIcon, Video, Layers, GripVertical, Mic, Wand2, Captions, Check, FlaskConical, Edit, Film, Trash2, MousePointer2, ZoomIn, ZoomOut, Minus, Magnet, Sparkles } from 'lucide-react';

interface TimelineProps {
  clips: Clip[];
  tracks: number[]; // Array of track IDs
  currentTime: number;
  onSeek: (time: number) => void;
  onDelete: (ids: string[]) => void;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onAddMediaRequest: (trackId: number) => void;
  onResize: (id: string, newDuration: number, mode: 'start' | 'end', commit: boolean) => void;
  onReorder: (sourceId: string, newStartTime: number, targetTrackId: number, commit: boolean) => void;
  onAddTrack: (position: 'top' | 'bottom') => void;
  selectedClipIds: string[];
  onTransitionRequest?: (clipA: Clip, clipB: Clip) => void;
  onCaptionRequest?: () => void;
  onOpenFoundry?: () => void;
  onEditImage?: (clip: Clip) => void; 
  isSelectionMode?: boolean; 
  onRangeChange?: (range: {start: number, end: number} | null) => void; 
  onRangeSelected?: () => void; 
  onClipEject?: (clip: Clip) => void;
  isPickingMode?: boolean; 
  onPick?: (id: string, name: string) => void; 
  transitions?: Transition[]; // New Prop
  onDeleteTransition?: (id: string) => void; // New Prop
}

export const Timeline: React.FC<TimelineProps> = ({ 
    clips, 
    tracks,
    currentTime, 
    onSeek, 
    onDelete, 
    onSelect, 
    onAddMediaRequest,
    onResize,
    onReorder,
    onAddTrack,
    selectedClipIds,
    onTransitionRequest,
    onCaptionRequest,
    onOpenFoundry,
    onEditImage,
    isSelectionMode = false,
    onRangeChange,
    onRangeSelected,
    onClipEject,
    isPickingMode = false,
    onPick,
    transitions = [],
    onDeleteTransition
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // ZOOM STATE
  const [zoomLevel, setZoomLevel] = useState(1);
  const pxPerSec = 40 * zoomLevel;
  
  // SNAP STATE
  const [isSnappingEnabled, setIsSnappingEnabled] = useState(true);

  const [dragState, setDragState] = useState<{
      type: 'move' | 'resize';
      clipId: string;
      startX: number;
      originalStartTime: number;
      originalDuration: number;
      originalTrackId: number;
      currentStartTime: number; 
      currentDuration: number;  
      currentTrackId: number;   
      resizeMode?: 'start' | 'end';
  } | null>(null);

  const [snapLineX, setSnapLineX] = useState<number | null>(null);
  const [hoveredGap, setHoveredGap] = useState<{ trackId: number, index: number } | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<number | null>(null);
  const [isEjectCandidate, setIsEjectCandidate] = useState(false); 

  // Range Selection State
  const [selectionDrag, setSelectionDrag] = useState<{startX: number, currentX: number} | null>(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);

  useEffect(() => {
    if (containerRef.current && !dragState && !isSelectionMode) {
        // Auto-scroll logic if needed
    }
  }, [currentTime, dragState, isSelectionMode]);

  // Handle Selection Mode logic
  useEffect(() => {
    if (!isSelectionMode) {
      setSelectionDrag(null);
      setIsDraggingRange(false);
      if (onRangeChange) onRangeChange(null);
      return;
    }
  }, [isSelectionMode]);

  const getSnapState = (
      candidateTime: number, 
      clips: Clip[], 
      ignoreId: string, 
      currentTime: number,
      scale: number = pxPerSec,
      thresholdPx: number = 20, 
      enabled: boolean = true
  ) => {
      if (!enabled) return { time: candidateTime, isSnapped: false };

      const threshold = thresholdPx / scale;
      const points = [0, currentTime];
      clips.forEach(c => {
          if (c.id === ignoreId) return;
          points.push(c.startTime);
          points.push(c.startTime + c.duration);
      });
      
      let snappedTime = candidateTime;
      let isSnapped = false;
      let minDiff = threshold;

      points.forEach(p => {
          const diff = Math.abs(p - candidateTime);
          if (diff < minDiff) {
              minDiff = diff;
              snappedTime = p;
              isSnapped = true;
          }
      });
      return { time: snappedTime, isSnapped };
  }

  useEffect(() => {
      if (!dragState) return;

      const handleMouseMove = (e: MouseEvent) => {
          if (!dragState) return;
          
          if (dragState.type === 'move' && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              if (e.clientY < rect.top - 50) {
                  setIsEjectCandidate(true);
              } else {
                  setIsEjectCandidate(false);
              }
          }

          const deltaX = e.clientX - dragState.startX;
          const deltaSeconds = deltaX / pxPerSec; 

          if (dragState.type === 'move') {
              let rawNewStart = dragState.originalStartTime + deltaSeconds;
              
              const snapStart = getSnapState(rawNewStart, clips, dragState.clipId, currentTime, pxPerSec, 20, isSnappingEnabled);
              const rawNewEnd = rawNewStart + dragState.originalDuration;
              const snapEnd = getSnapState(rawNewEnd, clips, dragState.clipId, currentTime, pxPerSec, 20, isSnappingEnabled);

              let finalNewStart = rawNewStart;

              if (snapStart.isSnapped) {
                  finalNewStart = snapStart.time;
                  setSnapLineX(snapStart.time * pxPerSec);
              } else if (snapEnd.isSnapped) {
                  finalNewStart = snapEnd.time - dragState.originalDuration;
                  setSnapLineX(snapEnd.time * pxPerSec);
              } else {
                  setSnapLineX(null);
              }

              finalNewStart = Math.max(0, finalNewStart);
              
              setDragState(prev => prev ? {
                  ...prev,
                  currentStartTime: finalNewStart,
                  currentTrackId: dragOverTrackId ?? prev.originalTrackId
              } : null);

          } else if (dragState.type === 'resize' && dragState.resizeMode) {
              let newDuration = dragState.originalDuration;
              let newStartTime = dragState.originalStartTime;
              
              if (dragState.resizeMode === 'end') {
                  const rawNewEnd = dragState.originalStartTime + dragState.originalDuration + deltaSeconds;
                  const snap = getSnapState(rawNewEnd, clips, dragState.clipId, currentTime, pxPerSec, 20, isSnappingEnabled);
                  if (snap.isSnapped) {
                      newDuration = snap.time - dragState.originalStartTime;
                      setSnapLineX(snap.time * pxPerSec);
                  } else {
                      newDuration = dragState.originalDuration + deltaSeconds;
                      setSnapLineX(null);
                  }
                  newDuration = Math.max(0.1, newDuration);
              } else {
                  const rawNewStart = dragState.originalStartTime + deltaSeconds;
                  const snap = getSnapState(rawNewStart, clips, dragState.clipId, currentTime, pxPerSec, 20, isSnappingEnabled);
                  
                  let effectiveStart = rawNewStart;
                  if (snap.isSnapped) {
                      effectiveStart = snap.time;
                      setSnapLineX(snap.time * pxPerSec);
                  } else {
                      setSnapLineX(null);
                  }
                  const timeDiff = effectiveStart - dragState.originalStartTime;
                  newStartTime = effectiveStart;
                  newDuration = Math.max(0.1, dragState.originalDuration - timeDiff);
              }
              
              setDragState(prev => prev ? {
                  ...prev,
                  currentDuration: newDuration,
                  currentStartTime: newStartTime
              } : null);
          }
      };

      const handleMouseUp = (e: MouseEvent) => {
        if (dragState) {
             if (dragState.type === 'move') {
                 if (isEjectCandidate && onClipEject) {
                     const clip = clips.find(c => c.id === dragState.clipId);
                     if (clip) onClipEject(clip);
                 } else {
                     onReorder(dragState.clipId, dragState.currentStartTime, dragState.currentTrackId, true);
                 }
             } else if (dragState.type === 'resize' && dragState.resizeMode) {
                 onResize(dragState.clipId, dragState.currentDuration, dragState.resizeMode, true);
             }
        }
        setDragState(null);
        setSnapLineX(null);
        setDragOverTrackId(null);
        setIsEjectCandidate(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
      };
  }, [dragState, onResize, onReorder, clips, currentTime, dragOverTrackId, isEjectCandidate, onClipEject, pxPerSec, isSnappingEnabled]);

  const totalDuration = clips.reduce((acc, clip) => Math.max(acc, clip.startTime + clip.duration), 0);
  const markers: number[] = [];
  const interval = 5;
  const endMarker = Math.max(Math.ceil(totalDuration / interval) * interval + interval, 30);
  for (let t = 0; t <= endMarker; t += interval) markers.push(t);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (isPickingMode) return;

      if (isSelectionMode && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const startX = e.clientX - rect.left;
          setSelectionDrag({ startX, currentX: startX });
          setIsDraggingRange(true);
          
          const handleSelectionMove = (moveEvent: MouseEvent) => {
              const currentX = moveEvent.clientX - rect.left;
              setSelectionDrag(prev => prev ? { ...prev, currentX } : null);
              
              if (onRangeChange) {
                  const s = Math.min(startX, currentX) / pxPerSec;
                  const e = Math.max(startX, currentX) / pxPerSec;
                  onRangeChange({ start: Math.max(0, s), end: Math.max(0, e) });
              }
          };

          const handleSelectionUp = () => {
              document.removeEventListener('mousemove', handleSelectionMove);
              document.removeEventListener('mouseup', handleSelectionUp);
              setIsDraggingRange(false);
              if (onRangeSelected) onRangeSelected();
          };

          document.addEventListener('mousemove', handleSelectionMove);
          document.addEventListener('mouseup', handleSelectionUp);
          return;
      }

      if ((e.target as HTMLElement).closest('button') || 
          (e.target as HTMLElement).closest('label') ||
          (e.target as HTMLElement).hasAttribute('data-resize-handle') ||
          (e.target as HTMLElement).hasAttribute('data-clip-body') ||
          (e.target as HTMLElement).closest('[data-transition]')
      ) return;
      
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      
      const calculateTime = (clientX: number) => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const offsetX = clientX - rect.left;
          const time = Math.max(0, offsetX / pxPerSec);
          onSeek(time);
      };
      calculateTime(e.clientX);
      
      const handleMouseMove = (moveEvent: MouseEvent) => calculateTime(moveEvent.clientX);
      const handleMouseUp = () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
  };

  const startResize = (e: React.MouseEvent, clip: Clip, mode: 'start' | 'end') => {
      if (isSelectionMode || isPickingMode) return;
      e.preventDefault();
      e.stopPropagation();
      setDragState({ 
          type: 'resize',
          clipId: clip.id, 
          resizeMode: mode, 
          startX: e.clientX, 
          originalStartTime: clip.startTime,
          originalDuration: clip.duration,
          originalTrackId: clip.trackId,
          currentStartTime: clip.startTime,
          currentDuration: clip.duration,
          currentTrackId: clip.trackId
      });
  };

  const startMove = (e: React.MouseEvent, clip: Clip) => {
      if (isSelectionMode || isPickingMode) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(clip.id, e);
      setDragState({
          type: 'move',
          clipId: clip.id,
          startX: e.clientX,
          originalStartTime: clip.startTime,
          originalDuration: clip.duration,
          originalTrackId: clip.trackId,
          currentStartTime: clip.startTime,
          currentDuration: clip.duration,
          currentTrackId: clip.trackId
      });
  };

  const selectionStart = selectionDrag ? Math.min(selectionDrag.startX, selectionDrag.currentX) : 0;
  const selectionWidth = selectionDrag ? Math.abs(selectionDrag.currentX - selectionDrag.startX) : 0;
  const selectionEnd = selectionStart + selectionWidth;

  const startTimeStr = formatTime(selectionStart / pxPerSec);
  const endTimeStr = formatTime(selectionEnd / pxPerSec);
  const durationStr = (selectionWidth / pxPerSec).toFixed(1) + 's';

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.2, 5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.2, 0.5));

  return (
    <div className={`w-full h-full bg-neutral-900 border-t border-neutral-800 flex flex-col relative select-none ${isSelectionMode ? 'cursor-crosshair' : ''}`}>
       <div className="h-8 border-b border-neutral-800 flex items-center justify-between px-2 bg-neutral-800/50">
           <div className="flex items-center gap-2">
                <button disabled={isSelectionMode || isPickingMode} onClick={() => onAddTrack('top')} className="flex items-center gap-1 text-[10px] bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-2 py-0.5 rounded text-neutral-300 hover:text-white transition-colors disabled:opacity-50">
                    <Layers size={10} /> Add Track Above
                </button>
                <button disabled={isSelectionMode || isPickingMode} onClick={() => onAddTrack('bottom')} className="flex items-center gap-1 text-[10px] bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-2 py-0.5 rounded text-neutral-300 hover:text-white transition-colors disabled:opacity-50">
                    <Layers size={10} /> Add Track Below
                </button>
                <div className="w-px h-4 bg-neutral-700 mx-1" />
                <button disabled={isSelectionMode || isPickingMode} onClick={onCaptionRequest} className="flex items-center gap-1.5 text-[10px] bg-purple-900/30 hover:bg-purple-900/50 border border-purple-500/30 px-2 py-0.5 rounded text-purple-200 hover:text-white transition-colors disabled:opacity-50">
                    <Mic size={10} /> Generate Captions
                </button>
                <button disabled={isSelectionMode || isPickingMode} onClick={onOpenFoundry} className="flex items-center gap-1.5 text-[10px] bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-500/30 px-2 py-0.5 rounded text-indigo-200 hover:text-white transition-colors disabled:opacity-50">
                    <FlaskConical size={10} /> Asset Foundry
                </button>
           </div>
           <div className="flex items-center gap-3">
               <div className="flex items-center gap-1 bg-neutral-800 rounded p-0.5 border border-neutral-700">
                   <button 
                       onClick={() => setIsSnappingEnabled(p => !p)} 
                       className={`p-1 rounded transition-colors ${isSnappingEnabled ? 'text-blue-400 bg-blue-400/10' : 'text-neutral-500 hover:text-neutral-300'}`} 
                       title="Toggle Magnetic Snap"
                   >
                       <Magnet size={10} />
                   </button>
                   <div className="w-px h-3 bg-neutral-700 mx-0.5" />
                   <button onClick={handleZoomOut} className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white transition-colors" title="Zoom Out"><Minus size={10} /></button>
                   <span className="text-[9px] text-neutral-500 w-8 text-center font-mono">{(zoomLevel * 100).toFixed(0)}%</span>
                   <button onClick={handleZoomIn} className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white transition-colors" title="Zoom In"><Plus size={10} /></button>
               </div>
               <span className="text-[10px] text-neutral-500 font-mono">Total: {formatTime(totalDuration)}</span>
           </div>
       </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto scroll-smooth relative custom-scrollbar">
        {isEjectCandidate && (
            <div className="fixed top-14 left-0 right-80 h-32 z-[200] bg-red-500/20 border-b border-red-500/50 flex items-center justify-center pointer-events-none backdrop-blur-sm animate-in fade-in">
                <span className="text-red-200 font-bold uppercase tracking-widest flex items-center gap-2">
                    <Trash2 size={20} /> Release to Stash in Workspace
                </span>
            </div>
        )}
        <div className="min-w-max relative min-h-full pb-8" ref={containerRef} onMouseDown={handleMouseDown}>
            
            {/* PICKING OVERLAY */}
            {isPickingMode && (
                <div className="absolute inset-0 z-[100] pointer-events-none bg-blue-900/10"></div>
            )}

            {/* SELECTION OVERLAY LAYER */}
            {isSelectionMode && (
                <div className="absolute inset-0 z-[100] pointer-events-none">
                     <div className="absolute top-0 bottom-0 bg-black/60 backdrop-grayscale transition-all duration-75 ease-out" style={{ left: 0, width: `${selectionStart}px` }} />
                     <div className="absolute top-0 bottom-0 right-0 bg-black/60 backdrop-grayscale transition-all duration-75 ease-out" style={{ left: `${selectionEnd}px` }} />
                     {selectionDrag && (
                         <div className="absolute top-0 bottom-8 border-x-2 border-yellow-400 bg-yellow-400/10 shadow-[0_0_20px_rgba(250,204,21,0.2)]" style={{ left: `${selectionStart}px`, width: `${selectionWidth}px` }}>
                            <div className="absolute -top-6 left-0 flex flex-col items-center -translate-x-1/2"><span className="bg-yellow-400 text-black text-[9px] font-bold px-1 rounded-sm">{startTimeStr}</span><div className="h-2 w-px bg-yellow-400" /></div>
                            <div className="absolute -top-6 right-0 flex flex-col items-center translate-x-1/2"><span className="bg-yellow-400 text-black text-[9px] font-bold px-1 rounded-sm">{endTimeStr}</span><div className="h-2 w-px bg-yellow-400" /></div>
                            {selectionWidth > 40 && (<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><span className="bg-black/80 text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded-full text-[10px] font-mono font-bold shadow-xl backdrop-blur-sm">{durationStr}</span></div>)}
                            <div className="absolute top-0 bottom-0 left-0 w-px bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]" /><div className="absolute top-0 bottom-0 right-0 w-px bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
                         </div>
                     )}
                     {!selectionDrag && (<div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]"><div className="bg-neutral-900 border border-neutral-700 text-neutral-200 px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 animate-pulse"><div className="w-2 h-2 rounded-full bg-yellow-500" /><span className="text-xs font-medium">Click and drag to select range</span></div></div>)}
                </div>
            )}

            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-50 pointer-events-none" style={{ left: `${currentTime * pxPerSec}px` }}>
                <div className="absolute -top-1.5 -left-[4px] w-2.5 h-2.5 bg-red-500 rotate-45 border border-red-600 shadow-sm" />
                <div className="absolute top-0 bottom-0 left-0 right-0 bg-red-500/20 w-px blur-[1px]" />
            </div>

            {snapLineX !== null && (<div className="absolute top-0 bottom-0 w-px bg-yellow-400 z-[60] pointer-events-none shadow-[0_0_8px_rgba(250,204,21,0.8)]" style={{ left: `${snapLineX}px` }} />)}

            <div className={`flex flex-col py-4 gap-2 transition-opacity duration-300 ${isSelectionMode ? 'opacity-100' : 'opacity-100'}`}>
                {[...tracks].reverse().map((trackId) => {
                    const trackClips = clips.filter(c => c.trackId === trackId).sort((a, b) => a.startTime - b.startTime);
                    const trackTransitions = transitions.filter(t => t.trackId === trackId);
                    const isTrackDragOver = dragOverTrackId === trackId;
                    
                    return (
                        <div key={trackId} className="relative" onMouseEnter={() => dragState?.type === 'move' && setDragOverTrackId(trackId)}>
                            <div className="absolute left-2 -top-3 text-[9px] font-bold text-neutral-600 uppercase tracking-widest pointer-events-none z-10">Track {trackId + 1}</div>
                            <div className={`h-24 w-full relative transition-colors ${isTrackDragOver ? 'bg-blue-900/10' : 'bg-neutral-800/20'} border-y border-neutral-800/30`} style={{ minWidth: `${(endMarker + 10) * pxPerSec}px` }}>
                                {trackClips.map((clip, index) => {
                                    const isDraggingThis = dragState?.clipId === clip.id;
                                    const isActive = currentTime >= clip.startTime && currentTime < (clip.startTime + clip.duration);
                                    const isSelected = selectedClipIds.includes(clip.id);
                                    const isAudio = clip.type === 'audio';
                                    const isText = clip.type === 'text';
                                    const isImage = clip.type === 'image';

                                    const displayStart = isDraggingThis ? dragState.currentStartTime : clip.startTime;
                                    const displayDuration = isDraggingThis ? dragState.currentDuration : clip.duration;
                                    
                                    if (isDraggingThis && trackId !== dragState.currentTrackId) return null;
                                    
                                    let bgClass = '';
                                    let icon = null;
                                    if (isAudio) {
                                        bgClass = isSelected ? 'bg-orange-500/50' : isActive ? 'bg-orange-500/40' : 'bg-orange-500/20 border-orange-500/30 hover:bg-orange-600/30';
                                        icon = <Mic size={10} className="text-orange-300" />;
                                    } else if (isText) {
                                        bgClass = isSelected ? 'bg-emerald-500/50' : isActive ? 'bg-emerald-500/40' : 'bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-600/30';
                                        icon = <Captions size={10} className="text-emerald-300" />;
                                    } else {
                                        bgClass = isSelected ? 'bg-blue-600/50' : isActive ? 'bg-blue-600/40' : 'bg-blue-600/20 border-blue-500/30 hover:bg-blue-600/30';
                                        icon = isImage ? <ImageIcon size={10} className="text-purple-300" /> : <Video size={10} className="text-blue-300" />;
                                    }

                                    // Special styling for Pick Mode
                                    if (isPickingMode) {
                                        bgClass = 'bg-neutral-700/50 hover:bg-blue-600/80 border-dashed border-blue-400/50 cursor-crosshair z-[110]';
                                    }

                                    return (
                                        <React.Fragment key={clip.id}>
                                            <div
                                                data-clip-body
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isPickingMode && onPick) {
                                                        onPick(clip.id, clip.title);
                                                        return;
                                                    }
                                                }}
                                                onMouseDown={(e) => startMove(e, clip)}
                                                className={`group absolute top-1 bottom-1 rounded-md flex flex-col justify-between p-2 transition-all duration-0 ease-linear border overflow-hidden ${isPickingMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} ${bgClass} ${isSelected ? 'border-white ring-2 ring-white/50 z-20' : 'z-10'}`}
                                                style={{ left: `${displayStart * pxPerSec}px`, width: `${displayDuration * pxPerSec}px`, boxShadow: isDraggingThis ? '0 4px 12px rgba(0,0,0,0.5)' : undefined, opacity: isDraggingThis ? 0.9 : 1, zIndex: isDraggingThis ? 100 : undefined }}
                                            >
                                                {isPickingMode && (
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <div className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                                                            <MousePointer2 size={12} /> Add to Chat
                                                        </div>
                                                    </div>
                                                )}

                                                <div data-resize-handle className={`absolute left-0 top-0 bottom-0 w-3 cursor-w-resize hover:bg-white/20 z-40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isPickingMode ? 'hidden' : ''}`} onMouseDown={(e) => startResize(e, clip, 'start')}><div className="w-0.5 h-6 bg-white/50 rounded-full" /></div>
                                                <div data-resize-handle className={`absolute right-0 top-0 bottom-0 w-3 cursor-e-resize hover:bg-white/20 z-40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isPickingMode ? 'hidden' : ''}`} onMouseDown={(e) => startResize(e, clip, 'end')}><div className="w-0.5 h-6 bg-white/50 rounded-full" /></div>
                                                
                                                <div className="flex items-center gap-1.5 mb-1 pointer-events-none">
                                                    {icon}
                                                    <span className={`text-xs font-medium truncate ${isActive || isSelected ? 'text-white' : isText ? 'text-emerald-100' : 'text-blue-100'}`}>{clip.title}</span>
                                                </div>

                                                {/* THE ADD MOTION / EDIT BUTTON */}
                                                {isImage && isSelected && !isDraggingThis && !isPickingMode && (
                                                    <button
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onClick={(e) => { e.stopPropagation(); if(onEditImage) onEditImage(clip); }}
                                                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-green-600 hover:bg-green-500 text-white border border-green-400 shadow-lg px-3 py-1.5 rounded flex items-center gap-2 z-50 transition-transform hover:scale-105 active:scale-95"
                                                    >
                                                        <div className="flex flex-col items-center">
                                                            <div className="flex items-center gap-1">
                                                                <Edit size={10} />
                                                                <span className="text-[10px] font-bold whitespace-nowrap">Edit / Motion</span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                )}

                                                <span className={`text-[10px] pointer-events-none ${isActive || isSelected ? 'text-yellow-200' : 'text-white/50'}`}>{displayDuration.toFixed(1)}s</span>
                                                <button onClick={(e) => { e.stopPropagation(); onDelete([clip.id]); }} className={`absolute top-1 right-1 p-0.5 rounded-full bg-black/40 hover:bg-red-500 text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-30 ${isPickingMode ? 'hidden' : ''}`}><X size={10} strokeWidth={3} /></button>
                                            </div>
                                        </React.Fragment>
                                    );
                                })}

                                {/* Render Transitions */}
                                {trackTransitions.map(t => {
                                    const isActive = currentTime >= t.startTime && currentTime < t.startTime + t.duration;
                                    return (
                                        <div 
                                            key={t.id}
                                            data-transition
                                            className={`absolute top-1 bottom-1 flex items-center justify-center z-[120] rounded-sm group cursor-pointer transition-colors border-l border-r border-white/20 ${isActive ? 'bg-white/20 backdrop-blur-sm' : 'bg-purple-500/20 hover:bg-purple-500/40'}`}
                                            style={{ left: `${t.startTime * pxPerSec}px`, width: `${t.duration * pxPerSec}px` }}
                                            onClick={(e) => { e.stopPropagation(); onDeleteTransition && onDeleteTransition(t.id); }}
                                            title={`Transition: ${t.type}`}
                                        >
                                            <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden">
                                                <div className="w-full h-px bg-purple-400/50 mb-0.5"></div>
                                                <div className="w-full h-px bg-purple-400/50"></div>
                                                <Sparkles size={8} className="text-purple-300 absolute" />
                                                
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-red-900/80 transition-opacity">
                                                    <Trash2 size={8} className="text-white" />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                <button disabled={isSelectionMode || isPickingMode} onClick={() => onAddMediaRequest(trackId)} className="group absolute h-20 w-20 border-2 border-dashed border-neutral-700/50 hover:border-blue-500/50 bg-neutral-800/10 hover:bg-blue-500/5 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all z-0 top-2 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none" style={{ left: `${(trackClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0) * pxPerSec) + 20}px` }}>
                                    <div className="w-6 h-6 rounded-full bg-neutral-700 group-hover:bg-blue-500 flex items-center justify-center transition-colors"><Plus className="w-3 h-3 text-neutral-400 group-hover:text-white" strokeWidth={3} /></div>
                                    <span className="text-[9px] text-neutral-500 group-hover:text-blue-200 mt-1 font-medium">Add Media</span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="relative mt-2 h-6 border-t border-neutral-800/50 pt-1" style={{ width: `${(endMarker + 10) * pxPerSec}px` }}>
            {markers.map((time) => (
                <div key={time} className="absolute top-0 flex flex-col items-center" style={{ left: `${time * pxPerSec}px`, transform: 'translateX(-50%)' }}>
                    <div className="h-1.5 w-px bg-neutral-600 mb-1"></div>
                    <span className="text-[10px] text-neutral-500 font-mono select-none">{formatTime(time)}</span>
                </div>
            ))}
            </div>
        </div>
      </div>
    </div>
  );
};
