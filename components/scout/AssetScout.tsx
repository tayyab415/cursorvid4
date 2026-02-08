
import React, { useState, useRef, useEffect } from 'react';
import { ScoutAgent, ScoutLog, ScoutResult } from '../../services/agents/scout';
import { Search, Loader2, Globe, Terminal, CheckCircle2, AlertCircle, Download, ArrowRight } from 'lucide-react';

interface AssetScoutProps {
    onAssetFound: (url: string, description: string) => void;
}

export const AssetScout: React.FC<AssetScoutProps> = ({ onAssetFound }) => {
    const [query, setQuery] = useState('');
    const [isScouting, setIsScouting] = useState(false);
    const [logs, setLogs] = useState<ScoutLog[]>([]);
    const [result, setResult] = useState<ScoutResult | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const agentRef = useRef<ScoutAgent | null>(null);

    // Auto-scroll logs
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const handleScout = async () => {
        if (!query.trim() || isScouting) return;

        setIsScouting(true);
        setLogs([]);
        setResult(null);
        
        // Initialize Agent
        agentRef.current = new ScoutAgent((log) => {
            setLogs(prev => [...prev, log]);
        });

        try {
            const found = await agentRef.current.scout(query);
            if (found) {
                setResult(found);
            } else {
                setLogs(prev => [...prev, {
                    id: 'fail', type: 'error', message: 'Could not find a suitable asset.', timestamp: Date.now()
                }]);
            }
        } catch (e) {
             setLogs(prev => [...prev, {
                id: 'err', type: 'error', message: 'Agent crashed unexpectedly.', timestamp: Date.now()
            }]);
        } finally {
            setIsScouting(false);
        }
    };

    const handleAdd = () => {
        if (result) {
            onAssetFound(result.url, result.description);
        }
    };

    return (
        <div className="flex flex-col h-full bg-neutral-950 text-neutral-200">
            {/* Header */}
            <div className="p-6 border-b border-neutral-800 bg-neutral-900/50">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                        <Globe className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Asset Scout</h2>
                        <p className="text-xs text-neutral-400">Autonomous web agent (Gemini 3 Pro)</p>
                    </div>
                </div>
                <p className="text-sm text-neutral-400 leading-relaxed">
                    Describe the footage you need. The agent will browse stock libraries, evaluate candidates, and download the best match.
                </p>
            </div>

            {/* Main Area */}
            <div className="flex-1 overflow-hidden flex flex-col p-6 gap-6">
                
                {/* Result Card (Success State) */}
                {result && (
                    <div className="bg-neutral-900 border border-green-500/30 rounded-xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-500">
                        <div className="flex items-start gap-4">
                            <div className="w-32 aspect-video bg-black rounded-lg overflow-hidden border border-neutral-800 relative group">
                                <video src={result.url} className="w-full h-full object-cover" autoPlay muted loop />
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-green-400 mb-1">
                                    <CheckCircle2 size={16} />
                                    <span className="text-xs font-bold uppercase tracking-wider">Asset Secured</span>
                                </div>
                                <h3 className="text-sm font-medium text-white truncate mb-1">"{result.description}"</h3>
                                <p className="text-xs text-neutral-500 mb-3">Source: {result.source}</p>
                                
                                <button 
                                    onClick={handleAdd}
                                    className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-lg text-xs font-bold hover:bg-neutral-200 transition-colors shadow-lg shadow-white/5"
                                >
                                    <Download size={14} /> Add to Project
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Terminal / Logs */}
                <div className={`flex-1 bg-black/50 rounded-xl border border-neutral-800 overflow-hidden flex flex-col ${isScouting ? 'ring-1 ring-blue-500/30' : ''}`}>
                    <div className="bg-neutral-900/80 px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Terminal size={12} className="text-neutral-500" />
                            <span className="text-[10px] font-mono text-neutral-500 uppercase">Agent Logs</span>
                        </div>
                        {isScouting && <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /><span className="text-[10px] text-blue-400">Live</span></div>}
                    </div>
                    
                    <div className="flex-1 p-4 font-mono text-xs overflow-y-auto custom-scrollbar space-y-3" ref={scrollRef}>
                        {logs.length === 0 && !isScouting && (
                            <div className="h-full flex flex-col items-center justify-center text-neutral-600 gap-2 opacity-50">
                                <Search size={24} />
                                <p>Ready to search...</p>
                            </div>
                        )}
                        
                        {logs.map((log) => (
                            <div key={log.id} className="animate-in fade-in slide-in-from-left-2 duration-300">
                                <span className="text-neutral-600 mr-2">[{new Date(log.timestamp).toLocaleTimeString([], {hour12:false, second:'2-digit', minute:'2-digit'})}]</span>
                                {log.type === 'action' && <span className="text-blue-400 font-bold mr-2">ACTION &gt;</span>}
                                {log.type === 'success' && <span className="text-green-400 font-bold mr-2">SUCCESS &gt;</span>}
                                {log.type === 'error' && <span className="text-red-400 font-bold mr-2">ERROR &gt;</span>}
                                {log.type === 'info' && <span className="text-purple-400/50 font-bold mr-2">INFO &gt;</span>}
                                <span className={log.type === 'action' ? 'text-blue-100' : 'text-neutral-300'}>
                                    {log.message}
                                </span>
                            </div>
                        ))}
                        
                        {isScouting && (
                            <div className="flex items-center gap-2 text-neutral-500 animate-pulse">
                                <span className="text-blue-500">&gt;_</span> Processing step...
                            </div>
                        )}
                    </div>
                </div>

                {/* Input Area */}
                <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/50 to-transparent -top-10 pointer-events-none" />
                    <div className="relative flex gap-2">
                        <div className="flex-1 bg-neutral-900 border border-neutral-700 focus-within:border-blue-500 rounded-xl overflow-hidden transition-colors flex items-center shadow-lg">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleScout()}
                                disabled={isScouting}
                                placeholder="E.g. 'A busy street in New York at sunset'"
                                className="w-full bg-transparent border-none p-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={handleScout}
                            disabled={isScouting || !query.trim()}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/20"
                        >
                            {isScouting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
