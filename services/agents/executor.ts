
import { executeTool } from '../toolRegistry';

interface ExecutionResult {
  success: boolean;
  operation: string;
  clipId?: string;
  error?: string;
}

export class ExecutorAgent {
  async execute(functionCall: { name: string; args: any }): Promise<ExecutionResult> {
    const { name, args } = functionCall;
    
    try {
      console.log(`[Executor] Running ${name}`, args);
      
      const result = await executeTool(name, args);
      
      return {
          success: result.success,
          operation: name,
          clipId: result.clipId,
          error: result.error
      };

    } catch (error: any) {
      console.error(`[Executor] Error:`, error);
      return { success: false, operation: name, error: error.message };
    }
  }
}
