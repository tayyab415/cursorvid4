
import { getAiClient, callWithRetry } from './gemini';
import { captureFrameFromVideoUrl, extractAudioFromVideo } from '../utils/videoUtils';
import { Clip } from '../types';
import { GenerateContentResponse } from "@google/genai";

export class SmartEditService {
    
    /**
     * Finds the best loop point in a clip by comparing frame similarity using Gemini Vision.
     */
    async findLoopPoints(clip: Clip): Promise<{ start: number, end: number, confidence: number } | null> {
        if (!clip.sourceUrl) return null;
        
        const ai = getAiClient();
        const duration = clip.totalDuration || clip.duration;
        const samples = 6;
        const interval = duration / samples;
        
        const parts: any[] = [];
        parts.push({ text: `Analyze these frames from a video. I want to find a start and end point that look visually similar to create a seamless loop.` });

        // Capture frames
        for(let i=0; i<samples; i++) {
            const time = i * interval;
            try {
                const b64 = await captureFrameFromVideoUrl(clip.sourceUrl, time);
                parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64.split(',')[1] } });
                parts.push({ text: `[Frame ${i} at ${time.toFixed(2)}s]` });
            } catch (e) { console.warn("Frame capture failed", e); }
        }

        const prompt = `
        Compare the frames. Identify two timestamps where the visual state (object position, lighting) is most similar, suitable for a loop cut.
        Return JSON: { "startTime": number, "endTime": number, "confidence": number }
        `;
        parts.push({ text: prompt });

        try {
            const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: { role: 'user', parts },
                config: { responseMimeType: 'application/json' }
            }));
            const result = JSON.parse(response.text || "{}");
            if (result.startTime !== undefined && result.endTime !== undefined) {
                return { 
                    start: result.startTime, 
                    end: result.endTime, 
                    confidence: result.confidence || 0.8 
                };
            }
        } catch (e) {
            console.error("Smart Loop Analysis Failed", e);
        }
        return null;
    }

    /**
     * Analyzes audio to find beat markers.
     */
    async detectBeats(clip: Clip): Promise<number[]> {
        if (!clip.sourceUrl || clip.type !== 'audio' && clip.type !== 'video') return [];
        
        const ai = getAiClient();
        try {
            // Fetch blob to extract audio
            const response = await fetch(clip.sourceUrl);
            const blob = await response.blob();
            const audioB64 = await extractAudioFromVideo(blob);

            const result: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'audio/wav', data: audioB64 } },
                        { text: "Analyze this audio. Return a JSON array of timestamps (in seconds) for the main downbeats/rhythm hits. Format: [0.5, 1.2, ...]" }
                    ]
                },
                config: { responseMimeType: 'application/json' }
            }));

            const beats = JSON.parse(result.text || "[]");
            return Array.isArray(beats) ? beats : [];
        } catch (e) {
            console.error("Beat Detection Failed", e);
            return [];
        }
    }

    /**
     * Identifies timestamps where specific objects appear or actions happen.
     */
    async findHighlights(clip: Clip, description: string): Promise<{ start: number, end: number }[]> {
        if (!clip.sourceUrl) return [];
        
        const ai = getAiClient();
        // Sample densely for highlights
        const parts: any[] = [];
        const duration = Math.min(clip.duration, 20); // Limit analysis to 20s for demo
        const step = 2; 
        
        parts.push({ text: `Find time segments showing: "${description}".` });

        for(let t=0; t<duration; t+=step) {
            try {
                const b64 = await captureFrameFromVideoUrl(clip.sourceUrl, t);
                parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64.split(',')[1] } });
                parts.push({ text: `[Timestamp ${t}s]` });
            } catch (e) {}
        }

        parts.push({ text: `Return JSON array of segments: [{ "start": number, "end": number }]` });

        try {
            const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: { role: 'user', parts },
                config: { responseMimeType: 'application/json' }
            }));
            const segments = JSON.parse(response.text || "[]");
            return Array.isArray(segments) ? segments : [];
        } catch (e) {
            console.error("Highlight Detection Failed", e);
            return [];
        }
    }
}

export const smartEdit = new SmartEditService();
