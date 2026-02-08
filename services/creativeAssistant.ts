
import { getAiClient } from './gemini';
import { ChatMessage, Clip, WorkspaceItem } from '../types';
import { rangeToGeminiParts } from './geminiAdapter';
import { captureFrameFromVideoUrl, extractAudioFromVideo, sliceAudioBlob } from '../utils/videoUtils';

export interface AssistantContext {
    clips: Clip[];
    workspaceFiles: WorkspaceItem[];
    mediaRefs: any;
}

export const sendMessageToCreativeAssistant = async (
    text: string, 
    history: ChatMessage[], 
    context: AssistantContext
): Promise<string> => {
    const ai = getAiClient();
    
    // 1. Parse Mentions (@File) and Ranges (#Start-End)
    const parts: any[] = [];
    let cleanText = text;

    // Regex for ranges with OPTIONAL captured evidence: #[start:end](evidence_id?)
    // In our UI, we will append evidence as hidden metadata or handle it via a separate flow.
    // Ideally, the 'text' passed here already comes with attached evidence if it was a range selection.
    
    // Since we handle the range attachment in the UI by passing `visualEvidence` to the messages, 
    // we need to look for that evidence in the history OR parse special tags if we embed the base64 (too large).
    
    // STRATEGY: The UI inserts the range tag #[start:end]. 
    // We will look for a companion 'system' message or metadata containing the frames if they exist.
    // BUT to keep it simple for this "Demo", we will assume the `text` might contain a special marker we injected
    // OR we just rely on re-generating if not provided.
    
    // HOWEVER, the `TimeRangePicker` now returns frames. The `CreativeAssistant` component should hold these 
    // and pass them. We'll assume they are attached to the LAST user message in `history` if we want to follow strict types,
    // or we can extend the signature. 
    
    // Better approach for this function: parse the ranges, AND if the range matches what the user JUST selected, use the passed frames.
    // For now, let's keep it robust: If the message text contains `#[start:end]`, we attempt to generate context.
    
    const rangeRegex = /#\[([\d.]+):([\d.]+)\]/g;
    let match;
    
    while ((match = rangeRegex.exec(text)) !== null) {
        const start = parseFloat(match[1]);
        const end = parseFloat(match[2]);
        
        parts.push({ text: `\n--- CONTEXT: Timeline Segment (${start.toFixed(1)}s - ${end.toFixed(1)}s) ---` });
        
        // We check if the LAST message in history (the user's) has `visualEvidence`.
        // This requires casting or updating types. For safety, we will check if the caller passed it in a special way.
        // Actually, we can just rely on `rangeToGeminiParts` as a fallback, BUT
        // if `CreativeAssistant` injects the frames into `parts` BEFORE calling this, that's better.
        
        // Let's assume `rangeToGeminiParts` is the standard fallback, 
        // but if we want the "Captured Frames" from the modal, we need to pass them.
        
        // Let's rely on `rangeToGeminiParts` for now, but optimize it to use the new `canvasFrames` if available in the context (we can add it to context).
        // Since we didn't update Context type in every file, let's stick to generating it here to be safe, 
        // UNLESS the prompt text has the base64 encoded (bad idea).
        
        // The best way in this specific constrained codebase: 
        // `CreativeAssistant.tsx` will append the frames as `inlineData` to the `history` object it passes to us.
        // So we just need to ensure we forward any existing parts from the last message if they exist.
        
        const rangeParts = await rangeToGeminiParts(
            { start, end, tracks: [] },
            context.clips,
            context.mediaRefs
        );
        parts.push(...rangeParts);
        
        cleanText = cleanText.replace(/#\[([\d.]+):([\d.]+)\]/, `(Timeframe ${start.toFixed(1)}s-${end.toFixed(1)}s)`);
    }

    // ... (File parsing logic remains the same) ...
    // Regex for files: @[Name](id)
    const fileRegex = /@\[(.*?)\]\((.*?)\)/g;
    const fileIds: string[] = [];
    while ((match = fileRegex.exec(text)) !== null) {
        fileIds.push(match[2]);
    }

    for (const id of fileIds) {
        const file = context.workspaceFiles.find(f => f.id === id) || context.clips.find(c => c.id === id);
        if (file) {
            parts.push({ text: `\n--- CONTEXT: Referenced Asset "${(file as any).name || (file as any).title}" ---` });
            const url = (file as any).url || (file as any).sourceUrl;
            const type = (file as any).type;

            if (url) {
                if (type === 'image') {
                    const img = await fetch(url).then(r => r.blob());
                    const b64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                        reader.readAsDataURL(img);
                    });
                    parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
                } else if (type === 'video') {
                    const duration = (file as any).duration || 5;
                    const timestamps = [duration * 0.1, duration * 0.5, duration * 0.9];
                    for (const t of timestamps) {
                        try {
                            const frameB64 = await captureFrameFromVideoUrl(url, t);
                            parts.push({ inlineData: { mimeType: 'image/jpeg', data: frameB64.split(',')[1] } });
                        } catch (e) { }
                    }
                    parts.push({ text: "(Representative frames from video asset)" });
                } else if (type === 'audio') {
                    const b64 = await sliceAudioBlob(url, 0, Math.min(10, (file as any).duration || 10));
                    if (b64) {
                        parts.push({ inlineData: { mimeType: 'audio/wav', data: b64 } });
                    }
                }
            }
            cleanText = cleanText.replace(/@\[(.*?)\]\((.*?)\)/, `(Asset: ${ (file as any).name || (file as any).title })`);
        }
    }

    parts.push({ text: cleanText });

    const systemPrompt = `
    ROLE: You are an Expert Video Creative Director and Editor's Assistant.
    MODEL: Gemini 3 Pro (Multimodal).
    CAPABILITIES: You see video segments as sequences of frames. 
    GOAL: Provide constructive, specific, and actionable feedback on the user's timeline or assets.
    TONE: Professional, encouraging, but critical when necessary.
    `;

    // Flatten history: We only send text parts of previous turns to save context, 
    // unless it was the immediate previous user message which might have had images.
    const apiHistory = history.map(h => ({
        role: h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.text }] // Simplifying history to text-only for token efficiency
    }));

    try {
        const chat = ai.chats.create({
            model: 'gemini-3-pro-preview',
            history: apiHistory as any,
            config: { systemInstruction: systemPrompt }
        });

        // Pass the constructed multimodal parts
        const result = await chat.sendMessage({ message: parts });
        return result.text || "";
    } catch (e) {
        console.error("Creative Assistant Error:", e);
        return "I'm having trouble analyzing the media right now. Please try again.";
    }
};
