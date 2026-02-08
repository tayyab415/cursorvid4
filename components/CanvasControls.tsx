import React, { useEffect, useRef, useState } from 'react';
import { Clip } from '../types';
import { Move } from 'lucide-react';

interface CanvasControlsProps {
  clip: Clip;
  containerRef: React.RefObject<HTMLDivElement>;
  onUpdate: (id: string, newTransform: NonNullable<Clip['transform']>) => void;
}

export const CanvasControls: React.FC<CanvasControlsProps> = ({ clip, containerRef, onUpdate }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [initialTransform, setInitialTransform] = useState(clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging && !isResizing) return;
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      
      if (isDragging) {
        const deltaX = e.clientX - startPos.x;
        const deltaY = e.clientY - startPos.y;

        // Convert pixel delta to percentage
        const xPercent = deltaX / rect.width;
        const yPercent = deltaY / rect.height;

        onUpdate(clip.id, {
          ...initialTransform,
          x: initialTransform.x + xPercent,
          y: initialTransform.y + yPercent,
        });
      } else if (isResizing) {
        // Distance-based uniform scaling relative to center
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Initial distance from center
        const startDist = Math.hypot(startPos.x - centerX, startPos.y - centerY);
        // Current distance from center
        const currentDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);

        if (startDist < 1) return; // Prevent division by zero

        const scaleFactor = currentDist / startDist;
        const newScale = Math.max(0.1, initialTransform.scale * scaleFactor);

        onUpdate(clip.id, {
          ...initialTransform,
          scale: newScale,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, startPos, initialTransform, clip.id, containerRef, onUpdate]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag if clicking the border box itself, not handles
    if ((e.target as HTMLElement).dataset.handle) return;
    
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setInitialTransform(clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 });
  };

  const handleResizeDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setInitialTransform(clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 });
  };

  const transform = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
  
  const style: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: '100%',
    height: '100%', 
    transform: `translate(-50%, -50%) translate(${transform.x * 100}%, ${transform.y * 100}%) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
    pointerEvents: 'none',
    zIndex: 100,
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={style}>
             {/* The Interaction Box */}
             <div 
                className="w-full h-full border-2 border-blue-500 relative pointer-events-auto cursor-move group" 
                onMouseDown={handleMouseDown}
             >
                {/* Drag Indicator (Center) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500/50 p-2 rounded-full pointer-events-none">
                    <Move className="w-4 h-4 text-white" />
                </div>

                {/* Resize Handles */}
                {/* Top Left */}
                <div 
                    data-handle="true"
                    className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nwse-resize hover:scale-125 transition-transform"
                    onMouseDown={handleResizeDown}
                />
                
                {/* Top Right */}
                <div 
                    data-handle="true"
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nesw-resize hover:scale-125 transition-transform"
                    onMouseDown={handleResizeDown}
                />

                {/* Bottom Left */}
                <div 
                    data-handle="true"
                    className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nesw-resize hover:scale-125 transition-transform"
                    onMouseDown={handleResizeDown}
                />

                {/* Bottom Right */}
                <div 
                    data-handle="true"
                    className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nwse-resize hover:scale-125 transition-transform"
                    onMouseDown={handleResizeDown}
                />
             </div>
        </div>
    </div>
  );
};