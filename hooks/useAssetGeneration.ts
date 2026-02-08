
import { useState, useCallback } from 'react';
import { assetBrain, AssetConfig } from '../services/assetBrain';
import { generateVideo } from '../services/gemini';

export type GenerationStatus = 'idle' | 'analyzing' | 'generating' | 'ready' | 'error';

export interface GeneratedAsset {
  config: AssetConfig;
  videoUrl: string;
}

export const useAssetGeneration = () => {
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [result, setResult] = useState<GeneratedAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateAsset = useCallback(async (prompt: string, modelId: string = 'veo-3.1-fast-generate-preview') => {
    setStatus('analyzing');
    setError(null);
    setResult(null);

    try {
      // 1. Ask Gemini 3 to decide the strategy and rewrite the prompt
      const config = await assetBrain.decideStrategy(prompt);
      
      setStatus('generating');

      // 2. Call Veo (Real Generation)
      // Use standard settings for asset generation: 4s duration, 720p (for speed), 16:9
      const videoUrl = await generateVideo(
          config.enhancedPrompt,
          modelId, 
          '16:9',
          '720p',
          4
      );

      setResult({
        config,
        videoUrl
      });
      setStatus('ready');

    } catch (err: any) {
      console.error("Asset Generation Error:", err);
      setError(err.message || "Failed to generate asset");
      setStatus('error');
    }
  }, []);

  return {
    generateAsset,
    status,
    result,
    error,
    reset: () => { setStatus('idle'); setResult(null); }
  };
};
