
import React from 'react';
import { EditPlan, PlanStep } from '../../types';
import { CheckCircle2, Circle, Loader2, Clock, PlayCircle } from 'lucide-react';

interface PlanWidgetProps {
  plan: EditPlan | null;
  currentStepIndex: number;
}

export const PlanWidget: React.FC<PlanWidgetProps> = ({ plan, currentStepIndex }) => {
  if (!plan) return null;

  return (
    <div className="bg-neutral-900 border-b border-neutral-800 p-4">
      <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Current Plan</h3>
            <p className="text-xs text-white font-medium mt-0.5">{plan.goal}</p>
          </div>
          <div className="text-[10px] font-mono text-neutral-500">
              {Math.min(currentStepIndex, plan.steps.length)}/{plan.steps.length}
          </div>
      </div>
      
      <div className="space-y-2">
        {plan.steps.map((step, index) => {
          let statusIcon = <Circle size={14} className="text-neutral-600" />;
          let statusColor = "text-neutral-500";
          let bgClass = "bg-neutral-800/30 border-transparent";

          if (step.status === 'completed') {
              statusIcon = <CheckCircle2 size={14} className="text-emerald-500" />;
              statusColor = "text-neutral-400 line-through decoration-neutral-600";
              bgClass = "bg-neutral-900 border-transparent opacity-60";
          } else if (step.status === 'generating' || step.status === 'approved') {
              statusIcon = <Loader2 size={14} className="text-blue-400 animate-spin" />;
              statusColor = "text-blue-200";
              bgClass = "bg-blue-900/20 border-blue-500/30";
          } else if (index === currentStepIndex) {
              statusIcon = <PlayCircle size={14} className="text-purple-400" />;
              statusColor = "text-white";
              bgClass = "bg-purple-900/10 border-purple-500/30";
          }

          return (
            <div key={step.id} className={`flex items-start gap-3 p-2 rounded-lg border text-xs transition-all ${bgClass}`}>
                <div className="mt-0.5 shrink-0">
                    {statusIcon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`truncate font-medium ${statusColor}`}>
                        {step.intent}
                    </p>
                    {step.status === 'generating' && (
                        <p className="text-[9px] text-blue-400/80 mt-0.5 animate-pulse">
                            Generating assets...
                        </p>
                    )}
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
