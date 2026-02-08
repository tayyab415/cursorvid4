
import { Clip } from '../types';

export const DEFAULT_TEXT_STYLE = {
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 40,
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
        const bgWidth = metrics.width + (style.fontSize * 0.5);
        const bgHeight = lineHeight * lines.length + (style.fontSize * 0.2);

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
