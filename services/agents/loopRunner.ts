
import { EyesAgent } from './eyes';
import { BrainAgent } from './brain';
import { HandsAgent } from './hands';
import { VerifierAgent } from './verifier';
import { Clip, ToolAction, AgentContext, EditPlan, PlanStep } from '../../types';
import { timelineStore } from '../../timeline/store';

export class AgenticLoop {
  constructor(
    private eyes: EyesAgent,
    private brain: BrainAgent,
    private hands: HandsAgent,
    private verifier: VerifierAgent,
    private onThought: (agent: 'eyes' | 'brain' | 'hands' | 'verifier' | 'system', thought: string, action?: ToolAction) => void,
    private onRequestObservation?: () => Promise<string[]>
  ) {}

  // Phase 1: Analyze & Plan
  async plan(userIntent: string, context: AgentContext, mediaRefs: any): Promise<EditPlan | null> {
    try {
        this.onThought('system', "👀 Activating Perception...");
        const analysis = await this.eyes.analyze(context, mediaRefs);
        this.onThought('eyes', analysis.thought);

        this.onThought('system', "🧠 Activating Planning...");
        const brainOutput = await this.brain.plan(userIntent, analysis, context);
        this.onThought('brain', brainOutput.thought);

        // Defensive check for brain output structure
        if (!brainOutput || !brainOutput.plan || !brainOutput.plan.steps || brainOutput.plan.steps.length === 0) {
            this.onThought('system', "🛑 Brain could not formulate a valid plan. Stopping.");
            return null;
        }

        // Normalize steps with 'pending' status
        const steps: PlanStep[] = brainOutput.plan.steps.map(s => ({
            ...s,
            status: 'pending'
        }));

        return {
            goal: brainOutput.plan.goal || "Edit Timeline",
            analysis: brainOutput.plan.reasoning || "Plan generated.",
            steps: steps
        };

    } catch (e: any) {
        console.error("Planning Error", e);
        this.onThought('system', `💥 Planning Error: ${e.message}`);
        return null;
    }
  }

  // Phase 2: Execute Single Step
  async executeStep(step: PlanStep): Promise<{ success: boolean; result?: any; approvalRequired?: any; actionRequired?: any }> {
      // this.onThought('hands', `Executing: ${step.intent}`);
      const result = await this.hands.execute({
          operation: step.operation!,
          parameters: step.parameters,
          intent: step.intent
      });

      if (result.thought) this.onThought('hands', result.thought);

      if (result.approvalRequired) {
          // this.onThought('system', `🔔 Pausing for User Approval: ${result.approvalRequired.tool}`);
          return { success: true, approvalRequired: result.approvalRequired };
      }

      if (result.actionRequired) {
          const toolAction: ToolAction = {
              tool_id: 'USER_ACTION_REQUEST',
              button_label: result.actionRequired.type === 'upload' ? 'Upload Media' : 'Confirm',
              reasoning: result.actionRequired.message,
              parameters: {}
          };
          this.onThought('system', `🔔 User Action Required: ${result.actionRequired.message}`, toolAction);
          return { success: false, actionRequired: result.actionRequired };
      }

      if (!result.success) {
          this.onThought('system', `❌ Execution failed: ${result.error}`);
          return { success: false };
      }

      return { success: true };
  }

  // Phase 3: Verify Whole Plan
  async verify(originalIntent: string, preState: Clip[], postState: Clip[]) {
      this.onThought('system', "✅ Activating Verification...");
      
      let visualEvidence: string[] = [];
      if (this.onRequestObservation) {
          this.onThought('verifier', "I need to watch the video to ensure quality. Starting playback...");
          visualEvidence = await this.onRequestObservation();
          this.onThought('verifier', `I have watched the video and captured ${visualEvidence.length} frames for analysis.`);
      }

      const verification = await this.verifier.verify(originalIntent, "Plan Execution", preState, postState, visualEvidence);
      this.onThought('verifier', verification.thought);
      
      if (verification.passed) {
          this.onThought('system', `✨ All checks passed. Mission accomplished.`);
      } else {
          const issues = [
              ...(verification.checks.structural.issues || []),
              !verification.checks.intentAlignment.passed ? verification.checks.intentAlignment.reasoning : null
          ].filter(Boolean) as string[];
          
          if (issues.length > 0) {
              const formattedIssues = issues.map(i => `• ${i}`).join('\n');
              this.onThought('system', `⚠️ Verification Issues Found:\n${formattedIssues}`);
          }

          // Generate a Correction Proposal if remediation is available
          if (verification.remediation) {
              const fixAction: ToolAction = {
                  tool_id: 'REPLAN_REQUEST',
                  button_label: 'Auto-Fix Issues',
                  reasoning: `I can fix this automatically: "${verification.remediation}"`,
                  parameters: { prompt: verification.remediation }
              };
              this.onThought('verifier', "I have a plan to fix these issues.", fixAction);
          }
      }
      return verification;
  }
}
