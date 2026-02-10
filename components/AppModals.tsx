
import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Play, Pause, Scissors, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Film, Image as ImageIcon, Mic, Sparkles, Keyboard } from 'lucide-react';
import { Clip } from '../types';
import { drawClipToCanvas } from '../utils/canvasDrawing';
import { formatTime } from '../utils/videoUtils';

export const TextControls = ({ values, onChange }: { values: any, onChange: (updates: any) => void }) => (
    <div className="space-y-3">
         <div className="grid grid-cols-2 gap-2">
             <div>
                 <label className="text-[10px] text-neutral-500 mb-1 block">Font</label>
                 <select value={values.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-xs focus:border-blue-500 outline-none text-white">
                     <option value="Plus Jakarta Sans">Sans Serif</option>
                     <option value="serif">Serif</option>
                     <option value="monospace">Monospace</option>
                 </select>
             </div>
             <div>
                 <label className="text-[10px] text-neutral-500 mb-1 block">Size</label>
                 <input type="number" value={values.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-xs focus:border-blue-500 outline-none text-white" />
             </div>
         </div>
         <div className="flex items-center justify-between border-y border-neutral-700/50 py-2">
             <div className="flex bg-neutral-900 rounded border border-neutral-700 p-0.5">
                 <button onClick={() => onChange({ isBold: !values.isBold })} className={`p-1.5 rounded transition-colors ${values.isBold ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}><Bold size={12} /></button>
                 <button onClick={() => onChange({ isItalic: !values.isItalic })} className={`p-1.5 rounded transition-colors ${values.isItalic ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}><Italic size={12} /></button>
                 <button onClick={() => onChange({ isUnderline: !values.isUnderline })} className={`p-1.5 rounded transition-colors ${values.isUnderline ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}><Underline size={12} /></button>
             </div>
             <div className="flex bg-neutral-900 rounded border border-neutral-700 p-0.5">
                 <button onClick={() => onChange({ align: 'left' })} className={`p-1.5 rounded transition-colors ${values.align === 'left' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}><AlignLeft size={12} /></button>
                 <button onClick={() => onChange({ align: 'center' })} className={`p-1.5 rounded transition-colors ${values.align === 'center' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}><AlignCenter size={12} /></button>
                 <button onClick={() => onChange({ align: 'right' })} className={`p-1.5 rounded transition-colors ${values.align === 'right' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}><AlignRight size={12} /></button>
             </div>
         </div>
         <div>
              <label className="text-[10px] text-neutral-500 mb-1 block">Color</label>
              <div className="flex items-center gap-2">
                  <input type="color" value={values.color} onChange={(e) => onChange({ color: e.target.value })} className="w-6 h-6 rounded cursor-pointer border-none p-0 bg-transparent" />
                  <input type="text" value={values.color} onChange={(e) => onChange({ color: e.target.value })} className="flex-1 bg-neutral-900 border border-neutral-700 rounded p-1 text-xs font-mono uppercase focus:border-blue-500 outline-none text-white" />
              </div>
         </div>
          <div>
              <label className="text-[10px] text-neutral-500 mb-1 block">Background</label>
              <div className="flex items-center gap-2 mb-1">
                  <input type="color" value={values.backgroundColor} onChange={(e) => onChange({ backgroundColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer border-none p-0 bg-transparent" />
                   <input type="range" min="0" max="1" step="0.1" value={values.backgroundOpacity} onChange={(e) => onChange({ backgroundOpacity: parseFloat(e.target.value) })} className="flex-1 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>
         </div>
    </div>
);

export const GeminiLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M16 3C16 3 16.0375 8.525 21.0625 10.9375C16.0375 13.35 16 19 16 19C16 19 15.9625 13.35 11 11C15.9625 8.525 16 3 16 3Z" fill="url(#gemini-gradient)" />
        <path d="M4 11C4 11 4.5 13.5 7 14.5C4.5 15.5 4 18 4 18C4 18 3.5 15.5 1 14.5C3.5 13.5 4 11 4 11Z" fill="url(#gemini-gradient)" />
        <defs>
            <linearGradient id="gemini-gradient" x1="1" y1="3" x2="21" y2="19" gradientUnits="userSpaceOnUse">
                <stop stopColor="#4E75F6" />
                <stop offset="1" stopColor="#E93F33" />
            </linearGradient>
        </defs>
    </svg>
);

export const RangeEditorModal = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    initialRange,
    clips,
    mediaRefs
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onConfirm: (range: { start: number, end: number }) => void;
    initialRange: { start: number, end: number };
    clips: Clip[];
    mediaRefs: React.MutableRefObject<{[key: string]: HTMLVideoElement | HTMLAudioElement | HTMLImageElement | null}>;
}) => {
    const [range, setRange] = useState(initialRange);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const duration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 10);
    const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
    const playbackTimeRef = useRef(initialRange.start);

    useEffect(() => {
        setRange(initialRange);
        playbackTimeRef.current = initialRange.start;
    }, [initialRange, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        let animationFrameId: number;
        let lastTime = performance.now();

        const loop = (time: number) => {
            const dt = (time - lastTime) / 1000;
            lastTime = time;

            if (isPlaying) {
                playbackTimeRef.current += dt;
                if (playbackTimeRef.current >= range.end) {
                    playbackTimeRef.current = range.start;
                }
            }

            const currentT = playbackTimeRef.current;
            const visibleClipIds = new Set<string>();

            clips.forEach(clip => {
                 const isVisible = currentT >= clip.startTime && currentT < clip.startTime + clip.duration;
                 if (isVisible) visibleClipIds.add(clip.id);

                 if (clip.type === 'video' || clip.type === 'audio') {
                     const el = mediaRefs.current[clip.id];
                     if (el) {
                         const mediaEl = el as HTMLMediaElement;
                         if (isVisible) {
                             const offset = currentT - clip.startTime;
                             const mediaTime = clip.sourceStartTime + offset * (clip.speed || 1);
                             if (Math.abs(mediaEl.currentTime - mediaTime) > 0.15) mediaEl.currentTime = mediaTime;
                             mediaEl.muted = false;
                             const vol = clip.volume ?? 1;
                             if (Math.abs(mediaEl.volume - vol) > 0.01) mediaEl.volume = vol;
                             if (isPlaying && mediaEl.paused) mediaEl.play().catch(() => {});
                             else if (!isPlaying && !mediaEl.paused) mediaEl.pause();
                         } else {
                             if (!mediaEl.paused) mediaEl.pause();
                             if (!mediaEl.muted) mediaEl.muted = true;
                         }
                     }
                 }
            });
            
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    const width = canvasRef.current.width;
                    const height = canvasRef.current.height;
                    ctx.clearRect(0, 0, width, height);
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, width, height);

                    const visibleClips = clips
                        .filter(c => visibleClipIds.has(c.id))
                        .sort((a, b) => a.trackId - b.trackId);

                    visibleClips.forEach(clip => {
                        if (clip.type === 'audio') return;
                        if (clip.type === 'text') {
                            drawClipToCanvas(ctx, clip, null, width, height);
                        } else {
                            let source: CanvasImageSource | null = null;
                            if (clip.type === 'video') {
                                const el = mediaRefs.current[clip.id] as HTMLVideoElement;
                                if (el) source = el;
                            } else if (clip.type === 'image') {
                                const el = mediaRefs.current[clip.id] as unknown as HTMLImageElement;
                                if (el && el.complete) {
                                    source = el;
                                } else if (clip.sourceUrl) {
                                    const img = new Image();
                                    img.src = clip.sourceUrl;
                                    if (img.complete) source = img;
                                }
                            }
                            if (source) drawClipToCanvas(ctx, clip, source, width, height);
                        }
                    });
                }
            }
            animationFrameId = requestAnimationFrame(loop);
        };
        animationFrameId = requestAnimationFrame(loop);
        return () => {
             cancelAnimationFrame(animationFrameId);
             clips.forEach(clip => {
                 if (clip.type === 'video' || clip.type === 'audio') {
                     const el = mediaRefs.current[clip.id] as HTMLMediaElement | null;
                     if (el) { el.pause(); el.muted = true; }
                 }
             });
        };
    }, [isOpen, isPlaying, range, clips, mediaRefs]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragging || !trackRef.current) return;
            e.preventDefault();
            const rect = trackRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, x / rect.width));
            const time = percentage * duration;

            if (dragging === 'start') {
                const newStart = Math.min(time, range.end - 0.5);
                setRange(prev => ({ ...prev, start: newStart }));
                playbackTimeRef.current = newStart;
            } else {
                const newEnd = Math.max(time, range.start + 0.5);
                setRange(prev => ({ ...prev, end: newEnd }));
                playbackTimeRef.current = Math.max(range.start, Math.min(playbackTimeRef.current, newEnd));
            }
        };
        const handleMouseUp = () => setDragging(null);
        if (dragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, duration, range]);

    if (!isOpen) return null;
    const startPct = (range.start / duration) * 100;
    const endPct = (range.end / duration) * 100;
    const widthPct = endPct - startPct;

    return (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
                <div className="p-4 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Scissors className="w-4 h-4 text-yellow-500" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Refine Selection</h3>
                    </div>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white"><X size={18} /></button>
                </div>
                <div className="aspect-video bg-black relative flex items-center justify-center border-b border-neutral-800">
                    <canvas ref={canvasRef} width={1280} height={720} className="w-full h-full object-contain" />
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900/80 backdrop-blur border border-neutral-700 rounded-full px-4 py-1.5 flex items-center gap-3">
                        <button onClick={() => setIsPlaying(p => !p)}>{isPlaying ? <Pause size={14} className="fill-white" /> : <Play size={14} className="fill-white" />}</button>
                    </div>
                </div>
                <div className="p-8 bg-neutral-900 select-none">
                    <div className="relative h-12 w-full" ref={trackRef}>
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2 bg-neutral-800 rounded-full overflow-hidden"><div className="h-full bg-neutral-700 w-full" /></div>
                        <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-yellow-500/50" style={{ left: `${startPct}%`, width: `${widthPct}%` }} />
                        <div className="absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize group z-10" style={{ left: `${startPct}%` }} onMouseDown={() => setDragging('start')}>
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-1 bg-neutral-800 text-white text-[10px] font-mono px-1.5 py-0.5 rounded border border-neutral-700 whitespace-nowrap">{formatTime(range.start)}</div>
                            <div className="h-full w-1 bg-yellow-500 mx-auto rounded-full group-hover:w-1.5 transition-all shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
                        </div>
                        <div className="absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize group z-10" style={{ left: `${endPct}%` }} onMouseDown={() => setDragging('end')}>
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-1 bg-neutral-800 text-white text-[10px] font-mono px-1.5 py-0.5 rounded border border-neutral-700 whitespace-nowrap">{formatTime(range.end)}</div>
                            <div className="h-full w-1 bg-yellow-500 mx-auto rounded-full group-hover:w-1.5 transition-all shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={() => onConfirm(range)} className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95"><Check size={14} strokeWidth={3} /> Confirm Selection</button>
                </div>
            </div>
        </div>
    );
};

export const GenerationApprovalModal = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    request 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    onConfirm: (params: any) => void, 
    request: { tool: string, params: any } | null 
}) => {
    if (!isOpen || !request) return null;

    const [params, setParams] = useState(request.params);

    useEffect(() => {
        setParams(request.params);
    }, [request]);

    const handleChange = (key: string, value: any) => {
        setParams(prev => ({ ...prev, [key]: value }));
    };

    const isVideo = request.tool === 'generate_video_asset';
    const isImage = request.tool === 'generate_image_asset';
    const isAudio = request.tool === 'generate_voiceover';

    const getIcon = () => {
        if (isVideo) return <Film className="w-5 h-5 text-purple-400" />;
        if (isImage) return <ImageIcon className="w-5 h-5 text-yellow-400" />;
        if (isAudio) return <Mic className="w-5 h-5 text-blue-400" />;
        return <Sparkles className="w-5 h-5 text-purple-400" />;
    };

    const getTitle = () => {
        if (isVideo) return "Generate Video Asset";
        if (isImage) return "Generate Image Asset";
        if (isAudio) return "Generate Voiceover";
        return "Generate Asset";
    };

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-neutral-800 border border-neutral-700">
                            {getIcon()}
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">{getTitle()}</h3>
                            <p className="text-[10px] text-neutral-400 uppercase tracking-wider">AI Execution Approval</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 p-6 overflow-y-auto bg-neutral-950/50">
                    <div className="max-w-xl mx-auto space-y-6">
                        {/* Common: Prompt / Text */}
                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-2">
                                {isAudio ? 'Script' : 'Prompt'}
                            </label>
                            <textarea 
                                value={isAudio ? params.text : params.prompt} 
                                onChange={(e) => handleChange(isAudio ? 'text' : 'prompt', e.target.value)}
                                className="w-full h-24 bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none transition-all text-neutral-200"
                            />
                        </div>

                        {/* Model Suggestion Banner */}
                        {params.model && (
                            <div className="bg-purple-900/10 border border-purple-500/20 rounded-lg p-3 flex items-start gap-3">
                                <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-purple-200">AI Model Suggestion</p>
                                    <p className="text-xs text-purple-300/80 mt-0.5 leading-relaxed">
                                        The planner selected <strong>{params.model}</strong> based on your intent. You can change this below.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Type Specific Controls Grid */}
                        <div className="grid grid-cols-2 gap-6 pt-2 border-t border-neutral-800">
                            {isVideo && (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-neutral-500 mb-1">Model</label>
                                        <select 
                                            value={params.model || 'veo-3.1-fast-generate-preview'} 
                                            onChange={(e) => handleChange('model', e.target.value)}
                                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500 text-white"
                                        >
                                            <option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast</option>
                                            <option value="veo-3.1-generate-preview">Veo 3.1 Quality</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-neutral-500 mb-1">Duration</label>
                                        <select 
                                            value={params.duration || 4} 
                                            onChange={(e) => handleChange('duration', Number(e.target.value))}
                                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500 text-white"
                                        >
                                            <option value={4}>4 Seconds</option>
                                            <option value={8}>8 Seconds</option>
                                        </select>
                                    </div>
                                </>
                            )}
                            {isImage && (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 mb-1">Model</label>
                                    <select 
                                        value={params.model || 'gemini-2.5-flash-image'} 
                                        onChange={(e) => handleChange('model', e.target.value)}
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500 text-white"
                                    >
                                        <option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option>
                                        <option value="gemini-3-pro-image-preview">Gemini 3 Pro</option>
                                    </select>
                                </div>
                            )}
                            {isAudio && (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 mb-1">Voice</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].map(voice => (
                                            <button 
                                                key={voice} 
                                                onClick={() => handleChange('voice', voice)} 
                                                className={`p-2 rounded border text-xs font-medium transition-all ${params.voice === voice ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600'}`}
                                            >
                                                {voice}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={() => onConfirm(params)} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-6 py-2 rounded-lg font-medium text-sm transition-all shadow-lg shadow-purple-900/20">
                        <Sparkles size={14} className="text-yellow-200" /> Confirm & Generate
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ShortcutsModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-neutral-400" />
            <h3 className="font-bold text-white text-sm uppercase tracking-wide">Keyboard Shortcuts</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-3 bg-neutral-900">
           <div className="flex justify-between items-center text-xs"><span className="text-neutral-400 font-medium">Play / Pause</span> <span className="font-mono text-white bg-neutral-800 border border-neutral-700 px-2 py-1 rounded shadow-sm">Space</span></div>
           <div className="flex justify-between items-center text-xs"><span className="text-neutral-400 font-medium">Delete Clip</span> <span className="font-mono text-white bg-neutral-800 border border-neutral-700 px-2 py-1 rounded shadow-sm">Del / Backspace</span></div>
           <div className="flex justify-between items-center text-xs"><span className="text-neutral-400 font-medium">Split Clip</span> <span className="font-mono text-white bg-neutral-800 border border-neutral-700 px-2 py-1 rounded shadow-sm">S</span></div>
           <div className="flex justify-between items-center text-xs"><span className="text-neutral-400 font-medium">Undo</span> <span className="font-mono text-white bg-neutral-800 border border-neutral-700 px-2 py-1 rounded shadow-sm">Ctrl + Z</span></div>
           <div className="flex justify-between items-center text-xs"><span className="text-neutral-400 font-medium">Redo</span> <span className="font-mono text-white bg-neutral-800 border border-neutral-700 px-2 py-1 rounded shadow-sm">Ctrl + Shift + Z</span></div>
           <div className="flex justify-between items-center text-xs"><span className="text-neutral-400 font-medium">Select Multiple</span> <span className="font-mono text-white bg-neutral-800 border border-neutral-700 px-2 py-1 rounded shadow-sm">Shift + Click</span></div>
           <div className="flex justify-between items-center text-xs"><span className="text-neutral-400 font-medium">Shortcuts Help</span> <span className="font-mono text-white bg-neutral-800 border border-neutral-700 px-2 py-1 rounded shadow-sm">?</span></div>
        </div>
      </div>
    </div>
  );
};

export const ToastContainer = ({ toasts, removeToast }: { toasts: any[], removeToast: (id: string) => void }) => (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
            <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md animate-in slide-in-from-right-full fade-in duration-300 pointer-events-auto min-w-[280px] ${t.type === 'error' ? 'bg-red-900/90 border-red-500/50 text-red-100' : 'bg-neutral-800/90 border-neutral-700 text-white'}`}>
                {t.type === 'success' && <div className="bg-green-500/20 p-1 rounded-full"><Check className="w-3.5 h-3.5 text-green-400" /></div>}
                {t.type === 'error' && <div className="bg-red-500/20 p-1 rounded-full"><X className="w-3.5 h-3.5 text-red-400" /></div>}
                {t.type === 'info' && <div className="bg-blue-500/20 p-1 rounded-full"><Sparkles className="w-3.5 h-3.5 text-blue-400" /></div>}
                <span className="text-xs font-medium">{t.message}</span>
                <button onClick={() => removeToast(t.id)} className="ml-auto opacity-50 hover:opacity-100 transition-opacity"><X size={12} /></button>
            </div>
        ))}
    </div>
);
