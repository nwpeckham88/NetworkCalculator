import { Injectable, signal } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

export type LlmProvider = 'gemini' | 'openai' | 'anthropic';

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
}

@Injectable({
  providedIn: 'root'
})
export class LlmService {
  config = signal<LlmConfig | null>(this.loadConfig());

  constructor() {}

  private loadConfig(): LlmConfig | null {
    try {
      const stored = localStorage.getItem('llm_config');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  saveConfig(provider: LlmProvider, apiKey: string) {
    const cfg: LlmConfig = { provider, apiKey };
    localStorage.setItem('llm_config', JSON.stringify(cfg));
    this.config.set(cfg);
  }

  clearConfig() {
    localStorage.removeItem('llm_config');
    this.config.set(null);
  }

  hasConfig() {
    return this.config() !== null;
  }

  async chat(message: string, context: any): Promise<string> {
    const cfg = this.config();
    if (!cfg) throw new Error('No configuration found. Please add your API key.');

    const systemPrompt = `
      You are an expert Network Engineer and Tutor.
      
      Current Subnet Configuration Context:
      - Host IP: ${context.ip}
      - Initial Network Mask: /${context.baseCidr}
      - New/Target Subnet Mask: /${context.cidr}
      - Borrowed Bits: ${context.borrowedBits}
      - Subnets Created: ${context.subnetsCreated}
      - Hosts per Subnet: ${context.hostsPerSubnet}
      - Network Address: ${context.networkAddress}
      - Broadcast Address: ${context.broadcastAddress}
      - Range: ${context.firstHost} to ${context.lastHost}

      User Question: "${message}"

      Please provide a concise, educational answer. Break down the logic if asked.
    `;

    try {
      switch (cfg.provider) {
        case 'gemini':
          return this.chatGemini(cfg.apiKey, systemPrompt);
        case 'openai':
          return this.chatOpenAI(cfg.apiKey, systemPrompt);
        case 'anthropic':
          return this.chatAnthropic(cfg.apiKey, systemPrompt);
        default:
          throw new Error('Unknown provider selected.');
      }
    } catch (error: any) {
      console.error('LLM Request Failed', error);
      // specific error handling for common issues
      if (error.message.includes('401')) return 'Authentication failed. Please check your API Key.';
      if (error.message.includes('Failed to fetch')) return 'Network error. If using Anthropic/OpenAI, this may be a browser CORS restriction.';
      return `Error: ${error.message || 'Unable to get response'}`;
    }
  }

  private async chatGemini(apiKey: string, prompt: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || 'No response from Gemini.';
  }

  private async chatOpenAI(apiKey: string, prompt: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: 'You are a helpful network engineering tutor.' },
            { role: 'user', content: prompt }
        ]
      })
    });
    
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'OpenAI API Error');
    }
    
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No response from OpenAI.';
  }

  private async chatAnthropic(apiKey: string, prompt: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Anthropic API Error (Check CORS/Key)');
    }

    const data = await res.json();
    return data.content?.[0]?.text || 'No response from Claude.';
  }
}