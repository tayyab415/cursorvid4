
import React, { useState, useRef, useEffect } from 'react';
import { Clip } from '../../types';
import { formatTime } from '../../utils/videoUtils';
import { X, Check, Play, Pause, ScanEye, ChevronLeft, ChevronRight } from 'lucide-react';

interface TimeRangePickerProps {
    totalDuration: number;
    clips: Clip[];
    mediaRefs: React.MutableRefObject<{[key: string]: HTMLVideoElement | HTMLAudioElement | HTMLImageElement | null}>;
    onConfirm: (start: number, end: number, visualEvidence: string[]) => void;
    onCancel: () => void;
}

const drawPreviewFrame = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    clips: Clip[],
    mediaRefs: any
) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const visibleClips = clips
        .filter(c => time >= c.startTime && time < c.startTime + c.duration)
        .sort((a, b) => a.trackId - b.trackId);

    visibleClips.forEach(clip => {
        if (clip.type === 'audio') return;

        const transform = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
        
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.translate(transform.x * width, transform.y * height);
        ctx.scale(transform.scale, transform.scale);
        ctx.rotate((transform.rotation * Math.PI) / 180);

        if (clip.type === 'text' && clip.text) {
            const style = clip.textStyle || { 
                fontSize: 40, color: 'white', fontFamily: 'sans-serif', 
                backgroundColor: 'black', backgroundOpacity: 0,
                isBold: false, isItalic: false, isUnderline: false, align: 'center'
            };
            ctx.font = `${style.isBold ? 'bold' : ''} ${style.fontSize}px ${style.fontFamily || 'sans-serif'}`;
            ctx.textAlign = (style.align as any) || 'center';
            ctx.textBaseline = 'middle';
            
            if (style.backgroundOpacity > 0) {
                const metrics = ctx.measureText(clip.text);
                const bgH = style.fontSize * 1.2;
                ctx.globalAlpha = style.backgroundOpacity;
                ctx.fillStyle = style.backgroundColor;
                ctx.fillRect(-metrics.width/2 - 10, -bgH/2, metrics.width + 20, bgH);
                ctx.globalAlpha = 1.0;
            }
            
            ctx.fillStyle = style.color;
            ctx.fillText(clip.text, 0, 0);
        } 
        else if (clip.type === 'video' || clip.type === 'image') {
            const el = mediaRefs.current[clip.id];
            if (el) {
                if (el instanceof HTMLVideoElement) {
                    try {
                       const aspectSrc = el.videoWidth / el.videoHeight;
                       const aspectDest = width / height;
                       let drawW, drawH;
                       if (aspectSrc > aspectDest) { drawW = width; drawH = width / aspectSrc; } 
                       else { drawH = height; drawW = height * aspectSrc; }
                       ctx.drawImage(el, -drawW/2, -drawH/2, drawW, drawH);
                    } catch(e) {}
                } else if (el instanceof HTMLImageElement) {
                    try {
                       const aspectSrc = el.naturalWidth / el.naturalHeight;
                       const aspectDest = width / height;
                       let drawW, drawH;
                       if (aspectSrc > aspectDest) { drawW = width; drawH = width / aspectSrc; } 
                       else { drawH = height; drawW = height * aspectSrc; }
                       ctx.drawImage(el, -drawW/2, -drawH/2, drawW, drawH);
                    } catch(e) {}
                }
            }
        }
        ctx.restore();
    });
};

export const TimeRangePicker: React.FC<TimeRangePickerProps> = ({ totalDuration, clips, mediaRefs, onConfirm, onCancel }) => {
    // Ensure we have a reasonable duration to work with
    const safeDuration = Math.max(totalDuration, 10);
    
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState(Math.min(5, safeDuration));
    const [previewTime, setPreviewTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isCapturing, setIsCapturing] = useState(false);
    
    const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | 'playhead' | null>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | null>(null);
    
    useEffect(() => {
        let lastTime = performance.now();
        const animate = (time: number) => {
            if (!isPlaying) {
                lastTime = time;
                requestRef.current = requestAnimationFrame(animate);
                return;
            }

            const dt = (time - lastTime) / 1000;
            lastTime = time;

            setPreviewTime(prev => {
                let next = prev + dt;
                // Loop within selection range
                if (next > end) next = start;
                if (next < start) next = start;
                return next;
            });

            // Sync video elements for preview
            clips.forEach(clip => {
                if (clip.type === 'video') {
                    const el = mediaRefs.current[clip.id] as HTMLVideoElement;
                    if (el) {
                        const targetTime = clip.sourceStartTime + (previewTime - clip.startTime) * (clip.speed || 1);
                        if (!el.paused && Math.abs(el.currentTime - targetTime) > 0.5) {
                            el.currentTime = targetTime;
                        } else if (el.paused && targetTime >= 0 && targetTime <= el.duration) {
                             el.currentTime = targetTime;
                        }
                    }
                }
            });

            requestRef.current = requestAnimationFrame(animate);
        };
        requestRef.current = requestAnimationFrame(animate);
        return () => { if (requestRef.current !== null) cancelAnimationFrame(requestRef.current); };
    }, [isPlaying, start, end, clips, mediaRefs, previewTime]); // Added previewTime to dependency to ensure updated value in loop closure if needed, though ref pattern usually handles it.

    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx || !canvasRef.current) return;
        drawPreviewFrame(ctx, canvasRef.current.width, canvasRef.current.height, previewTime, clips, mediaRefs);
    }, [previewTime, clips, mediaRefs]);

    const handleConfirm = async () => {
        setIsCapturing(true);
        setIsPlaying(false);

        const frames: string[] = [];
        const captureCount = 6; 
        const step = (end - start) / captureCount;
        const ctx = canvasRef.current?.getContext('2d');

        if (ctx && canvasRef.current) {
            for (let i = 0; i <= captureCount; i++) {
                const t = start + (step * i);
                
                await Promise.all(clips.map(async (clip) => {
                    if (clip.type === 'video' && t >= clip.startTime && t < clip.startTime + clip.duration) {
                        const el = mediaRefs.current[clip.id] as HTMLVideoElement;
                        if (el) {
                            const targetTime = clip.sourceStartTime + (t - clip.startTime) * (clip.speed || 1);
                            el.currentTime = targetTime;
                            await new Promise(r => {
                                const onSeek = () => { el.removeEventListener('seeked', onSeek); r(true); };
                                el.addEventListener('seeked', onSeek);
                                setTimeout(r, 200); 
                            });
                        }
                    }
                }));

                drawPreviewFrame(ctx, canvasRef.current.width, canvasRef.current.height, t, clips, mediaRefs);
                frames.push(canvasRef.current.toDataURL('image/jpeg', 0.7));
            }
        }

        setIsCapturing(false);
        onConfirm(start, end, frames);
    };

    const handleMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'playhead') => {
        e.stopPropagation();
        setDraggingHandle(type);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!draggingHandle || !trackRef.current) return;
            
            const rect = trackRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, x / rect.width));
            const time = pct * safeDuration;

            if (draggingHandle === 'start') {
                const newStart = Math.min(time, end - 0.5);
                setStart(Math.max(0, newStart));
                setPreviewTime(newStart); 
            } else if (draggingHandle === 'end') {
                const newEnd = Math.max(time, start + 0.5);
                setEnd(Math.min(safeDuration, newEnd));
                setPreviewTime(newEnd); // Snap preview to end while dragging for visibility
            } else if (draggingHandle === 'playhead') {
                setPreviewTime(time);
                // Pause while scrubbing
                setIsPlaying(false);
            }
        };

        const handleMouseUp = () => {
            setDraggingHandle(null);
        };

        if (draggingHandle) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingHandle, start, end, safeDuration]);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onCancel} />
            
            <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
                    <div className="flex items-center gap-3">
                        <ScanEye className="w-5 h-5 text-purple-400" />
                        <div>
                            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Select Context</h3>
                            <p className="text-[10px] text-neutral-400">Define timeline segment for AI analysis</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Preview Area */}
                <div className="flex-1 bg-black relative flex flex-col items-center justify-center p-8">
                    <div className="relative w-full aspect-video max-h-[400px] bg-neutral-900 rounded-lg overflow-hidden border border-neutral-800 shadow-2xl">
                        <canvas ref={canvasRef} width={1280} height={720} className="w-full h-full object-contain" />
                        
                        {/* Controls Overlay */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2 bg-neutral-900/90 backdrop-blur border border-neutral-700 rounded-full shadow-xl">
                            <button 
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="w-8 h-8 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all"
                            >
                                {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                            </button>
                            <div className="text-xs font-mono text-neutral-300 w-24 text-center">
                                {formatTime(previewTime)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Timeline Strip */}
                <div className="p-6 bg-neutral-900 border-t border-neutral-800 select-none">
                    <div className="relative h-14 bg-neutral-950 rounded-lg border border-neutral-800 mb-6" ref={trackRef}>
                        {/* Background Clips Visualization */}
                        {clips.map(c => (
                            <div 
                                key={c.id} 
                                className="absolute top-2 bottom-2 bg-neutral-800/60 rounded-sm border border-neutral-700/50 pointer-events-none"
                                style={{ 
                                    left: `${(c.startTime / safeDuration) * 100}%`, 
                                    width: `${(c.duration / safeDuration) * 100}%` 
                                }}
                            />
                        ))}
                        
                        {/* Selection Zone */}
                        <div 
                            className="absolute top-0 bottom-0 bg-purple-500/20 border-x-0 border-purple-500 transition-all"
                            style={{
                                left: `${(start / safeDuration) * 100}%`,
                                width: `${((end - start) / safeDuration) * 100}%`
                            }}
                        >
                            {/* Drag Handles */}
                            <div 
                                className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-ew-resize flex flex-col justify-center items-center group z-20"
                                onMouseDown={(e) => handleMouseDown(e, 'start')}
                            >
                                <div className="h-8 w-1.5 bg-purple-500 rounded-full group-hover:bg-white transition-colors shadow-lg" />
                                <div className="absolute -top-6 bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {formatTime(start)}
                                </div>
                            </div>

                            <div 
                                className="absolute top-0 bottom-0 -right-1.5 w-3 cursor-ew-resize flex flex-col justify-center items-center group z-20"
                                onMouseDown={(e) => handleMouseDown(e, 'end')}
                            >
                                <div className="h-8 w-1.5 bg-purple-500 rounded-full group-hover:bg-white transition-colors shadow-lg" />
                                <div className="absolute -top-6 bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {formatTime(end)}
                                </div>
                            </div>
                        </div>
                        
                        {/* Playhead */}
                        <div 
                            className="absolute top-0 bottom-0 w-4 -ml-2 z-30 cursor-grab active:cursor-grabbing flex flex-col items-center group"
                            style={{ left: `${(previewTime / safeDuration) * 100}%` }}
                            onMouseDown={(e) => handleMouseDown(e, 'playhead')}
                        >
                            <div className="w-0.5 h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                            <div className="absolute -top-1 w-3 h-3 bg-white rotate-45 transform origin-center shadow-sm group-hover:scale-125 transition-transform" />
                        </div>
                    </div>

                    <div className="flex justify-between items-center">
                        <div className="text-xs text-neutral-500">
                            Range: <span className="text-purple-400 font-bold font-mono">{formatTime(start)} - {formatTime(end)}</span>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors">
                                Cancel
                            </button>
                            <button 
                                onClick={handleConfirm}
                                disabled={isCapturing}
                                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-purple-900/20 transition-all disabled:opacity-70 disabled:cursor-wait"
                            >
                                {isCapturing ? (
                                    <> <ScanEye className="w-4 h-4 animate-spin" /> Scanning Video... </>
                                ) : (
                                    <> <Check className="w-4 h-4" strokeWidth={3} /> Attach Range </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};