
import { executeTool, getToolDefinition } from '../toolRegistry';
import { timelineStore } from '../../timeline/store';

export interface HandsOutput {
  thought: string;
  success: boolean;
  changes: string[];
  error?: string;
  actionRequired?: { message: string, type: string };
  approvalRequired?: { tool: string, params: any, reasoning?: string };
}

export class HandsAgent {
  
  async execute(step: { operation: string, parameters: any, intent: string }): Promise<HandsOutput> {
    const { operation, parameters, intent } = step;
    
    try {
      // Simulate "work" time for UI visibility
      await new Promise(r => setTimeout(r, 600));

      const toolDef = getToolDefinition(operation);

      // Check if tool requires approval via metadata
      if (toolDef && toolDef.requiresApproval) {
          // Safety defaults for generation parameters if not provided
          if (parameters.trackId === undefined) {
              const clips = timelineStore.getClips();
              const safeTrack = clips.length === 0 ? 1 : Math.max(...clips.map(c => c.trackId)) + 1;
              parameters.trackId = safeTrack;
          }

          return {
              thought: `Preparing to execute ${operation}. Pausing for user approval on parameters.`,
              success: true,
              changes: [],
              approvalRequired: {
                  tool: operation,
                  params: parameters,
                  reasoning: intent
              }
          };
      }

      if (operation === 'request_user_assistance') {
           return {
              thought: `Requesting user help: ${parameters.message}`,
              success: true,
              changes: [],
              actionRequired: { message: parameters.message, type: parameters.actionType }
          };
      }

      // Delegate to Registry
      const result = await executeTool(operation, parameters);
      
      if (!result.success) {
          throw new Error(result.error || "Unknown error");
      }

      return { 
          thought: `Executing: ${intent}`,
          success: true, 
          changes: [result.message || `Executed ${operation}`]
      };
      
    } catch (error: any) {
      console.error(`[Hands] Error:`, error);
      return { 
          thought: `Failed to execute: ${intent}`,
          success: false, 
          changes: [], 
          error: error.message 
      };
    }
  }
}
