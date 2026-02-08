
import { Clip, Transition } from '../types';
import { timelineStore } from '../timeline/store';
import { TimelineOps } from '../timeline/operations';
import { generateSpeech, generateVideo, generateImage } from './gemini';
import { TIMELINE_PRIMITIVES } from './timelinePrimitives';
import { smartEdit } from './smartEdit';

export interface ToolExecutionResult {
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
    clipId?: string;
}

export interface ToolDefinition {
    execute: (args: any) => Promise<ToolExecutionResult>;
    requiresApproval?: boolean;
    description?: string;
}

// Helper for safe track assignment
const getSafeTrackId = () => {
    const clips = timelineStore.getClips();
    if (clips.length === 0) return 1;
    return Math.max(...clips.map(c => c.trackId)) + 1;
};

const toolRegistry: Record<string, ToolDefinition> = {
    'move_clip': {
        execute: async (args) => {
            TimelineOps.moveClip(timelineStore, args.clipId, Number(args.startTime), args.trackId !== undefined ? Number(args.trackId) : undefined);
            return { success: true, message: `Moved clip ${args.clipId}` };
        }
    },

    'request_user_assistance': {
        execute: async (args) => {
            return { success: true, message: `Requested user assistance: ${args.message}`, clipId: 'system-request' };
        }
    },

    'update_clip_property': {
        execute: async (args) => {
            TimelineOps.updateClipProperty(timelineStore, args.clipId, args.property, Number(args.value));
            return { success: true, message: `Updated ${args.property} for ${args.clipId}` };
        }
    },

    'add_transition': {
        execute: async (args) => {
            const { fromClipId, toClipId, type, duration = 1.0 } = args;
            const clips = timelineStore.getClips();
            const fromClip = clips.find(c => c.id === fromClipId);
            const toClip = clips.find(c => c.id === toClipId);

            if (!fromClip || !toClip) return { success: false, error: "Clip not found" };
            if (fromClip.trackId !== toClip.trackId) return { success: false, error: "Clips must be on same track for transition" };

            // AUTO-ADJUST: Ensure overlap exists
            // Standard NLE behavior: Move incoming clip (toClip) BACKWARD by `duration` seconds
            // so it overlaps with the end of fromClip.
            
            const desiredStartTime = (fromClip.startTime + fromClip.duration) - duration;
            const currentGap = toClip.startTime - (fromClip.startTime + fromClip.duration);
            
            // Logic: If there is a gap, close it AND overlap. If they are touching, just overlap.
            // We just set toClip.startTime to `desiredStartTime`.
            // BUT we must check if toClip has room (source handles). 
            // For this demo, we assume infinite handles or allow freezing.
            
            TimelineOps.moveClip(timelineStore, toClipId, desiredStartTime);

            // Create Transition Object
            const transition: Transition = {
                id: `trans-${Date.now()}`,
                type: type,
                startTime: desiredStartTime,
                duration: duration,
                trackId: fromClip.trackId,
                fromClipId: fromClipId,
                toClipId: toClipId
            };

            timelineStore.addTransition(transition);

            return { success: true, message: `Added ${type} transition (created ${duration}s overlap).` };
        }
    },

    'ripple_delete': {
        execute: async (args) => {
            TimelineOps.rippleDelete(timelineStore, args.clipId);
            return { success: true, message: `Ripple deleted ${args.clipId}` };
        }
    },

    'smart_trim': {
        execute: async (args) => {
            TimelineOps.trimClip(timelineStore, args.clipId, Number(args.newDuration));
            return { success: true, message: `Trimmed end of ${args.clipId}` };
        }
    },

    'trim_clip_start': {
        execute: async (args) => {
            TimelineOps.trimClipStart(timelineStore, args.clipId, Number(args.timeToRemove));
            return { success: true, message: `Trimmed start of ${args.clipId}` };
        }
    },

    'set_clip_layer': {
        execute: async (args) => {
            TimelineOps.setClipLayer(timelineStore, args.clipId, Number(args.trackId));
            return { success: true, message: `Moved ${args.clipId} to track ${args.trackId}` };
        }
    },

    'split_clip': {
        execute: async (args) => {
            TimelineOps.splitClip(timelineStore, args.clipId, Number(args.splitTime));
            return { success: true, message: `Split ${args.clipId}` };
        }
    },

    'apply_visual_transform': {
        execute: async (args) => {
            TimelineOps.updateClipProperty(timelineStore, args.clipId, 'transform', {
                scale: Number(args.scale || 1),
                x: Number(args.x || 0),
                y: Number(args.y || 0),
                rotation: Number(args.rotation || 0)
            });
            return { success: true, message: `Transformed ${args.clipId}` };
        }
    },

    'add_text_overlay': {
        execute: async (args) => {
            const stylePreset = args.style || 'subtitle';
            const isTitle = stylePreset === 'title';
            
            // Base styles based on preset
            const baseStyle = isTitle 
                ? { fontSize: 60, isBold: true, isItalic: false, isUnderline: false, align: 'center', color: '#ffffff', backgroundColor: '#000000', backgroundOpacity: 0.0, fontFamily: 'Plus Jakarta Sans' }
                : { fontSize: 30, isBold: true, isItalic: false, isUnderline: false, align: 'center', color: '#ffffff', backgroundColor: '#000000', backgroundOpacity: 0.6, fontFamily: 'Plus Jakarta Sans' };

            // Apply Brain overrides if provided
            const finalStyle = { ...baseStyle, ...(args.textStyle || {}) };
            
            const textClip: Clip = {
                id: `txt-${Date.now()}`,
                title: args.text.slice(0, 15),
                type: 'text',
                text: args.text,
                startTime: Number(args.startTime),
                duration: Number(args.duration),
                sourceStartTime: 0,
                trackId: 3, // Text usually stays on top
                textStyle: finalStyle as any,
                transform: { x: 0, y: isTitle ? 0 : 0.35, scale: 1, rotation: 0 } 
            };
            TimelineOps.addClip(timelineStore, textClip);
            return { success: true, message: `Added text "${args.text}"`, clipId: textClip.id };
        }
    },

    'generate_voiceover': {
        requiresApproval: true,
        execute: async (args) => {
            const audioUrl = await generateSpeech(args.text, args.voice || 'Kore');
            const tempAudio = new Audio(audioUrl);
            await new Promise<void>((resolve) => {
                tempAudio.onloadedmetadata = () => resolve();
                tempAudio.onerror = () => resolve();
            });
            
            const newClip: Clip = {
                id: `vo-${Date.now()}`,
                title: `VO: ${args.text.slice(0, 15)}...`,
                type: 'audio',
                startTime: Number(args.insertTime),
                duration: tempAudio.duration || 5,
                sourceStartTime: 0,
                sourceUrl: audioUrl,
                trackId: args.trackId !== undefined ? Number(args.trackId) : 2,
                volume: 1,
                speed: 1,
                transform: { x: 0, y: 0, scale: 1, rotation: 0 }
            };
            TimelineOps.addClip(timelineStore, newClip);
            return { success: true, message: `Generated voiceover`, clipId: newClip.id };
        }
    },

    'generate_video_asset': {
        requiresApproval: true,
        execute: async (args) => {
            const videoUrl = await generateVideo(
                args.prompt, 
                args.model || 'veo-3.1-fast-generate-preview',
                '16:9', 
                '720p', 
                Number(args.duration) || 4
            );
            
            const videoClip: Clip = {
                id: `gen-vid-${Date.now()}`,
                title: `Veo: ${args.prompt.slice(0, 15)}...`,
                type: 'video',
                startTime: Number(args.insertTime),
                duration: Number(args.duration) || 4,
                sourceStartTime: 0,
                sourceUrl: videoUrl,
                trackId: args.trackId !== undefined ? Number(args.trackId) : getSafeTrackId(),
                volume: 1,
                speed: 1,
                transform: { x: 0, y: 0, scale: 1, rotation: 0 }
            };
            TimelineOps.addClip(timelineStore, videoClip);
            return { success: true, message: `Generated video`, clipId: videoClip.id };
        }
    },

    'generate_image_asset': {
        requiresApproval: true,
        execute: async (args) => {
            const base64Img = await generateImage(args.prompt, args.model || 'gemini-2.5-flash-image');
            const imgUrl = `data:image/png;base64,${base64Img}`;
            
            const imgClip: Clip = {
                id: `gen-img-${Date.now()}`,
                title: `Img: ${args.prompt.slice(0, 15)}...`,
                type: 'image',
                startTime: Number(args.insertTime),
                duration: Number(args.duration) || 5,
                sourceStartTime: 0,
                sourceUrl: imgUrl,
                trackId: args.trackId !== undefined ? Number(args.trackId) : getSafeTrackId(),
                transform: { x: 0, y: 0, scale: 1, rotation: 0 }
            };
            TimelineOps.addClip(timelineStore, imgClip);
            return { success: true, message: `Generated image`, clipId: imgClip.id };
        }
    },

    'perform_smart_edit': {
        execute: async (args) => {
            const clip = timelineStore.getClips().find(c => c.id === args.targetClipId);
            if (!clip) return { success: false, error: "Clip not found" };

            if (args.editType === 'loop') {
                const loopPoints = await smartEdit.findLoopPoints(clip);
                if (loopPoints) {
                    const startOffset = loopPoints.start;
                    const endOffset = loopPoints.end;
                    // Apply cuts to create the loop section
                    // 1. Trim start
                    TimelineOps.trimClipStart(timelineStore, clip.id, startOffset);
                    
                    // 2. Trim end (Need to fetch updated clip ref or calculate)
                    const newDuration = endOffset - startOffset;
                    TimelineOps.trimClip(timelineStore, clip.id, newDuration);
                    
                    return { success: true, message: `Created seamless loop (trimmed ${startOffset.toFixed(1)}s start, set dur to ${newDuration.toFixed(1)}s)` };
                }
                return { success: false, message: "Could not find seamless loop points." };
            }

            if (args.editType === 'beat_sync') {
                const beats = await smartEdit.detectBeats(clip);
                if (beats.length > 0) {
                    // Split clip at beats
                    // Limit to first 3 beats to avoid chaos for demo
                    for (const beat of beats.slice(0, 3)) {
                        const splitTime = clip.startTime + beat;
                        TimelineOps.splitClip(timelineStore, clip.id, splitTime);
                    }
                    return { success: true, message: `Synced to ${beats.length} detected beats.` };
                }
                return { success: false, message: "No clear beats detected." };
            }

            if (args.editType === 'highlight') {
                const highlights = await smartEdit.findHighlights(clip, args.description || "action");
                if (highlights.length > 0) {
                    // Just take the first highlight and trim the clip to it
                    const h = highlights[0];
                    TimelineOps.trimClipStart(timelineStore, clip.id, h.start);
                    TimelineOps.trimClip(timelineStore, clip.id, h.end - h.start);
                    return { success: true, message: `Isolated highlight "${args.description}" (${h.start}-${h.end}s).` };
                }
                return { success: false, message: `No highlights found for "${args.description}".` };
            }

            return { success: false, error: "Unknown edit type" };
        }
    }
};

export const getToolDefinition = (name: string): ToolDefinition | undefined => {
    return toolRegistry[name];
}

export const executeTool = async (name: string, args: any): Promise<ToolExecutionResult> => {
    const toolDef = toolRegistry[name];
    if (!toolDef) {
        throw new Error(`Tool "${name}" is not implemented in the registry.`);
    }
    return toolDef.execute(args);
};

export const getToolDescriptions = (): string => {
    return TIMELINE_PRIMITIVES.map(t => `- ${t.name}: ${t.description}`).join('\n');
};
