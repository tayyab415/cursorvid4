
import React, { useState, useEffect } from 'react';
import { X, Wand2, Sparkles, Loader2, Play, Image as ImageIcon, Film, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Clip } from '../types';
import { optimizePrompt, editImage, generateVideo } from '../services/gemini';

interface ImageEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    clip: Clip | null;
    onAddResult: (url: string, type: 'image' | 'video', title: string) => void;
}

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({ isOpen, onClose, clip, onAddResult }) => {
    const [tab, setTab] = useState<'edit' | 'motion'>('edit');
    const [prompt, setPrompt] = useState('');
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [motionMode, setMotionMode] = useState<'start_frame' | 'reference'>('start_frame');
    const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null);

    // Convert source URL to Base64 on mount/clip change
    useEffect(() => {
        if (clip?.sourceUrl) {
            fetch(clip.sourceUrl)
                .then(res => res.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onload = () => setSourceImageBase64(reader.result as string);
                    reader.readAsDataURL(blob);
                })
                .catch(err => console.error("Failed to load image for editing", err));
        } else {
            setSourceImageBase64(null);
        }
        setResultUrl(null);
        setPrompt('');
    }, [clip]);

    if (!isOpen || !clip) return null;

    const handleOptimize = async () => {
        if (!prompt.trim() || !sourceImageBase64) return;
        setIsOptimizing(true);
        try {
            const target = tab === 'edit' ? 'nano_banana' : 'veo';
            const optimized = await optimizePrompt(prompt, target, sourceImageBase64);
            setPrompt(optimized);
        } catch (e) {
            console.error(e);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleGenerate = async () => {
        if (!prompt.trim() || !sourceImageBase64) return;
        setIsGenerating(true);
        setResultUrl(null);

        try {
            let url = '';
            if (tab === 'edit') {
                // Edit Image (Nano Banana)
                const b64 = await editImage(sourceImageBase64, prompt, 'gemini-2.5-flash-image');
                url = `data:image/png;base64,${b64}`;
            } else {
                // Add Motion (Veo)
                const startImg = motionMode === 'start_frame' ? sourceImageBase64 : null;
                const refImgs = motionMode === 'reference' ? [sourceImageBase64] : null;
                // Note: Reference image logic depends on model support. 
                // For Veo 3.1 Preview, use 'veo-3.1-generate-preview' for refs, or 'fast' for start frame.
                const model = motionMode === 'reference' ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview';
                
                url = await generateVideo(
                    prompt, 
                    model, 
                    '16:9', 
                    '720p', 
                    4, 
                    startImg, 
                    null, 
                    refImgs
                );
            }
            setResultUrl(url);
        } catch (e) {
            console.error(e);
            alert("Generation failed. See console.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAccept = () => {
        if (resultUrl) {
            const type = tab === 'edit' ? 'image' : 'video';
            const title = tab === 'edit' ? `Edited: ${clip.title}` : `Motion: ${clip.title}`;
            onAddResult(resultUrl, type, title);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col h-[600px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-neutral-800 overflow-hidden border border-neutral-700">
                            <img src={clip.sourceUrl} className="w-full h-full object-cover" alt="Source" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg">Edit Asset</h3>
                            <p className="text-xs text-neutral-400">Editing: {clip.title}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-1 min-h-0">
                    {/* Sidebar / Controls */}
                    <div className="w-1/2 p-6 border-r border-neutral-800 flex flex-col gap-6 bg-neutral-900 overflow-y-auto">
                        
                        {/* Tabs */}
                        <div className="flex p-1 bg-neutral-950 border border-neutral-800 rounded-xl">
                            <button 
                                onClick={() => { setTab('edit'); setResultUrl(null); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'edit' ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
                            >
                                <ImageIcon size={14} /> Edit Image
                            </button>
                            <button 
                                onClick={() => { setTab('motion'); setResultUrl(null); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'motion' ? 'bg-green-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
                            >
                                <Film size={14} /> Add Motion
                            </button>
                        </div>

                        {/* Controls */}
                        <div className="flex-1 flex flex-col gap-4">
                            {tab === 'motion' && (
                                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Motion Mode</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => setMotionMode('start_frame')}
                                            className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all ${motionMode === 'start_frame' ? 'bg-green-900/30 border-green-500/50 text-green-200' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'}`}
                                        >
                                            Start Frame
                                            <span className="block text-[9px] opacity-60 font-normal mt-0.5">Animate directly from this image</span>
                                        </button>
                                        <button 
                                            onClick={() => setMotionMode('reference')}
                                            className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all ${motionMode === 'reference' ? 'bg-green-900/30 border-green-500/50 text-green-200' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'}`}
                                        >
                                            Reference Style
                                            <span className="block text-[9px] opacity-60 font-normal mt-0.5">Use as inspiration for new video</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 flex flex-col">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                                        {tab === 'edit' ? 'Edit Instructions' : 'Animation Prompt'}
                                    </label>
                                    <button 
                                        onClick={handleOptimize}
                                        disabled={isOptimizing || !prompt.trim()}
                                        className="flex items-center gap-1.5 text-[10px] text-purple-300 bg-purple-900/30 hover:bg-purple-900/50 border border-purple-500/30 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                    >
                                        {isOptimizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                        Improvise
                                    </button>
                                </div>
                                <textarea 
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder={tab === 'edit' ? "e.g. 'Add a neon sign', 'Make it cyberpunk style', 'Change the lighting to sunset'" : "e.g. 'Camera pans right', 'The character waves', 'Slow zoom in'"}
                                    className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
                                />
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating || !prompt.trim()}
                                className={`w-full py-3 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${tab === 'edit' ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500' : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500'}`}
                            >
                                {isGenerating ? (
                                    <> <Loader2 className="w-4 h-4 animate-spin" /> Generating... </>
                                ) : (
                                    <> <Sparkles className="w-4 h-4" /> Generate Result </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="w-1/2 bg-black flex flex-col">
                        <div className="flex-1 flex items-center justify-center p-6 relative">
                            {/* Grid Pattern */}
                            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                            
                            {resultUrl ? (
                                tab === 'edit' ? (
                                    <img src={resultUrl} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg border border-neutral-800" alt="Result" />
                                ) : (
                                    <video src={resultUrl} autoPlay loop controls className="max-w-full max-h-full object-contain shadow-2xl rounded-lg border border-neutral-800" />
                                )
                            ) : (
                                <div className="text-center text-neutral-600 space-y-2">
                                    {isGenerating ? (
                                        <Loader2 className="w-10 h-10 animate-spin mx-auto text-neutral-700" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto">
                                            {tab === 'edit' ? <ImageIcon className="w-6 h-6 opacity-20" /> : <Play className="w-6 h-6 opacity-20" />}
                                        </div>
                                    )}
                                    <p className="text-sm font-medium">{isGenerating ? "Forging pixels..." : "Result will appear here"}</p>
                                </div>
                            )}
                        </div>

                        {resultUrl && (
                            <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex justify-end gap-3">
                                <button onClick={() => setResultUrl(null)} className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white transition-colors">Discard</button>
                                <button onClick={handleAccept} className="px-6 py-2 bg-white text-black hover:bg-neutral-200 rounded-lg text-xs font-bold shadow-lg flex items-center gap-2">
                                    <CheckCircle2 size={14} /> Add to Timeline
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
