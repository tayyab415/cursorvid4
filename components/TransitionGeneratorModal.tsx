
import React, { useState } from 'react';
import { Clip } from '../types';
import { X, Sparkles, Film, ArrowRight, Wand2, Layers, Zap, Loader2 } from 'lucide-react';
import { optimizePrompt } from '../services/gemini';

interface TransitionGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    clipA: Clip | null;
    clipB: Clip | null;
    previews: { endFrameA: string, startFrameB: string } | null;
    onGenerate: (config: any) => void;
    isGenerating: boolean;
}

export const TransitionGeneratorModal: React.FC<TransitionGeneratorModalProps> = ({ 
    isOpen, 
    onClose, 
    clipA, 
    clipB, 
    previews, 
    onGenerate,
    isGenerating 
}) => {
    const [mode, setMode] = useState<'ai' | 'standard'>('ai');
    
    // AI State
    const [prompt, setPrompt] = useState('Smooth cinematic transition, seamless flow');
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [model, setModel] = useState('veo-3.1-fast-generate-preview');
    const [resolution, setResolution] = useState('720p');
    
    // Standard State
    const [standardType, setStandardType] = useState('fade');
    const [duration, setDuration] = useState(1.0);

    if (!isOpen || !clipA || !clipB) return null;

    const handleOptimize = async () => {
        if (!prompt.trim()) return;
        setIsOptimizing(true);
        try {
            const contextImages: string[] = [];
            if (previews?.endFrameA) contextImages.push(previews.endFrameA);
            if (previews?.startFrameB) contextImages.push(previews.startFrameB);

            const optimized = await optimizePrompt(prompt, 'transition', contextImages);
            setPrompt(optimized);
        } catch (e) {
            console.error("Optimization failed", e);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleConfirm = () => {
        onGenerate({
            mode,
            prompt,
            model,
            resolution,
            standardType,
            duration: mode === 'ai' ? 8 : duration // AI transitions (Veo) default to 8s
        });
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
                    <div className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-purple-400" />
                        <h3 className="font-bold text-white text-lg">Generate Transition</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Previews */}
                <div className="p-6 bg-neutral-900 border-b border-neutral-800 flex items-center justify-center gap-4">
                    <div className="relative group">
                        <div className="w-40 aspect-video bg-black rounded-lg overflow-hidden border border-neutral-700 shadow-lg">
                            {previews?.endFrameA ? (
                                <img src={previews.endFrameA} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Clip A End" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">No Preview</div>
                            )}
                        </div>
                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono border border-white/10">Clip A End</span>
                    </div>

                    <ArrowRight className="text-neutral-600" />

                    <div className="relative group">
                        <div className="w-40 aspect-video bg-black rounded-lg overflow-hidden border border-neutral-700 shadow-lg">
                            {previews?.startFrameB ? (
                                <img src={previews.startFrameB} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Clip B Start" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">No Preview</div>
                            )}
                        </div>
                        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono border border-white/10">Clip B Start</span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-neutral-800 bg-neutral-950">
                    <button 
                        onClick={() => setMode('ai')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${mode === 'ai' ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-900/10' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'}`}
                    >
                        <Sparkles size={14} /> AI Generation (Veo)
                    </button>
                    <button 
                        onClick={() => setMode('standard')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${mode === 'standard' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-900/10' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'}`}
                    >
                        <Layers size={14} /> Standard Effect
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 overflow-y-auto bg-neutral-950/30">
                    {mode === 'ai' ? (
                        <div className="space-y-5">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider">Transition Description</label>
                                    <button 
                                        onClick={handleOptimize}
                                        disabled={isOptimizing || !prompt.trim()}
                                        className="flex items-center gap-1.5 text-[10px] text-purple-300 bg-purple-900/30 hover:bg-purple-900/50 border border-purple-500/30 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                    >
                                        {isOptimizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                        Improvise Prompt
                                    </button>
                                </div>
                                <textarea 
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    className="w-full h-24 bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500 resize-none text-neutral-200 placeholder:text-neutral-600"
                                    placeholder="Describe the transition (e.g., 'Morphing liquid metal', 'Light speed jump', 'Dissolve into smoke')"
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Model</label>
                                    <select 
                                        value={model} 
                                        onChange={(e) => setModel(e.target.value)}
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-xs text-neutral-300 focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="veo-3.1-fast-generate-preview">Veo 3 Fast (Recommended)</option>
                                        <option value="veo-3.1-generate-preview">Veo 3 Quality</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Resolution</label>
                                    <select 
                                        value={resolution} 
                                        onChange={(e) => setResolution(e.target.value)}
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-xs text-neutral-300 focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="720p">720p</option>
                                        <option value="1080p">1080p (Slow)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 opacity-50">Duration</label>
                                    <div className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2.5 text-xs text-neutral-500 cursor-not-allowed">
                                        Fixed (8.0s)
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Effect Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['fade', 'wipe_right', 'wipe_left', 'wipe_up', 'wipe_down', 'circle_open', 'zoom_in'].map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setStandardType(t)}
                                            className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${standardType === t ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700'}`}
                                        >
                                            {t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Duration: {duration}s</label>
                                <input 
                                    type="range" 
                                    min="0.5" 
                                    max="3.0" 
                                    step="0.1" 
                                    value={duration} 
                                    onChange={(e) => setDuration(parseFloat(e.target.value))}
                                    className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="flex justify-between text-[10px] text-neutral-500 mt-1 font-mono">
                                    <span>0.5s</span>
                                    <span>3.0s</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white transition-colors">
                        Cancel
                    </button>
                    <button 
                        onClick={handleConfirm}
                        disabled={isGenerating}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-bold shadow-lg transition-all disabled:opacity-50 ${mode === 'ai' ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/20' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'}`}
                    >
                        {isGenerating ? (
                            <> <Zap className="w-4 h-4 animate-spin" /> Generating... </>
                        ) : (
                            <> <Sparkles className="w-4 h-4" /> {mode === 'ai' ? 'Generate & Insert' : 'Apply Transition'} </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
