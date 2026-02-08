
import React, { useState, useRef, useEffect } from 'react';
import { Send, Hash, AtSign, Loader2, Play, Film, Image as ImageIcon, Music, X } from 'lucide-react';
import { ChatMessage, Clip, WorkspaceItem } from '../../types';
import { sendMessageToCreativeAssistant } from '../../services/creativeAssistant';
import { TimeRangePicker } from './TimeRangePicker';
import { getAiClient } from '../../services/gemini';

interface CreativeAssistantProps {
    clips: Clip[];
    workspaceFiles: WorkspaceItem[];
    mediaRefs: React.MutableRefObject<{[key: string]: HTMLVideoElement | HTMLAudioElement | HTMLImageElement | null}>;
}

export const CreativeAssistant: React.FC<CreativeAssistantProps> = ({ clips, workspaceFiles, mediaRefs }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', text: "I'm your Creative Assistant. I can see your timeline and files. Mention a file with '@' or select a range with '#' to ask for feedback!" }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [showRangePicker, setShowRangePicker] = useState(false);
    const [pendingRange, setPendingRange] = useState<{start: number, end: number, frames: string[]} | null>(null);
    
    // Mention State
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const totalDuration = clips.length > 0 ? Math.max(...clips.map(c => c.startTime + c.duration)) : 10;

    const allAssets = [
        ...workspaceFiles.map(f => ({ id: f.id, name: f.name, type: f.type, url: f.url })),
        ...clips.map(c => ({ id: c.id, name: c.title, type: c.type || 'video', url: c.sourceUrl }))
    ];

    const filteredAssets = mentionQuery !== null 
        ? allAssets.filter(a => a.name.toLowerCase().includes(mentionQuery.toLowerCase()))
        : [];

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInput(val);

        const lastAt = val.lastIndexOf('@');
        if (lastAt !== -1 && lastAt >= val.length - 15) { 
            const query = val.slice(lastAt + 1);
            if (!query.includes(' ')) {
                setMentionQuery(query);
                return;
            }
        }
        setMentionQuery(null);
    };

    const insertMention = (asset: {id: string, name: string}) => {
        if (mentionQuery === null) return;
        const lastAt = input.lastIndexOf('@');
        const before = input.slice(0, lastAt);
        const after = input.slice(lastAt + mentionQuery.length + 1);
        setInput(`${before}@[${asset.name}](${asset.id}) ${after}`); 
        setMentionQuery(null);
        inputRef.current?.focus();
    };

    const handleRangeConfirm = (start: number, end: number, frames: string[]) => {
        // Store the captured evidence to send with the next message
        setPendingRange({ start, end, frames });
        
        setInput(prev => `${prev} #[${start.toFixed(2)}:${end.toFixed(2)}] `);
        setShowRangePicker(false);
        inputRef.current?.focus();
    };

    const handleSend = async () => {
        if (!input.trim() || isTyping) return;
        
        const userText = input;
        const userMsg: ChatMessage = { role: 'user', text: userText };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);
        setPendingRange(null); // Clear pending after using

        // Custom send logic to inject the specific frames if we have them
        try {
            if (pendingRange && userText.includes(`#[${pendingRange.start.toFixed(2)}:${pendingRange.end.toFixed(2)}]`)) {
                // Specialized call with explicit visual evidence
                const ai = getAiClient();
                const parts: any[] = [];
                
                parts.push({ text: `\n--- ANALYZING CAPTURED TIMELINE SEGMENT (${pendingRange.start.toFixed(1)}s - ${pendingRange.end.toFixed(1)}s) ---` });
                
                // Add the high-fidelity captured frames
                pendingRange.frames.forEach(b64 => {
                    parts.push({
                        inlineData: { mimeType: 'image/jpeg', data: b64.split(',')[1] }
                    });
                });
                
                parts.push({ text: userText });

                // We bypass the generic service to ensure we send *exactly* what we captured
                const chat = ai.chats.create({
                    model: 'gemini-3-pro-preview',
                    history: messages.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })) as any,
                    config: { systemInstruction: "You are an expert video editor. Analyze the provided VIDEO FRAMES (which represent a timeline segment) and answer the user's question." }
                });

                const result = await chat.sendMessage({ message: parts });
                setMessages(prev => [...prev, { role: 'model', text: result.text || "I processed the video segment." }]);

            } else {
                // Fallback to standard service which regenerates/estimates frames
                const responseText = await sendMessageToCreativeAssistant(
                    userText, 
                    [...messages, userMsg], 
                    { clips, workspaceFiles, mediaRefs }
                );
                setMessages(prev => [...prev, { role: 'model', text: responseText }]);
            }
        } catch (e) {
            console.error(e);
            setMessages(prev => [...prev, { role: 'model', text: "Error connecting to Assistant." }]);
        } finally {
            setIsTyping(false);
        }
    };

    const renderMessage = (msg: ChatMessage, idx: number) => {
        const isUser = msg.role === 'user';
        const formattedText = msg.text.split(/(@\[.*?\]\(.*?\)|#\[[\d.:]+\])/g).map((part, i) => {
            if (part.startsWith('@[')) {
                const name = part.match(/@\[(.*?)\]/)?.[1];
                return <span key={i} className="text-blue-300 bg-blue-900/30 px-1 rounded mx-0.5">@{name}</span>;
            }
            if (part.startsWith('#[')) {
                const range = part.match(/#\[([\d.]+):([\d.]+)\]/);
                if (range) return <span key={i} className="text-purple-300 bg-purple-900/30 px-1 rounded mx-0.5 font-mono">{range[1]}s-{range[2]}s</span>;
            }
            return part;
        });

        return (
            <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${isUser ? 'bg-blue-600/20 text-blue-100 border border-blue-500/20' : 'bg-neutral-800 text-neutral-200 border border-neutral-700'}`}>
                    {formattedText}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-neutral-900 relative">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map(renderMessage)}
                {isTyping && (
                    <div className="flex gap-2 items-center text-xs text-neutral-500 pl-2">
                        <Loader2 size={12} className="animate-spin" /> Thinking...
                    </div>
                )}
            </div>

            {/* Mention Popup */}
            {mentionQuery !== null && filteredAssets.length > 0 && (
                <div className="absolute bottom-16 left-2 right-2 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-500 uppercase bg-neutral-900/50 sticky top-0">Mention Asset</div>
                    {filteredAssets.map((asset, i) => (
                        <button
                            key={asset.id}
                            onClick={() => insertMention(asset)}
                            className="w-full text-left px-3 py-2 text-xs text-neutral-300 hover:bg-blue-600/20 hover:text-white flex items-center gap-3 transition-colors border-b border-neutral-700/50 last:border-0 h-12"
                        >
                            <div className="w-8 h-8 bg-black rounded overflow-hidden shrink-0 border border-neutral-700 flex items-center justify-center">
                                {asset.type === 'image' && asset.url && <img src={asset.url} className="w-full h-full object-cover" alt="" />}
                                {asset.type === 'video' && asset.url && <video src={asset.url} className="w-full h-full object-cover" muted />}
                                {asset.type === 'audio' && <Music size={12} className="text-green-400" />}
                                {!asset.url && (
                                    asset.type === 'image' ? <ImageIcon size={12} className="text-purple-400" /> :
                                    asset.type === 'video' ? <Film size={12} className="text-blue-400" /> :
                                    <Music size={12} className="text-green-400" />
                                )}
                            </div>
                            <span className="truncate font-medium">{asset.name}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Time Range Modal */}
            {showRangePicker && (
                <TimeRangePicker 
                    totalDuration={totalDuration} 
                    clips={clips} 
                    mediaRefs={mediaRefs}
                    onConfirm={handleRangeConfirm}
                    onCancel={() => setShowRangePicker(false)}
                />
            )}

            {/* Input Bar */}
            <div className="p-3 bg-neutral-900 border-t border-neutral-800">
                <div className="relative flex items-center bg-neutral-950 border border-neutral-800 rounded-2xl px-2 py-1 focus-within:border-blue-500/50 transition-colors shadow-inner">
                    <button 
                        onClick={() => setShowRangePicker(!showRangePicker)}
                        className={`p-2 rounded-xl transition-colors shrink-0 ${showRangePicker || pendingRange ? 'text-purple-400 bg-purple-900/20' : 'text-neutral-500 hover:text-purple-400 hover:bg-neutral-800'}`}
                        title="Reference Timeline Range (#)"
                    >
                        <Hash size={14} />
                    </button>
                    
                    <button 
                        onClick={() => { setInput(prev => prev + '@'); inputRef.current?.focus(); }}
                        className="p-2 text-neutral-500 hover:text-blue-400 hover:bg-neutral-800 rounded-xl transition-colors shrink-0"
                        title="Mention Asset (@)"
                    >
                        <AtSign size={14} />
                    </button>

                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        disabled={isTyping}
                        placeholder={pendingRange ? "Range attached. Ask question..." : "Ask about @files or #ranges..."}
                        className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder:text-neutral-600 py-2 px-2 min-w-[50px]"
                        autoComplete="off"
                    />
                    
                    <button 
                        onClick={handleSend}
                        disabled={isTyping || !input.trim()}
                        className="p-2 hover:bg-neutral-800 rounded-xl text-blue-500 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Send size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};
