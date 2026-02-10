
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

// Simple CPU-based Green Screen removal for Canvas Analysis/Export
const applyChromaKey = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const frameData = ctx.getImageData(0, 0, width, height);
    const data = frameData.data;
    const l = data.length / 4;

    for (let i = 0; i < l; i++) {
        const r = data[i * 4 + 0];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];

        // Green Dominance Keying Algorithm
        // Matches the WebGL shader logic roughly
        const rbMax = Math.max(r, b);
        const gDelta = g - rbMax;

        if (gDelta > 20) { // Threshold (approx 0.08 * 255)
            // It is green -> Make transparent
            data[i * 4 + 3] = 0; 
        } else if (gDelta > 0) {
            // Despill: Clamp green to max(red, blue) to remove fringing
            data[i * 4 + 1] = rbMax;
        }
    }
    ctx.putImageData(frameData, 0, 0);
};

export const drawClipToCanvas = (
    ctx: CanvasRenderingContext2D, 
    clip: Clip, 
    source: CanvasImageSource | null, 
    containerW: number, 
    containerH: number
) => {
    const transform = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
    
    // Save state before clip-specific transforms
    ctx.save();
    
    // Position the context
    ctx.translate(containerW / 2, containerH / 2);
    ctx.translate(transform.x * containerW, transform.y * containerH);
    ctx.scale(transform.scale, transform.scale);
    ctx.rotate((transform.rotation * Math.PI) / 180);

    // Apply Blend Mode if Screen Strategy
    if (clip.strategy === 'screen') {
        ctx.globalCompositeOperation = 'screen';
    }

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
        const bgWidth = metrics.width + (style.fontSize * 1.0);
        const bgHeight = lineHeight * lines.length + (style.fontSize * 0.4);

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
          
          if (clip.strategy === 'chroma') {
              // CHROMA KEY FALLBACK (CPU)
              // To perform pixel manipulation, we must draw the source to a temporary canvas first
              // or process the rectangle on the main canvas after drawing.
              // Processing on main canvas is risky if other items are behind.
              // So we draw source -> offscreen canvas -> process -> main canvas.
              
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = drawW;
              tempCanvas.height = drawH;
              const tempCtx = tempCanvas.getContext('2d');
              
              if (tempCtx) {
                  tempCtx.drawImage(source, 0, 0, drawW, drawH);
                  applyChromaKey(tempCtx, drawW, drawH);
                  ctx.drawImage(tempCanvas, -drawW/2, -drawH/2, drawW, drawH);
              }
          } else {
              // Standard Draw
              ctx.drawImage(source, -drawW/2, -drawH/2, drawW, drawH);
          }
      }
    }
    
    // Restore
    ctx.restore();
};

export const applyTransitionEffect = (
    ctx: CanvasRenderingContext2D,
    type: TransitionType,
    progress: number, 
    width: number,
    height: number
) => {
    switch (type) {
        case 'fade':
            ctx.globalAlpha = progress;
            break;
        case 'wipe_right':
            ctx.beginPath();
            ctx.rect(0, 0, width * progress, height);
            ctx.clip();
            break;
        case 'wipe_left':
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
            ctx.translate(width * (progress - 1), 0);
            break;
        case 'slide_left':
            ctx.translate(width * (1 - progress), 0);
            break;
        case 'circle_open':
            const maxRadius = Math.sqrt(width * width + height * height) / 2;
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, maxRadius * progress, 0, Math.PI * 2);
            ctx.clip();
            break;
        case 'zoom_in':
            const scale = 0.5 + (0.5 * progress); 
            ctx.translate(width/2, height/2);
            ctx.scale(scale, scale);
            ctx.translate(-width/2, -height/2);
            ctx.globalAlpha = progress;
            break;
    }
};
