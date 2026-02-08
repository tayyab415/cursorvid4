import { PlanStep } from '../../types';
import { timelineStore } from '../../timeline/store';
import { ExecutorAgent } from './executor';
import { VerifierAgent, VerifierOutput } from './verifier';
import { TIMELINE_PRIMITIVES } from '../timelinePrimitives';
import { getAiClient } from '../gemini';
import { FunctionCallingConfigMode } from '@google/genai';

interface StepResult {
    step: PlanStep;
    status: string;
    error?: string;
    issues?: string[] | null;
}

interface ExecutionReport {
    results: StepResult[];
    successCount: number;
}

export class OrchestratorAgent {
  private executor = new ExecutorAgent();
  private verifier = new VerifierAgent();
  
  async executePlanWithVerification(
    steps: PlanStep[],
    onProgress: (status: string) => void
  ): Promise<ExecutionReport> {
    
    const results: StepResult[] = [];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      onProgress(`Executing step ${i+1}/${steps.length}: ${step.intent}`);
      
      // Capture pre-state
      const preState = [...timelineStore.getClips()];
      
      // Execute
      let execResult;
      try {
          execResult = await this.executeStep(step);
      } catch (e: any) {
          console.error(`Step Execution Failed: ${step.intent}`, e);
          results.push({ step, status: 'failed', error: e.message });
          continue;
      }
      
      if (!execResult.success) {
        results.push({ step, status: 'failed', error: execResult.error });
        continue;
      }
      
      // Wait for React state propagation / Store updates
      await new Promise(r => setTimeout(r, 500));
      
      // Verify
      const postState = [...timelineStore.getClips()];
      const verification = await this.verifier.verify(
        step.intent,
        execResult.operation,
        preState,
        postState
      );
      
      if (verification.passed) {
        results.push({ step, status: 'success' });
      } else {
        // AUTO-RETRY: Ask Gemini to fix the issue
        onProgress(`Issue detected. Attempting auto-fix for: ${step.intent}`);
        const retryStep = await this.generateFixStep(step, verification);
        
        // Extract issues manually since VerifierOutput structure separates them
        const issues = [
            ...(verification.checks.structural.issues || []),
            !verification.checks.intentAlignment.passed ? verification.checks.intentAlignment.reasoning : null
        ].filter(Boolean) as string[];

        if (retryStep) {
          try {
              const retryResult = await this.executeStep(retryStep);
              if (retryResult.success) {
                   results.push({ 
                        step, 
                        status: 'success_after_retry',
                        issues: issues
                   });
              } else {
                   results.push({ step, status: 'failed_retry', issues: issues });
              }
          } catch (e) {
               results.push({ step, status: 'failed_retry_exception', issues: issues });
          }
        } else {
          results.push({ step, status: 'failed_verification', issues: issues });
        }
      }
    }
    
    return { results, successCount: results.filter(r => r.status.includes('success')).length };
  }
  
  private async executeStep(step: PlanStep) {
    // Call Gemini with step.intent + timeline primitives
    const ai = getAiClient();
    const prompt = `
    CONTEXT: You are the Execution Engine.
    TASK: Translate the user intent into a specific function call.
    INTENT: "${step.intent}"
    REASONING: "${step.reasoning}"
    
    CURRENT TIMELINE:
    ${JSON.stringify(timelineStore.getClips().map(c => ({id:c.id, title:c.title, start:c.startTime, dur:c.duration, track:c.trackId})))}
    
    Available Tools:
    - update_clip_property: Move, resize, volume, speed.
    - apply_visual_transform: Zoom, Pan, Scale, Rotate.
    - ripple_delete: Remove clip and close gap.
    - split_clip: Cut a clip.
    - generate_voiceover: Create new audio.
    - generate_video_asset: Create new video (Veo).
    - generate_image_asset: Create new image (Gemini).
    - add_text_overlay: Add text/subtitles/titles.
    `;

    try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            tools: [{ functionDeclarations: TIMELINE_PRIMITIVES }],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } }
          }
        });
        
        let functionCall = null;
        if (response.functionCalls && response.functionCalls.length > 0) {
            functionCall = response.functionCalls[0];
        } else if (response.candidates?.[0]?.content?.parts) {
            functionCall = response.candidates[0].content.parts.find(p => p.functionCall)?.functionCall;
        }

        if (!functionCall) {
            throw new Error('No operation generated by AI');
        }
        
        return await this.executor.execute(functionCall);

    } catch (e) {
        console.error("Gemini Execution Error", e);
        throw e;
    }
  }
  
  private async generateFixStep(originalStep: PlanStep, verification: VerifierOutput): Promise<PlanStep | null> {
    const issues = [
        ...(verification.checks.structural.issues || []),
        !verification.checks.intentAlignment.passed ? verification.checks.intentAlignment.reasoning : null
    ].filter(Boolean) as string[];

    const ai = getAiClient();
    const prompt = `
    You attempted: "${originalStep.intent}"
    Issues detected: ${issues.join(', ')}
    Suggestion: ${verification.suggestion}

    Generate a corrective step (intent and reasoning). 
    Return JSON: { "intent": "string", "reasoning": "string" }
    `;
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const text = response.text || "{}";
      const fix = JSON.parse(text);
      if (!fix.intent) return null;
      return { ...originalStep, intent: fix.intent, reasoning: fix.reasoning };
    } catch {
      return null;
    }
  }
}
