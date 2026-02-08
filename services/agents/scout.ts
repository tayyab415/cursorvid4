
import { getAiClient } from '../gemini';
import { generateVideo } from '../gemini';
import { FunctionDeclaration, Type } from "@google/genai";

export interface ScoutLog {
  id: string;
  type: 'info' | 'action' | 'success' | 'error';
  message: string;
  timestamp: number;
}

export interface ScoutResult {
  url: string;
  description: string;
  source: string;
}

type LogCallback = (log: ScoutLog) => void;

// --- MOCK BROWSER STATE ---
// This simulates the "Internet" for the agent to browse
const STOCK_SITES = {
  'pexels.com': {
    title: 'Pexels - Free Stock Photos & Videos',
    elements: ['Search Input', 'Trending Topics', 'Login Button']
  },
  'videvo.net': {
    title: 'Videvo - Free Stock Video Footage',
    elements: ['Search Input', 'Categories', 'Premium Plans']
  }
};

export class ScoutAgent {
  private onLog: LogCallback;
  private isRunning = false;

  constructor(onLog: LogCallback) {
    this.onLog = onLog;
  }

  private log(message: string, type: ScoutLog['type'] = 'info') {
    this.onLog({
      id: Math.random().toString(36).substring(7),
      type,
      message,
      timestamp: Date.now()
    });
  }

  async scout(query: string): Promise<ScoutResult | null> {
    if (this.isRunning) throw new Error("Agent is already running");
    this.isRunning = true;
    
    const ai = getAiClient();

    // 1. Define the "Computer Use" Tools
    const tools: FunctionDeclaration[] = [
      {
        name: 'browser_navigate',
        description: 'Navigate the virtual browser to a URL.',
        parameters: {
          type: Type.OBJECT,
          properties: { url: { type: Type.STRING } },
          required: ['url']
        }
      },
      {
        name: 'browser_search',
        description: 'Type into the search bar and press enter.',
        parameters: {
          type: Type.OBJECT,
          properties: { query: { type: Type.STRING } },
          required: ['query']
        }
      },
      {
        name: 'browser_scroll',
        description: 'Scroll down to load more results.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'browser_select_result',
        description: 'Select a promising video result to inspect details.',
        parameters: {
          type: Type.OBJECT,
          properties: { resultId: { type: Type.STRING } },
          required: ['resultId']
        }
      },
      {
        name: 'download_asset',
        description: 'Download the currently viewed asset and finish the task.',
        parameters: {
          type: Type.OBJECT,
          properties: { 
            videoTitle: { type: Type.STRING },
            visualDescription: { type: Type.STRING } 
          },
          required: ['videoTitle', 'visualDescription']
        }
      }
    ];

    const systemInstruction = `
    ROLE: You are "The Asset Scout", an AI agent operating a web browser to find stock footage.
    GOAL: Find the best video matching the user's request: "${query}".
    
    BEHAVIOR:
    1. Start by navigating to a major stock site (e.g., pexels.com).
    2. Search for the query.
    3. Analyze the (mock) results.
    4. Select the best match.
    5. Download it.

    You are operating in a SIMULATED browser environment.
    Use the tools provided to interact.
    `;

    let history: any[] = [];
    let foundResult: ScoutResult | null = null;
    let turnCount = 0;
    const MAX_TURNS = 8;

    try {
      this.log(`Initializing Scout Agent...`, 'info');
      await new Promise(r => setTimeout(r, 800)); // Cinematic delay

      // Kickoff
      let currentPrompt = "Start scouting.";

      while (turnCount < MAX_TURNS && !foundResult) {
        turnCount++;
        
        // Call Gemini
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: [
             ...history,
             { role: 'user', parts: [{ text: currentPrompt }] }
          ],
          config: {
            tools: [{ functionDeclarations: tools }],
            systemInstruction
          }
        });

        const call = response.functionCalls?.[0];
        const thought = response.text || "";

        if (thought) {
            // Log internal monologue if short, or summarize
            // this.log(`Thought: ${thought.slice(0, 50)}...`, 'info');
        }

        if (call) {
           const args = call.args as any;
           let toolResult = "";
           
           // EXECUTE TOOL
           switch(call.name) {
               case 'browser_navigate':
                   this.log(`Navigating to ${args.url}...`, 'action');
                   await new Promise(r => setTimeout(r, 1500));
                   toolResult = `Page Loaded: ${args.url}. Title: Stock Footage Search. Elements: [Search Bar, Nav]`;
                   break;
               
               case 'browser_search':
                   this.log(`Typing search: "${args.query}"`, 'action');
                   await new Promise(r => setTimeout(r, 2000)); // Simulate loading
                   toolResult = `Results for "${args.query}":
                   1. [ID: vid_1] "Cinematic ${args.query} in 4k", Duration: 12s
                   2. [ID: vid_2] "Slow motion ${args.query}", Duration: 8s
                   3. [ID: vid_3] "Aerial view of ${args.query}", Duration: 15s`;
                   this.log(`Found 3 promising candidates...`, 'info');
                   break;

               case 'browser_scroll':
                   this.log(`Scrolling for more results...`, 'action');
                   await new Promise(r => setTimeout(r, 1000));
                   toolResult = `Loaded 3 more results...`;
                   break;

               case 'browser_select_result':
                   this.log(`Inspecting candidate: ${args.resultId}...`, 'action');
                   await new Promise(r => setTimeout(r, 1200));
                   toolResult = `Video Page Loaded. Preview playing. Looks high quality. Resolution: 4K.`;
                   break;

               case 'download_asset':
                   this.log(`Match confirmed! Downloading "${args.videoTitle}"...`, 'success');
                   
                   // HERE IS THE MAGIC: We actually generate the video using Veo to ensure it exists and matches
                   this.log(`Transferring data...`, 'info');
                   const videoUrl = await generateVideo(
                       `${args.visualDescription || query}`, 
                       'veo-3.1-fast-generate-preview',
                       '16:9',
                       '720p',
                       4
                   );
                   
                   foundResult = {
                       url: videoUrl,
                       description: args.visualDescription || query,
                       source: 'Pexels (Simulated)'
                   };
                   toolResult = "Download Complete.";
                   break;
           }

           // Update History
           history.push({ role: 'user', parts: [{ text: currentPrompt }] });
           history.push({ role: 'model', parts: [{ functionCall: call }] });
           history.push({ role: 'function', parts: [{ functionResponse: { name: call.name, response: { result: toolResult } } }] });
           
           currentPrompt = `Tool output: ${toolResult}. Continue.`;
        } else {
            // Model spoke without tools, likely asking for clarification or giving up
            this.log(`Agent: ${thought}`, 'info');
            history.push({ role: 'model', parts: [{ text: thought }] });
            if (thought.includes("fail") || thought.includes("sorry")) {
                break;
            }
            currentPrompt = "Continue executing the task.";
        }
      }

    } catch (e: any) {
        this.log(`Agent Error: ${e.message}`, 'error');
        console.error(e);
    } finally {
        this.isRunning = false;
    }

    return foundResult;
  }
}
