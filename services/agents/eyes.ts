
import { AgentContext } from '../../types';
import { getAiClient } from '../gemini';
import { rangeToGeminiParts, storyboardToGeminiParts } from '../geminiAdapter';
import { Type } from '@google/genai';

export interface VideoAnalysis {
  thought: string;
  pacing: { rhythm: string, deadMoments: number[] };
  visual: { quality: string, issues: string[], styleDescription: string };
  audio: { hasSpeech: boolean, clarity: string };
  editingNeeds: string[];
}

export class EyesAgent {
  async analyze(context: AgentContext, mediaRefs: any): Promise<VideoAnalysis> {
    const ai = getAiClient();
    const { clips, range } = context;
    
    const hasSelection = range.end > range.start && (range.end - range.start) > 0.1;
    const isSurveyMode = !hasSelection && clips.length > 3;

    let mediaParts: any[] = [];
    let instructions = "";

    try {
        if (isSurveyMode) {
            mediaParts = await storyboardToGeminiParts(clips);
            instructions = `
            MODE: INVENTORY SURVEY.
            TASK: Look at the individual clips provided. Identify clip types (Intros, Interviews, B-roll).
            `;
        } else {
            const duration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
            const analysisRange = hasSelection ? 
                { start: range.start, end: range.end, tracks: [] as any } : 
                { start: 0, end: Math.min(duration, 45), tracks: [] as any };

            mediaParts = await rangeToGeminiParts(analysisRange, clips, mediaRefs);
            instructions = `
            MODE: TIMELINE PLAYBACK.
            RANGE: ${analysisRange.start.toFixed(1)}s to ${analysisRange.end.toFixed(1)}s.
            TASK: Watch the composed video. Analyze Pacing, Visual Quality, and Audio.
            `;
        }
    } catch (error) {
        console.warn("Failed to generate media parts for analysis:", error);
        mediaParts = [{ text: "Visual data unavailable. Analyze based on clip titles only." }];
    }

    const prompt = `
    ROLE: You are the EYES of a video editor.
    ${instructions}
    
    OUTPUT JSON SCHEMA:
    {
      "thought": "Brief first-person thought about what you see.",
      "pacing": { "rhythm": "slow|fast|inconsistent", "deadMoments": [0.0] },
      "visual": { 
          "quality": "string", 
          "issues": ["shaky", "dark", "static"],
          "styleDescription": "A detailed description of the visual style (e.g. 'Cinematic, warm lighting, slow motion, corporate, high contrast'). Used for generating matching assets."
      },
      "audio": { "hasSpeech": boolean, "clarity": "string" },
      "editingNeeds": ["string"]
    }
    
    IMPORTANT: 
    1. Return VALID JSON ONLY. 
    2. Do not use markdown code blocks. 
    3. Ensure all keys are double-quoted (e.g. "thought", not thought).
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                role: 'user',
                parts: [
                    ...mediaParts,
                    { text: prompt }
                ]
            },
            config: { 
                responseMimeType: 'application/json',
                systemInstruction: "You are a precise video analysis engine. Output standard JSON."
            }
        });

        let text = response.text || "{}";
        
        // Robust cleanup for JSON parsing
        // Remove markdown wrappers if present
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let parsed: any = {};
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            console.warn("Eyes Agent: JSON Parse Failed, attempting regex salvage", e);
            // Try to extract JSON object
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    parsed = JSON.parse(match[0]);
                } catch (e2) {
                    console.error("Eyes Agent: Regex salvage failed", e2);
                    // Last resort: manual or empty fallback
                }
            }
        }
        
        // Defaults to prevent crashes
        return {
            thought: parsed.thought || "I have analyzed the timeline.",
            pacing: parsed.pacing || { rhythm: "unknown", deadMoments: [] },
            visual: { 
                quality: parsed.visual?.quality || "unknown", 
                issues: parsed.visual?.issues || [],
                styleDescription: parsed.visual?.styleDescription || "Neutral video style."
            },
            audio: parsed.audio || { hasSpeech: false, clarity: "unknown" },
            editingNeeds: parsed.editingNeeds || []
        };

    } catch (e) {
        console.error("Eyes Agent Fatal Error", e);
        return {
            thought: "I couldn't analyze the visuals due to a processing error. Assuming standard style.",
            pacing: { rhythm: "unknown", deadMoments: [] },
            visual: { quality: "unknown", issues: [], styleDescription: "Standard video style" },
            audio: { hasSpeech: false, clarity: "unknown" },
            editingNeeds: []
        };
    }
  }
}
