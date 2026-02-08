
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Timeline } from './components/Timeline';
import { CanvasControls } from './components/CanvasControls';
import { AIAssistant } from './components/sidebar/AIAssistant';
import { Clip, ChatMessage, ToolAction, EditPlan, WorkspaceItem } from './types';
import { generateImage, generateVideo, generateSpeech, optimizePrompt, editImage } from './services/gemini';
import { extractAudioFromVideo, formatTime } from './utils/videoUtils';
import { drawClipToCanvas, DEFAULT_TEXT_STYLE } from './utils/canvasDrawing';
import { GenerationApprovalModal, RangeEditorModal, TextControls, GeminiLogo } from './components/AppModals';
import { 
  Video, Play, Pause, Loader2, Upload, RotateCcw, RotateCw, 
  Sparkles, Scissors, Gauge, Download, Volume2, VolumeX, X, 
  Image as ImageIcon, Film, Mic, Camera, Trash2, Info, Captions, 
  Type, Check, ChevronLeft, ShieldCheck, Globe, FolderOpen, Plus
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

export default function App() {
  const [tracks, setTracks] = useState<number[]>([0, 1, 2, 3]);
  const [clips, setClips] = useState<Clip[]>(timelineStore.getClips());
  const [foundryOpen, setFoundryOpen] = useState(false);
  const [imageEditorClip, setImageEditorClip] = useState<Clip | null>(null);
  
  // Workspace State
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceItem[]>([]);

  // Modal Target State (Track ID or 'workspace' or null)
  const [mediaModalTarget, setMediaModalTarget] = useState<number | 'workspace' | null>(null);
  const mediaModalTrackId = typeof mediaModalTarget === 'number' ? mediaModalTarget : null;

  useEffect(() => { return timelineStore.subscribe(setClips); }, []);
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
  const mediaRefs = useRef<{[key: string]: HTMLVideoElement | HTMLAudioElement | HTMLImageElement | null}>({});
  const currentTimeRef = useRef(currentTime);

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

  // HELPER: Process Files (Shared by Upload Input and Drop)
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
      } catch (e) { 
          console.error(e); 
      } finally { 
          setIsGenerating(false); 
          if (fileInputRef.current) fileInputRef.current.value = ''; 
      } 
  };

  // HANDLERS
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
      
      // Handle Native Files
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
              const maxTime = clips.length > 0 ? Math.max(...clips.map(c => c.startTime + c.duration)) : 0; 
              timelineStore.addClip({ id: `clip-${item.id}-${Date.now()}`, title: item.name, type: item.type as any, startTime: maxTime, duration: item.duration, sourceStartTime: 0, sourceUrl: item.url, trackId: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); 
          } 
      } catch (err) { console.error("Drop failed", err); } 
  };
  
  const handleTimelineDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleClipEject = (clip: Clip) => { if (!clip.sourceUrl) return; const newItem: WorkspaceItem = { id: `ws-eject-${Date.now()}`, type: (clip.type === 'video' || clip.type === 'audio' || clip.type === 'image') ? clip.type : 'video', url: clip.sourceUrl, name: clip.title, duration: clip.totalDuration || clip.duration }; setWorkspaceFiles(prev => [...prev, newItem]); timelineStore.removeClip(clip.id); setWorkspaceOpen(true); };
  
  const handleAssetFoundryAdd = (url: string, config: AssetConfig) => { 
      // Add to timeline
      const maxTrack = clips.length > 0 ? Math.max(...clips.map(c => c.trackId)) : 0; 
      const targetTrack = maxTrack + 1; 
      timelineStore.addClip({ id: `foundry-${Date.now()}`, title: config.originalPrompt.slice(0, 20), type: 'video', startTime: currentTime, duration: 5, sourceStartTime: 0, sourceUrl: url, trackId: targetTrack, strategy: config.strategy, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); 
      
      // Also sync to workspace
      setWorkspaceFiles(prev => [...prev, {
          id: `foundry-ws-${Date.now()}`,
          type: 'video',
          url,
          name: config.originalPrompt.slice(0, 20),
          duration: 5
      }]);

      setChatHistory(prev => [...prev, { role: 'system', text: `✨ Asset Foundry Action: Created "${config.originalPrompt}" using '${config.strategy}' strategy.` }]); 
  };

  const handleScoutAssetFound = (url: string, description: string) => { 
      // Always add to workspace first
      const newItem: WorkspaceItem = { id: `scout-ws-${Date.now()}`, type: 'video', url, name: description.slice(0, 20), duration: 4 }; 
      setWorkspaceFiles(prev => [...prev, newItem]); 
      
      // If we are targeting a track (not just workspace), add to timeline too
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
  };

  const handleAddEditedAsset = (url: string, type: 'image' | 'video', title: string) => { 
      // Add to timeline
      const maxTrack = clips.length > 0 ? Math.max(...clips.map(c => c.trackId)) : 0; 
      const targetTrack = maxTrack + 1; 
      const originalClip = imageEditorClip; 
      const startTime = originalClip ? originalClip.startTime : currentTime; 
      const duration = type === 'video' ? 4 : 5; 
      timelineStore.addClip({ id: `edit-${Date.now()}`, title: title, type: type, startTime: startTime, duration: duration, sourceStartTime: 0, sourceUrl: url, trackId: targetTrack, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); 
      
      // Also sync to workspace
      setWorkspaceFiles(prev => [...prev, {
          id: `edit-ws-${Date.now()}`,
          type,
          url,
          name: title,
          duration
      }]);

      setChatHistory(prev => [...prev, { role: 'system', text: `🎨 Added new asset: "${title}"` }]); 
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
          
          // Add to Workspace
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
      } catch (e) { 
          console.error("Generation failed", e); 
      } finally { 
          setIsGenerating(false); 
      } 
  };

  const handleGenerateCaptions = async () => { if (!availableVideo || isGenerating) return; setIsGenerating(true); try { let audioBase64 = ''; if (videoFile) { audioBase64 = await extractAudioFromVideo(videoFile); } else if (availableVideo.sourceUrl) { const response = await fetch(availableVideo.sourceUrl); const blob = await response.blob(); audioBase64 = await extractAudioFromVideo(blob); } if (!audioBase64) throw new Error("Could not extract audio"); timelineStore.addClip({ id: `sub-${Date.now()}`, title: 'Generated Subtitles', type: 'text', text: "Generated captions would appear here aligned to speech.", startTime: 0, duration: 5, sourceStartTime: 0, trackId: 3, textStyle: captionStyle }); setCaptionModalOpen(false); } catch (e) { console.error(e); } finally { setIsGenerating(false); } };
  const handleExport = async () => { setIsExporting(true); setExportProgress(0); try { const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error("No context"); for(let i=0; i<=100; i+=10) { setExportProgress(i); await new Promise(r => setTimeout(r, 100)); } alert("Export simulation complete. (Real export requires WebCodecs implementation)"); } catch (e) { console.error(e); alert("Export failed"); } finally { setIsExporting(false); } };
  const captureCurrentFrame = async (): Promise<string | null> => { if (!containerRef.current) return null; const width = 1280; const height = 720; const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); if (!ctx) return null; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, width, height); const visible = clips.filter(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration).sort((a, b) => a.trackId - b.trackId); for (const clip of visible) { if (clip.type === 'audio') continue; if (clip.type === 'text') { drawClipToCanvas(ctx, clip, null, width, height); } else { const el = mediaRefs.current[clip.id] as HTMLVideoElement | null; if (clip.type === 'video' && el) { drawClipToCanvas(ctx, clip, el, width, height); } else if (clip.type === 'image') { const img = new Image(); img.crossOrigin = "anonymous"; img.src = clip.sourceUrl || ''; await new Promise((resolve) => { if (img.complete) resolve(true); img.onload = () => resolve(true); img.onerror = () => resolve(false); }); drawClipToCanvas(ctx, clip, img, width, height); } } } return canvas.toDataURL('image/jpeg', 0.8); };
  const handleRequestObservation = async (): Promise<string[]> => { setIsVerifying(true); setIsPlaying(false); setCurrentTime(0); await new Promise(r => setTimeout(r, 200)); const duration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0) || 10; const capturedFrames: string[] = []; setIsPlaying(true); return new Promise((resolve) => { const checkInterval = setInterval(async () => { const frame = await captureCurrentFrame(); if (frame) capturedFrames.push(frame); if (currentTimeRef.current >= duration) { clearInterval(checkInterval); setIsPlaying(false); setIsVerifying(false); resolve(capturedFrames); } }, 1000); }); };
  const eyes = new EyesAgent(); const brain = new BrainAgent(); const hands = new HandsAgent(); const verifier = new VerifierAgent();
  const loop = new AgenticLoop( eyes, brain, hands, verifier, (agent, thought, toolAction) => { setChatHistory(prev => [...prev, { role: 'agent', agentType: agent, text: thought, toolAction: toolAction }]); }, handleRequestObservation );
  const executePlanStep = async (stepIndex: number, plan: EditPlan, initialIntent: string) => { if (!plan || stepIndex >= plan.steps.length) { if (plan) { await loop.verify(initialIntent, planStartClipsRef.current, timelineStore.getClips()); setActivePlan(null); } setIsProcessing(false); return; } const step = plan.steps[stepIndex]; setCurrentStepIndex(stepIndex); setActivePlan(prev => { if (!prev) return null; const newSteps = [...prev.steps]; newSteps[stepIndex] = { ...newSteps[stepIndex], status: 'generating' }; return { ...prev, steps: newSteps }; }); try { const result = await loop.executeStep(step); if (result.approvalRequired) { setPendingApproval(result.approvalRequired); return; } if (result.success) { setActivePlan(prev => { if (!prev) return null; const newSteps = [...prev.steps]; newSteps[stepIndex] = { ...newSteps[stepIndex], status: 'completed' }; return { ...prev, steps: newSteps }; }); await executePlanStep(stepIndex + 1, plan, initialIntent); } } catch (e) { console.error("Step execution failed", e); setIsProcessing(false); } };
  const handleRunAgentLoop = async (message: string) => { setIsProcessing(true); setChatHistory(prev => [...prev, { role: 'user', text: message }]); setActivePlan(null); setCurrentStepIndex(0); currentIntentRef.current = message; planStartClipsRef.current = [...timelineStore.getClips()]; try { const context = { clips: timelineStore.getClips(), selectedClipIds, currentTime, range: liveScopeRange || { start: 0, end: 0 } }; const plan = await loop.plan(message, context, mediaRefs.current); if (plan) { setActivePlan(plan); await executePlanStep(0, plan, message); } else { setIsProcessing(false); } } catch (e) { setChatHistory(prev => [...prev, { role: 'system', text: "Agent loop failed unexpectedly." }]); console.error(e); setIsProcessing(false); } };
  const handleExecuteAIAction = async (action: ToolAction) => { if (action.tool_id === 'REPLAN_REQUEST') { const fixPrompt = action.parameters?.prompt || action.reasoning; await handleRunAgentLoop(fixPrompt); return; } if (action.tool_id === 'USER_ACTION_REQUEST') { if (action.button_label.includes("Upload")) { triggerLocalUpload(); } return; } setIsGenerating(true); await hands.execute({ operation: action.tool_id.toLowerCase(), parameters: action.parameters, intent: action.reasoning }); setIsGenerating(false); };
  const handleApprovalConfirm = async (params: any) => { if (!pendingApproval || !activePlan) return; const { tool } = pendingApproval; setPendingApproval(null); setIsGenerating(true); setChatHistory(prev => [...prev, { role: 'system', text: `🚀 Starting generation for step ${currentStepIndex + 1}/${activePlan.steps.length}...` }]); try { const currentClips = timelineStore.getClips(); const maxTrack = currentClips.length > 0 ? Math.max(...currentClips.map(c => c.trackId)) : 0; let targetTrackId = Number(params.trackId); if (isNaN(targetTrackId)) targetTrackId = maxTrack + 1; const rawInsertTime = Number(params.insertTime); const safeStartTime = isNaN(rawInsertTime) ? 0 : rawInsertTime; const rawDuration = Number(params.duration); const safeDuration = (isNaN(rawDuration) || rawDuration <= 0) ? 4 : rawDuration; if (tool === 'generate_video_asset') { const videoUrl = await generateVideo(params.prompt, params.model || 'veo-3.1-fast-generate-preview', '16:9', '720p', safeDuration); timelineStore.addClip({ id: `gen-vid-${Date.now()}`, title: `Veo: ${params.prompt.slice(0, 15)}...`, type: 'video', startTime: safeStartTime, duration: safeDuration, sourceStartTime: 0, sourceUrl: videoUrl, trackId: targetTrackId, volume: 1, speed: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); } else if (tool === 'generate_image_asset') { const base64Img = await generateImage(params.prompt, params.model || 'gemini-2.5-flash-image'); const imgUrl = `data:image/png;base64,${base64Img}`; timelineStore.addClip({ id: `gen-img-${Date.now()}`, title: `Img: ${params.prompt.slice(0, 15)}...`, type: 'image', startTime: safeStartTime, duration: safeDuration || 5, sourceStartTime: 0, sourceUrl: imgUrl, trackId: targetTrackId, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); } else if (tool === 'generate_voiceover') { const audioUrl = await generateSpeech(params.text, params.voice || 'Kore'); const tempAudio = new Audio(audioUrl); await new Promise<void>((resolve) => { tempAudio.onloadedmetadata = () => resolve(); tempAudio.onerror = () => resolve(); }); timelineStore.addClip({ id: `vo-${Date.now()}`, title: `VO: ${params.text.slice(0, 15)}...`, type: 'audio', startTime: safeStartTime, duration: tempAudio.duration || 5, sourceStartTime: 0, sourceUrl: audioUrl, trackId: targetTrackId, volume: 1, speed: 1, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }); } setChatHistory(prev => [...prev, { role: 'system', text: "✅ Asset generated successfully." }]); setActivePlan(prev => { if (!prev) return null; const newSteps = [...prev.steps]; newSteps[currentStepIndex] = { ...newSteps[currentStepIndex], status: 'completed' }; return { ...prev, steps: newSteps }; }); await executePlanStep(currentStepIndex + 1, activePlan, currentIntentRef.current); } catch (e: any) { console.error("Generation Error:", e); setChatHistory(prev => [...prev, { role: 'system', text: `❌ Generation failed: ${e.message}` }]); setIsProcessing(false); } finally { setIsGenerating(false); } };
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
      {isVerifying && (
          <div className="fixed inset-0 z-[9999] pointer-events-none flex flex-col">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(234,179,8,0.1)_100%)] animate-pulse" />
              <div className="w-full bg-yellow-500/90 text-black py-1 text-center font-bold text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
                  <ShieldCheck size={14} className="animate-pulse" /> Verification in Progress - Recording Playback View
              </div>
              <div className="flex-1 border-[6px] border-yellow-500/20" />
          </div>
      )}

      <GenerationApprovalModal isOpen={!!pendingApproval} onClose={() => { setPendingApproval(null); setIsProcessing(false); }} onConfirm={handleApprovalConfirm} request={pendingApproval} />
      <RangeEditorModal isOpen={rangeModalOpen} onClose={() => { setRangeModalOpen(false); setIsSelectingScope(false); }} onConfirm={handleRangeConfirm} initialRange={liveScopeRange || { start: 0, end: 5 }} clips={clips} mediaRefs={mediaRefs} />
      {/* Hidden Inputs */}
      <input type="file" multiple accept="video/*,image/*,audio/*" className="hidden" ref={fileInputRef} onChange={handleAddMedia} />
      <input type="file" accept="image/*" className="hidden" ref={referenceImageInputRef} onChange={handleReferenceImageFileChange} />
      
      {/* Caption Modal */}
      {captionModalOpen && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCaptionModalOpen(false)} />
              <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900">
                      <div className="flex items-center gap-2"><Captions className="w-5 h-5 text-purple-400" /><h3 className="text-lg font-semibold text-white">Generate Subtitles</h3></div>
                      <button onClick={() => setCaptionModalOpen(false)} className="p-1.5 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="p-6 space-y-6">
                      <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700/50"><div className="flex items-start gap-3"><Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" /><div className="space-y-1"><p className="text-sm font-medium text-white">Source Selection</p><p className="text-xs text-neutral-400 leading-relaxed">Subtitles will be generated from the <strong>Main Video</strong> uploaded to the project. {videoFile ? ` (Main Video: ${videoFile.name})` : (availableVideo ? " (Using first timeline video)" : " (No video detected)")}</p></div></div></div>
                      <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/50"><label className="text-xs font-semibold text-neutral-400 uppercase mb-3 block tracking-wider">Default Style</label><TextControls values={captionStyle} onChange={(updates) => setCaptionStyle(prev => ({...prev, ...updates}))} /></div>
                      <div className="flex justify-end pt-2"><button onClick={handleGenerateCaptions} disabled={isGenerating || !availableVideo} className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50 shadow-lg w-full justify-center">{isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate with Gemini 2.5 Flash</button></div>
                  </div>
              </div>
          </div>
      )}
      
      {/* Add Media Modal */}
      {mediaModalTarget !== null && ( <div className="fixed inset-0 z-[500] flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseMediaModal} /><div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"><div className="p-4 border-b border-neutral-800 flex items-center justify-between"><h3 className="text-lg font-semibold text-white">{mediaModalTarget === 'workspace' ? 'Add to Project Files' : `Add Media to Track ${(mediaModalTarget as number) + 1}`}</h3><button onClick={handleCloseMediaModal} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button></div>{modalMode === 'initial' ? (<div className="p-8 grid grid-cols-2 gap-6"><button onClick={triggerLocalUpload} className="flex flex-col items-center justify-center gap-4 p-12 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:border-blue-500/50 hover:bg-neutral-800 transition-all group"><div className="w-16 h-16 rounded-full bg-neutral-700 group-hover:bg-blue-600 flex items-center justify-center transition-colors shadow-lg"><Upload className="w-8 h-8 text-neutral-300 group-hover:text-white" /></div><div className="text-center"><p className="text-lg font-medium text-white mb-1">Upload Files</p><p className="text-sm text-neutral-400">Select multiple items</p></div></button><button onClick={() => setModalMode('generate')} className="flex flex-col items-center justify-center gap-4 p-12 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:border-purple-500/50 hover:bg-neutral-800 transition-all group relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" /><div className="w-16 h-16 rounded-full bg-neutral-700 group-hover:bg-purple-600 flex items-center justify-center transition-colors shadow-lg relative z-10"><GeminiLogo className="w-8 h-8" /></div><div className="text-center relative z-10"><p className="text-lg font-medium text-white mb-1">Generate with Gemini</p><p className="text-sm text-neutral-400">Image, Video, or Speech</p></div></button></div>) : (<div className="flex flex-1 min-h-0"><div className="w-48 border-r border-neutral-800 bg-neutral-900 p-2 space-y-1"><button onClick={() => setModalMode('initial')} className="flex items-center gap-2 w-full p-2 text-neutral-400 hover:text-white mb-4 transition-colors"><ChevronLeft className="w-4 h-4" /> Back</button>{[{ id: 'image', icon: ImageIcon, label: 'Image' },{ id: 'video', icon: Film, label: 'Video (Veo)' },{ id: 'audio', icon: Mic, label: 'Speech (TTS)' }, { id: 'scout', icon: Globe, label: 'Asset Scout' }].map(tab => (<button key={tab.id} onClick={() => setGenTab(tab.id as any)} className={`flex items-center gap-3 w-full p-3 rounded-lg text-sm font-medium transition-all ${genTab === tab.id ? 'bg-purple-600/20 text-purple-300' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}><tab.icon className="w-4 h-4" /> {tab.label}</button>))}</div><div className="flex-1 overflow-y-auto bg-neutral-950/50">
        
        {/* SCOUT MODE */}
        {genTab === 'scout' ? (
            <div className="flex-1 min-h-0 bg-neutral-950 h-full">
                <AssetScout onAssetFound={handleScoutAssetFound} />
            </div>
        ) : (
            <div className="max-w-xl mx-auto space-y-6 p-6"><div><label className="block text-sm font-medium text-neutral-400 mb-2">{genTab === 'audio' ? 'Text to Speak' : 'Prompt'}</label><textarea value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} placeholder={genTab === 'audio' ? "Enter text..." : "Describe what you want to generate..."} className="w-full h-24 bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none transition-all" autoFocus /></div>{genTab === 'video' && (<div className="space-y-4 pt-2 border-t border-neutral-800"><div className="flex items-center justify-between mb-2"><span className="text-sm font-medium text-neutral-300">Reference Images</span><span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 ${veoModeColor}`}>{veoModeLabel}</span></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><div className="flex items-center justify-between"><label className="text-xs font-medium text-neutral-500">Start Frame (Optional)</label>{veoStartImg && <button onClick={() => setVeoStartImg(null)} className="text-xs text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>}</div><div className="relative aspect-video bg-neutral-900 border border-neutral-700 rounded-lg overflow-hidden group hover:border-blue-500/50 transition-colors">{veoStartImg ? (<img src={veoStartImg} className="w-full h-full object-cover" alt="Start Frame" />) : (<div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><button onClick={() => handleCaptureFrame('start')} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 transition-colors"><Camera className="w-3 h-3" /> Timeline</button><button onClick={() => handleVeoReferenceUpload('start')} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 transition-colors"><Upload className="w-3 h-3" /> Upload</button></div>)}</div><p className="text-[10px] text-neutral-600">Tip: Position playhead to capture specific timeline frame.</p></div><div className="space-y-2"><div className="flex items-center justify-between"><label className={`text-xs font-medium ${!veoStartImg ? 'text-neutral-700' : 'text-neutral-500'}`}>End Frame (Requires Start Frame)</label>{veoEndImg && <button onClick={() => setVeoEndImg(null)} className="text-xs text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>}</div><div className={`relative aspect-video bg-neutral-900 border rounded-lg overflow-hidden group transition-colors ${!veoStartImg ? 'border-neutral-800 opacity-50 pointer-events-none' : 'border-neutral-700 hover:border-purple-500/50'}`}>{veoEndImg ? (<img src={veoEndImg} className="w-full h-full object-cover" alt="End Frame" />) : (<div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><button onClick={() => handleCaptureFrame('end')} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 transition-colors"><Camera className="w-3 h-3" /> Timeline</button><button onClick={() => handleVeoReferenceUpload('end')} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 transition-colors"><Upload className="w-3 h-3" /> Upload</button></div>)}</div></div></div></div>)}{genTab === 'image' && (<div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-neutral-500 mb-1">Model</label><select value={imgModel} onChange={(e) => setImgModel(e.target.value as any)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="gemini-2.5-flash-image">Fast (Flash)</option><option value="gemini-3-pro-image-preview">High Quality (Pro)</option></select></div><div><label className="block text-xs font-medium text-neutral-500 mb-1">Aspect Ratio</label><select value={imgAspect} onChange={(e) => setImgAspect(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="16:9">16:9 (Landscape)</option><option value="9:16">9:16 (Portrait)</option><option value="1:1">1:1 (Square)</option></select></div></div>)}{genTab === 'video' && (<div className="grid grid-cols-2 gap-4"><div className="col-span-2 grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-neutral-500 mb-1">Model</label><select value={vidModel} onChange={(e) => setVidModel(e.target.value as any)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast</option><option value="veo-3.1-generate-preview">Veo 3.1 Quality</option><option value="veo-3.0-fast-generate-preview">Veo 3 Fast</option><option value="veo-3.0-generate-preview">Veo 3 Quality</option></select></div><div><label className="block text-xs font-medium text-neutral-500 mb-1">Resolution</label><select value={vidResolution} onChange={(e) => setVidResolution(e.target.value as any)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="720p">720p</option><option value="1080p">1080p (8s only)</option><option value="4k">4k (8s only)</option></select></div><div><label className="block text-xs font-medium text-neutral-500 mb-1">Duration</label><select value={vidDuration} onChange={(e) => setVidDuration(e.target.value as any)} disabled={vidResolution === '1080p' || vidResolution === '4k' || !!veoStartImg || !!veoEndImg} className={`w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500 ${vidResolution === '1080p' || vidResolution === '4k' || !!veoStartImg || !!veoEndImg ? 'opacity-50 cursor-not-allowed bg-neutral-800' : ''}`}><option value="4">4s</option><option value="8">8s</option></select></div><div><label className="block text-xs font-medium text-neutral-500 mb-1">Aspect Ratio</label><select value={vidAspect} onChange={(e) => setVidAspect(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500"><option value="16:9">16:9 (Landscape)</option><option value="9:16">9:16 (Portrait)</option></select></div></div><div className="col-span-2 p-3 bg-blue-900/20 border border-blue-500/20 rounded-lg flex items-start gap-2"><Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" /><span className="text-xs text-blue-300 leading-relaxed">Video generation takes 1-2 minutes. A paid billing project is required.<br/><strong>Note:</strong> 1080p, 4K, and Image-to-Video operations are locked to 8s duration.</span></div></div>)}{genTab === 'audio' && (<div><label className="block text-xs font-medium text-neutral-500 mb-1">Voice</label><div className="grid grid-cols-5 gap-2">{['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].map(voice => (<button key={voice} onClick={() => setAudioVoice(voice)} className={`p-2 rounded border text-xs font-medium transition-all ${audioVoice === voice ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-600'}`}>{voice}</button>))}</div></div>)}<div className="flex justify-end pt-4"><button onClick={handleGenerate} disabled={isGenerating || (genTab !== 'video' && !genPrompt.trim()) || (genTab === 'video' && !genPrompt.trim() && !veoStartImg)} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-8 py-3 rounded-lg font-medium text-sm transition-all disabled:opacity-50 shadow-lg shadow-purple-900/20 w-full justify-center">{isGenerating ? (<><Loader2 className="w-5 h-5 animate-spin" />{genTab === 'video' ? 'Generating Video...' : 'Generating...'}</>) : (<><Sparkles className="w-5 h-5" />Generate {genTab.charAt(0).toUpperCase() + genTab.slice(1)}</>)}</button></div></div></div></div>)}</div></div>)}

      <header className="h-14 border-b border-neutral-800 flex items-center px-4 justify-between bg-neutral-900/50 backdrop-blur-sm z-10 relative z-[100]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><Video className="w-5 h-5 text-white" /></div>
          <h1 className="font-semibold text-lg tracking-tight">Cursor for Video <span className="text-xs font-normal text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded ml-2">Agentic</span></h1>
        </div>
        <div className="flex items-center gap-4">
          {/* WORKSPACE TOGGLE */}
          <button 
            onClick={() => setWorkspaceOpen(!workspaceOpen)}
            className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${workspaceOpen ? 'bg-neutral-800 border-neutral-600 text-white' : 'bg-transparent border-transparent text-neutral-400 hover:bg-neutral-800'}`}
          >
            <FolderOpen className="w-4 h-4" /> 
            Files ({workspaceFiles.length})
          </button>

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
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 bg-neutral-950 flex flex-col">
              <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden" onClick={handleCanvasClick}>
                <div ref={containerRef} className="relative w-full max-w-4xl aspect-video bg-neutral-900 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 group">
                    {/* Render clips */}
                    {clips.map(clip => {
                        const isVisible = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;
                        const transform = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
                        const style: React.CSSProperties = { position: 'absolute', left: '50%', top: '50%', width: '100%', height: '100%', transform: `translate(-50%, -50%) translate(${transform.x * 100}%, ${transform.y * 100}%) scale(${transform.scale}) rotate(${transform.rotation}deg)`, objectFit: 'contain', cursor: isPlaying ? 'default' : 'pointer', zIndex: clip.trackId * 10, opacity: isVisible ? 1 : 0, pointerEvents: isVisible ? (isPlaying ? 'none' : 'auto') : 'none' };
                        const handleClipClick = (e: React.MouseEvent) => { e.stopPropagation(); if (!isPlaying && isVisible) { handleSelectClip(clip.id, e); } };
                        if (clip.type === 'text' && clip.text) {
                            const ts = clip.textStyle || DEFAULT_TEXT_STYLE;
                            return ( <div key={clip.id} style={style} onClick={handleClipClick} className="flex items-center justify-center"><span className="px-4 py-2 text-center whitespace-pre-wrap" style={{ fontFamily: ts.fontFamily || 'Plus Jakarta Sans', fontSize: `${ts.fontSize}px`, fontWeight: ts.isBold ? 'bold' : 'normal', fontStyle: ts.isItalic ? 'italic' : 'normal', textDecoration: ts.isUnderline ? 'underline' : 'none', color: ts.color, backgroundColor: ts.backgroundColor ? `${ts.backgroundColor}${Math.round((ts.backgroundOpacity ?? 0) * 255).toString(16).padStart(2,'0')}` : 'transparent', lineHeight: 1.2, textShadow: (ts.backgroundOpacity ?? 0) < 0.3 ? '1px 1px 2px rgba(0,0,0,0.8)' : 'none' }}>{clip.text}</span></div> );
                        }
                        if (clip.type === 'video' || clip.type === 'audio') {
                            const isAudio = clip.type === 'audio';
                            return ( <div key={clip.id} style={{...style, display: isAudio ? 'none' : 'block'}} onClick={handleClipClick}>{isAudio ? ( <audio ref={(el) => { mediaRefs.current[clip.id] = el; }} src={clip.sourceUrl || ''} muted={false} /> ) : ( <video ref={(el) => { mediaRefs.current[clip.id] = el; }} src={clip.sourceUrl || videoUrl || ''} className="w-full h-full object-contain pointer-events-none" muted={false} playsInline crossOrigin={(!clip.sourceUrl && !videoUrl) ? undefined : "anonymous"} /> )}</div> );
                        } else { 
                            // IMAGES: Important fix to register ref
                            return ( 
                                <div key={clip.id} style={style} onClick={handleClipClick}>
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
