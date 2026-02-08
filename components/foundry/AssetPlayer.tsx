
import React, { useEffect, useRef, useState } from 'react';
import { CompositionStrategy } from '../../services/assetBrain';
import { Loader2 } from 'lucide-react';

interface AssetPlayerProps {
  src: string | null;
  strategy: CompositionStrategy | undefined; // Strategy might be undefined for normal videos
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  innerRef?: React.Ref<HTMLVideoElement>;
}

/**
 * VERTEX SHADER
 * Simple pass-through shader for a full-quad render.
 */
const VS_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

/**
 * FRAGMENT SHADER (The Chroma Keyer)
 * IMPROVED ALGORITHM: Green Dominance Keying
 * 
 * Previous method (Euclidean Distance) failed on shadows and generated uneven edges.
 * New method calculates how much 'greener' a pixel is compared to red/blue.
 * This effectively removes dark green shadows and desaturates green fringing.
 */
const FS_SOURCE = `
  precision mediump float;
  uniform sampler2D u_image;
  varying vec2 v_texCoord;

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    
    // 1. Calculate Green Dominance
    // "How much more Green is this pixel compared to the maximum of Red and Blue?"
    // This is robust against brightness changes (handling shadows on the green screen).
    float rbMax = max(color.r, color.b);
    float gDelta = color.g - rbMax; 

    // 2. Determine Alpha
    // Thresholds tuned for Veo's generation style:
    // > 0.15: Background (Fully Transparent) - catches the solid green and most shadows
    // < 0.05: Foreground (Fully Opaque)
    // The range 0.05-0.15 provides a soft anti-aliased edge.
    float alpha = 1.0 - smoothstep(0.05, 0.15, gDelta);

    // 3. Spill Suppression
    // If a pixel is semi-transparent or has a slight green tint (edge fringing),
    // clamp the green channel to the max of Red/Blue.
    // This turns "Green Edge" into "Grey/White Edge", which blends naturally.
    if (gDelta > 0.0) {
        color.g = rbMax; 
    }

    // 4. Output
    gl_FragColor = vec4(color.rgb, color.a * alpha);
  }
`;

export const AssetPlayer: React.FC<AssetPlayerProps> = ({ src, strategy, className, style, onClick, innerRef }) => {
  if (!src) return <div className="w-full h-full bg-neutral-900 rounded-lg flex items-center justify-center text-neutral-600">No Asset Loaded</div>;

  // STRATEGY A: SCREEN BLEND (Pure CSS)
  // Best for: Fire, Sparks, Glows
  if (strategy === 'screen') {
    return (
      <div className={`relative overflow-hidden ${className}`} style={style} onClick={onClick}>
        <video 
          ref={innerRef}
          src={src} 
          autoPlay 
          loop 
          muted 
          playsInline
          className="w-full h-full object-contain mix-blend-screen pointer-events-none"
        />
      </div>
    );
  }

  // STRATEGY B: CHROMA KEY (WebGL Shader)
  // Best for: Solid objects, Characters
  if (strategy === 'chroma') {
    return <WebGLChromaPlayer src={src} className={className} style={style} onClick={onClick} />;
  }

  // STRATEGY C: STANDARD (Morph/Cut/Normal)
  return (
    <div className={`relative overflow-hidden ${className}`} style={style} onClick={onClick}>
        <video 
        ref={innerRef}
        src={src} 
        autoPlay 
        loop 
        muted 
        playsInline
        className={`w-full h-full object-contain pointer-events-none`} 
        />
    </div>
  );
};

/**
 * Internal Component: WebGL Chroma Key Renderer
 */
const WebGLChromaPlayer: React.FC<{ src: string, className?: string, style?: React.CSSProperties, onClick?: (e: React.MouseEvent) => void }> = ({ src, className, style, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reqIdRef = useRef<number>(0);
  const [isReady, setIsReady] = useState(false);

  // Force play on mount/src change
  useEffect(() => {
      if (videoRef.current) {
          videoRef.current.play().catch(e => console.warn("Auto-play blocked", e));
      }
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Use preserveDrawingBuffer: true to prevent flickering/clearing in some React render cycles if overlay is clicked
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) return;

    // 1. Compile Shaders
    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertShader = createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
    const fragShader = createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // 2. Setup Geometry (Full Screen Quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  -1, 1,  1, -1,
       1, -1,  -1, 1,  1, 1,
    ]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
       0, 1,  0, 0,  1, 1,
       1, 1,  0, 0,  1, 0,
    ]), gl.STATIC_DRAW);

    const texCoordLoc = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    // 3. Setup Texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // 4. Render Loop
    const render = () => {
      // Ensure video is playing and has data
      if (video.readyState >= 2) {
        if (!isReady) setIsReady(true);
        
        // Resize canvas to match display size if needed
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }

        // Upload video frame to texture
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        
        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else {
          // Keep trying to play if it paused itself
          if (video.paused) video.play().catch(() => {});
      }
      reqIdRef.current = requestAnimationFrame(render);
    };

    reqIdRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(reqIdRef.current);
      gl.deleteProgram(program);
    };
  }, [src]);

  return (
    <div className={`relative ${className}`} style={style} onClick={onClick}>
        {/* Hidden Video Source */}
        <video 
            ref={videoRef} 
            src={src} 
            muted 
            loop 
            autoPlay 
            playsInline
            crossOrigin="anonymous"
            className="hidden"
        />
        {/* WebGL Canvas Target */}
        <canvas 
            ref={canvasRef} 
            className="w-full h-full object-contain pointer-events-none"
        />
        {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-white/50 animate-spin" />
            </div>
        )}
    </div>
  );
};
