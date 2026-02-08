
import React, { useState } from 'react';
import { X, Wand2, Sparkles, Loader2, Play, CheckCircle2, FlaskConical, MoveRight, Settings2 } from 'lucide-react';
import { useAssetGeneration } from '../../hooks/useAssetGeneration';
import { AssetPlayer } from './AssetPlayer';
import { AssetConfig } from '../../services/assetBrain';

interface AssetFoundryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddAsset: (url: string, config: AssetConfig) => void;
}

const VEO_MODELS = [
    { id: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast (Preview)', desc: 'Lowest latency, good for drafts' },
    { id: 'veo-3.1-generate-preview', label: 'Veo 3.1 Quality', desc: 'Higher fidelity, slower generation' },
    { id: 'veo-3.0-fast-generate-preview', label: 'Veo 3.0 Fast', desc: 'Previous gen fast model' },
    { id: 'veo-3.0-generate-preview', label: 'Veo 3.0 Quality', desc: 'Previous gen high quality' },
];

export const AssetFoundryModal: React.FC<AssetFoundryModalProps> = ({ isOpen, onClose, onAddAsset }) => {
    const [prompt, setPrompt] = useState('');
    const [selectedModel, setSelectedModel] = useState(VEO_MODELS[0].id);
    const { generateAsset, status, result, error, reset } = useAssetGeneration();

    if (!isOpen) return null;

    const handleGenerate = () => {
        if (!prompt.trim()) return;
        generateAsset(prompt, selectedModel);
    };

    const handleAdd = () => {
        if (result) {
            onAddAsset(result.videoUrl, result.config);
            reset();
            setPrompt('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[800] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px] animate-in fade-in zoom-in-95 duration-200">
                
                {/* LEFT: Controls & Intelligence */}
                <div className="w-full md:w-1/3 border-r border-neutral-800 flex flex-col bg-neutral-950">
                    <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-purple-400">
                            <FlaskConical className="w-5 h-5" />
                            <h3 className="font-bold tracking-tight text-white">Asset Foundry</h3>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-neutral-800 rounded-full text-neutral-500 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto">
                        <div>
                            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                Describe Asset
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g. 'Flaming text that says HOT', 'A holographic map of earth', 'A running cyberpunk cat'"
                                className="w-full h-32 bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none transition-all text-neutral-200 placeholder:text-neutral-600"
                                autoFocus
                            />
                        </div>

                        {/* Model Selector */}
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                <Settings2 className="w-3 h-3" /> Generator Model
                            </label>
                            <div className="relative">
                                <select 
                                    value={selectedModel} 
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-purple-500 appearance-none"
                                >
                                    {VEO_MODELS.map(m => (
                                        <option key={m.id} value={m.id}>{m.label}</option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                                    <svg className="w-3 h-3 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                            <p className="mt-1.5 text-[10px] text-neutral-500">
                                {VEO_MODELS.find(m => m.id === selectedModel)?.desc}
                            </p>
                        </div>

                        {result && (
                            <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800 space-y-3 animate-in slide-in-from-bottom-2 fade-in">
                                <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                                    <BrainIcon className="w-3 h-3 text-purple-400" />
                                    AI Analysis
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-neutral-500">Physics Strategy</span>
                                        <span className={`px-2 py-0.5 rounded-full font-mono font-bold ${
                                            result.config.strategy === 'chroma' ? 'bg-green-900/30 text-green-400 border border-green-500/30' :
                                            result.config.strategy === 'screen' ? 'bg-orange-900/30 text-orange-400 border border-orange-500/30' :
                                            'bg-blue-900/30 text-blue-400 border border-blue-500/30'
                                        }`}>
                                            {result.config.strategy.toUpperCase()}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-neutral-400 italic leading-relaxed border-l-2 border-neutral-700 pl-2">
                                        "{result.config.reasoning}"
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="mt-auto pt-4">
                            <button
                                onClick={handleGenerate}
                                disabled={status === 'analyzing' || status === 'generating' || !prompt.trim()}
                                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {status === 'analyzing' ? (
                                    <> <Loader2 className="w-4 h-4 animate-spin" /> Analyzing Physics... </>
                                ) : status === 'generating' ? (
                                    <> <Loader2 className="w-4 h-4 animate-spin" /> Generating Asset... </>
                                ) : (
                                    <> <Wand2 className="w-4 h-4" /> Generate Asset </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Preview Area */}
                <div className="flex-1 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-900 to-black flex flex-col relative">
                    {/* Background Grid Pattern */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

                    {result ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
                            <div className="w-full max-w-lg aspect-video bg-black/50 rounded-xl overflow-hidden shadow-2xl border border-neutral-800 relative group">
                                <AssetPlayer 
                                    src={result.videoUrl} 
                                    strategy={result.config.strategy} 
                                    className="w-full h-full"
                                />
                                <div className="absolute bottom-3 left-3 flex gap-2">
                                     <div className="px-2 py-1 bg-black/60 backdrop-blur rounded text-[10px] font-mono text-neutral-400 border border-neutral-800">
                                        Preview Mode
                                     </div>
                                </div>
                            </div>
                            
                            <div className="mt-8 flex gap-4">
                                <button onClick={reset} className="px-6 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-sm font-medium">
                                    Discard
                                </button>
                                <button onClick={handleAdd} className="px-8 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition-colors text-sm font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                                    <CheckCircle2 className="w-4 h-4" /> Add to Timeline
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 gap-4 relative z-10">
                            <div className="w-20 h-20 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                                <Sparkles className="w-8 h-8 opacity-20" />
                            </div>
                            <p className="text-sm font-medium">Ready to forge assets</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const BrainIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
);
