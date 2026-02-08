
import { Clip } from '../../types';

export interface CheckResult {
  passed: boolean;
  issue?: string;
  remediationHint?: string;
}

export interface VerificationCheck {
  id: string;
  name: string;
  category: 'structural' | 'visual' | 'semantic';
  run: (preState: Clip[], postState: Clip[]) => CheckResult[];
}

export const structuralChecks: VerificationCheck[] = [
  {
    id: 'min_duration',
    name: 'Minimum Duration Check',
    category: 'structural',
    run: (pre, post) => {
      const issues: CheckResult[] = [];
      post.forEach(c => {
        if (c.duration <= 0.1) {
          issues.push({
            passed: false,
            issue: `Clip "${c.title}" is too short (<0.1s).`,
            remediationHint: `Increase duration of "${c.title}" or remove it.`
          });
        }
      });
      return issues;
    }
  },
  {
    id: 'valid_start_time',
    name: 'Valid Start Time Check',
    category: 'structural',
    run: (pre, post) => {
      const issues: CheckResult[] = [];
      post.forEach(c => {
        if (Number.isNaN(c.startTime)) {
          issues.push({
            passed: false,
            issue: `Clip "${c.title}" has an invalid start time (NaN).`,
            remediationHint: `Set a valid numeric start time for "${c.title}".`
          });
        }
      });
      return issues;
    }
  },
  {
    id: 'occlusion',
    name: 'Visual Occlusion Check',
    category: 'structural',
    run: (pre, post) => {
      const issues: CheckResult[] = [];
      const preIds = new Set(pre.map(c => c.id));
      const newClips = post.filter(c => !preIds.has(c.id));
      const visualClips = post.filter(c => ['video', 'image', 'text'].includes(c.type || ''));

      for (const newClip of newClips) {
        if (['video', 'image', 'text'].includes(newClip.type || '')) {
          // Find clips on HIGHER tracks that overlap
          const occluders = visualClips.filter(c => 
            c.id !== newClip.id && 
            c.trackId > newClip.trackId && 
            Math.max(c.startTime, newClip.startTime) < Math.min(c.startTime + c.duration, newClip.startTime + newClip.duration)
          );

          if (occluders.length > 0) {
            const blockingClip = occluders[0];
            issues.push({
              passed: false,
              issue: `The new clip "${newClip.title}" is covered by "${blockingClip.title}" on Track ${blockingClip.trackId + 1}.`,
              remediationHint: `Move "${newClip.title}" to a track higher than ${blockingClip.trackId} or move "${blockingClip.title}".`
            });
          }
        }
      }
      return issues;
    }
  },
  {
    id: 'audio_gap',
    name: 'Audio/Visual Sync Check',
    category: 'structural',
    run: (pre, post) => {
      const issues: CheckResult[] = [];
      const audioClips = post.filter(c => c.type === 'audio');
      const visualClips = post.filter(c => ['video', 'image', 'text'].includes(c.type || ''));

      if (audioClips.length > 0 && visualClips.length > 0) {
        const maxVisualEnd = Math.max(...visualClips.map(c => c.startTime + c.duration));
        const maxAudioEnd = Math.max(...audioClips.map(c => c.startTime + c.duration));

        if (maxAudioEnd > maxVisualEnd + 0.5) {
          const diff = (maxAudioEnd - maxVisualEnd).toFixed(1);
          issues.push({
            passed: false,
            issue: `CRITICAL: Audio continues for ${diff}s after visuals end (Black Screen).`,
            remediationHint: `Extend a visual clip or trim the audio to match the video end time.`
          });
        }
      }
      return issues;
    }
  },
  {
    id: 'audio_overlap',
    name: 'Audio Overlap Check',
    category: 'structural',
    run: (pre, post) => {
      const issues: CheckResult[] = [];
      const audioClips = post.filter(c => c.type === 'audio');
      const sortedAudio = [...audioClips].sort((a, b) => a.startTime - b.startTime);
      
      for (let i = 0; i < sortedAudio.length - 1; i++) {
        const current = sortedAudio[i];
        const next = sortedAudio[i+1];
        
        const overlapStart = Math.max(current.startTime, next.startTime);
        const overlapEnd = Math.min(current.startTime + current.duration, next.startTime + next.duration);
        const overlapDuration = overlapEnd - overlapStart;

        if (overlapDuration > 0.5) {
           issues.push({
             passed: false,
             issue: `AUDIO CLASH: Audio clip "${current.title}" overlaps with "${next.title}" by ${overlapDuration.toFixed(1)}s.`,
             remediationHint: `Move "${next.title}" to start after "${current.title}" ends.`
           });
        }
      }
      return issues;
    }
  }
];

export const runStructuralChecks = (preState: Clip[], postState: Clip[]): { passed: boolean, issues: string[], remediationHints: string[] } => {
  const allIssues: string[] = [];
  const allHints: string[] = [];

  structuralChecks.forEach(check => {
    const results = check.run(preState, postState);
    results.forEach(res => {
      if (!res.passed && res.issue) {
        allIssues.push(res.issue);
        if (res.remediationHint) allHints.push(res.remediationHint);
      }
    });
  });

  return {
    passed: allIssues.length === 0,
    issues: allIssues,
    remediationHints: allHints
  };
};
