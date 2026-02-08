
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Timeline } from './components/Timeline';
import { CanvasControls } from './components/CanvasControls';
import { AIAssistant } from './components/sidebar/AIAssistant';
import { Clip, ChatMessage, ToolAction, EditPlan, WorkspaceItem, Transition } from './types';
import { generateImage, generateVideo, generateSpeech, optimizePrompt, editImage, generateSubtitles } from './services/gemini';
import { generateTransition } from './services/transitions';
import { StyleAnalyzer } from './services/agents/styleAnalyzer';
import { extractAudioFromVideo, formatTime } from './utils/videoUtils';
import { drawClipToCanvas, DEFAULT_TEXT_STYLE, applyTransitionEffect } from './utils/canvasDrawing';
import { GenerationApprovalModal, RangeEditorModal, TextControls, GeminiLogo, ShortcutsModal, ToastContainer } from './components/AppModals';
import { 
  Video, Play, Pause, Loader2, Upload, RotateCcw, RotateCw, 
  Sparkles, Scissors, Gauge, Download, Volume2, VolumeX, X, 
  Image as ImageIcon, Film, Mic, Camera, Trash2, Info, Captions, 
  Type, Check, ChevronLeft, ShieldCheck, Globe, FolderOpen, Plus,
  MousePointer2, ScanEye, Grid3X3, HelpCircle, Key
} from 'lucide-react';
import { timelineStore } from './timeline/store';
import { AssetFoundryModal } from './components/foundry/AssetFoundryModal';
import { AssetConfig } from './services/assetBrain';
import { AssetScout } from './components/scout/AssetScout';
import { ImageEditorModal } from './components/ImageEditorModal';
import { Workspace } from './components/Workspace';

// AGENTS
import { AgenticLoop } from './services/agents/loopRunner';
import { EyesAgent } from './services/agents/eyes';
import { BrainAgent } from './services/agents/brain';
import { HandsAgent } from './services/agents/hands';
import { VerifierAgent } from './services/agents/verifier';

// --- HELPER FOR TRACK SAFETY ---
const getSafeTrackId = (preferredTrack: number, clips: Clip[]): number => {
    if (clips.length === 0) return preferredTrack;
    const maxTrack = Math.max(...clips.map(c => c.trackId));
    if (preferredTrack === 0) return Math.max(1, maxTrack + 1);
    return preferredTrack;
};

// --- HELPER FOR API KEY ---
const checkApiKey = async (): Promise<boolean> => {
    if ((window as any).aistudio) {
        if (!await (window as any).aistudio.hasSelectedApiKey()) {
            return await (window as any).aistudio.openSelectKey();
        }
        return true;
    }
    return true; // Fallback if environment doesn't have the key selector (dev mode)
};

export default function App() {
  const [tracks, setTracks] = useState<number[]>([0, 1, 2, 3]);
  const [clips, setClips] = useState<Clip[]>(timelineStore.getClips());
  const [transitions, setTransitions] = useState<Transition[]>(timelineStore.getTransitions());
  const [foundryOpen, setFoundryOpen] = useState(false);
  const [imageEditorClip, setImageEditorClip] = useState<Clip | null>(null);
  
  // Workspace State
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceItem[]>([]);

  // Modal Target State (Track ID or 'workspace' or null)
  const [mediaModalTarget, setMediaModalTarget] = useState<number | 'workspace' | null>(null);
  const mediaModalTrackId = typeof mediaModalTarget === 'number' ? mediaModalTarget : null;

  // CHAT PICKING STATE
  const [isPickingForChat, setIsPickingForChat] = useState(false);
  const [pickedChatAsset, setPickedChatAsset] = useState<{id: string, name: string, timestamp: number} | null>(null);

  // UI STATE
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string, message: string, type: 'success' | 'error' | 'info' }>>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = Math.random().toString(36).substr(2, 9);
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  useEffect(() => { 
      return timelineStore.subscribe((c, t) => {
          setClips(c);
          setTransitions(t);
      }); 
  }, []);

  useEffect(() => {
      if (clips.length === 0) return;
      const maxTrackInClips = Math.max(...clips.map(c => c.trackId));
      setTracks(prev => {
          const currentMax = Math.max(...prev);
          if (maxTrackInClips > currentMax) {
              const newTracks = [...prev];
              for (let i = currentMax + 1; i <= maxTrackInClips; i++) newTracks.push(i);
              return newTracks;
          }
          return prev;
      });
  }, [clips]);

  // SHORTCUTS LISTENER
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
              setShowShortcuts(true);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const clipsRef = useRef(clips);
  useEffect(() => { clipsRef.current = clips; }, [clips]);

  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const planStartClipsRef = useRef<Clip[]>([]); // To store pre-plan state for verification
  const currentIntentRef = useRef<string>(''); // Store the original user intent

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isCustomSpeed, setIsCustomSpeed] = useState(false);
  const [showVolumeMenu, setShowVolumeMenu] = useState(false);
  const [showTextStyleMenu, setShowTextStyleMenu] = useState(false);
  const [captionStyle, setCaptionStyle] = useState(DEFAULT_TEXT_STYLE);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  const [currentTime, setCurrentTime] = useState(0); 
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const [modalMode, setModalMode] = useState<'initial' | 'generate'>('initial');
  const [genTab, setGenTab] = useState<'image' | 'video' | 'audio' | 'scout'>('image');
  
  const [captionModalOpen, setCaptionModalOpen] = useState(false);
  const [isSelectingScope, setIsSelectingScope] = useState(false);
  const [liveScopeRange, setLiveScopeRange] = useState<{start: number, end: number} | null>(null);
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [imgModel, setImgModel] = useState('gemini-2.5-flash-image');
  const [imgAspect, setImgAspect] = useState('16:9');
  
  const [vidModel, setVidModel] = useState('veo-3.1-fast-generate-preview');
  const [vidResolution, setVidResolution] = useState('720p');
  const [vidAspect, setVidAspect] = useState('16:9');
  const [vidDuration, setVidDuration] = useState('4');
  const [veoStartImg, setVeoStartImg] = useState<string | null>(null);
  const [veoEndImg, setVeoEndImg] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<'start'|'end'>('start');
  const [audioVoice, setAudioVoice] = useState('Kore');
  
  // CHAT & AGENT STATE
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [activePlan, setActivePlan] = useState<EditPlan | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [pendingApproval, setPendingApproval] = useState<{ tool: string, params: any } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null); 
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceImageInputRef = useRef<HTMLInputElement>(null);
  const refVideoInputRef = useRef<HTMLInputElement>(null);
  const mediaRefs = useRef<{[key: string]: HTMLVideoElement | HTMLAudioElement | HTMLImageElement | null}>({});
  const currentTimeRef = useRef(currentTime);
  
  // ABORT CONTROLLER REF FOR STOPPING AGENT
  const agentAbortRef = useRef<AbortController | null>(null);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  const selectedClips = clips.filter(c => selectedClipIds.includes(c.id));
  const primarySelectedClip = selectedClips.length > 0 ? selectedClips[selectedClips.length - 1] : null;
  const isMultiSelection = selectedClipIds.length > 1;
  const allSelectedAreText = selectedClips.length > 0 && selectedClips.every(c => c.type === 'text');
  const allSelectedAreMedia = selectedClips.length > 0 && selectedClips.every(c => ['video', 'audio', 'image'].includes(c.type || ''));
  const isSelectedClipVisible = primarySelectedClip ? (currentTime >= primarySelectedClip.startTime && currentTime < primarySelectedClip.startTime + primarySelectedClip.duration) : false;
  const availableVideo = clips.find(c => c.type === 'video');

  const canUndo = timelineStore.canUndo();
  const canRedo = timelineStore.canRedo();
  
  const veoModeLabel = veoStartImg && veoEndImg ? 'Morph Mode' : veoStartImg ? 'Image-to-Video' : 'Text-to-Video';
  const veoModeColor = veoStartImg && veoEndImg ? 'text-purple-300 bg-purple-900/50 border-purple-500/50' : veoStartImg ? 'text-blue-300 bg-blue-900/50 border-blue-500/50' : 'text-neutral-400 bg-neutral-800 border-neutral-700';

  // [HELPER FUNCTIONS TRUNCATED FOR BREVITY - SAME AS ORIGINAL]
  const processFiles = async (fileList: FileList | File[], targetTrack?: number) => {
      setIsGenerating(true);
      try {
          if (mediaModalTarget === 'workspace' && targetTrack === undefined) { 
              await handleWorkspaceImport(fileList instanceof FileList ? fileList : fileList as any); 
              setMediaModalTarget(null); 
              setModalMode('initial'); 
              setWorkspaceOpen(true); 
              setIsGenerating(false); 
              if (fileInputRef.current) fileInputRef.current.value = ''; 
              return; 
          } 
          
          const trackId = typeof targetTrack === 'number' ? targetTrack : (typeof mediaModalTarget === 'number' ? mediaModalTarget : 0); 
          const trackClips = timelineStore.getClips().filter(c => c.trackId === trackId); 
          let startTime = trackClips.length > 0 ? Math.max(...trackClips.map(c => c.startTime + c.duration)) : 0; 
          const fileArray: File[] = Array.from(fileList); 
          
          const newWsItems: WorkspaceItem[] = [];

          for (let i = 0; i < fileArray.length; i++) { 
              const file = fileArray[i]; 
              const url = URL.createObjectURL(file); 
              const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : 'audio'; 
              let duration = 5; 
              if (type === 'video' || type === 'audio') { 
                  const el = document.createElement(type); 
                  el.src = url; 
                  await new Promise<void>(r => { 
                      el.onloadedmetadata = () => { 
                          if (Number.isFinite(el.duration)) duration = el.duration; 
                          r(); 
                      }; 
                      el.onerror = () => r(); 
                  }); 
              } 
              
              if (type === 'video') { 
                  setVideoFile(file); 
                  setVideoUrl(url); 
              } 
              
              // Add to Timeline
              timelineStore.addClip({ 
                  id: `upload-${Date.now()}-${i}`, 
                  title: file.name, 
                  type: type as any, 
                  startTime, 
                  duration, 
                  sourceStartTime: 0, 
                  trackId, 
                  sourceUrl: url, 
                  totalDuration: duration 
              }); 
              
              startTime += duration; 
              
              // Prepare for Workspace Sync
              newWsItems.push({ 
                  id: `ws-auto-${Date.now()}-${i}`, 
                  type: type as any, 
                  url, 
                  name: file.name, 
                  duration 
              });
          } 
          
          // Sync to Workspace
          setWorkspaceFiles(prev => [...prev, ...newWsItems]);

          setMediaModalTarget(null); 
          setModalMode('initial'); 
          addToast(`Imported ${fileArray.length} files successfully`, 'success');
      } catch (e) { 
          console.error(e); 
          addToast("Failed to import files", "error");
      } finally { 
          setIsGenerating(false); 
          if (fileInputRef.current) fileInputRef.current.value = ''; 
      } 
  };

  const handleChatPickRequest = () => {
      setIsPickingForChat(true);
      setWorkspaceOpen(true); 
  };

  const handleAssetPickedForChat = (id: string, name: string) => {
      setPickedChatAsset({ id, name, timestamp: Date.now() });
      setIsPickingForChat(false);
  };

  const handleWorkspaceImport = async (fileList: FileList) => {
      const newItems: WorkspaceItem[] = [];
      const files = Array.from(fileList);
      for (const file of files) {
          const url = URL.createObjectURL(file);
          const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
          let duration = 5;
          if (type === 'video' || type === 'audio') {
              const el = document.createElement(type); el.src = url;
              await new Promise<void>(r => { el.onloadedmetadata = () => { if (Number.isFinite(el.duration)) duration = el.duration; r(); }; el.onerror = () => r(); });
          }
          newItems.push({ id: `ws-${Date.now()}-${Math.random().toString(36).substr(2,9)}`, type: type as any, url, name: file.name, duration });
      }
      setWorkspaceFiles(prev => [...prev, ...newItems]);
  };
  const handleWorkspaceDelete = (id: string) => { setWorkspaceFiles(prev => prev.filter(p => p.id !== id)); };
  
  const handleTimelineDrop = (e: React.DragEvent) => { 
      e.preventDefault(); 
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files);
          return;
      }
      try { 
          const data = e.dataTransfer.getData('application/json'); 
          if (!data) return; 
          const parsed = JSON.parse(data); 
          if (parsed.origin === 'workspace' && parsed.item) { 
              const item = parsed.item as WorkspaceItem; 
              const rect = containerRef.current?.getBoundingClientRect();
              const x = e.clientX - (rect?.left || 0);
              const startTime = Math.max(0, x / 40); 
              const y = e.clientY - (rect?.top || 0);
              const trackIndex = Math.floor(y / 100);
              const trackId = tracks.length - 1 - trackIndex;
              const safeTrackId = Math.max(0, trackId);

              timelineStore.addClip({ 
                  id: `clip-${item.id}-${Date.now()}`, 
                  title: item.name, 
                  type: item.type as any, 
                  startTime: startTime, 
                  duration: item.duration, 
                  sourceStartTime: 0, 
                  sourceUrl: item.url, 
                  trackId: safeTrackId, 
                  transform: { x: 0, y: 0, scale: 1, rotation: 0 } 
              }); 
          } 
      } catch (err) { console.error("Drop failed", err); } 
  };
  
  const handleTimelineDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleClipEject = (clip: Clip) => { if (!clip.sourceUrl) return; const newItem: WorkspaceItem = { id: `ws-eject-${Date.now()}`, type: (clip.type === 'video' || clip.type === 'audio' || clip.type === 'image') ? clip.type : 'video', url: clip.sourceUrl, name: clip.title, duration: clip.totalDuration || clip.duration }; setWorkspaceFiles(prev => [...prev, newItem]); timelineStore.removeClip(clip.id); setWorkspaceOpen(true); addToast("Clip moved to Workspace", "info"); };
  
  const handleAssetFoundryAdd = (url: string, config: AssetConfig) => { 
      const maxTrack = clips.length > 0 ? Math.max(...clips.map(c => c.trackId)) : 0; 
      const targetTrack = maxTrack + 1; 
      timelineStore.addClip({ id: `foundry-${Date.now()}`, title: config.originalPrompt.slice(0, 20), type: 'video', startTime: currentTime, duration: 5, sourceStartTime: 0, sourceUrl: url, trackId: targetTrack, strategy: config.strategy, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); 
      setWorkspaceFiles(prev => [...prev, {
          id: `foundry-ws-${Date.now()}`,
          type: 'video',
          url,
          name: config.originalPrompt.slice(0, 20),
          duration: 5
      }]);
      setChatHistory(prev => [...prev, { role: 'system', text: `✨ Asset Foundry Action: Created "${config.originalPrompt}" using '${config.strategy}' strategy.` }]); 
      addToast("Asset Created", "success");
  };

  const handleScoutAssetFound = (url: string, description: string) => { 
      const newItem: WorkspaceItem = { id: `scout-ws-${Date.now()}`, type: 'video', url, name: description.slice(0, 20), duration: 4 }; 
      setWorkspaceFiles(prev => [...prev, newItem]); 
      if (mediaModalTarget !== 'workspace') {
          const maxTrack = clips.length > 0 ? Math.max(...clips.map(c => c.trackId)) : 0; 
          const targetTrack = maxTrack + 1; 
          const trackId = typeof mediaModalTarget === 'number' ? mediaModalTarget : targetTrack; 
          const trackClips = clips.filter(c => c.trackId === trackId); 
          let startTime = trackClips.length > 0 ? Math.max(...trackClips.map(c => c.startTime + c.duration)) : 0; 
          timelineStore.addClip({ id: `scout-${Date.now()}`, title: `Found: ${description.slice(0, 15)}...`, type: 'video', startTime: startTime, duration: 4, sourceStartTime: 0, sourceUrl: url, trackId: trackId, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); 
      }
      setChatHistory(prev => [...prev, { role: 'system', text: `🌐 Asset Scout: Found and added "${description}".` }]); 
      handleCloseMediaModal(); 
      setWorkspaceOpen(true);
      addToast("Asset Scouted & Added", "success");
  };

  const handleAddEditedAsset = (url: string, type: 'image' | 'video', title: string) => { 
      const maxTrack = clips.length > 0 ? Math.max(...clips.map(c => c.trackId)) : 0; 
      const targetTrack = maxTrack + 1; 
      const originalClip = imageEditorClip; 
      const startTime = originalClip ? originalClip.startTime : currentTime; 
      const duration = type === 'video' ? 4 : 5; 
      timelineStore.addClip({ id: `edit-${Date.now()}`, title: title, type: type, startTime: startTime, duration: duration, sourceStartTime: 0, sourceUrl: url, trackId: targetTrack, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); 
      setWorkspaceFiles(prev => [...prev, {
          id: `edit-ws-${Date.now()}`,
          type,
          url,
          name: title,
          duration
      }]);
      setChatHistory(prev => [...prev, { role: 'system', text: `🎨 Added new asset: "${title}"` }]); 
      addToast("Edit Applied", "success");
  };

  const triggerLocalUpload = () => { fileInputRef.current?.click(); };
  const handleCloseMediaModal = () => { setMediaModalTarget(null); setVeoStartImg(null); setVeoEndImg(null); setGenPrompt(''); };
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { 
      if (!e.target.files || e.target.files.length === 0) return;
      processFiles(e.target.files);
  };
  
  const handleAddMedia = handleFileUpload;
  const handleOptimizePrompt = async () => { if (!genPrompt.trim()) return; setIsOptimizing(true); try { let type: 'imagen' | 'veo' | 'nano_banana' = 'nano_banana'; if (genTab === 'video') { type = 'veo'; } else if (genTab === 'image') { if (imgModel.includes('imagen')) { type = 'imagen'; } else { type = 'nano_banana'; } } const optimized = await optimizePrompt(genPrompt, type); setGenPrompt(optimized); } catch (e) { console.error("Optimization failed", e); } finally { setIsOptimizing(false); } };
  
  const handleGenerate = async () => { 
      if (mediaModalTarget === null) return; 
      
      // API Key Check for Veo/Gen
      if (!await checkApiKey()) {
          addToast("API Key selection required for generation.", "error");
          return;
      }

      setIsGenerating(true); 
      try { 
          let resultUrl = ''; 
          let duration = 5; 
          let type: Clip['type'] = 'image'; 
          if (genTab === 'image') { 
              const b64 = await generateImage(genPrompt, imgModel, imgAspect); 
              resultUrl = `data:image/png;base64,${b64}`; 
              type = 'image'; 
              duration = 5; 
          } else if (genTab === 'video') { 
              resultUrl = await generateVideo( genPrompt, vidModel, vidAspect, vidResolution, parseInt(vidDuration), veoStartImg, veoEndImg ); 
              type = 'video'; 
              duration = parseInt(vidDuration); 
          } else if (genTab === 'audio') { 
              resultUrl = await generateSpeech(genPrompt, audioVoice); 
              type = 'audio'; 
              const temp = new Audio(resultUrl); 
              await new Promise(r => { temp.onloadedmetadata = r; temp.onerror = r; }); 
              duration = temp.duration || 5; 
          } 
          
          // Prepare Workspace Item
          const newItem: WorkspaceItem = { 
              id: `gen-ws-${Date.now()}`, 
              type: type as any, 
              url: resultUrl, 
              name: genTab === 'audio' ? `TTS: ${genPrompt.slice(0,10)}...` : `Gen: ${genPrompt.slice(0,10)}...`, 
              duration: duration 
          }; 
          
          setWorkspaceFiles(prev => [...prev, newItem]);
          
          if (mediaModalTarget === 'workspace') { 
              setWorkspaceOpen(true); 
          } else { 
              const trackId = mediaModalTarget; 
              const trackClips = timelineStore.getClips().filter(c => c.trackId === trackId); 
              const startTime = trackClips.length > 0 ? Math.max(...trackClips.map(c => c.startTime + c.duration)) : 0; 
              timelineStore.addClip({ 
                  id: `gen-${Date.now()}`, 
                  title: genTab === 'audio' ? `TTS: ${genPrompt.slice(0,10)}...` : `Gen ${genTab}: ${genPrompt.slice(0,10)}...`, 
                  type, 
                  startTime, 
                  duration, 
                  sourceStartTime: 0, 
                  trackId, 
                  sourceUrl: resultUrl, 
                  totalDuration: duration 
              }); 
          } 
          handleCloseMediaModal(); 
          addToast("Generation Complete", "success");
      } catch (e: any) { 
          console.error("Generation failed", e); 
          addToast(e.message || "Generation Failed", "error");
      } finally { 
          setIsGenerating(false); 
      } 
  };

  const handleGenerateCaptions = async () => { 
      if (!availableVideo || isGenerating) return; 
      setIsGenerating(true); 
      try { 
          let audioBase64 = ''; 
          if (videoFile) { 
              audioBase64 = await extractAudioFromVideo(videoFile); 
          } else if (availableVideo.sourceUrl) { 
              const response = await fetch(availableVideo.sourceUrl); 
              const blob = await response.blob(); 
              audioBase64 = await extractAudioFromVideo(blob); 
          } 
          if (!audioBase64) throw new Error("Could not extract audio"); 
          
          const subs = await generateSubtitles(audioBase64);
          
          subs.forEach((sub, i) => {
              timelineStore.addClip({ 
                  id: `sub-${Date.now()}-${i}`, 
                  title: `Caption ${i+1}`, 
                  type: 'text', 
                  text: sub.text, 
                  startTime: sub.start, 
                  duration: sub.end - sub.start, 
                  sourceStartTime: 0, 
                  trackId: 3, 
                  textStyle: captionStyle 
              });
          });
          
          setCaptionModalOpen(false); 
          addToast(`Generated ${subs.length} captions`, "success");
      } catch (e) { 
          console.error(e); 
          addToast("Caption generation failed", "error");
      } finally { 
          setIsGenerating(false); 
      } 
  };

  const handleExport = async () => { setIsExporting(true); setExportProgress(0); try { const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error("No context"); for(let i=0; i<=100; i+=10) { setExportProgress(i); await new Promise(r => setTimeout(r, 100)); } addToast("Export Complete (Simulated)", "success"); } catch (e) { console.error(e); addToast("Export Failed", "error"); } finally { setIsExporting(false); } };
  const captureCurrentFrame = async (): Promise<string | null> => { if (!containerRef.current) return null; const width = 1280; const height = 720; const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); if (!ctx) return null; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, width, height); const visible = clips.filter(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration).sort((a, b) => a.trackId - b.trackId); for (const clip of visible) { if (clip.type === 'audio') continue; if (clip.type === 'text') { drawClipToCanvas(ctx, clip, null, width, height); } else { const el = mediaRefs.current[clip.id] as HTMLVideoElement | null; if (clip.type === 'video' && el) { drawClipToCanvas(ctx, clip, el, width, height); } else if (clip.type === 'image') { const img = new Image(); img.crossOrigin = "anonymous"; img.src = clip.sourceUrl || ''; await new Promise((resolve) => { if (img.complete) resolve(true); img.onload = () => resolve(true); img.onerror = () => resolve(false); }); drawClipToCanvas(ctx, clip, img, width, height); } } } return canvas.toDataURL('image/jpeg', 0.8); };
  
  // ROBUST OBSERVATION HANDLER (Replaces simple interval)
  const handleRequestObservation = async (): Promise<string[]> => {
      setIsVerifying(true);
      setIsPlaying(false);
      
      // Force React to flush updates and render
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const capturedFrames: string[] = [];
      const duration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0) || 10;
      
      // Capture at specific intervals (every 0.5 seconds for better coverage)
      const captureInterval = 0.5;
      const totalFrames = Math.ceil(duration / captureInterval);
      
      for (let i = 0; i <= totalFrames; i++) {
        const captureTime = i * captureInterval;
        
        // Set time and wait for render
        setCurrentTime(captureTime);
        
        // Wait for React state update + video element seeks + canvas render
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Additional wait for video elements to actually seek
        await waitForVideoSeek(captureTime);
        
        // Now capture the frame
        const frame = await captureFrameAtTime(captureTime);
        if (frame) {
          capturedFrames.push(frame);
          console.log(`[Verifier] Captured frame at ${captureTime.toFixed(1)}s`);
        }
        
        // Small delay between captures
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      setIsVerifying(false);
      return capturedFrames;
  };

  // Helper: Wait for all video elements to seek to correct positions
  const waitForVideoSeek = async (targetTime: number): Promise<void> => {
      const videos = clips
        .filter(c => c.type === 'video' && targetTime >= c.startTime && targetTime < c.startTime + c.duration)
        .map(c => mediaRefs.current[c.id] as HTMLVideoElement)
        .filter(el => el && el.readyState >= 2); 
      
      if (videos.length === 0) return;
      
      // Wait for all videos to be ready at their target times
      const maxWait = 500; // Max 500ms wait
      const startWait = Date.now();
      
      while (Date.now() - startWait < maxWait) {
        const allReady = videos.every(video => {
          const clip = clips.find(c => mediaRefs.current[c.id] === video);
          if (!clip) return true;
          
          const relativeTime = targetTime - clip.startTime;
          const targetVideoTime = clip.sourceStartTime + (relativeTime * (clip.speed || 1));
          const timeDiff = Math.abs(video.currentTime - targetVideoTime);
          
          return timeDiff < 0.1 && !video.seeking;
        });
        
        if (allReady) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
  };

  // Enhanced frame capture with better rendering
  const captureFrameAtTime = async (time: number): Promise<string | null> => {
      if (!containerRef.current) return null;
      
      const width = 1280;
      const height = 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      // Fill background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      
      // Get clips visible at this time, sorted by track (bottom to top)
      const visibleClips = clips
        .filter(c => time >= c.startTime && time < c.startTime + c.duration)
        .sort((a, b) => a.trackId - b.trackId);
      
      // Check if we're in a transition
      const activeTransition = transitions.find(t => 
        t.trackId === visibleClips[0]?.trackId &&
        time >= t.startTime &&
        time < t.startTime + t.duration
      );
      
      if (activeTransition) {
        await renderTransition(ctx, activeTransition, time, width, height);
      } else {
        for (const clip of visibleClips) {
          await renderClipToCanvas(ctx, clip, time, width, height);
        }
      }
      
      return canvas.toDataURL('image/jpeg', 0.9);
  };

  // Render single clip to canvas
  const renderClipToCanvas = async (
      ctx: CanvasRenderingContext2D,
      clip: Clip,
      currentTime: number,
      width: number,
      height: number
  ): Promise<void> => {
      if (clip.type === 'audio') return;
      
      // We can reuse the utility function but need to adapt it slightly as it expects `source`
      // Or we implement logic here. Reusing is safer for consistency but needs element fetching.
      let source: CanvasImageSource | null = null;
      
      if (clip.type === 'text') {
           // handled by drawClipToCanvas internally if source is null
      } else if (clip.type === 'video') {
          const el = mediaRefs.current[clip.id] as HTMLVideoElement;
          if (el && el.readyState >= 2) source = el;
      } else if (clip.type === 'image') {
          const el = mediaRefs.current[clip.id] as unknown as HTMLImageElement;
          if (el && el.complete) source = el;
          else if (clip.sourceUrl) {
               // Fallback load
               const img = new Image();
               img.crossOrigin = 'anonymous';
               img.src = clip.sourceUrl;
               await new Promise(r => { img.onload = r; img.onerror = r; });
               if (img.complete) source = img;
          }
      }

      drawClipToCanvas(ctx, clip, source, width, height);
  };

  // Render transition between two clips
  const renderTransition = async (
      ctx: CanvasRenderingContext2D,
      transition: Transition,
      currentTime: number,
      width: number,
      height: number
  ): Promise<void> => {
      const fromClip = clips.find(c => c.id === transition.fromClipId);
      const toClip = clips.find(c => c.id === transition.toClipId);
      
      if (!fromClip || !toClip) return;
      
      const progress = (currentTime - transition.startTime) / transition.duration;
      const easedProgress = applyEasing(progress, transition.params?.easing || 'linear');
      
      // Create temporary canvases for both clips
      const fromCanvas = document.createElement('canvas');
      fromCanvas.width = width;
      fromCanvas.height = height;
      const fromCtx = fromCanvas.getContext('2d')!;
      
      const toCanvas = document.createElement('canvas');
      toCanvas.width = width;
      toCanvas.height = height;
      const toCtx = toCanvas.getContext('2d')!;
      
      // Render both clips to their canvases
      await renderClipToCanvas(fromCtx, fromClip, transition.startTime, width, height);
      await renderClipToCanvas(toCtx, toClip, transition.startTime + transition.duration, width, height);
      
      // Apply transition effect
      // We essentially recreate `applyTransitionEffect` logic but tailored for canvas-to-canvas blending
      // For now, simpler: Use globalAlpha for fade, and custom clipping for wipes.
      // Re-using applyTransitionEffect from utils might require context trickery.
      
      ctx.save();
      // Draw FROM
      ctx.drawImage(fromCanvas, 0, 0);
      
      // Prepare TO draw
      applyTransitionEffect(ctx, transition.type, easedProgress, width, height);
      ctx.drawImage(toCanvas, 0, 0);
      
      ctx.restore();
  };

  const applyEasing = (t: number, easing: string): number => {
    switch (easing) {
      case 'linear': return t;
      case 'ease_in': return t * t;
      case 'ease_out': return 1 - Math.pow(1 - t, 2);
      case 'ease_in_out': 
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      default: return t;
    }
  };

  const eyes = new EyesAgent(); const brain = new BrainAgent(); const hands = new HandsAgent(); const verifier = new VerifierAgent();
  
  // Create loop with abort support
  const loop = new AgenticLoop( eyes, brain, hands, verifier, (agent, thought, toolAction) => { setChatHistory(prev => [...prev, { role: 'agent', agentType: agent, text: thought, toolAction: toolAction }]); }, handleRequestObservation );
  
  const executePlanStep = async (stepIndex: number, plan: EditPlan, initialIntent: string, signal?: AbortSignal) => { 
      if (signal?.aborted) return;
      if (!plan || stepIndex >= plan.steps.length) { 
          if (plan) { 
              await loop.verify(initialIntent, planStartClipsRef.current, timelineStore.getClips()); 
              setActivePlan(null); 
          } 
          setIsProcessing(false); 
          return; 
      } 
      const step = plan.steps[stepIndex]; 
      setCurrentStepIndex(stepIndex); 
      setActivePlan(prev => { if (!prev) return null; const newSteps = [...prev.steps]; newSteps[stepIndex] = { ...newSteps[stepIndex], status: 'generating' }; return { ...prev, steps: newSteps }; }); 
      try { 
          const result = await loop.executeStep(step); 
          if (signal?.aborted) return;

          if (result.approvalRequired) { setPendingApproval(result.approvalRequired); return; } 
          if (result.success) { 
              setActivePlan(prev => { if (!prev) return null; const newSteps = [...prev.steps]; newSteps[stepIndex] = { ...newSteps[stepIndex], status: 'completed' }; return { ...prev, steps: newSteps }; }); 
              await executePlanStep(stepIndex + 1, plan, initialIntent, signal); 
          } 
      } catch (e) { 
          console.error("Step execution failed", e); 
          setIsProcessing(false); 
      } 
  };

  const handleRunAgentLoop = async (message: string) => { 
      if (agentAbortRef.current) agentAbortRef.current.abort();
      const abortController = new AbortController();
      agentAbortRef.current = abortController;

      setIsProcessing(true); 
      setChatHistory(prev => [...prev, { role: 'user', text: message }]); 
      setActivePlan(null); 
      setCurrentStepIndex(0); 
      currentIntentRef.current = message; 
      planStartClipsRef.current = [...timelineStore.getClips()]; 
      
      try { 
          const context = { clips: timelineStore.getClips(), selectedClipIds, currentTime, range: liveScopeRange || { start: 0, end: 0 } }; 
          // Pass abort signal to plan (if supported) or check after
          const plan = await loop.plan(message, context, mediaRefs.current); 
          
          if (abortController.signal.aborted) return;

          if (plan) { 
              setActivePlan(plan); 
              await executePlanStep(0, plan, message, abortController.signal); 
          } else { 
              setIsProcessing(false); 
          } 
      } catch (e) { 
          if (abortController.signal.aborted) return;
          setChatHistory(prev => [...prev, { role: 'system', text: "Agent loop failed unexpectedly." }]); 
          console.error(e); 
          setIsProcessing(false); 
      } 
  };

  const handleStopAgent = () => {
      if (agentAbortRef.current) {
          agentAbortRef.current.abort();
          agentAbortRef.current = null;
          setIsProcessing(false);
          addToast("Director stopped by user.", "info");
      }
  };

  const handleExecuteAIAction = async (action: ToolAction) => { if (action.tool_id === 'REPLAN_REQUEST') { const fixPrompt = action.parameters?.prompt || action.reasoning; await handleRunAgentLoop(fixPrompt); return; } if (action.tool_id === 'USER_ACTION_REQUEST') { if (action.button_label.includes("Upload")) { triggerLocalUpload(); } return; } setIsGenerating(true); await hands.execute({ operation: action.tool_id.toLowerCase(), parameters: action.parameters, intent: action.reasoning }); setIsGenerating(false); };
  
  // SHARED APPROVAL HANDLER
  const handleApprovalConfirm = async (params: any) => { 
      if (!pendingApproval || !activePlan) return; 
      
      // API Key Check for Veo/Gen inside Approval
      if ((pendingApproval.tool === 'generate_video_asset' || pendingApproval.tool === 'generate_image_asset') && !await checkApiKey()) {
          addToast("API Key selection required for generation.", "error");
          return;
      }

      const { tool } = pendingApproval; 
      setPendingApproval(null); 
      setIsGenerating(true); 
      setChatHistory(prev => [...prev, { role: 'system', text: `🚀 Starting generation for step ${currentStepIndex + 1}/${activePlan.steps.length}...` }]); 
      try { const currentClips = timelineStore.getClips(); const maxTrack = currentClips.length > 0 ? Math.max(...currentClips.map(c => c.trackId)) : 0; let targetTrackId = Number(params.trackId); if (isNaN(targetTrackId)) targetTrackId = maxTrack + 1; const rawInsertTime = Number(params.insertTime); const safeStartTime = isNaN(rawInsertTime) ? 0 : rawInsertTime; const rawDuration = Number(params.duration); const safeDuration = (isNaN(rawDuration) || rawDuration <= 0) ? 4 : rawDuration; if (tool === 'generate_video_asset') { const videoUrl = await generateVideo(params.prompt, params.model || 'veo-3.1-fast-generate-preview', '16:9', '720p', safeDuration); timelineStore.addClip({ id: `gen-vid-${Date.now()}`, title: `Veo: ${params.prompt.slice(0, 15)}...`, type: 'video', startTime: safeStartTime, duration: safeDuration, sourceStartTime: 0, sourceUrl: videoUrl, trackId: targetTrackId, volume: 1, speed: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); } else if (tool === 'generate_image_asset') { const base64Img = await generateImage(params.prompt, params.model || 'gemini-2.5-flash-image'); const imgUrl = `data:image/png;base64,${base64Img}`; timelineStore.addClip({ id: `gen-img-${Date.now()}`, title: `Img: ${params.prompt.slice(0, 15)}...`, type: 'image', startTime: safeStartTime, duration: safeDuration || 5, sourceStartTime: 0, sourceUrl: imgUrl, trackId: targetTrackId, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); } else if (tool === 'generate_voiceover') { const audioUrl = await generateSpeech(params.text, params.voice || 'Kore'); const tempAudio = new Audio(audioUrl); await new Promise<void>((resolve) => { tempAudio.onloadedmetadata = () => resolve(); tempAudio.onerror = () => resolve(); }); timelineStore.addClip({ id: `vo-${Date.now()}`, title: `VO: ${params.text.slice(0, 15)}...`, type: 'audio', startTime: safeStartTime, duration: tempAudio.duration || 5, sourceStartTime: 0, sourceUrl: audioUrl, trackId: targetTrackId, volume: 1, speed: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); } setChatHistory(prev => [...prev, { role: 'system', text: "✅ Asset generated successfully." }]); setActivePlan(prev => { if (!prev) return null; const newSteps = [...prev.steps]; newSteps[currentStepIndex] = { ...newSteps[currentStepIndex], status: 'completed' }; return { ...prev, steps: newSteps }; }); await executePlanStep(currentStepIndex + 1, activePlan, currentIntentRef.current, agentAbortRef.current?.signal); } catch (e: any) { console.error("Generation Error:", e); setChatHistory(prev => [...prev, { role: 'system', text: `❌ Generation failed: ${e.message}` }]); setIsProcessing(false); } finally { setIsGenerating(false); } };
  
  const handleTransitionRequest = async (clipA: Clip, clipB: Clip) => {
      // API Key Check for Veo
      if (!await checkApiKey()) {
          addToast("API Key selection required for Veo.", "error");
          return;
      }

      setIsGenerating(true);
      try {
          // Capture end frame of A
          setCurrentTime(clipA.startTime + clipA.duration - 0.1);
          await new Promise(r => setTimeout(r, 200)); 
          const startFrame = await captureCurrentFrame();

          // Capture start frame of B
          setCurrentTime(clipB.startTime + 0.1);
          await new Promise(r => setTimeout(r, 200));
          const endFrame = await captureCurrentFrame();

          if (!startFrame || !endFrame) throw new Error("Could not capture transition frames");

          const url = await generateTransition(startFrame, endFrame);
          
          const transDuration = 2;
          const insertTime = clipA.startTime + clipA.duration;
          
          timelineStore.addClip({
              id: `trans-${Date.now()}`,
              title: 'AI Transition',
              type: 'video',
              startTime: insertTime,
              duration: transDuration,
              sourceStartTime: 0,
              sourceUrl: url,
              trackId: clipA.trackId
          });

          timelineStore.moveClip(clipB.id, insertTime + transDuration, clipB.trackId);
          
          setWorkspaceFiles(prev => [...prev, {
              id: `trans-ws-${Date.now()}`,
              type: 'video',
              url,
              name: 'AI Transition',
              duration: transDuration
          }]);
          addToast("Transition Generated", "success");

      } catch (e: any) {
          console.error("Transition failed", e);
          addToast(e.message || "Transition failed", "error");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleReferenceVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setIsProcessing(true);
      setChatHistory(prev => [...prev, { role: 'system', text: "Analyzing reference video style..." }]);
      
      try {
          const analyzer = new StyleAnalyzer();
          const style = await analyzer.analyzeReferenceVideo(file);
          setChatHistory(prev => [...prev, {
              role: 'system',
              text: `**Style Analysis Complete**\n• Pacing: ${style.pacing}\n• Cut Style: ${style.cutStyle}\n• Color: ${style.colorGrade}\n\nAsk me to apply this style to your timeline!`
          }]);
          addToast("Style Analysis Complete", "success");
      } catch (e) {
          console.error(e);
          setChatHistory(prev => [...prev, { role: 'system', text: "Failed to analyze reference video." }]);
          addToast("Analysis failed", "error");
      } finally {
          setIsProcessing(false);
          e.target.value = '';
      }
  };

  useEffect(() => { let animationFrameId: number; let lastTimestamp = performance.now(); const updateLoop = (timestamp: number) => { const dt = (timestamp - lastTimestamp) / 1000; lastTimestamp = timestamp; if (isPlaying) setCurrentTime((prevTime) => prevTime + dt); animationFrameId = requestAnimationFrame(updateLoop); }; if (isPlaying) { lastTimestamp = performance.now(); animationFrameId = requestAnimationFrame(updateLoop); } else { Object.values(mediaRefs.current).forEach((el) => { if (el instanceof HTMLMediaElement) { el.pause(); } }); } return () => cancelAnimationFrame(animationFrameId); }, [isPlaying]);
  useEffect(() => { clips.forEach(clip => { if (clip.type !== 'video' && clip.type !== 'audio') return; const mediaEl = mediaRefs.current[clip.id] as HTMLVideoElement | HTMLAudioElement; if (!mediaEl) return; const isActive = currentTime >= clip.startTime && currentTime < (clip.startTime + clip.duration); if (isActive) { const relativeTime = currentTime - clip.startTime; const targetTime = clip.sourceStartTime + (relativeTime * (clip.speed || 1)); if (Math.abs(mediaEl.currentTime - targetTime) > 0.25) mediaEl.currentTime = targetTime; if (isPlaying) { if (mediaEl.paused) mediaEl.play().catch(() => {}); } else { if (!mediaEl.paused) mediaEl.pause(); } mediaEl.muted = false; mediaEl.volume = clip.volume ?? 1; mediaEl.playbackRate = clip.speed ?? 1; } else { if (!mediaEl.paused) mediaEl.pause(); mediaEl.muted = true; } }); }, [currentTime, isPlaying, clips]);
  const handleUndo = () => timelineStore.undo(); const handleRedo = () => timelineStore.redo(); const handleDelete = (ids: string[]) => ids.forEach(id => timelineStore.removeClip(id));
  useEffect(() => { const handleGlobalKeyDown = (e: KeyboardEvent) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; const isMod = e.ctrlKey || e.metaKey; if (e.code === 'Space') { e.preventDefault(); togglePlay(); } else if (e.key === 'Backspace' || e.key === 'Delete') { handleDelete(selectedClipIds); } else if (isMod && e.key === 'z') { e.preventDefault(); if (e.shiftKey) handleRedo(); else handleUndo(); } }; window.addEventListener('keydown', handleGlobalKeyDown); return () => window.removeEventListener('keydown', handleGlobalKeyDown); }, [selectedClipIds, togglePlay]);
  const handleSeek = (time: number) => { setCurrentTime(Math.max(0, time)); setIsPlaying(false); }; const handleSelectClip = (id: string, e: React.MouseEvent) => { if (e.shiftKey) setSelectedClipIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); else setSelectedClipIds([id]); }; const handleCanvasClick = () => setSelectedClipIds([]);
  const updateClip = (id: string, updates: Partial<Clip>) => timelineStore.updateClip(id, updates); const handleUpdateClipTransform = (id: string, newTransform: NonNullable<Clip['transform']>) => updateClip(id, { transform: newTransform }); const handleUpdateTextContent = (id: string, text: string) => updateClip(id, { text }); const handleUpdateTextStyle = (updates: any) => primarySelectedClip && updateClip(primarySelectedClip.id, { textStyle: { ...primarySelectedClip.textStyle, ...updates } }); const handleClipSpeed = (id: string, speed: number) => updateClip(id, { speed }); const handleClipVolume = (id: string, volume: number) => updateClip(id, { volume });
  const handleClipResize = (id: string, newDuration: number, mode: 'start' | 'end', commit: boolean) => { if (commit) { timelineStore.updateClip(id, { duration: newDuration }); } }; const handleClipReorder = (id: string, newStartTime: number, targetTrackId: number, commit: boolean) => { if (commit) timelineStore.moveClip(id, newStartTime, targetTrackId); };
  const handleAddTrack = (position: 'top' | 'bottom') => { setTracks(prev => { const newId = Math.max(...prev) + 1; return position === 'top' ? [...prev, newId] : [newId, ...prev]; }); };
  const handleRangeSelected = () => { setRangeModalOpen(true); }; const handleSplitClip = () => { if (primarySelectedClip) { timelineStore.splitClip(primarySelectedClip.id, currentTime); } };
  const handleRangeConfirm = (range: { start: number, end: number }) => { setLiveScopeRange(range); setRangeModalOpen(false); }; const handleCaptureFrame = async (target: 'start' | 'end') => { const frame = await captureCurrentFrame(); if (frame) { if (target === 'start') setVeoStartImg(frame); else setVeoEndImg(frame); } }; const handleVeoReferenceUpload = (target: 'start' | 'end') => { setUploadTarget(target); referenceImageInputRef.current?.click(); }; const handleReferenceImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => { const b64 = reader.result as string; if (uploadTarget === 'start') setVeoStartImg(b64); else setVeoEndImg(b64); }; reader.readAsDataURL(file); } e.target.value = ''; };

  // --- RENDER ---
  return (
    <div className={`flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden transition-all duration-300 ${isVerifying ? 'ring-4 ring-yellow-500/50 scale-[0.99]' : ''}`}>
      {/* ... [Modals and Overlays same as previous] ... */}
      {isVerifying && (
          <div className="fixed inset-0 z-[9999] pointer-events-none flex flex-col">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(234,179,8,0.1)_100%)] animate-pulse" />
              <div className="w-full bg-yellow-500/90 text-black py-1 text-center font-bold text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
                  <ShieldCheck size={14} className="animate-pulse" /> Verification in Progress - Recording Playback View
              </div>
              <div className="flex-1 border-[6px] border-yellow-500/20" />
          </div>
      )}

      {isPickingForChat && (
          <div className="fixed inset-x-0 top-14 h-12 z-[200] bg-blue-900/90 backdrop-blur-sm border-b border-blue-500/50 flex items-center justify-center animate-in slide-in-from-top-4 fade-in">
              <div className="flex items-center gap-3">
                  <MousePointer2 className="w-5 h-5 text-blue-200 animate-bounce" />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">Select a clip or file to add to chat</span>
                  <button 
                    onClick={() => setIsPickingForChat(false)}
                    className="ml-4 px-3 py-1 bg-black/40 hover:bg-black/60 rounded-full text-xs font-bold text-blue-200 transition-colors"
                  >
                    Cancel
                  </button>
              </div>
          </div>
      )}

      <GenerationApprovalModal isOpen={!!pendingApproval} onClose={() => { setPendingApproval(null); setIsProcessing(false); }} onConfirm={handleApprovalConfirm} request={pendingApproval} />
      <RangeEditorModal isOpen={rangeModalOpen} onClose={() => { setRangeModalOpen(false); setIsSelectingScope(false); }} onConfirm={handleRangeConfirm} initialRange={liveScopeRange || { start: 0, end: 5 }} clips={clips} mediaRefs={mediaRefs} />
      <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Hidden Inputs */}
      <input type="file" multiple accept="video/*,image/*,audio/*" className="hidden" ref={fileInputRef} onChange={handleAddMedia} />
      <input type="file" accept="image/*" className="hidden" ref={referenceImageInputRef} onChange={handleReferenceImageFileChange} />
      <input type="file" accept="video/*" className="hidden" ref={refVideoInputRef} onChange={handleReferenceVideoUpload} />
      
      {/* Caption Modal and Add Media Modal omitted for brevity, logic identical to original */}
      {/* Add Media Modal */}
      {mediaModalTarget !== null && ( 
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4"> {/* Boosted Z-Index */}
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleCloseMediaModal} /> {/* Darker backdrop */}
              <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                  {/* Header */}
                  <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">
                          {mediaModalTarget === 'workspace' ? 'Add to Project Files' : `Add Media to Track ${(mediaModalTarget as number) + 1}`}
                      </h3>
                      <button onClick={handleCloseMediaModal} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  
                  {modalMode === 'initial' ? (
                      <div className="p-8 grid grid-cols-2 gap-6">
                          <button 
                              type="button"
                              onClick={triggerLocalUpload} 
                              className="flex flex-col items-center justify-center gap-4 p-12 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:border-blue-500/50 hover:bg-neutral-800 transition-all group cursor-pointer"
                          >
                              <div className="w-16 h-16 rounded-full bg-neutral-700 group-hover:bg-blue-600 flex items-center justify-center transition-colors shadow-lg pointer-events-none">
                                  <Upload className="w-8 h-8 text-neutral-300 group-hover:text-white" />
                              </div>
                              <div className="text-center pointer-events-none">
                                  <p className="text-lg font-medium text-white mb-1">Upload Files</p>
                                  <p className="text-sm text-neutral-400">Select multiple items</p>
                              </div>
                          </button>
                          
                          <button 
                              type="button"
                              onClick={() => setModalMode('generate')} 
                              className="flex flex-col items-center justify-center gap-4 p-12 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:border-purple-500/50 hover:bg-neutral-800 transition-all group relative overflow-hidden cursor-pointer"
                          >
                              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                              <div className="w-16 h-16 rounded-full bg-neutral-700 group-hover:bg-purple-600 flex items-center justify-center transition-colors shadow-lg relative z-10 pointer-events-none">
                                  <GeminiLogo className="w-8 h-8" />
                              </div>
                              <div className="text-center relative z-10 pointer-events-none">
                                  <p className="text-lg font-medium text-white mb-1">Generate with Gemini</p>
                                  <p className="text-sm text-neutral-400">Image, Video, or Speech</p>
                              </div>
                          </button>
                      </div>
                  ) : (
                      // ... Generation UI ...
                      <div className="flex flex-1 min-h-0">
                          {/* Sidebar */}
                          <div className="w-48 border-r border-neutral-800 bg-neutral-900 p-2 space-y-1">
                              <button onClick={() => setModalMode('initial')} className="flex items-center gap-2 w-full p-2 text-neutral-400 hover:text-white mb-4 transition-colors">
                                  <ChevronLeft className="w-4 h-4" /> Back
                              </button>
                              {[{ id: 'image', icon: ImageIcon, label: 'Image' },{ id: 'video', icon: Film, label: 'Video (Veo)' },{ id: 'audio', icon: Mic, label: 'Speech (TTS)' }, { id: 'scout', icon: Globe, label: 'Asset Scout' }].map(tab => (<button key={tab.id} onClick={() => setGenTab(tab.id as any)} className={`flex items-center gap-3 w-full p-3 rounded-lg text-sm font-medium transition-all ${genTab === tab.id ? 'bg-purple-600/20 text-purple-300' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}><tab.icon className="w-4 h-4" /> {tab.label}</button>))}
                          </div>
                          {/* Content */}
                          <div className="flex-1 overflow-y-auto bg-neutral-950/50">
                            {/* SCOUT MODE */}
                            {genTab === 'scout' ? (
                                <div className="flex-1 min-h-0 bg-neutral-950 h-full">
                                    <AssetScout onAssetFound={handleScoutAssetFound} />
                                </div>
                            ) : (
                                <div className="max-w-xl mx-auto space-y-6 p-6"><div><label className="block text-sm font-medium text-neutral-400 mb-2">{genTab === 'audio' ? 'Text to Speak' : 'Prompt'}</label><textarea value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} placeholder={genTab === 'audio' ? "Enter text..." : "Describe what you want to generate..."} className="w-full h-24 bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none transition-all" autoFocus /></div>{genTab === 'video' && (<div className="space-y-4 pt-2 border-t border-neutral-800"><div className="flex items-center justify-between mb-2"><span className="text-sm font-medium text-neutral-300">Reference Images</span><span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 ${veoModeColor}`}>{veoModeLabel}</span></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><div className="flex items-center justify-between"><label className="text-xs font-medium text-neutral-500">Start Frame (Optional)</label>{veoStartImg && <button onClick={() => setVeoStartImg(null)} className="text-xs text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>}</div><div className="relative aspect-video bg-neutral-900 border border-neutral-700 rounded-lg overflow-hidden group hover:border-blue-500/50 transition-colors">{veoStartImg ? (<img src={veoStartImg} className="w-full h-full object-cover" alt="Start Frame" />) : (<div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><button onClick={() => handleCaptureFrame('start')} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 transition-colors"><Camera className="w-3 h-3" /> Timeline</button><button onClick={() => handleVeoReferenceUpload('start')} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 transition-colors"><Upload className="w-3 h-3" /> Upload</button></div>)}</div><p className="text-[10px] text-neutral-600">Tip: Position playhead to capture specific timeline frame.</p></div><div className="space-y-2"><div className="flex items-center justify-between"><label className={`text-xs font-medium ${!veoStartImg ? 'text-neutral-700' : 'text-neutral-500'}`}>End Frame (Requires Start Frame)</label>{veoEndImg && <button onClick={() => setVeoEndImg(null)} className="text-xs text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>}</div><div className={`relative aspect-video bg-neutral-900 border rounded-lg overflow-hidden group transition-colors ${!veoStartImg ? 'border-neutral-800 opacity-50 pointer-events-none' : 'border-neutral-700 hover:border-purple-500/50'}`}>{veoEndImg ? (<img src={veoEndImg} className="w-full h-full object-cover" alt="End Frame" />) : (<div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><button onClick={() => handleCaptureFrame('end')} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 transition-colors"><Camera className="w-3 h-3" /> Timeline</button><button onClick={() => handleVeoReferenceUpload('end')} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 transition-colors"><Upload className="w-3 h-3" /> Upload</button></div>)}</div></div></div></div>)}{genTab === 'image' && (<div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-neutral-500 mb-1">Model</label><select value={imgModel} onChange={(e) => setImgModel(e.target.value as any)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="gemini-2.5-flash-image">Fast (Flash)</option><option value="gemini-3-pro-image-preview">High Quality (Pro)</option></select></div><div><label className="block text-xs font-medium text-neutral-500 mb-1">Aspect Ratio</label><select value={imgAspect} onChange={(e) => setImgAspect(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="16:9">16:9 (Landscape)</option><option value="9:16">9:16 (Portrait)</option><option value="1:1">1:1 (Square)</option></select></div></div>)}{genTab === 'video' && (<div className="grid grid-cols-2 gap-4"><div className="col-span-2 grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-neutral-500 mb-1">Model</label><select value={vidModel} onChange={(e) => setVidModel(e.target.value as any)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast</option><option value="veo-3.1-generate-preview">Veo 3.1 Quality</option><option value="veo-3.0-fast-generate-preview">Veo 3 Fast</option><option value="veo-3.0-generate-preview">Veo 3 Quality</option></select></div><div><label className="block text-xs font-medium text-neutral-500 mb-1">Resolution</label><select value={vidResolution} onChange={(e) => setVidResolution(e.target.value as any)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="720p">720p</option><option value="1080p">1080p (8s only)</option><option value="4k">4k (8s only)</option></select></div><div><label className="block text-xs font-medium text-neutral-500 mb-1">Duration</label><select value={vidDuration} onChange={(e) => setVidDuration(e.target.value as any)} disabled={vidResolution === '1080p' || vidResolution === '4k' || !!veoStartImg || !!veoEndImg} className={`w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500 ${vidResolution === '1080p' || vidResolution === '4k' || !!veoStartImg || !!veoEndImg ? 'opacity-50 cursor-not-allowed bg-neutral-800' : ''}`}><option value="4">4s</option><option value="8">8s</option></select></div><div><label className="block text-xs font-medium text-neutral-500 mb-1">Aspect Ratio</label><select value={vidAspect} onChange={(e) => setVidAspect(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="16:9">16:9 (Landscape)</option><option value="9:16">9:16 (Portrait)</option></select></div></div><div className="col-span-2 p-3 bg-blue-900/20 border border-blue-500/20 rounded-lg flex items-start gap-2"><Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" /><span className="text-xs text-blue-300 leading-relaxed">Video generation takes 1-2 minutes. A paid billing project is required.<br/><strong>Note:</strong> 1080p, 4K, and Image-to-Video operations are locked to 8s duration.</span></div></div>)}{genTab === 'audio' && (<div><label className="block text-xs font-medium text-neutral-500 mb-1">Voice</label><div className="grid grid-cols-5 gap-2">{['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].map(voice => (<button key={voice} onClick={() => setAudioVoice(voice)} className={`p-2 rounded border text-xs font-medium transition-all ${audioVoice === voice ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-600'}`}>{voice}</button>))}</div></div>)}<div className="flex justify-end pt-4"><button onClick={handleGenerate} disabled={isGenerating || (genTab !== 'video' && !genPrompt.trim()) || (genTab === 'video' && !genPrompt.trim() && !veoStartImg)} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-8 py-3 rounded-lg font-medium text-sm transition-all disabled:opacity-50 shadow-lg shadow-purple-900/20 w-full justify-center">{isGenerating ? (<><Loader2 className="w-5 h-5 animate-spin" />{genTab === 'video' ? 'Generating Video...' : 'Generating...'}</>) : (<><Sparkles className="w-5 h-5" />Generate {genTab.charAt(0).toUpperCase() + genTab.slice(1)}</>)}</button></div></div></div></div>)}</div></div>)}

      {/* HEADER omitted for brevity */}
      <header className="h-14 border-b border-neutral-800 flex items-center px-4 justify-between bg-neutral-900/50 backdrop-blur-sm z-10 relative z-[100]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><Video className="w-5 h-5 text-white" /></div>
          <h1 className="font-semibold text-lg tracking-tight">Cursor for Video <span className="text-xs font-normal text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded ml-2">Agentic</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => refVideoInputRef.current?.click()}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:bg-neutral-800 hover:text-white transition-all"
          >
            <ScanEye className="w-4 h-4 text-purple-400" />
            Analyze Style
          </button>

          <button 
            onClick={() => setWorkspaceOpen(!workspaceOpen)}
            className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${workspaceOpen ? 'bg-neutral-800 border-neutral-600 text-white' : 'bg-transparent border-transparent text-neutral-400 hover:bg-neutral-800'}`}
          >
            <FolderOpen className="w-4 h-4" /> 
            Files ({workspaceFiles.length})
          </button>

          <div className="flex items-center gap-2">
              <button onClick={checkApiKey} className="p-1.5 rounded-md border border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-all" title="Select API Key"><Key size={16} /></button>
              <button onClick={() => setShowSafeZones(!showSafeZones)} className={`p-1.5 rounded-md border transition-all ${showSafeZones ? 'bg-neutral-800 border-neutral-600 text-white' : 'bg-transparent border-transparent text-neutral-500 hover:text-neutral-300'}`} title="Toggle Safe Zones"><Grid3X3 size={16} /></button>
              <button onClick={() => setShowShortcuts(true)} className="p-1.5 rounded-md border border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-all" title="Shortcuts Help (?)"><HelpCircle size={16} /></button>
          </div>

          <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700 mr-2">
            <button onClick={handleUndo} disabled={!canUndo} className="p-1.5 hover:bg-neutral-700 rounded-md text-neutral-400 hover:text-white disabled:opacity-30 transition-colors"><RotateCcw className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-neutral-700 mx-0.5" />
            <button onClick={handleRedo} disabled={!canRedo} className="p-1.5 hover:bg-neutral-700 rounded-md text-neutral-400 hover:text-white disabled:opacity-30 transition-colors"><RotateCw className="w-4 h-4" /></button>
          </div>
           <button onClick={handleExport} disabled={isExporting} className="flex items-center gap-2 text-sm text-white bg-green-600 hover:bg-green-700 px-4 py-1.5 rounded-full shadow-lg transition-all disabled:opacity-50">{isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}<span>{isExporting ? `${exportProgress}%` : 'Export MP4'}</span></button>
           <label className="flex items-center gap-2 text-sm text-white cursor-pointer transition-all bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-full shadow-lg hover:shadow-blue-500/20 active:scale-95 font-medium"><Upload className="w-4 h-4" /><span>Import Video</span><input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} /></label>
        </div>
      </header>
      
      <div className="flex flex-1 min-h-0 relative">
        
        {/* LEFT SIDEBAR */}
        <Workspace 
            isOpen={workspaceOpen} 
            onClose={() => setWorkspaceOpen(false)}
            items={workspaceFiles} 
            onImport={handleWorkspaceImport} 
            onDeleteItem={handleWorkspaceDelete}
            onAddMedia={() => { setMediaModalTarget('workspace'); setModalMode('initial'); }}
            isPickingMode={isPickingForChat}
            onPick={handleAssetPickedForChat}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 bg-neutral-950 flex flex-col">
              <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden" onClick={handleCanvasClick}>
                <div ref={containerRef} className="relative w-full max-w-4xl aspect-video bg-neutral-900 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 group">
                    {/* Render clips */}
                    {clips.map(clip => {
                        // Check if this clip is involved in an active transition
                        const activeTransition = transitions.find(t => 
                            t.toClipId === clip.id && 
                            currentTime >= t.startTime && 
                            currentTime < t.startTime + t.duration
                        );

                        const isVisible = (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) || activeTransition;
                        const transform = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
                        
                        // If active transition, we need to ensure it's rendered even if technically 'before' start time (due to overlap logic)
                        // Actually, our `add_transition` tool moves the clip start time, so `isVisible` check handles it naturally.
                        
                        const style: React.CSSProperties = { position: 'absolute', left: '50%', top: '50%', width: '100%', height: '100%', transform: `translate(-50%, -50%) translate(${transform.x * 100}%, ${transform.y * 100}%) scale(${transform.scale}) rotate(${transform.rotation}deg)`, objectFit: 'contain', cursor: isPlaying ? 'default' : 'pointer', zIndex: clip.trackId * 10, opacity: isVisible ? 1 : 0, pointerEvents: isVisible ? (isPlaying ? 'none' : 'auto') : 'none' };
                        const handleClipClick = (e: React.MouseEvent) => { e.stopPropagation(); if (!isPlaying && isVisible) { handleSelectClip(clip.id, e); } };
                        
                        // TRANSITION RENDER LOGIC
                        // We use CSS masking for real-time preview
                        let transitionStyle: React.CSSProperties = {};
                        if (activeTransition) {
                            const progress = (currentTime - activeTransition.startTime) / activeTransition.duration;
                            if (activeTransition.type === 'fade') {
                                style.opacity = progress;
                            } else if (activeTransition.type === 'wipe_right') {
                                transitionStyle = { clipPath: `inset(0 0 0 ${100 - (progress * 100)}%)` };
                            } else if (activeTransition.type === 'wipe_left') {
                                transitionStyle = { clipPath: `inset(0 ${100 - (progress * 100)}% 0 0)` };
                            } else if (activeTransition.type === 'wipe_down') {
                                transitionStyle = { clipPath: `inset(0 0 ${100 - (progress * 100)}% 0)` };
                            } else if (activeTransition.type === 'circle_open') {
                                transitionStyle = { clipPath: `circle(${progress * 150}% at 50% 50%)` };
                            } else if (activeTransition.type === 'zoom_in') {
                                style.transform += ` scale(${0.5 + (0.5 * progress)})`;
                                style.opacity = progress;
                            }
                        }

                        if (clip.type === 'text' && clip.text) {
                            const ts = clip.textStyle || DEFAULT_TEXT_STYLE;
                            return ( <div key={clip.id} style={{...style, ...transitionStyle}} onClick={handleClipClick} className="flex items-center justify-center"><span className="px-4 py-2 text-center whitespace-pre-wrap" style={{ fontFamily: ts.fontFamily || 'Plus Jakarta Sans', fontSize: `${ts.fontSize}px`, fontWeight: ts.isBold ? 'bold' : 'normal', fontStyle: ts.isItalic ? 'italic' : 'normal', textDecoration: ts.isUnderline ? 'underline' : 'none', color: ts.color, backgroundColor: ts.backgroundColor ? `${ts.backgroundColor}${Math.round((ts.backgroundOpacity ?? 0) * 255).toString(16).padStart(2,'0')}` : 'transparent', lineHeight: 1.2, textShadow: (ts.backgroundOpacity ?? 0) < 0.3 ? '1px 1px 2px rgba(0,0,0,0.8)' : 'none' }}>{clip.text}</span></div> );
                        }
                        if (clip.type === 'video' || clip.type === 'audio') {
                            const isAudio = clip.type === 'audio';
                            return ( <div key={clip.id} style={{...style, display: isAudio ? 'none' : 'block', ...transitionStyle}} onClick={handleClipClick}>{isAudio ? ( <audio ref={(el) => { mediaRefs.current[clip.id] = el; }} src={clip.sourceUrl || ''} muted={false} /> ) : ( <video ref={(el) => { mediaRefs.current[clip.id] = el; }} src={clip.sourceUrl || videoUrl || ''} className="w-full h-full object-contain pointer-events-none" muted={false} playsInline crossOrigin={(!clip.sourceUrl && !videoUrl) ? undefined : "anonymous"} /> )}</div> );
                        } else { 
                            return ( 
                                <div key={clip.id} style={{...style, ...transitionStyle}} onClick={handleClipClick}>
                                    <img 
                                        ref={(el) => { if (el) mediaRefs.current[clip.id] = el; }}
                                        src={clip.sourceUrl || ''} 
                                        alt={clip.title} 
                                        className="w-full h-full object-contain pointer-events-none" 
                                    />
                                </div> 
                            ); 
                        }
                    })}
                    {!videoUrl && clips.length === 0 && ( <label className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 hover:text-neutral-300 cursor-pointer transition-colors z-20"><Video className="w-16 h-16 mb-4 opacity-20" /><p className="font-medium text-lg mb-2">Click to upload video</p><p className="text-sm opacity-50">or drag and drop here</p><input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} /></label> )}
                    {!isPlaying && isSelectedClipVisible && primarySelectedClip && primarySelectedClip.type !== 'audio' && !isMultiSelection && ( 
                        <CanvasControls clip={primarySelectedClip} containerRef={containerRef} onUpdate={handleUpdateClipTransform} /> 
                    )}
                    
                    {/* Safe Zones Overlay */}
                    {showSafeZones && (
                        <div className="absolute inset-0 pointer-events-none z-[100]">
                            {/* Center Crosshair */}
                            <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-500/30" />
                            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-cyan-500/30" />
                            <div className="absolute top-[5%] bottom-[5%] left-[5%] right-[5%] border border-yellow-500/30 rounded-sm" />
                            <div className="absolute top-[10%] bottom-[10%] left-[10%] right-[10%] border border-red-500/30 rounded-sm" />
                        </div>
                    )}
                </div>
              </div>
              {/* Toolbar & Timeline */}
              <div className="h-12 bg-neutral-900 border-t border-neutral-800 flex items-center justify-between px-6 z-[200] relative">
                  <div className="flex items-center gap-4">
                      <button onClick={togglePlay} className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-black hover:bg-neutral-200 transition-colors">{isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}</button>
                      <span className="font-mono text-sm text-neutral-400"><span className="text-white">{formatTime(currentTime)}</span></span>
                  </div>
                  {/* ... Toolbar Buttons (unchanged) ... */}
                  <div className="flex items-center gap-2">
                       {allSelectedAreText && (
                           <>
                            {!isMultiSelection && primarySelectedClip && ( <input type="text" value={primarySelectedClip.text || ''} onChange={(e) => handleUpdateTextContent(primarySelectedClip.id, e.target.value)} className="w-48 bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 mr-2" placeholder="Enter text..." /> )}
                            <div className="relative">
                                <button onClick={() => { setShowTextStyleMenu(!showTextStyleMenu); setShowVolumeMenu(false); setShowSpeedMenu(false); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showTextStyleMenu ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700'}`}>
                                    <Type className="w-3.5 h-3.5" /> Style {isMultiSelection ? `(${selectedClips.length})` : ''}
                                </button>
                                {showTextStyleMenu && ( <div className="absolute bottom-full mb-2 right-0 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-4 z-50 min-w-[280px] animate-in fade-in zoom-in-95 duration-100"><TextControls values={primarySelectedClip?.textStyle || DEFAULT_TEXT_STYLE} onChange={handleUpdateTextStyle} /></div> )}
                            </div>
                           </>
                       )}
                       {allSelectedAreMedia && (
                           <>
                           <div className="relative">
                                <button onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowVolumeMenu(false); setIsCustomSpeed(false); setShowTextStyleMenu(false); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showSpeedMenu ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700'}`}><Gauge className="w-3.5 h-3.5" />{primarySelectedClip?.speed}x</button>
                               {showSpeedMenu && (<div className="absolute bottom-full mb-2 right-0 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden min-w-[140px] flex flex-col p-1 z-50">{[0.5, 1, 1.5, 2].map(s => (<button key={s} onClick={() => primarySelectedClip && handleClipSpeed(primarySelectedClip.id, s)} className="text-left px-3 py-1.5 text-xs rounded hover:bg-neutral-700 transition-colors w-full text-neutral-300">{s}x</button>))}</div>)}
                           </div>
                           <div className="relative">
                                <button onClick={() => { setShowVolumeMenu(!showVolumeMenu); setShowSpeedMenu(false); setShowTextStyleMenu(false); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showVolumeMenu ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700'}`}>{primarySelectedClip?.volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}{Math.round((primarySelectedClip?.volume ?? 1) * 100)}%</button>
                                {showVolumeMenu && (<div className="absolute bottom-full mb-2 right-0 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-3 z-50 min-w-[120px]"><input type="range" min="0" max="1" step="0.05" value={primarySelectedClip?.volume ?? 1} onChange={(e) => primarySelectedClip && handleClipVolume(primarySelectedClip.id, parseFloat(e.target.value))} className="w-full h-1.5 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-500" /></div>)}
                            </div>
                           </>
                       )}
                       <button onClick={handleSplitClip} className="p-2 hover:bg-neutral-800 rounded-md text-neutral-400 hover:text-white transition-colors" title="Split Clip at Playhead"><Scissors className="w-4 h-4" /></button>
                  </div>
              </div>
          </div>
          <div 
            className="h-64 border-t border-neutral-800 bg-neutral-900/50 backdrop-blur-sm z-10 flex flex-col relative z-[90]"
            onDrop={handleTimelineDrop}
            onDragOver={handleTimelineDragOver}
          >
            <Timeline 
                clips={clips} 
                tracks={tracks} 
                currentTime={currentTime} 
                onSeek={handleSeek} 
                onDelete={handleDelete} 
                onSelect={handleSelectClip} 
                onAddMediaRequest={(tid) => { setMediaModalTarget(tid); setModalMode('initial'); }} 
                onResize={handleClipResize} 
                onReorder={handleClipReorder} 
                onAddTrack={handleAddTrack} 
                selectedClipIds={selectedClipIds} 
                onTransitionRequest={() => {}} 
                onCaptionRequest={() => setCaptionModalOpen(true)} 
                onOpenFoundry={() => setFoundryOpen(true)} 
                isSelectionMode={isSelectingScope} 
                onRangeChange={(range) => setLiveScopeRange(range)} 
                onRangeSelected={handleRangeSelected} 
                onEditImage={(clip) => setImageEditorClip(clip)} 
                onClipEject={handleClipEject}
                isPickingMode={isPickingForChat}
                onPick={handleAssetPickedForChat}
                transitions={transitions}
                onDeleteTransition={(id) => timelineStore.removeTransition(id)}
            />
          </div>
        </div>
        <aside className="w-80 border-l border-neutral-800 bg-neutral-900 flex flex-col z-[150] relative">
          <AIAssistant 
            selectedClip={primarySelectedClip} 
            selectedClipIds={selectedClipIds}
            onRequestRangeSelect={() => {}}
            isSelectingRange={isSelectingScope} 
            timelineRange={liveScopeRange}
            currentTime={currentTime}
            allClips={clips}
            mediaRefs={mediaRefs}
            onExecuteAction={handleExecuteAIAction}
            onRunAgentLoop={handleRunAgentLoop}
            chatHistory={chatHistory}
            isProcessing={isProcessing}
            activePlan={activePlan}
            currentStepIndex={currentStepIndex}
            workspaceFiles={workspaceFiles} 
            onRequestAssetPick={handleChatPickRequest}
            pickedAsset={pickedChatAsset}
            onStop={handleStopAgent} // Pass stop handler
          />
        </aside>
      </div>
      <AssetFoundryModal isOpen={foundryOpen} onClose={() => setFoundryOpen(false)} onAddAsset={handleAssetFoundryAdd} />
      <ImageEditorModal 
          isOpen={!!imageEditorClip}
          onClose={() => setImageEditorClip(null)}
          clip={imageEditorClip}
          onAddResult={handleAddEditedAsset}
      />
    </div>
  );
}
