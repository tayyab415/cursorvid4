
import { Clip, TransitionType } from '../types';

export const DEFAULT_TEXT_STYLE = {
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 30,
    isBold: true,
    isItalic: false,
    isUnderline: false,
    color: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.0,
    align: 'center' as const
};

export const drawClipToCanvas = (
    ctx: CanvasRenderingContext2D, 
    clip: Clip, 
    source: CanvasImageSource | null, 
    containerW: number, 
    containerH: number
) => {
    const transform = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
    ctx.save();
    ctx.translate(containerW / 2, containerH / 2);
    ctx.translate(transform.x * containerW, transform.y * containerH);
    ctx.scale(transform.scale, transform.scale);
    ctx.rotate((transform.rotation * Math.PI) / 180);

    if (clip.type === 'text' && clip.text) {
        const style = clip.textStyle || DEFAULT_TEXT_STYLE;
        const fontWeight = style.isBold ? 'bold' : 'normal';
        const fontStyle = style.isItalic ? 'italic' : 'normal';
        
        ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily || 'Plus Jakarta Sans'}, sans-serif`;
        ctx.textAlign = style.align || 'center';
        ctx.textBaseline = 'middle';
        
        const lines = clip.text.split('\n');
        const metrics = ctx.measureText(lines[0]); 
        const lineHeight = style.fontSize * 1.2;
        const bgWidth = metrics.width + (style.fontSize * 1.0); // More padding
        const bgHeight = lineHeight * lines.length + (style.fontSize * 0.4); // More padding

        if (style.backgroundOpacity > 0) {
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = style.backgroundOpacity;
            ctx.fillStyle = style.backgroundColor;
            ctx.fillRect(-bgWidth/2, -bgHeight/2, bgWidth, bgHeight);
            ctx.globalAlpha = prevAlpha;
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
      if (source instanceof HTMLVideoElement) { srcW = source.videoWidth; srcH = source.videoHeight; } 
      else if (source instanceof HTMLImageElement) { srcW = source.naturalWidth; srcH = source.naturalHeight; }

      if (srcW && srcH) {
          const aspectSrc = srcW / srcH;
          const aspectDest = containerW / containerH;
          let drawW, drawH;
          if (aspectSrc > aspectDest) { drawW = containerW; drawH = containerW / aspectSrc; } 
          else { drawH = containerH; drawW = containerH * aspectSrc; }
          ctx.drawImage(source, -drawW/2, -drawH/2, drawW, drawH);
      }
    }
    ctx.restore();
};

/**
 * Applies transition effects to the canvas context BEFORE drawing the clip.
 * Uses Clipping paths, Alpha, and Transforms.
 */
export const applyTransitionEffect = (
    ctx: CanvasRenderingContext2D,
    type: TransitionType,
    progress: number, // 0 to 1
    width: number,
    height: number
) => {
    switch (type) {
        case 'fade':
            ctx.globalAlpha = progress;
            break;
            
        case 'wipe_right':
            // Clip everything to the left of progress
            ctx.beginPath();
            ctx.rect(0, 0, width * progress, height);
            ctx.clip();
            break;

        case 'wipe_left':
            // Clip from right
            ctx.beginPath();
            ctx.rect(width * (1 - progress), 0, width, height);
            ctx.clip();
            break;

        case 'wipe_down':
            ctx.beginPath();
            ctx.rect(0, 0, width, height * progress);
            ctx.clip();
            break;

        case 'wipe_up':
            ctx.beginPath();
            ctx.rect(0, height * (1 - progress), width, height);
            ctx.clip();
            break;

        case 'slide_right':
            // Slide in from left
            ctx.translate(width * (progress - 1), 0);
            break;

        case 'slide_left':
            // Slide in from right
            ctx.translate(width * (1 - progress), 0);
            break;

        case 'circle_open':
            const maxRadius = Math.sqrt(width * width + height * height) / 2;
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, maxRadius * progress, 0, Math.PI * 2);
            ctx.clip();
            break;

        case 'zoom_in':
            const scale = 0.5 + (0.5 * progress); // 0.5 -> 1.0
            ctx.translate(width/2, height/2);
            ctx.scale(scale, scale);
            ctx.translate(-width/2, -height/2);
            ctx.globalAlpha = progress;
            break;
    }
};
