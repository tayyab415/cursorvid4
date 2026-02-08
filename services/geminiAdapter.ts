
import { Clip, TimelineRange } from '../types';
import { sliceAudioBlob, captureFrameFromVideoUrl } from '../utils/videoUtils';

/**
 * THE GEMINI ADAPTER
 * 
 * Goal: Convert a semantic "TimelineRange" (Editor Truth) into a Multimodal Payload
 * that simulates "Real Video" for Gemini.
 */

// Helper to load image from URL (or base64) into an HTMLImageElement for drawing
const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

// Renders a specific clip onto the given canvas context
const drawClipToContext = (
    ctx: CanvasRenderingContext2D,
    clip: Clip,
    source: CanvasImageSource | null,
    width: number,
    height: number
) => {
    const transform = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };

    ctx.save();
    // Center origin
    ctx.translate(width / 2, height / 2);
    // Apply transforms
    ctx.translate(transform.x * width, transform.y * height);
    ctx.scale(transform.scale, transform.scale);
    ctx.rotate((transform.rotation * Math.PI) / 180);

    if (clip.type === 'text' && clip.text) {
        const style = clip.textStyle || {
            fontFamily: 'Plus Jakarta Sans',
            fontSize: 40,
            isBold: true,
            isItalic: false,
            isUnderline: false,
            color: '#ffffff',
            backgroundColor: '#000000',
            backgroundOpacity: 0,
            align: 'center'
        };

        const fontWeight = style.isBold ? 'bold' : 'normal';
        const fontStyle = style.isItalic ? 'italic' : 'normal';
        ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily}, sans-serif`;
        ctx.textAlign = style.align as any || 'center';
        ctx.textBaseline = 'middle';

        const lines = clip.text.split('\n');
        const lineHeight = style.fontSize * 1.2;
        const metrics = ctx.measureText(lines[0]); 
        if (style.backgroundOpacity > 0) {
            const bgWidth = metrics.width + (style.fontSize * 1.5);
            const bgHeight = lineHeight * lines.length + (style.fontSize * 0.5);
            ctx.save();
            ctx.globalAlpha = style.backgroundOpacity;
            ctx.fillStyle = style.backgroundColor;
            ctx.fillRect(-bgWidth/2, -bgHeight/2, bgWidth, bgHeight);
            ctx.restore();
        }

        ctx.fillStyle = style.color;
        lines.forEach((line, i) => {
            const yOffset = (i - (lines.length - 1) / 2) * lineHeight;
            if (style.backgroundOpacity < 0.5) {
                ctx.strokeStyle = 'black';
                ctx.lineWidth = style.fontSize / 15;
                ctx.strokeText(line, 0, yOffset);
            }
            ctx.fillText(line, 0, yOffset);
            if (style.isUnderline) {
                const lineWidth = ctx.measureText(line).width;
                ctx.fillRect(-lineWidth / 2, yOffset + style.fontSize/2, lineWidth, style.fontSize/15);
            }
        });

    } else if (source) {
        let srcW = 0, srcH = 0;
        if (source instanceof HTMLVideoElement) {
            srcW = source.videoWidth;
            srcH = source.videoHeight;
        } else if (source instanceof HTMLImageElement) {
            srcW = source.naturalWidth;
            srcH = source.naturalHeight;
        } else if (source instanceof ImageBitmap) {
            srcW = source.width;
            srcH = source.height;
        }

        if (srcW && srcH) {
            const aspectSrc = srcW / srcH;
            const aspectDest = width / height;
            let drawW, drawH;
            if (aspectSrc > aspectDest) {
                drawW = width;
                drawH = width / aspectSrc;
            } else {
                drawH = height;
                drawW = height * aspectSrc;
            }
            ctx.drawImage(source, -drawW/2, -drawH/2, drawW, drawH);
        }
    }
    ctx.restore();
};

const drawPlaceholder = (
    ctx: CanvasRenderingContext2D,
    clip: Clip,
    width: number,
    height: number
) => {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.fillStyle = '#1a1a1a'; // Dark gray
    ctx.fillRect(-width/2, -height/2, width, height);
    
    ctx.fillStyle = '#404040';
    ctx.fillRect(-width/4, -height/4, width/2, height/2);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`[${clip.type.toUpperCase()}]`, 0, -20);
    ctx.font = '20px sans-serif';
    ctx.fillText(clip.title, 0, 20);
    ctx.restore();
};

/**
 * STORYBOARD MODE
 * Extracts a representative frame from EVERY clip to help the AI understand
 * the entire inventory of assets for rearrangement.
 * 
 * OPTIMIZATION: If clip count > 12, we sample frames to prevent token explosion,
 * while still sending text metadata for all clips.
 */
export const storyboardToGeminiParts = async (
    clips: Clip[]
): Promise<any[]> => {
    const parts: any[] = [];
    const MAX_VISUAL_SAMPLES = 12;
    
    parts.push({ text: "INVENTORY ANALYSIS (Storyboard Mode): Analyzing individual clips to determine best arrangement." });

    // Determine sampling stride
    const step = clips.length > MAX_VISUAL_SAMPLES ? Math.ceil(clips.length / MAX_VISUAL_SAMPLES) : 1;

    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const shouldIncludeVisual = i % step === 0;

        if (clip.type === 'audio') {
             parts.push({ text: `[Clip ${clip.id}] Type: AUDIO. Title: "${clip.title}". Duration: ${clip.duration}s.` });
             continue;
        }

        // Always include metadata
        let desc = `[Clip ${clip.id}] Type: ${clip.type.toUpperCase()}. Title: "${clip.title}".`;
        
        if (!shouldIncludeVisual) {
            parts.push({ text: `${desc} (Visual skipped for efficiency)` });
            continue;
        }

        // For video/image, grab a frame from the middle
        const midPoint = clip.sourceStartTime + (clip.duration / 2);
        let base64 = "";

        try {
            if (clip.type === 'image' && clip.sourceUrl) {
                // Just load the image
                 const img = await loadImage(clip.sourceUrl);
                 const canvas = document.createElement('canvas');
                 canvas.width = 320; // Low res for survey
                 canvas.height = 180;
                 const ctx = canvas.getContext('2d');
                 if(ctx) {
                     ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                     base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
                 }
            } else if (clip.type === 'video' && clip.sourceUrl) {
                 base64 = await captureFrameFromVideoUrl(clip.sourceUrl, midPoint);
                 if (base64.includes(',')) base64 = base64.split(',')[1];
            }
        } catch (e) {
            console.warn(`Failed to capture storyboard frame for ${clip.id}`, e);
        }

        if (base64) {
            parts.push({
                inlineData: { mimeType: 'image/jpeg', data: base64 }
            });
            parts.push({ text: `${desc} Content shown above.` });
        } else {
            parts.push({ text: `${desc} (No visual available)` });
        }
    }
    
    return parts;
};

export const rangeToGeminiParts = async (
    range: TimelineRange,
    clips: Clip[], 
    mediaRefs: { [key: string]: HTMLVideoElement | HTMLAudioElement | null } 
): Promise<any[]> => {
    const parts: any[] = [];
    
    const contextDescription = {
        type: "TimelineContext",
        range: `${range.start.toFixed(1)}s to ${range.end.toFixed(1)}s`,
        layers: range.tracks.map(t => ({
            trackId: t.id,
            clips: t.clips.map(c => ({
                type: c.type,
                title: c.title,
                text: c.text
            }))
        }))
    };
    parts.push({ text: `Timeline Metadata: ${JSON.stringify(contextDescription)}` });

    // Audio Slicing (same as before)
    const activeAudioVideo = clips.filter(c => 
        c.startTime < range.end && (c.startTime + c.duration) > range.start &&
        (c.type === 'video' || c.type === 'audio')
    );
    const dominantClip = activeAudioVideo.find(c => c.type === 'audio') || activeAudioVideo.find(c => c.type === 'video');

    if (dominantClip && dominantClip.sourceUrl) {
        const intersectionStart = Math.max(range.start, dominantClip.startTime);
        const intersectionEnd = Math.min(range.end, dominantClip.startTime + dominantClip.duration);
        const offsetInClip = intersectionStart - dominantClip.startTime;
        const sourceStart = dominantClip.sourceStartTime + (offsetInClip * (dominantClip.speed || 1));
        
        try {
            const audioBase64 = await sliceAudioBlob(dominantClip.sourceUrl, sourceStart, intersectionEnd - intersectionStart);
            if (audioBase64) {
                parts.push({ inlineData: { mimeType: 'audio/wav', data: audioBase64 } });
                parts.push({ text: `(Audio from: ${dominantClip.title})` });
            }
        } catch (e) {
            // Silently ignore audio slice failures (common for silent/Veo videos)
        }
    }

    // Visual Composition (same as before)
    const duration = range.end - range.start;
    let frameCount = Math.min(Math.ceil(duration / 5), 8);
    if (frameCount < 1) frameCount = 1;
    
    const step = duration / (frameCount + 1);
    const sampleTimes: number[] = [];
    for(let i=1; i<=frameCount; i++) {
        sampleTimes.push(range.start + (step * i));
    }

    for (const t of sampleTimes) {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const activeClips = clips
            .filter(c => t >= c.startTime && t < c.startTime + c.duration)
            .sort((a, b) => a.trackId - b.trackId); 

        for (const clip of activeClips) {
            if (clip.type === 'audio') continue;
            let renderSource: HTMLImageElement | null = null;
            let captureSuccess = false;

            if (clip.type === 'text') {
                // Handled in draw
                captureSuccess = true;
            } 
            else if (clip.type === 'image' && clip.sourceUrl) {
                try {
                    renderSource = await loadImage(clip.sourceUrl);
                    captureSuccess = true;
                } catch (e) { }
            } 
            else if (clip.type === 'video' && clip.sourceUrl) {
                const offset = t - clip.startTime;
                const sourceTime = clip.sourceStartTime + (offset * (clip.speed || 1));
                try {
                    const frameBase64 = await captureFrameFromVideoUrl(clip.sourceUrl, sourceTime);
                    renderSource = await loadImage(frameBase64);
                    captureSuccess = true;
                } catch (e) { 
                    console.warn(`GeminiAdapter: Frame capture failed for ${clip.title}`, e);
                }
            }

            if (captureSuccess) {
                drawClipToContext(ctx, clip, renderSource, canvas.width, canvas.height);
            } else {
                // Use fallback placeholder so AI doesn't see black
                drawPlaceholder(ctx, clip, canvas.width, canvas.height);
            }
        }

        try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            const base64 = dataUrl.split(',')[1];
            parts.push({
                inlineData: { mimeType: 'image/jpeg', data: base64 }
            });
            parts.push({ text: `[Composed Visual Frame at ${t.toFixed(1)}s]` });
        } catch (e) { }
    }

    return parts;
};
