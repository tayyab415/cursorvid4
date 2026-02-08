
/**
 * Extracts a sequence of frames from a video file.
 * This simulates "Video Understanding" by feeding the model a visual storyboard
 * since we cannot easily upload large video files in a client-side only demo.
 */
export const extractFramesFromVideo = async (
  videoFile: File,
  numberOfFrames: number = 10
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const frames: string[] = [];
    
    // Create a URL for the video file
    const url = URL.createObjectURL(videoFile);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    video.onloadedmetadata = async () => {
      canvas.width = video.videoWidth / 4; // Downscale for API payload size optimization
      canvas.height = video.videoHeight / 4;
      const duration = video.duration;
      const interval = duration / (numberOfFrames + 1);

      try {
        for (let i = 1; i <= numberOfFrames; i++) {
          const currentTime = interval * i;
          video.currentTime = currentTime;
          
          // Wait for seek to complete
          await new Promise<void>((seekResolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              seekResolve();
            };
            video.addEventListener('seeked', onSeeked);
          });

          // Draw frame
          if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            // Low quality jpeg to save tokens/bandwidth
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            frames.push(dataUrl);
          }
        }
        
        URL.revokeObjectURL(url);
        resolve(frames);
      } catch (e) {
        reject(e);
      }
    };

    video.onerror = (e) => {
        reject(e);
    };
  });
};

/**
 * Captures a single frame from a video URL at a specific timestamp.
 * Improved robustness to prevent black frames.
 */
export const captureFrameFromVideoUrl = async (
    videoUrl: string,
    timeOffset: number
): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!videoUrl) {
            return reject(new Error("No video URL provided"));
        }

        const video = document.createElement('video');
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto"; 

        // Timeout safety
        const timeout = setTimeout(() => {
             video.removeAttribute('src'); 
             video.load();
             reject(new Error("Frame capture timeout"));
        }, 8000);

        const cleanUp = () => {
            clearTimeout(timeout);
            video.removeAttribute('src'); 
            video.load();
        };

        // Use loadedmetadata to ensure we can set currentTime safely
        video.onloadedmetadata = () => {
             let seekTime = timeOffset;
             if (seekTime < 0) seekTime = 0;
             if (seekTime > video.duration) seekTime = video.duration;
             
             video.currentTime = seekTime;
        };

        video.onseeked = async () => {
            try {
                // Ensure frame data is actually available
                if (video.readyState < 2) {
                    await new Promise(r => setTimeout(r, 50));
                }

                const canvas = document.createElement('canvas');
                // Handle 0 dimensions edge case
                canvas.width = video.videoWidth || 1280;
                canvas.height = video.videoHeight || 720;
                
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    cleanUp();
                    resolve(dataUrl);
                } else {
                    cleanUp();
                    reject(new Error("Could not create canvas context"));
                }
            } catch (e) {
                cleanUp();
                reject(e);
            }
        };

        video.onerror = (e) => {
            cleanUp();
            // Don't reject with an Event object as it clutters logs/UI
            reject(new Error("Error loading video for frame capture (Network/Format)"));
        };

        video.src = videoUrl;
    });
};

// Helper to convert Blob to Base64 string (no header)
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64data = reader.result as string;
            if (base64data && base64data.includes(',')) {
                resolve(base64data.split(',')[1]);
            } else {
                reject(new Error("Failed to read blob data"));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * Extracts audio from a video file/blob and returns it as a base64 encoded string.
 * This is used to send lighter payloads to Gemini for transcription.
 */
export const extractAudioFromVideo = async (file: File | Blob): Promise<string> => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
        throw new Error("AudioContext not supported");
    }
    const audioContext = new AudioContextClass();
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Re-encode to WAV
        const wavBlob = bufferToWav(audioBuffer);
        return await blobToBase64(wavBlob);
    } catch (err) {
        // If decoding fails, it likely means no audio track or unsupported format.
        console.warn("Audio extraction failed (likely silent video):", err);
        throw new Error("Could not extract audio from video. The video might be silent.");
    } finally {
        if (audioContext.state !== 'closed') {
            await audioContext.close();
        }
    }
};

/**
 * Downloads a source URL, decodes it, and extracts a specific time slice as WAV.
 * This preserves the "Soul" of the video (audio rhythm) for Gemini.
 */
export const sliceAudioBlob = async (sourceUrl: string, start: number, duration: number): Promise<string | null> => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    
    const audioContext = new AudioContextClass();

    try {
        const response = await fetch(sourceUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        // decodeAudioData will throw if the audio data is invalid or empty (e.g. video without audio track)
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Calculate sample offsets
        const sampleRate = audioBuffer.sampleRate;
        const startSample = Math.floor(start * sampleRate);
        const endSample = Math.floor((start + duration) * sampleRate);
        const length = endSample - startSample;

        if (length <= 0 || startSample >= audioBuffer.length) return null;

        // Create new sliced buffer
        const slicedBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            length,
            sampleRate
        );

        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            const channelData = audioBuffer.getChannelData(i);
            const slicedData = slicedBuffer.getChannelData(i);
            for (let j = 0; j < length; j++) {
                if (startSample + j < channelData.length) {
                    slicedData[j] = channelData[startSample + j];
                }
            }
        }

        const wavBlob = bufferToWav(slicedBuffer);
        return await blobToBase64(wavBlob);

    } catch (e) {
        // This is common for videos generated by AI that are silent. We swallow the error to allow the pipeline to continue.
        // console.debug("Slice audio skipped (silent or decode error):", e);
        return null;
    } finally {
        if (audioContext.state !== 'closed') {
            await audioContext.close();
        }
    }
}

// Simple WAV encoder helper
function bufferToWav(abuffer: AudioBuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (hardcoded in this example)

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for(i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while(pos < length) {
        for(i = 0; i < numOfChan; i++) {
            // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++; // next source sample
    }

    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data: any) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: any) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

// Format time helper
export const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
};
