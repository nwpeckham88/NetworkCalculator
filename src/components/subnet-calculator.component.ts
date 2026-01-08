import { Component, signal, computed, inject, AfterViewInit, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IpUtils, SubnetDetails } from '../utils/ip-utils';
import { LlmService, LlmProvider } from '../services/llm.service';

interface BitDetail {
  value: string;
  type: 'network' | 'subnet' | 'host';
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

@Component({
  selector: 'app-subnet-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './subnet-calculator.component.html',
})
export class SubnetCalculatorComponent implements AfterViewInit {
  llmService = inject(LlmService);

  @ViewChild('chatScrollContainer') private chatScrollContainer!: ElementRef;

  // Signals
  ipInput = signal<string>('192.168.1.10');
  cidrInput = signal<number>(26); // New Subnet Mask
  parentCidrInput = signal<number>(24); // Initial Subnet Mask
  
  // Chat State
  isChatOpen = signal<boolean>(false);
  chatInput = signal<string>('');
  chatMessages = signal<ChatMessage[]>([]);
  isThinking = signal<boolean>(false);
  
  // Settings State
  showSettings = signal<boolean>(false);
  settingsProvider = signal<LlmProvider>('gemini');
  settingsApiKey = signal<string>('');

  // Constants
  cidrValues = Array.from({ length: 32 }, (_, i) => i + 1);
  
  suggestedQuestions = [
    "Explain this setup",
    "How many usable hosts?",
    "Why are there borrowed bits?",
    "What is the broadcast address?"
  ];

  constructor() {
    // Show settings if not configured
    effect(() => {
        if (!this.llmService.config()) {
            this.showSettings.set(true);
        }
    });
  }

  // IP Categorization
  ipInfo = computed(() => IpUtils.getIpCategory(this.ipInput()));

  // Validation Error Computation
  configError = computed(() => {
    const info = this.ipInfo();
    const parentCidr = this.parentCidrInput();
    const ip = this.ipInput();
    
    // Case 1: Private IP being configured with a mask that makes it public (supernetting out of bounds)
    if (info.type === 'Private' && info.minCidr && parentCidr < info.minCidr) {
        return {
            isError: true,
            message: `Invalid Mask for Private IP`,
            detail: `The ${info.rangeName} range requires a mask of /${info.minCidr} or higher to stay private.`
        };
    }

    // Case 2: Public IP being configured with a mask that makes it overlap Private space
    // e.g. 11.0.0.1 (Public) with /7 mask -> covers 10.x.x.x
    if (info.type === 'Public') {
        const overlap = IpUtils.checkPrivateOverlap(ip, parentCidr);
        if (overlap) {
            return {
                isError: true,
                message: `Public IP Overlaps Private Range`,
                detail: `This configuration creates a network that overlaps with the private ${overlap} range.`
            };
        }
    }

    return null;
  });

  // Computed state
  result = computed<SubnetDetails>(() => {
    const ip = this.ipInput();
    const cidr = this.cidrInput();
    const parent = this.parentCidrInput();
    
    return IpUtils.calculateSubnet(ip, cidr, parent);
  });

  isValid = computed(() => {
    const res = this.result();
    if (!res.isValid) return false;
    if (this.configError()) return false;
    
    // New mask must be >= Initial mask
    return this.cidrInput() >= this.parentCidrInput();
  });

  // Generate the full table of subnets
  subnetTable = computed(() => {
    const res = this.result();
    if (!this.isValid()) return { rows: [], totalCount: 0, truncated: false };
    
    return IpUtils.generateSubnetTable(this.ipInput(), this.cidrInput(), res.baseCidr);
  });

  // Computed visuals for bits
  bitVisuals = computed<BitDetail[]>(() => {
    const res = this.result();
    if (!res.isValid) return [];

    const fullBinary = res.binaryIp;
    const cidr = this.cidrInput();
    const baseCidr = res.baseCidr;

    return fullBinary.split('').map((bit, index) => {
      let type: 'network' | 'subnet' | 'host' = 'host';
      
      if (index < baseCidr) {
        type = 'network';
      } else if (index < cidr) {
        type = 'subnet';
      }
      
      return { value: bit, type };
    });
  });

  maskVisuals = computed<string[]>(() => {
    const res = this.result();
    return res.isValid ? res.binaryMask.split('') : [];
  });

  // Helper to split bits into two rows of 16 for better visualization
  visualRows = computed(() => {
    const ip = this.bitVisuals();
    const mask = this.maskVisuals();
    
    if (ip.length < 32 || mask.length < 32) return null;

    return {
      ip: [ip.slice(0, 16), ip.slice(16, 32)],
      mask: [mask.slice(0, 16), mask.slice(16, 32)]
    };
  });

  ngAfterViewInit() {
    try {
      // Initialize ads
      (window as any).adsbygoogle = (window as any).adsbygoogle || [];
      (window as any).adsbygoogle.push({});
    } catch (e) {
      console.error('AdSense error:', e);
    }
  }

  updateIp(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.ipInput.set(value);
  }

  updateCidr(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.cidrInput.set(value);
  }

  updateParentCidr(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.parentCidrInput.set(value);
    // Auto-adjust target if it becomes invalid
    if (this.cidrInput() < value) {
      this.cidrInput.set(value);
    }
  }

  toggleChat() {
    this.isChatOpen.update(v => !v);
    
    // Reset settings view if opening and config exists
    if (this.isChatOpen() && this.llmService.config()) {
        this.showSettings.set(false);
    } else if (this.isChatOpen() && !this.llmService.config()) {
        this.showSettings.set(true);
    }

    if (this.isChatOpen()) {
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  openSettings() {
    const current = this.llmService.config();
    if (current) {
        this.settingsProvider.set(current.provider);
        this.settingsApiKey.set(current.apiKey);
    }
    this.showSettings.set(true);
  }

  saveSettings() {
    if (this.settingsApiKey()) {
        this.llmService.saveConfig(this.settingsProvider(), this.settingsApiKey());
        this.showSettings.set(false);
        this.chatMessages.set([]); // clear history on new config
    }
  }

  clearSettings() {
    this.llmService.clearConfig();
    this.settingsApiKey.set('');
    this.showSettings.set(true);
  }

  formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num);
  }

  async sendChat(messageText?: string) {
    const text = messageText || this.chatInput().trim();
    if (!text || !this.isValid() || this.isThinking()) return;
    
    if (!this.llmService.config()) {
        this.showSettings.set(true);
        return;
    }

    // Add user message
    this.chatMessages.update(msgs => [...msgs, { role: 'user', text }]);
    this.chatInput.set('');
    this.scrollToBottom();

    this.isThinking.set(true);

    try {
      const response = await this.llmService.chat(text, this.result());
      this.chatMessages.update(msgs => [...msgs, { role: 'ai', text: response }]);
    } catch (e) {
      this.chatMessages.update(msgs => [...msgs, { role: 'ai', text: 'Sorry, I encountered an error. Please check your settings.' }]);
    } finally {
      this.isThinking.set(false);
      this.scrollToBottom();
    }
  }

  private scrollToBottom() {
    if (this.chatScrollContainer) {
      setTimeout(() => {
        const el = this.chatScrollContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }
}