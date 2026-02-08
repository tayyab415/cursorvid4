
import React, { useState } from 'react';
import { EditPlan, PlanStep } from '../../types';
import { ClipboardList, CheckCircle2, Circle, Play, Info, ArrowRight } from 'lucide-react';

interface PlanReviewCardProps {
  plan: EditPlan;
  onExecute: (approvedSteps: PlanStep[]) => void;
}

export const PlanReviewCard: React.FC<PlanReviewCardProps> = ({ plan, onExecute }) => {
  const [steps, setSteps] = useState<PlanStep[]>(
    plan.steps.map(s => ({ ...s, status: 'approved' }))
  );

  const toggleStep = (id: string) => {
    setSteps(prev => prev.map(s => 
      s.id === id ? { ...s, status: s.status === 'approved' ? 'pending' : 'approved' } : s
    ));
  };

  const approvedCount = steps.filter(s => s.status === 'approved').length;

  return (
    <div className="mt-4 mb-2 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Director's Note Header */}
      <div className="p-4 bg-gradient-to-br from-purple-900/20 to-blue-900/10 border-b border-neutral-800">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-purple-600/20 text-purple-400">
            <ClipboardList size={16} />
          </div>
          <h3 className="text-xs font-bold text-white uppercase tracking-widest">Director's Plan</h3>
        </div>
        <p className="text-sm font-semibold text-white mb-1">{plan.goal}</p>
        <p className="text-xs text-neutral-400 italic leading-relaxed">
          "{plan.analysis}"
        </p>
      </div>

      {/* Steps List */}
      <div className="flex-1 p-2 space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar bg-neutral-950/30">
        {steps.map((step) => {
          const isApproved = step.status === 'approved';
          return (
            <div 
              key={step.id}
              onClick={() => toggleStep(step.id)}
              className={`group flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                isApproved 
                  ? 'bg-neutral-800/40 border-neutral-700' 
                  : 'bg-transparent border-transparent opacity-50'
              }`}
            >
              <div className="mt-0.5 shrink-0 transition-transform group-hover:scale-110">
                {isApproved ? (
                  <CheckCircle2 size={16} className="text-purple-500" />
                ) : (
                  <Circle size={16} className="text-neutral-600" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <p className={`text-xs font-bold transition-colors ${isApproved ? 'text-neutral-100' : 'text-neutral-500'}`}>
                    {step.intent}
                  </p>
                  {step.timestamp !== undefined && (
                    <span className="text-[9px] font-mono text-neutral-500">
                      @{step.timestamp.toFixed(1)}s
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500 leading-snug">
                  {step.reasoning}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Execution Footer */}
      <div className="p-3 bg-neutral-900 border-t border-neutral-800">
        <button
          disabled={approvedCount === 0}
          onClick={() => onExecute(steps.filter(s => s.status === 'approved'))}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg disabled:opacity-30 disabled:grayscale transition-all"
        >
          <div className="flex items-center gap-2">
            <Play size={14} className="fill-white" />
            <span>Apply {approvedCount} Changes</span>
          </div>
          <ArrowRight size={14} />
        </button>
        <div className="flex items-center justify-center gap-1.5 mt-2 opacity-40">
           <Info size={10} />
           <span className="text-[9px] uppercase tracking-tighter font-bold">Autonomous Execution Enabled</span>
        </div>
      </div>
    </div>
  );
};
