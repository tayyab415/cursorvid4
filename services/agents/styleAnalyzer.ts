
import { getAiClient } from '../gemini';
import { Clip, EditPlan } from '../../types';
import { extractFramesFromVideo } from '../../utils/videoUtils';

export interface EditingStyle {
  cutStyle: string;
  averageCutDuration: number;
  pacing: 'fast' | 'medium' | 'slow';
  transitionTypes: string[];
  rhythmPattern: string;
  colorGrade: string;
  recommendations: string[];
}

export class StyleAnalyzer {
  async analyzeReferenceVideo(videoFile: File): Promise<EditingStyle> {
    const ai = getAiClient();
    
    // Extract frames to understand visual flow (every few seconds)
    const frames = await extractFramesFromVideo(videoFile, 12);
    
    const prompt = `
    ROLE: Professional Film Editor & Colorist.
    TASK: Analyze the visual editing style of this reference video based on the provided keyframes.
    
    OUTPUT JSON SCHEMA:
    {
        "cutStyle": "jump_cuts|smooth|montage|linear|dynamic",
        "averageCutDuration": number (in seconds, estimate),
        "pacing": "fast|medium|slow",
        "transitionTypes": ["cut", "fade", "wipe", "zoom", "morph"],
        "rhythmPattern": "string (e.g. 'on-beat', 'chaotic', 'slow-build')",
        "colorGrade": "string (e.g. 'teal-orange', 'b&w', 'saturated', 'vintage')",
        "recommendations": ["string (specific editing rules to mimic this style)"]
    }
    `;

    const parts: any[] = frames.map(f => ({
        inlineData: { mimeType: 'image/jpeg', data: f.split(',')[1] }
    }));
    parts.push({ text: prompt });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: { role: 'user', parts },
            config: { responseMimeType: 'application/json' }
        });

        const text = response.text || "{}";
        return JSON.parse(text);
    } catch (e) {
        console.error("Style Analysis Parse Error", e);
        return {
            cutStyle: "standard",
            averageCutDuration: 4,
            pacing: "medium",
            transitionTypes: ["cut"],
            rhythmPattern: "steady",
            colorGrade: "natural",
            recommendations: ["Keep cuts steady", "Use standard transitions"]
        };
    }
  }

  generateStylePlan(style: EditingStyle, currentClips: Clip[]): EditPlan {
      const steps = [];
      
      // Pacing step
      steps.push({
          id: 'style-pace',
          intent: `Retime clips to ${style.pacing} pacing`,
          reasoning: `Reference video uses ${style.pacing} pacing with approx ${style.averageCutDuration}s cuts.`,
          status: 'pending' as const
      });

      // Color/Style step
      if (style.colorGrade && style.colorGrade.toLowerCase() !== 'natural') {
          steps.push({
              id: 'style-grade',
              intent: `Match color grade: ${style.colorGrade}`,
              reasoning: "Aligning visual tone with reference.",
              status: 'pending' as const
          });
      }
      
      // Rhythm step
      if (style.recommendations && style.recommendations.length > 0) {
           steps.push({
              id: 'style-rules',
              intent: `Apply style rules: ${style.recommendations[0]}`,
              reasoning: "Following reference editorial guidelines.",
              status: 'pending' as const
          });
      }

      return {
          goal: `Apply Reference Style (${style.cutStyle})`,
          analysis: `Detected ${style.cutStyle} style with ${style.pacing} pacing and ${style.colorGrade} look.`,
          steps
      };
  }
}
