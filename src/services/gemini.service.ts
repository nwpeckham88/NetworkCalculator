import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env['API_KEY'] || '' });
  }

  async chat(message: string, context: any): Promise<string> {
    try {
      const model = 'gemini-2.5-flash';
      const prompt = `
        You are an expert Network Engineer and Tutor.
        
        Current Subnet Configuration Context:
        - Host IP: ${context.ip}
        - Initial Network Mask: /${context.baseCidr}
        - New/Target Subnet Mask: /${context.cidr}
        - Borrowed Bits: ${context.borrowedBits} (Bits borrowed from the Initial Network)
        - Subnets Created: ${context.subnetsCreated}
        - Hosts per Subnet: ${context.hostsPerSubnet}
        - Network Address: ${context.networkAddress}
        - Broadcast Address: ${context.broadcastAddress}
        - Range: ${context.firstHost} to ${context.lastHost}

        User Question: "${message}"

        Please provide a concise, educational answer based on the context above. 
        If the user asks for an explanation, break down the logic of the borrowed bits and host calculation.
        Keep the tone helpful and professional.
      `;

      const response = await this.ai.models.generateContent({
        model: model,
        contents: prompt,
      });

      return response.text || "I couldn't generate a response. Please try again.";
    } catch (error) {
      console.error('Gemini API Error:', error);
      return "Unable to connect to the AI Tutor. Please check your API key or internet connection.";
    }
  }
}