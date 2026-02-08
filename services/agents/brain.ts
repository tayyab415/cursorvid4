
import { Clip, PlanStep, AgentContext } from '../../types';
import { getAiClient } from '../gemini';
import { TIMELINE_PRIMITIVES } from '../timelinePrimitives';
import { VideoAnalysis } from './eyes';
import { getToolDescriptions } from '../toolRegistry';

export interface BrainOutput {
  thought: string;
  plan: {
    goal: string;
    reasoning: string;
    steps: Array<{
      id: string;
      intent: string;
      operation: string;
      parameters: any;
      reasoning: string;
    }>;
  };
}

export class BrainAgent {
  async plan(userIntent: string, analysis: VideoAnalysis, context: AgentContext): Promise<BrainOutput> {
    const ai = getAiClient();
    const { clips, selectedClipIds, currentTime } = context;
    
    // Calculate timeline bounds
    const timelineDuration = clips.length > 0 
        ? Math.max(...clips.map(c => c.startTime + c.duration)) 
        : 0;

    // --- TRACK AWARENESS ---
    // Group clips by track to give the LLM a spatial understanding of the timeline
    const trackMap: Record<number, any[]> = {};
    const allTracks = Array.from(new Set(clips.map(c => c.trackId))).sort((a, b) => a - b);
    
    allTracks.forEach(tid => {
        trackMap[tid] = clips
            .filter(c => c.trackId === tid)
            .sort((a, b) => a.startTime - b.startTime)
            .map(c => ({
                id: c.id,
                title: c.title,
                type: c.type,
                range: `${c.startTime.toFixed(1)}s - ${(c.startTime + c.duration).toFixed(1)}s`,
                content: c.text ? `"${c.text}"` : (c.type === 'audio' ? 'Audio Track' : 'Visual Asset'),
                isSelected: selectedClipIds.includes(c.id)
            }));
    });

    // Format the track view for the prompt
    let trackStructureDescription = "";
    if (Object.keys(trackMap).length === 0) {
        trackStructureDescription = "Timeline is empty.";
    } else {
        trackStructureDescription = Object.entries(trackMap)
            .map(([tid, trackClips]) => `TRACK ${tid} (${tid === '0' ? 'Bottom/Background' : 'Overlay/Audio'}):\n` + trackClips.map(c => `  - [${c.id}] ${c.title} (${c.type}): ${c.range} ${c.isSelected ? '(*SELECTED*)' : ''}`).join('\n'))
            .join('\n\n');
    }

    // Extract visual style for consistency
    const detectedStyle = analysis.visual?.styleDescription || "Cinematic, high quality, consistent with existing footage";
    
    const toolDescriptions = getToolDescriptions();

    const prompt = `
    ROLE: You are the BRAIN of a video editor.
    TASK: Create a concrete editing plan to satisfy the User Intent, considering the Visual Analysis and Track Structure.
    
    USER INTENT: "${userIntent}"
    
    EYES ANALYSIS: 
    - Thought: ${analysis.thought}
    - Visual Style: ${detectedStyle}
    - Editing Needs: ${analysis.editingNeeds?.join(', ')}
    
    TIMELINE STATE:
    - Total Duration: ${timelineDuration.toFixed(2)}s
    - Playhead Position: ${currentTime.toFixed(2)}s
    - Selected Clips: ${selectedClipIds.length > 0 ? selectedClipIds.join(', ') : 'None'}
    
    TRACK STRUCTURE (Layering Context):
    ${trackStructureDescription}
    
    AVAILABLE TOOLS:
    ${toolDescriptions}

    INSTRUCTIONS:
    1. **TRACK AWARENESS**: Understand that Track 0 is the background. Higher tracks (1, 2...) overlay on top. Audio usually goes on specific tracks.
    2. **APPENDING CONTENT**: If adding an Outro or End Screen, use 'insertTime' = ${timelineDuration.toFixed(2)}. Do NOT put it at 0.
    3. **PRIORITIZE GENERATION**: If the user asks to "create", "generate", or "make" something (like an intro) and you don't have the files, DO NOT ask them to upload. Use 'generate_video_asset' or 'generate_image_asset'.
    4. **STYLE MATCHING & MODEL SELECTION**: 
       - Use 'veo-3.1-generate-preview' for high quality video.
       - Use 'gemini-3-pro-image-preview' for high quality images.
    5. **SMART EDITING**: 
       - If the user asks for a "loop", "beat sync", or identifying objects, use the 'perform_smart_edit' tool.
       - Example: "Loop this clip" -> perform_smart_edit(type='loop', targetClipId=...)
    
    OUTPUT JSON SCHEMA:
    {
        "thought": "First-person reasoning. Explain why you chose the specific model and parameters.",
        "plan": {
            "goal": "High level goal",
            "reasoning": "Why this plan works",
            "steps": [
                {
                    "id": "step_1",
                    "intent": "Human readable intent",
                    "operation": "function_name",
                    "parameters": { ...args for function... },
                    "reasoning": "Why this specific step"
                }
            ]
        }
    }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                tools: [{ functionDeclarations: TIMELINE_PRIMITIVES }], 
            }
        });

        const text = response.text || "{}";
        let parsed: any = {};
        
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            console.warn("Failed to parse Brain JSON directly, attempting fallback cleanup", e);
            // Try to salvage if it's wrapped in markdown
            const match = text.match(/```json\n([\s\S]*?)\n```/);
            if (match) {
                try { parsed = JSON.parse(match[1]); } catch {}
            } else {
                // Try simpler brace matching
                const match2 = text.match(/\{[\s\S]*\}/);
                if (match2) {
                    try { parsed = JSON.parse(match2[0]); } catch {}
                }
            }
        }

        // Validate and Default
        const finalPlan = {
            thought: parsed.thought || "I have formulated a plan.",
            plan: {
                goal: parsed.plan?.goal || "Edit Timeline",
                reasoning: parsed.plan?.reasoning || "Executing based on user request.",
                steps: Array.isArray(parsed.plan?.steps) ? parsed.plan.steps : []
            }
        };

        return finalPlan;

    } catch (e) {
        console.error("Brain Agent Error", e);
        return {
            thought: "My planning process was interrupted by an error.",
            plan: { goal: "Error Recovery", reasoning: "Failed to generate plan structure.", steps: [] }
        };
    }
  }
}
