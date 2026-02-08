
import React from 'react';
import { ToolAction } from '../../types';
import { Sparkles, ArrowRight, Scissors, Mic, Wand2, Edit, Play } from 'lucide-react';

interface ChatSuggestionCardProps {
  action: ToolAction;
  onApply: (action: ToolAction) => void;
}

export const ChatSuggestionCard: React.FC<ChatSuggestionCardProps> = ({ action, onApply }) => {
  const getIcon = () => {
    // Normalize to handle both legacy IDs and new primitive names
    const id = action.tool_id.toUpperCase();
    
    if (id.includes('TRANSITION') || id.includes('VIDEO_ASSET')) return <Wand2 size={16} className="text-purple-300" />;
    if (id.includes('VOICEOVER') || id.includes('AUDIO')) return <Mic size={16} className="text-blue-300" />;
    if (id.includes('TRIM') || id.includes('SPLIT') || id.includes('DELETE')) return <Scissors size={16} className="text-pink-300" />;
    if (id.includes('IMAGE')) return <Sparkles size={16} className="text-yellow-300" />;
    
    return <Play size={16} className="text-green-300" />;
  };

  return (
    <div className="mt-3 mb-2 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-700/50 shadow-lg overflow-hidden group hover:border-purple-500/30 transition-all">
      {/* Header / Reasoning */}
      <div className="p-3 border-b border-neutral-800/50">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 p-1.5 rounded-md bg-neutral-800 border border-neutral-700 shadow-inner">
            {getIcon()}
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">
              Suggestion
            </p>
            <p className="text-xs text-neutral-300 italic leading-relaxed">
              "{action.reasoning}"
            </p>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-2 bg-neutral-950/30">
        <button
          onClick={() => onApply(action)}
          className="w-full flex items-center justify-between px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow-md hover:shadow-purple-500/20 active:scale-[0.98] transition-all group/btn"
        >
          <span>{action.button_label}</span>
          <ArrowRight size={14} className="opacity-70 group-hover/btn:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
