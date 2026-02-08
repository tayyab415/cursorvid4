
import { getAiClient } from './gemini';

export const generateTransition = async (
  startFrame: string,  // base64
  endFrame: string,    // base64
  style: string = "smooth cinematic blend"
): Promise<string> => {
  const ai = getAiClient();

  // Clean base64 strings
  const cleanStart = startFrame.includes(',') ? startFrame.split(',')[1] : startFrame;
  const cleanEnd = endFrame.includes(',') ? endFrame.split(',')[1] : endFrame;

  try {
    // Veo 3.1 Preview supports starting image and last frame for transitions
    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview', 
      prompt: `Cinematic video transition: ${style}. Seamless flow from first image to second image. High quality, professional VFX.`,
      image: {
        imageBytes: cleanStart,
        mimeType: 'image/jpeg'
      },
      config: {
        numberOfVideos: 1,
        aspectRatio: '16:9',
        resolution: '720p',
        lastFrame: {
            imageBytes: cleanEnd,
            mimeType: 'image/jpeg'
        }
      }
    });

    let currentOp = operation;
    while (!currentOp.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        currentOp = await ai.operations.getVideosOperation({ operation: currentOp });
    }

    const videoUri = currentOp.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("No transition video generated");

    // Fetch the actual bytes using the API key
    const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);

  } catch (error) {
      console.error("Transition Generation Error:", error);
      throw error;
  }
};
