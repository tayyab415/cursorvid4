
import React, { useEffect, useRef, useState } from 'react';
import { CompositionStrategy } from '../../services/assetBrain';
import { Loader2 } from 'lucide-react';

interface AssetPlayerProps {
  src: string | null;
  strategy: CompositionStrategy | undefined;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  videoRef?: React.Ref<HTMLVideoElement>; // External ref for timeline control
  autoPlay?: boolean;
  loop?: boolean;
}

/**
 * VERTEX SHADER
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
 * FRAGMENT SHADER (Green Dominance Keying)
 */
const FS_SOURCE = `
  precision mediump float;
  uniform sampler2D u_image;
  varying vec2 v_texCoord;

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    float rbMax = max(color.r, color.b);
    float gDelta = color.g - rbMax; 
    float alpha = 1.0 - smoothstep(0.05, 0.15, gDelta);
    if (gDelta > 0.0) {
        color.g = rbMax; 
    }
    gl_FragColor = vec4(color.rgb, color.a * alpha);
  }
`;

export const AssetPlayer: React.FC<AssetPlayerProps> = ({ 
    src, 
    strategy, 
    className, 
    style, 
    onClick, 
    videoRef, 
    autoPlay = true, 
    loop = true 
}) => {
  if (!src) return <div className="w-full h-full bg-neutral-900 rounded-lg flex items-center justify-center text-neutral-600">No Asset</div>;

  // STRATEGY: SCREEN (CSS Blend)
  if (strategy === 'screen') {
    return (
      <div className={`relative overflow-hidden ${className}`} style={style} onClick={onClick}>
        <video 
          ref={videoRef}
          src={src} 
          autoPlay={autoPlay}
          loop={loop}
          muted 
          playsInline
          className="w-full h-full object-contain mix-blend-screen pointer-events-none"
          crossOrigin="anonymous"
        />
      </div>
    );
  }

  // STRATEGY: CHROMA (WebGL)
  if (strategy === 'chroma') {
    return (
        <WebGLChromaPlayer 
            src={src} 
            className={className} 
            style={style} 
            onClick={onClick} 
            videoRefProp={videoRef} 
            autoPlay={autoPlay} 
            loop={loop} 
        />
    );
  }

  // STANDARD VIDEO
  return (
    <div className={`relative overflow-hidden ${className}`} style={style} onClick={onClick}>
        <video 
            ref={videoRef}
            src={src} 
            autoPlay={autoPlay}
            loop={loop}
            muted 
            playsInline
            className={`w-full h-full object-contain pointer-events-none`} 
            crossOrigin="anonymous"
        />
    </div>
  );
};

const WebGLChromaPlayer: React.FC<{ 
    src: string, 
    className?: string, 
    style?: React.CSSProperties, 
    onClick?: (e: React.MouseEvent) => void,
    videoRefProp?: React.Ref<HTMLVideoElement>,
    autoPlay?: boolean,
    loop?: boolean
}> = ({ src, className, style, onClick, videoRefProp, autoPlay, loop }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const reqIdRef = useRef<number>(0);
  const [isReady, setIsReady] = useState(false);

  // Merge Refs to allow parent to control video
  useEffect(() => {
      if (videoRefProp) {
          if (typeof videoRefProp === 'function') {
              videoRefProp(internalVideoRef.current);
          } else {
              // @ts-ignore
              videoRefProp.current = internalVideoRef.current;
          }
      }
  }, [videoRefProp]);

  useEffect(() => {
      if (autoPlay && internalVideoRef.current) {
          internalVideoRef.current.play().catch(() => {});
      }
  }, [src, autoPlay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = internalVideoRef.current;
    if (!canvas || !video) return;

    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) return;

    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
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

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1, -1, -1, 1, 1, -1, 1, -1, -1, 1, 1, 1 ]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ 0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0 ]), gl.STATIC_DRAW);

    const texCoordLoc = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const render = () => {
      if (video.readyState >= 2) {
        if (!isReady) setIsReady(true);
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      reqIdRef.current = requestAnimationFrame(render);
    };

    reqIdRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(reqIdRef.current);
      gl.deleteProgram(program);
    };
  }, [src, isReady]);

  return (
    <div className={`relative ${className}`} style={style} onClick={onClick}>
        <video 
            ref={internalVideoRef} 
            src={src} 
            muted 
            loop={loop}
            autoPlay={autoPlay}
            playsInline
            crossOrigin="anonymous"
            className="hidden"
        />
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
