
import { TimelineStore } from './store';
import { Clip } from '../types';

export const TimelineOps = {
  updateClipProperty: (store: TimelineStore, clipId: string, property: keyof Clip, value: any) => {
    store.updateClip(clipId, { [property]: value });
  },

  rippleDelete: (store: TimelineStore, clipId: string) => {
    store.batch(() => {
        const clips = store.getClips();
        const clip = clips.find(c => c.id === clipId);
        if (!clip) return;

        // 1. Remove the target clip
        store.removeClip(clipId);
        
        // 2. Shift subsequent clips on the same track
        const clipsToShift = store.getClips().filter(c => c.trackId === clip.trackId && c.startTime > clip.startTime);
        clipsToShift.forEach(c => {
            store.updateClip(c.id, { startTime: Math.max(0, c.startTime - clip.duration) });
        });
    });
  },

  trimClip: (store: TimelineStore, clipId: string, newDuration: number) => {
    store.updateClip(clipId, { duration: newDuration });
  },

  trimClipStart: (store: TimelineStore, clipId: string, timeToRemove: number) => {
    const clip = store.getClips().find(c => c.id === clipId);
    if (!clip) return;

    if (timeToRemove >= clip.duration) {
        // Equivalent to delete if we remove everything
        store.removeClip(clipId);
        return;
    }

    const speed = clip.speed || 1;
    store.updateClip(clipId, {
        startTime: clip.startTime + timeToRemove,
        duration: clip.duration - timeToRemove,
        sourceStartTime: clip.sourceStartTime + (timeToRemove * speed)
    });
  },

  setClipLayer: (store: TimelineStore, clipId: string, trackId: number) => {
      store.updateClip(clipId, { trackId });
  },

  moveClip: (store: TimelineStore, clipId: string, startTime: number, trackId?: number) => {
    const clip = store.getClips().find(c => c.id === clipId);
    if (clip) {
        store.moveClip(clipId, startTime, trackId ?? clip.trackId);
    }
  },

  splitClip: (store: TimelineStore, clipId: string, splitTime: number) => {
    store.splitClip(clipId, splitTime);
  },

  addClip: (store: TimelineStore, clip: Clip) => {
    store.addClip(clip);
  }
};
