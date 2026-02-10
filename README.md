<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>
# CutPilot - The First Agentic Video Editor

**The world's first autonomous video editing agent powered by Gemini 3.** CutPilot uses multimodal vision to analyze footage, reasoning to understand narrative flow, and agentic capabilities to autonomously assist editing—transforming video editing from manual labor into intelligent collaboration.

🚀 **[Try CutPilot Live](https://cutpilot-1027824348124.us-west1.run.app)** | 📺 **[Watch Tutorial](https://youtu.be/-Qq7zigTyqc)** | 🎨 **[AI Studio](https://ai.studio/apps/drive/1FveeNpis2yIzzdpFjicRJsSyt5DoR2MV)**

## 🎯 The Problem

Video editing is **painfully manual**. Creators spend hours on repetitive tasks: trimming clips, finding the right moments, generating assets, and fixing pacing—all while toggling between tools and workflows. Traditional editors lack intelligence. AI tools exist, but they're either limited to single tasks (auto-captions) or require extensive prompting without understanding your creative vision.

## 💡 The Solution

**CutPilot brings agentic AI to the timeline.** It doesn't just execute commands—it sees, thinks, and acts as your AI co-editor. Using Gemini 3's cutting-edge multimodal capabilities, CutPilot:

- **SEES** your footage through multimodal vision (analyzing frames, audio, pacing, style)
- **REASONS** about narrative structure, quality requirements, and creative intent  
- **ACTS** autonomously by planning edits, generating assets, and executing changes
- **VERIFIES** results to ensure quality and alignment with your vision

---

## 🚀 Key Innovation: The 4-Agent Architecture

CutPilot implements a **novel multi-agent system** that mirrors how professional editors think:

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   Eyes   │ ──▶ │  Brain   │ ──▶ │  Hands   │ ──▶ │ Verifier │
│(Analyze) │     │  (Plan)  │     │(Execute) │     │ (Check)  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                 │                 │                 │
     ▼                 ▼                 ▼                 ▼
  • Watch video   • Create plan    • Run tools      • Verify
  • Extract       • Choose AI      • Edit           • Check
    features        models           timeline         quality
  • Detect style  • Reason about   • Generate       • Auto-fix
                    intent           assets           issues
```

### Why This Matters

**This is the first agentic video editor.** Unlike traditional AI tools that just generate content or follow rigid scripts, CutPilot:

1. **Understands context** - Analyzes your existing footage to match style, pacing, and tone
2. **Makes decisions** - Autonomously selects the right AI models (Veo, Imagen, TTS) based on quality needs
3. **Self-corrects** - Verifies its own work and suggests fixes when results don't match intent
4. **Learns intent** - Interprets vague requests ("make this more cinematic") into concrete actions

---

## 🎬 Demo Scenarios

### Scenario 1: "Add a 10-second intro with upbeat music"

**What happens:**
1. **Eyes Agent** analyzes existing footage → detects casual vlog style, bright colors, medium pacing
2. **Brain Agent** reasons → "needs high-energy visual, upbeat audio, match detected style"
   - Selects `veo-3.1-fast-generate-preview` for quick iteration
   - Plans TTS generation with energetic voice
3. **Hands Agent** executes → generates intro video, creates voiceover, adds to timeline
4. **Verifier Agent** watches result → confirms pacing matches, audio aligns, no gaps

**Result:** Fully autonomous intro generation in under 60 seconds, perfectly matched to your video's style.

### Scenario 2: "This feels slow, make it more dynamic"

**What happens:**
1. **Eyes** analyzes selected range → detects long static shots, slow transitions, low audio energy
2. **Brain** reasons → "needs faster cuts, tighter pacing, remove pauses"
   - Creates 4-step plan: trim long clips, remove gaps, add transitions, boost audio
3. **Hands** executes plan → cuts clips from 8s to 4s each, removes 2s gaps, crossfades
4. **Verifier** checks → confirms pacing improved, no jarring cuts

**Result:** Complex multi-step edit executed autonomously with a single natural language command.

---

## 🧠 Gemini 3 Integration - Full Capabilities Showcase

CutPilot demonstrates **comprehensive Gemini 3 capability usage**:

### 1. Multimodal Vision (Eyes Agent)
**Model:** `gemini-3-pro-preview`

```typescript
// Analyzes video frames + audio simultaneously
const mediaParts = await rangeToGeminiParts(range, clips, mediaRefs);
const response = await ai.models.generateContent({
  model: 'gemini-3-pro-preview',
  contents: { parts: [...mediaParts, { text: analysisPrompt }] },
  config: { responseMimeType: 'application/json' }
});
```

**What it analyzes:**
- Visual quality (lighting, composition, color grading)
- Pacing and rhythm (shot length distribution, energy level)
- Audio characteristics (speech clarity, music presence, ambient sound)
- Style description (aesthetic, tone, production value)
- Editing needs (gaps, pacing issues, quality problems)

**Innovation:** First tool to use Gemini's vision for **real-time video editing analysis**, not just content understanding.

### 2. Advanced Reasoning (Brain Agent)
**Model:** `gemini-3-flash-preview` with function calling

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: planningPrompt,
  config: {
    responseMimeType: 'application/json',
    tools: [{ functionDeclarations: TIMELINE_PRIMITIVES }]
  }
});
```

**What it reasons about:**
- User intent interpretation (vague → concrete actions)
- AI model selection (Veo quality vs speed, Imagen vs Flash for images)
- Operation sequencing (what order to execute edits)
- Style matching (incorporate detected aesthetics into generation prompts)
- Cost/quality tradeoffs (when to use expensive models vs fast ones)

**Innovation:** Uses Gemini's function calling to autonomously orchestrate 15+ timeline operations with multi-step reasoning.

### 3. Agentic Tool Use (Hands Agent)
**15 Timeline Primitives** exposed as Gemini functions:

- `generate_video_asset` - Veo 3.1 video generation (text-to-video, image-to-video, morph)
- `generate_image_asset` - Imagen 3 image generation
- `generate_voiceover` - TTS with 8 voice options
- `smart_trim`, `split_clip`, `move_clip`, `delete_clip` - Timeline manipulation
- `auto_caption`, `add_text_overlay` - AI-powered text
- `detect_scenes`, `remove_silence`, `fade_in_out` - Smart automation

**Innovation:** First implementation of Gemini function calling for **stateful, multi-step video editing workflows**.

### 4. Self-Verification (Verifier Agent)
**Model:** `gemini-3-flash-preview` with video analysis

```typescript
// Re-watches edited result to verify quality
const verification = await ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: {
    parts: [
      ...resultMediaParts, // Edited video frames
      { text: verificationPrompt }
    ]
  }
});
```

**What it checks:**
- Structural integrity (gaps, overlaps, continuity)
- Intent alignment (does result match user request?)
- Quality standards (visual/audio quality maintained?)
- Suggested fixes (if issues found)

**Innovation:** **Only video editor** that uses AI to verify its own work and auto-correct mistakes.

### 5. Multi-Model Orchestration

CutPilot intelligently routes to different Gemini models based on task:

| Task | Model | Why |
|------|-------|-----|
| Video analysis | `gemini-3-pro-preview` | Superior vision capabilities |
| Planning & reasoning | `gemini-3-flash-preview` | Fast inference, function calling |
| Verification | `gemini-3-flash-preview` | Quick quality checks |
| High-quality images | `gemini-3-pro-image-preview` | Complex art, text rendering |
| Quick mockups | `gemini-2.5-flash-image` | Fast iteration |
| Cinematic video | `veo-3.1-generate-preview` | Highest quality |
| Draft videos | `veo-3.1-fast-generate-preview` | Speed over quality |

**Innovation:** First editor to **dynamically select AI models** based on quality requirements detected in footage analysis.

---

## 🛠️ Technology Stack

### Core Technologies
| Category | Technology | Purpose |
|----------|-----------|---------|
| **Framework** | React 19.2.3 | UI framework |
| **Language** | TypeScript 5.8.2 | Type safety |
| **Build Tool** | Vite 6.2.0 | Development & bundling |
| **Styling** | Tailwind CSS | Styling |
| **Media** | mp4-muxer 5.2.2 | MP4 video export |

### Gemini AI Integration
- **Google GenAI SDK** (@google/genai) - Primary AI integration
- **Vision Models:**
  - `gemini-3-pro-preview` - Multimodal video/audio analysis
  - `gemini-3-flash-preview` - Fast reasoning and planning
- **Generation Models:**
  - `veo-3.1-generate-preview` - High-quality video generation
  - `veo-3.1-fast-generate-preview` - Fast video generation
  - `gemini-3-pro-image-preview` - Complex image generation
  - `gemini-2.5-flash-image` - Quick image generation
  - `gemini-2.5-flash-preview-tts` - Text-to-speech (8 voices)

---

## 📋 Core Features

### 1. Agentic Editing (The Killer Feature)
Two modes of AI assistance:

**Director Mode** (Multi-Agent System):
- Natural language commands → autonomous execution
- "Add a cinematic intro" → Eyes analyze, Brain plans, Hands generate, Verifier checks
- Handles complex multi-step workflows
- Self-corrects when results don't match intent

**Assistant Mode** (Direct Chat):
- Creative brainstorming and suggestions
- Quick asset generation without full workflow
- Style matching based on analyzed footage

### 2. Professional Timeline Editor
- Multi-track editing (unlimited tracks)
- Drag-and-drop clip arrangement
- Precision trimming and splitting
- Smart snapping to playhead and clip boundaries
- Range selection for targeted editing
- Full undo/redo history

### 3. AI Asset Generation
- **Videos:** Text-to-video, image-to-video, video morphing (Veo 3.1)
- **Images:** AI-generated graphics (Imagen 3, Flash)
- **Audio:** TTS voiceovers with multiple voices
- **Captions:** AI-powered subtitle generation
- **Asset Scout:** Find external assets

### 4. Canvas & Workspace
- Visual transform controls (position, scale, rotation)
- Asset library for media organization
- Real-time preview
- MP4 export

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        REACT APP                            │
├─────────────────────────────────────────────────────────────┤
│  UI Components  │  Timeline  │  Canvas  │  AI Sidebar      │
├─────────────────────────────────────────────────────────────┤
│                    STATE MANAGEMENT                         │
│              TimelineStore (Observable Pattern)             │
├─────────────────────────────────────────────────────────────┤
│                     AGENT SYSTEM                            │
│     Eyes → Brain → Hands → Verifier (Multi-Agent Loop)     │
├─────────────────────────────────────────────────────────────┤
│                   GEMINI AI SERVICES                        │
│  Vision (3-Pro) │ Reasoning (3-Flash) │ Veo │ Imagen │ TTS │
├─────────────────────────────────────────────────────────────┤
│                   TOOL REGISTRY                             │
│     15 Timeline Primitives │  Execution Logic              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚦 Getting Started

### Try It Now (No Installation)

**[Launch CutPilot Live App](https://cutpilot-1027824348124.us-west1.run.app)** - No setup required!

**[Watch the Tutorial](https://youtu.be/-Qq7zigTyqc)** - 5-minute walkthrough of key features

### Local Development Setup

#### Prerequisites
- Node.js 18+
- Gemini API key with access to Gemini 3 models

### Installation

```bash
# Clone repository
git clone [your-repo-url]
cd cutpilot

# Install dependencies
npm install

# Set up environment
echo "GEMINI_API_KEY=your_api_key_here" > .env.local

# Run development server
npm run dev
```

### First Edit

1. Open CutPilot at `http://localhost:5173`
2. Import a video or use the built-in sample
3. Open AI Assistant (Director Mode)
4. Try: *"Analyze this video and suggest improvements"*
5. Or: *"Add a 10-second energetic intro with music"*
6. Watch the agents work!

---

## 🎓 How The Agent System Works

### Complete Example: "Make this video more cinematic"

**1. Eyes Agent Analysis:**
```json
{
  "thought": "Analyzing video content...",
  "visual": {
    "quality": "consumer-grade footage, handheld camera, auto-exposed",
    "styleDescription": "casual documentary style, natural lighting, medium pacing",
    "colorPalette": ["warm tones", "soft shadows"]
  },
  "pacing": {
    "rhythm": "moderate, 4-6 second shot length average",
    "energy": "calm, conversational"
  },
  "editingNeeds": [
    "stabilization needed",
    "color grading would enhance cinematic feel",
    "slower pacing for dramatic effect"
  ]
}
```

**2. Brain Agent Planning:**
```json
{
  "thought": "To achieve cinematic look: slow down pacing, add color grade, stabilize",
  "plan": [
    {
      "step": 1,
      "tool_id": "smart_trim",
      "reasoning": "Extend shot lengths to 8-10s for dramatic pacing",
      "parameters": { "targetDuration": 9, "preserveAudio": true }
    },
    {
      "step": 2,
      "tool_id": "apply_filter",
      "reasoning": "Add cinematic color grade (teal/orange look)",
      "parameters": { "filter": "cinematic_teal_orange", "intensity": 0.7 }
    },
    {
      "step": 3,
      "tool_id": "add_text_overlay",
      "reasoning": "Add title card with cinematic typography",
      "parameters": { 
        "text": "Chapter One",
        "style": "elegant_serif",
        "animation": "fade_in"
      }
    }
  ]
}
```

**3. Hands Agent Execution:**
- Executes each step sequentially
- Shows approval modals for expensive operations
- Provides real-time progress updates
- Handles errors gracefully with rollback

**4. Verifier Agent Check:**
```json
{
  "allChecksPassed": true,
  "structuralIntegrity": "✓ No gaps or overlaps",
  "intentAlignment": "✓ Pacing slowed, color grading applied, looks cinematic",
  "qualityCheck": "✓ Visual quality maintained",
  "suggestions": [
    "Consider adding subtle music to enhance mood"
  ]
}
```

---

## 💎 What Makes CutPilot Unique

### 1. Context-Aware Generation
Traditional AI: *"Generate a beach scene"*  
CutPilot: *Analyzes your existing footage → detects moody, low-key lighting → generates beach scene with matching aesthetic*

### 2. Autonomous Model Selection
You don't choose models—CutPilot does:
- Detected high production value? → Uses `veo-3.1-generate-preview` (cinematic quality)
- Rapid prototyping? → Uses `veo-3.1-fast-generate-preview` (speed over quality)
- Complex graphics with text? → Uses `gemini-3-pro-image-preview`
- Simple mockups? → Uses `gemini-2.5-flash-image`

### 3. Self-Correcting Workflows
If the Verifier detects issues (wrong content, quality drop, pacing mismatch), it automatically:
1. Identifies the problem
2. Suggests specific fixes
3. Allows one-click re-execution with corrections

### 4. True Multi-Step Reasoning
Not just command → execute. CutPilot chains reasoning:
- "Make this professional" → analyze current quality → identify gaps → plan improvements → execute → verify

---

## 🔬 Technical Deep Dives

### Tool Registry Architecture

All timeline operations exposed as Gemini-callable functions:

```typescript
// Example: Smart Trim Tool
{
  name: 'smart_trim',
  description: 'Intelligently trim clip to target duration while preserving key moments',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clipId: { type: Type.STRING },
      targetDuration: { type: Type.NUMBER },
      preserveAudio: { type: Type.BOOLEAN }
    }
  }
}

// Tool Registry Implementation
'smart_trim': {
  requiresApproval: false, // Fast operation
  execute: async (args) => {
    const clip = timelineStore.getClip(args.clipId);
    const trimAmount = clip.duration - args.targetDuration;
    
    // Smart logic: trim from end unless important audio at end
    if (args.preserveAudio && hasAudioAtEnd(clip)) {
      trimFromStart(clip, trimAmount);
    } else {
      trimFromEnd(clip, trimAmount);
    }
    
    return { success: true, message: `Trimmed to ${args.targetDuration}s` };
  }
}
```

### State Management Pattern

Observable pattern for reactive updates:

```typescript
class TimelineStore {
  private clips: Clip[] = [];
  private listeners: Set<Function> = new Set();
  
  subscribe(callback: (clips: Clip[]) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback); // Cleanup
  }
  
  private notify() {
    this.listeners.forEach(fn => fn(this.clips));
  }
  
  addClip(clip: Clip) {
    this.clips.push(clip);
    this.saveHistory();
    this.notify(); // All components re-render
  }
}
```

Components subscribe:
```typescript
const [clips, setClips] = useState(timelineStore.getClips());

useEffect(() => {
  return timelineStore.subscribe(setClips); // Auto-cleanup on unmount
}, []);
```

### Approval Flow for Expensive Operations

```typescript
// Brain outputs plan with approval requests
{
  "step": 1,
  "tool_id": "generate_video_asset",
  "requiresApproval": true,
  "estimatedCost": "$0.10",
  "reasoning": "Generating 8-second cinematic intro",
  "parameters": {
    "prompt": "Epic sunrise over mountains...",
    "duration": 8,
    "model": "veo-3.1-generate-preview"
  }
}

// UI shows approval modal with:
// - Preview of what will be generated
// - Cost estimate
// - Reasoning explanation
// - Approve/Reject buttons

// User approves → Hands executes
// User rejects → Skips step, continues to next
```

---

## 🐛 Troubleshooting

### API Key Issues
- Ensure `GEMINI_API_KEY` is set in `.env.local`
- Verify key has access to Gemini 3 models (check AI Studio)
- Check quota limits if getting 429 errors

### Rate Limiting
- App implements exponential backoff retry logic
- For persistent issues, upgrade API tier or wait between requests

### Video Generation Fails
- Veo requires 4 or 8 second durations only
- Prompts should be descriptive but under 500 chars
- Check that images (if using image-to-video) are valid base64

### Agent Not Responding
- Check browser console for errors
- Enable debug mode: `localStorage.setItem('debug', 'true')`
- Verify all 4 agents initialized (Eyes, Brain, Hands, Verifier)

---

## 🎯 Future Roadmap

- [ ] **Real-time collaboration** - Multiple editors working on same timeline
- [ ] **Template library** - Pre-built agent workflows for common tasks
- [ ] **Advanced audio mixing** - Multi-track audio with AI-powered balancing
- [ ] **Motion graphics** - AI-generated animations and transitions
- [ ] **Batch processing** - Apply agent workflows to multiple videos
- [ ] **Fine-tuned models** - Custom Gemini models trained on user's editing style

---

## 🙏 Acknowledgments

Built with:
- **Google Gemini 3 API** - The foundation of everything
- **Veo 3.1** - Revolutionary video generation
- **React & Vite** - Powerful frontend stack
- **TypeScript** - Type safety and developer experience
- **Tailwind CSS** - Beautiful, responsive UI

Special thanks to the Google AI team for pushing the boundaries of what's possible with multimodal AI.

---

## 📞 Support

- **Live App:** https://cutpilot-1027824348124.us-west1.run.app
- **Tutorial Video:** https://youtu.be/-Qq7zigTyqc
- **AI Studio:** https://ai.studio/apps/drive/1FveeNpis2yIzzdpFjicRJsSyt5DoR2MV

---

**Built for Gemini 3 Hackathon 2025**  
*Transforming video editing from manual labor to intelligent collaboration.*


# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1FveeNpis2yIzzdpFjicRJsSyt5DoR2MV

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
