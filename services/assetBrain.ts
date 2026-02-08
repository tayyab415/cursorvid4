
import { getAiClient, callWithRetry } from './gemini';
import { GenerateContentResponse } from "@google/genai";

export type CompositionStrategy = 'chroma' | 'screen' | 'morph';

export interface AssetConfig {
  originalPrompt: string;
  enhancedPrompt: string;
  strategy: CompositionStrategy;
  reasoning: string;
}

const SYSTEM_INSTRUCTION = `
ROLE: You are the VFX Supervisor for a high-end AI Video Engine.
GOAL: Analyze user requests for video assets, determine the optimal Compositing Strategy, and REWRITE the prompt to ensure high-quality, ANIMATED, and cleanly separable generation.

CRITICAL: The output MUST be a video description that forces movement. Static images are failures.

STRATEGIES:

1. "screen" (Luma Key):
   - TRIGGER: Emissive/Translucent objects (Fire, lasers, neon, holograms, smoke, magic, lightning, explosions, ghosts).
   - PHYSICS: Light additively blends. Green screen creates ugly fringing on glow.
   - PROMPT GENERATION: 
     - START WITH: "Cinematic sequence of..."
     - DESCRIBE MOTION: Use verbs like "exploding", "swirling", "pulsing", "flowing", "emitting".
     - BACKGROUND: "...isolated on a void pure black background, high contrast, bloom effect, volumetric lighting, no ambient light".

2. "chroma" (Chroma Key):
   - TRIGGER: Solid/Opaque objects (Robots, animals, 3D text, vehicles, furniture, people, kinetic typography).
   - PHYSICS: Object obscures background. Needs distinct edge.
   - PROMPT GENERATION:
     - START WITH: "Action shot of..." or "Kinetic animation of..."
     - DESCRIBE MOTION: 
        - IF TEXT: "Kinetic typography, letters forming, animating in, 3D glossy motion".
        - IF CHARACTER: "Running", "Dancing", "Rotating", "Moving", "Looping action".
     - BACKGROUND: "...isolated on a flat pure green screen background (hex #00FF00), even studio lighting, sharp edges, no motion blur, distinct outline, minimal shadow fallout".

3. "morph" (Transition):
   - TRIGGER: Requests to change A to B.
   - PROMPT GENERATION: "Morphing transformation from [A] to [B], smooth transition, seamless VFX".

OUTPUT FORMAT (JSON ONLY):
{
  "strategy": "screen" | "chroma" | "morph",
  "enhancedPrompt": "The FULLY REWRITTEN prompt. Must be descriptive and force animation.",
  "reasoning": "Brief physics explanation (e.g. 'Fire is emissive, needs black bg')."
}
`;

export const assetBrain = {
  /**
   * Analyzes the physics of a request to determine how it should be rendered.
   */
  decideStrategy: async (userPrompt: string): Promise<AssetConfig> => {
    const ai = getAiClient();
    
    // Inject "in motion" to the user prompt context to bias the model towards animation
    const prompt = `User Request: "${userPrompt}" (Ensure the output prompt describes MOVEMENT/ANIMATION)`;

    try {
      const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json'
        }
      }));

      const jsonText = response.text || "{}";
      const result = JSON.parse(jsonText);

      return {
        originalPrompt: userPrompt,
        enhancedPrompt: result.enhancedPrompt || userPrompt,
        strategy: result.strategy || 'chroma',
        reasoning: result.reasoning || 'Default strategy applied.'
      };

    } catch (error) {
      console.error("AssetBrain Error:", error);
      // Fallback safe mode
      return {
        originalPrompt: userPrompt,
        enhancedPrompt: `Kinetic animation of ${userPrompt}, moving dynamically, isolated on green screen background`,
        strategy: 'chroma',
        reasoning: 'AI Service unavailable, defaulting to Chroma.'
      };
    }
  }
};
