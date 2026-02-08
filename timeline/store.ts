
import { Clip, Transition } from '../types';

export class TimelineStore {
  private clips: Clip[] = [];
  private transitions: Transition[] = [];
  private history: { past: { clips: Clip[], transitions: Transition[] }[]; future: { clips: Clip[], transitions: Transition[] }[] } = { past: [], future: [] };
  private listeners = new Set<(clips: Clip[], transitions: Transition[]) => void>();
  private isBatching = false;

  constructor(initialClips: Clip[] = []) {
    this.clips = initialClips;
  }

  // --- Observability ---
  getClips(): Clip[] {
    return this.clips;
  }

  getTransitions(): Transition[] {
    return this.transitions;
  }

  subscribe(fn: (clips: Clip[], transitions: Transition[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.clips, this.transitions); // Initial emit
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => fn(this.clips, this.transitions));
  }

  private saveHistory() {
    if (this.isBatching) return;
    this.history.past.push({
        clips: JSON.parse(JSON.stringify(this.clips)),
        transitions: JSON.parse(JSON.stringify(this.transitions))
    });
    this.history.future = [];
  }

  // --- Core Mutations ---
  setClips(newClips: Clip[]) {
    this.saveHistory();
    this.clips = newClips;
    this.notify();
  }

  addClip(clip: Clip) {
    this.saveHistory();
    this.clips = [...this.clips, clip];
    this.notify();
  }

  removeClip(id: string) {
    this.saveHistory();
    this.clips = this.clips.filter(c => c.id !== id);
    // Also remove associated transitions
    this.transitions = this.transitions.filter(t => t.fromClipId !== id && t.toClipId !== id);
    this.notify();
  }

  updateClip(id: string, updates: Partial<Clip>) {
    this.saveHistory();
    this.clips = this.clips.map(c => c.id === id ? { ...c, ...updates } : c);
    this.notify();
  }

  moveClip(id: string, startTime: number, trackId: number) {
    this.saveHistory();
    this.clips = this.clips.map(c => c.id === id ? { ...c, startTime, trackId } : c);
    this.notify();
  }

  // --- Transition Mutations ---
  addTransition(transition: Transition) {
      this.saveHistory();
      // Remove any existing transition between these two clips to prevent duplicates
      this.transitions = this.transitions.filter(t => !(t.fromClipId === transition.fromClipId && t.toClipId === transition.toClipId));
      this.transitions.push(transition);
      this.notify();
  }

  removeTransition(id: string) {
      this.saveHistory();
      this.transitions = this.transitions.filter(t => t.id !== id);
      this.notify();
  }

  splitClip(id: string, splitTime: number) {
    this.saveHistory();
    const original = this.clips.find(c => c.id === id);
    if (!original) return;

    if (splitTime <= original.startTime || splitTime >= original.startTime + original.duration) {
      console.warn("Split time out of bounds for clip", id);
      return;
    }

    const offset = splitTime - original.startTime;
    const speed = original.speed || 1;

    const newClip: Clip = {
      ...JSON.parse(JSON.stringify(original)), 
      id: `split-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: splitTime,
      duration: original.duration - offset,
      sourceStartTime: original.sourceStartTime + (offset * speed)
    };

    this.updateClip(id, { duration: offset });
    this.clips = [...this.clips, newClip];
    this.notify();
  }

  batch(fn: () => void) {
    this.saveHistory(); 
    this.isBatching = true;
    try {
      fn();
    } finally {
      this.isBatching = false;
      this.notify(); 
    }
  }

  // --- History ---
  undo() {
    if (this.history.past.length === 0) return;
    const previous = this.history.past.pop()!;
    this.history.future.unshift({ clips: this.clips, transitions: this.transitions });
    this.clips = previous.clips;
    this.transitions = previous.transitions;
    this.notify();
  }

  redo() {
    if (this.history.future.length === 0) return;
    const next = this.history.future.shift()!;
    this.history.past.push({ clips: this.clips, transitions: this.transitions });
    this.clips = next.clips;
    this.transitions = next.transitions;
    this.notify();
  }
  
  canUndo() { return this.history.past.length > 0; }
  canRedo() { return this.history.future.length > 0; }
}

const INITIAL_CLIPS: Clip[] = [
  { id: 'c1', title: 'Intro Scene', duration: 5, startTime: 0, sourceStartTime: 0, type: 'video', totalDuration: 60, trackId: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, speed: 1, volume: 1 },
  { id: 'c2', title: 'Main Action', duration: 8, startTime: 5, sourceStartTime: 5, type: 'video', totalDuration: 60, trackId: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, speed: 1, volume: 1 },
];

export const timelineStore = new TimelineStore(INITIAL_CLIPS);
