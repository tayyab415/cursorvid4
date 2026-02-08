
import { GoogleGenAI, Type, FunctionDeclaration, Modality, FunctionCallingConfigMode, GenerateContentResponse } from "@google/genai";
import { Clip, ToolAction, PlacementDecision, EditPlan, Suggestion, PlanStep, VideoIntent } from "../types";
import { TIMELINE_PRIMITIVES } from "./timelinePrimitives";

// Export this for agents to use
export const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY is not defined");
  }
  return new GoogleGenAI({ apiKey });
};

// Retry helper
export async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED'))) {
      console.warn(`Quota hit. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(r => setTimeout(r, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Helper to safely parse JSON from model responses
const tryParseJSON = (text: string) => {
    if (!text) return null;
    try {
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        // Fallback: try to extract JSON object structure
        const match = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e2) {
                return null;
            }
        }
        return null;
    }
};

// --- TOOL DEFINITIONS ---

const updateVideoIntentTool: FunctionDeclaration = {
  name: 'update_video_intent',
  description: 'Call this when you have inferred or confirmed the video platform, goal, or tone from the user conversation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      platform: { type: Type.STRING, description: "The target platform (TikTok, YouTube, Instagram, TV, Internal)." },
      goal: { type: Type.STRING, description: "The creative goal (Viral, Educational, Storytelling, Authority)." },
      tone: { type: Type.STRING, description: "The desired tone (Energetic, Cinematic, Professional, Calm)." }
    }
  }
};

const createEditPlanTool: FunctionDeclaration = {
  name: 'create_edit_plan',
  description: 'Propose a structured, multi-step plan to improve or edit the video based on high-level goals. Use this for complex requests.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      goal: {
        type: Type.STRING,
        description: 'The overall creative goal being addressed.'
      },
      analysis: {
        type: Type.STRING,
        description: 'A brief, sharp analysis of the current timeline (Director’s note).'
      },
      steps: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            intent: { type: Type.STRING, description: 'What needs to happen semantically (e.g. "Add a punchy intro voiceover").' },
            category: { type: Type.STRING, enum: ['visual', 'audio', 'pacing', 'style'] },
            reasoning: { type: Type.STRING, description: 'Why this step is necessary for the goal.' },
            timestamp: { type: Type.NUMBER, description: 'Optional timeline marker in seconds.' }
          },
          required: ['id', 'intent', 'reasoning']
        }
      }
    },
    required: ['goal', 'analysis', 'steps']
  }
};

const performAnalysisTool: FunctionDeclaration = {
    name: 'perform_deep_analysis',
    description: 'Use this tool IMMEDIATELY when the user asks to "analyze", "review", or "check" the video. This delegates the task to a specialized factual analysis engine.',
    parameters: { type: Type.OBJECT, properties: {} }
};

// --- CHAT SERVICE ---

export const chatWithGemini = async (
    history: { role: 'user' | 'model' | 'system', text?: string, parts?: any[] }[],
    message: string | any[],
    currentIntent?: VideoIntent
): Promise<{ text: string, toolAction?: ToolAction, plan?: EditPlan, intentUpdate?: VideoIntent, shouldAnalyze?: boolean }> => {
    const ai = getAiClient();
    
    const apiHistory = history
        .filter(msg => ['user', 'model', 'system'].includes(msg.role))
        .map(msg => ({ 
            role: (msg.role === 'system' ? 'user' : msg.role) as 'user' | 'model', 
            parts: msg.parts || [{ text: msg.role === 'system' ? `[SYSTEM UPDATE]: ${msg.text}` : (msg.text || '') }] 
        }));

    const intentContext = currentIntent ? `
    ESTABLISHED VIDEO INTENT:
    - Platform: ${currentIntent.platform || 'Unknown'}
    - Goal: ${currentIntent.goal || 'Unknown'}
    - Tone: ${currentIntent.tone || 'Unknown'}
    ` : "ESTABLISHED VIDEO INTENT: None yet.";

    const systemInstruction = `
You are the INTELLIGENT DIRECTOR for an AI Video Editor.
You coordinate between the User, the Analysis Engine, and the Editing Tools.

${intentContext}

========================
THE PIPELINE
========================
1. **ANALYSIS**: If user asks to analyze, call 'perform_deep_analysis'.
2. **PLANNING**: If user makes a complex request ("Fix the pacing"), call 'create_edit_plan'.
3. **EXECUTION**: If user gives a direct command ("Delete the first clip", "Add voiceover"), use the TIMELINE PRIMITIVES directly (update_clip_property, ripple_delete, etc).

Do not hallucinate responses. Use tools.
    `;

    const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        history: apiHistory,
        config: {
            systemInstruction: systemInstruction,
            tools: [{ 
                functionDeclarations: [
                    createEditPlanTool, 
                    performAnalysisTool, 
                    updateVideoIntentTool,
                    ...TIMELINE_PRIMITIVES 
                ] 
            }],
        }
    });

    try {
        const msgPayload = typeof message === 'string' ? { message } : { message: message };
        // Apply retry logic here
        const result: GenerateContentResponse = await callWithRetry(() => chat.sendMessage(msgPayload));
        
        let toolAction: ToolAction | undefined;
        let editPlan: EditPlan | undefined;
        let intentUpdate: VideoIntent | undefined;
        let shouldAnalyze = false;

        if (result.functionCalls && result.functionCalls.length > 0) {
            for (const call of result.functionCalls) {
                const args = call.args as any;
                
                if (call.name === 'create_edit_plan') {
                    editPlan = {
                        goal: args.goal,
                        analysis: args.analysis,
                        steps: args.steps.map((s: any) => ({ ...s, status: 'approved' }))
                    };
                } else if (call.name === 'update_video_intent') {
                    intentUpdate = {
                        platform: args.platform,
                        goal: args.goal,
                        tone: args.tone
                    };
                } else if (call.name === 'perform_deep_analysis') {
                    shouldAnalyze = true;
                } else {
                    // It's a primitive call! Map it to a "Single Action"
                    toolAction = {
                        tool_id: call.name as any,
                        button_label: `Execute ${call.name.replace(/_/g, ' ')}`,
                        reasoning: "Direct execution command",
                        parameters: args
                    };
                }
            }
        }

        // Avoid SDK warning by checking for text existence manually instead of accessing .text getter when it might be empty
        let responseText = "";
        const textPart = result.candidates?.[0]?.content?.parts?.find(p => p.text);
        if (textPart && textPart.text) {
            responseText = textPart.text;
        } else {
             // Fallback text if no text part exists but we have actions
             if (shouldAnalyze) responseText = "Initializing Analysis Engine...";
             else if (editPlan) responseText = "Proposed Edit Plan:";
             else if (toolAction) responseText = "Suggested Action:";
             else if (intentUpdate) responseText = "Intent Updated.";
        }

        return { 
            text: responseText,
            toolAction, 
            plan: editPlan,
            intentUpdate,
            shouldAnalyze
        };
    } catch (e: any) {
        console.error("Chat Error:", e);
        if (e.status === 429 || e.code === 429) {
             return { text: "I'm currently receiving too many requests. Please wait a moment and try again." };
        }
        return { text: "Communication error. Please check your API key and network." };
    }
};

/**
 * INDEPENDENT ANALYSIS LAYER (Perception Engine)
 */
export const performDeepAnalysis = async (mediaParts: any[]): Promise<string> => {
    const ai = getAiClient();
    
    const systemPrompt = `
    ROLE: Independent Video Analysis Engine.
    TASK: Provide a purely factual, neutral, and technical breakdown of the video timeline based on the PROVIDED AUDIO AND VISUAL FRAMES.
    
    INSTRUCTIONS:
    1. **LOOK AT THE IMAGES**: Describe the visual content (lighting, subject, movement, color palette).
    2. **LISTEN TO THE AUDIO**: Describe what is being said, the music mood, or if it is silent.
    3. **GROUND TRUTH**: The visual/audio parts are the truth.
    4. **NO ADVICE**: Do not suggest edits.
    5. **FORMAT**: Markdown. Sections: Visuals, Audio, Pacing, Structure.
    `;

    try {
        const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-pro-preview', // Keep Pro for analysis as it's better at vision
            contents: {
                role: 'user',
                parts: [
                    ...mediaParts,
                    { text: "Generate Deep Analysis Report based on the provided frames and audio." }
                ]
            },
            config: { systemInstruction: systemPrompt }
        }));
        
        const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
        return textPart?.text || "Analysis could not be generated.";
    } catch (e) {
        console.error("Analysis Layer Error:", e);
        return "Error: Analysis Layer failed to respond.";
    }
};

// ... helper functions ...
export const generateRefinement = async (originalContext: string, toolType: 'VOICEOVER' | 'TRANSITION'): Promise<string> => {
    const ai = getAiClient();
    const prompt = toolType === 'VOICEOVER'
        ? `You previously suggested a voiceover with this reasoning: "${originalContext}". Write a short, engaging, professional script (max 2 sentences) for this voiceover. Return ONLY the raw text to be spoken. Do not include quotes or labels.`
        : `You previously suggested a video transition with this reasoning: "${originalContext}". Write a highly detailed visual prompt for an AI video generator to create this transition. Return ONLY the raw prompt text.`;
    
    const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt }));
    return response.text?.trim() || "";
};

export const determinePlacement = async (currentClips: Clip[], assetType: 'audio' | 'video', assetDuration: number, intentReasoning: string, proposedTimestamp?: number): Promise<PlacementDecision> => {
    const ai = getAiClient();
    const prompt = `Timeline: ${JSON.stringify(currentClips.map(c=>({id:c.id, t:c.type, s:c.startTime, d:c.duration})))}. User intent: "${intentReasoning}". New asset: ${assetType} (${assetDuration}s). Decision? JSON: {strategy, startTime, trackId, reasoning}`;
    const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt, config: { responseMimeType: "application/json" }}));
    return JSON.parse(response.text || "{}");
};

export const analyzeVideoFrames = async (base64Frames: string[], prompt: string): Promise<string> => {
  const ai = getAiClient();
  const parts: any[] = [{ text: prompt }];
  base64Frames.forEach((frameData) => {
    const cleanData = frameData.split(',')[1] || frameData;
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanData }});
  });
  const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: { parts: parts }}));
  return response.text || "";
};

export const suggestEdits = async (currentClips: Clip[]): Promise<Suggestion[]> => { return []; };

// --- GENERATION CAPABILITIES ---

export const optimizePrompt = async (originalPrompt: string, targetModelType: 'imagen' | 'veo' | 'nano_banana', referenceImage?: string | null): Promise<string> => {
    const ai = getAiClient();
    
    let guidelines = "";
    if (targetModelType === 'imagen') {
        guidelines = `
        Ref: https://ai.google.dev/gemini-api/docs/imagen#imagen-prompt-guide
        - Subject: Clearly define the main subject.
        - Medium/Style: Specify (e.g., oil painting, photorealistic, 3D render).
        - Lighting: Describe lighting (e.g., golden hour, cinematic, studio).
        - Color: Mention color palette.
        - Composition: Camera angle, framing (e.g., wide shot, close-up).
        - Avoid negative prompts if possible, focus on what TO include.
        `;
    } else if (targetModelType === 'veo') {
        guidelines = `
        Ref: https://ai.google.dev/gemini-api/docs/video?example=dialogue#prompt-guide
        - Describe motion explicitly (panning, zooming, character movement).
        - Set the scene (lighting, atmosphere).
        - Define the camera (cinematic, drone shot, handheld).
        - Keep it continuous and fluid.
        - Mention physics/interaction if relevant.
        `;
    } else { // nano banana
        guidelines = `
        Ref: https://ai.google.dev/gemini-api/docs/image-generation#prompt-guide
        - Be descriptive but concise.
        - Specify art style or realistic.
        - Visual details are key.
        `;
    }

    const promptText = `
    ROLE: You are an Expert Prompt Engineer for Google's AI models.
    TASK: Optimize the user's prompt for the '${targetModelType}' model.
    USER PROMPT: "${originalPrompt}"
    ${referenceImage ? "CONTEXT: The user has provided a reference image (attached). Ensure the optimized prompt maintains visual consistency with this image if appropriate." : ""}
    
    GUIDELINES TO APPLY:
    ${guidelines}
    
    INSTRUCTIONS:
    1. Expand on vague concepts.
    2. Add missing stylistic or technical details (lighting, camera).
    3. Ensure the prompt is formatted optimally for the specific model.
    4. RETURN ONLY THE OPTIMIZED PROMPT TEXT. NO EXPLANATION.
    `;

    const contents: any = [{ role: 'user', parts: [] }];
    if (referenceImage) {
        const cleanData = referenceImage.includes(',') ? referenceImage.split(',')[1] : referenceImage;
        contents[0].parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanData } });
    }
    contents[0].parts.push({ text: promptText });

    try {
        const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview', // Use Flash because it is multimodal and fast
            contents: contents
        }));
        return response.text?.trim() || originalPrompt;
    } catch (e) {
        console.error("Prompt Optimization Error", e);
        return originalPrompt;
    }
}

export const generateImage = async (prompt: string, model: string = 'gemini-2.5-flash-image', aspectRatio: string = '16:9'): Promise<string> => { 
    const ai = getAiClient();
    try {
        // Handle Imagen models
        if (model.includes('imagen-')) {
            const response: any = await callWithRetry(() => ai.models.generateImages({
                model: model,
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio: aspectRatio as any, 
                    outputMimeType: 'image/jpeg'
                }
            }));
            
            const b64 = response.generatedImages?.[0]?.image?.imageBytes;
            if (!b64) throw new Error("No image generated by Imagen");
            return b64;
        }

        // Handle Nano Banana / Flash Image
        const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: prompt }] },
            config: {
                imageConfig: { aspectRatio: aspectRatio as any }
            }
        }));
        
        // Find image part
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('image')) {
                return part.inlineData.data;
            }
        }
        throw new Error("No image generated");
    } catch (e) {
        console.error("Image Gen Error", e);
        throw e;
    }
};

export const editImage = async (base64Image: string, prompt: string, model: string = 'gemini-2.5-flash-image'): Promise<string> => {
    const ai = getAiClient();
    const cleanData = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    
    try {
        const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
            model: model,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: cleanData } },
                    { text: prompt }
                ]
            }
        }));

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('image')) {
                return part.inlineData.data;
            }
        }
        throw new Error("No edited image generated");
    } catch (e) {
        console.error("Edit Image Error", e);
        throw e;
    }
};

export const generateVideo = async (
    prompt: string, 
    model: string = 'veo-3.1-fast-generate-preview', 
    aspectRatio: string = '16:9', 
    resolution: string = '720p', 
    duration: number = 8, 
    startImage?: string | null, 
    endImage?: string | null,
    referenceImages?: string[] | null // Added support for generic reference images
): Promise<string> => { 
    const ai = getAiClient();
    try {
        const imagePart = startImage ? {
            imageBytes: startImage.includes(',') ? startImage.split(',')[1] : startImage,
            mimeType: 'image/jpeg' 
        } : undefined;

        // If explicitly using referenceImages logic (Veo 3.1 specific)
        let config: any = {
            numberOfVideos: 1,
            aspectRatio: aspectRatio as any,
            resolution: resolution as any
        };

        if (endImage) {
            config.lastFrame = {
                imageBytes: endImage.includes(',') ? endImage.split(',')[1] : endImage,
                mimeType: 'image/jpeg'
            };
        }

        if (referenceImages && referenceImages.length > 0) {
             const refs = referenceImages.map(img => ({
                 image: {
                     imageBytes: img.includes(',') ? img.split(',')[1] : img,
                     mimeType: 'image/jpeg'
                 },
                 referenceType: 'ASSET' 
             }));
             config.referenceImages = refs;
        }

        let operation = await ai.models.generateVideos({
            model: model,
            prompt: prompt,
            image: imagePart,
            config: config
        });

        // Poll for completion
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({operation: operation});
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("No video URI returned");

        // Fetch the actual bytes using the API key
        const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await videoRes.blob();
        return URL.createObjectURL(blob);

    } catch (e: any) {
        console.error("Video Gen Error", e);
        // Throw improved error for UI
        if (e.message?.includes("PERMISSION_DENIED") || e.status === 403) {
            throw new Error("Permission Denied (403). Please select a valid API Key from a paid project via the 'Select API Key' button.");
        }
        throw e;
    }
};

const base64ToUint8Array = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const pcmToWav = (pcmData: Uint8Array, sampleRate: number, numChannels: number): string => {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); 
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); 
  view.setUint16(32, numChannels * 2, true); 
  view.setUint16(34, 16, true); 
  writeString(36, 'data');
  view.setUint32(40, pcmData.length, true);

  const blob = new Blob([header, pcmData], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
    const ai = getAiClient();
    const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: { 
          responseModalities: [Modality.AUDIO], 
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
    }));
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    const pcmData = base64ToUint8Array(base64Audio);
    return pcmToWav(pcmData, 24000, 1);
};

export const generateSubtitles = async (audioBase64: string): Promise<{start: number, end: number, text: string}[]> => {
    const ai = getAiClient();
    try {
        const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
            model: "gemini-3-flash-preview", 
            contents: {
                parts: [
                    { inlineData: { mimeType: "audio/wav", data: audioBase64 } },
                    { text: "Transcribe the audio accurately. Return a JSON array where each item has: 'start' (float seconds), 'end' (float seconds), and 'text' (string)." }
                ]
            },
            config: { 
                responseMimeType: "application/json"
            }
        }));

        const parsed = tryParseJSON(response.text || "");
        if (Array.isArray(parsed)) return parsed;
        return [];
    } catch (e) {
        console.error("Subtitle generation failed", e);
        return [];
    }
};
