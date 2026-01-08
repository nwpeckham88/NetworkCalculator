export interface SubnetDetails {
  ip: string;
  cidr: number;
  subnetMask: string;
  networkAddress: string;
  broadcastAddress: string;
  firstHost: string;
  lastHost: string;
  hostsPerSubnet: number;
  hostBits: number;
  borrowedBits: number;
  subnetsCreated: number;
  networkClass: string;
  defaultCidr: number;
  baseCidr: number;
  binaryIp: string;
  binaryMask: string;
  binaryNet: string;
  isValid: boolean;
}

export interface SubnetRow {
  index: number;
  networkAddress: string;
  range: string;
  broadcastAddress: string;
  isCurrent: boolean;
}

export type IpType = 'Private' | 'Public' | 'Loopback' | 'Link-Local' | 'Multicast' | 'Reserved' | 'CGNAT' | 'Unknown';

export interface IpCategoryInfo {
  type: IpType;
  rangeName?: string;
  minCidr?: number;
  description?: string;
  isPrivate: boolean; // Helper for legacy/simple checks
}

const PRIVATE_RANGES = [
  { start: 167772160, end: 184549375, name: '10.0.0.0/8', minCidr: 8 },      // 10.0.0.0 - 10.255.255.255
  { start: 2886729728, end: 2887778303, name: '172.16.0.0/12', minCidr: 12 }, // 172.16.0.0 - 172.31.255.255
  { start: 3232235520, end: 3232301055, name: '192.168.0.0/16', minCidr: 16 } // 192.168.0.0 - 192.168.255.255
];

export const IpUtils = {
  isValidIp(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
      const num = parseInt(part, 10);
      return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
    });
  },

  ipToLong(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  },

  longToIp(long: number): string {
    return [
      (long >>> 24) & 255,
      (long >>> 16) & 255,
      (long >>> 8) & 255,
      long & 255
    ].join('.');
  },

  toBinaryString(num: number): string {
    return (num >>> 0).toString(2).padStart(32, '0');
  },

  formatBinary(binary: string): string {
    return binary.match(/.{1,8}/g)?.join('.') || '';
  },

  getNetworkClass(firstOctet: number): { char: string; defaultCidr: number } {
    if (firstOctet >= 0 && firstOctet <= 127) return { char: 'A', defaultCidr: 8 };
    if (firstOctet >= 128 && firstOctet <= 191) return { char: 'B', defaultCidr: 16 };
    if (firstOctet >= 192 && firstOctet <= 223) return { char: 'C', defaultCidr: 24 };
    if (firstOctet >= 224 && firstOctet <= 239) return { char: 'D', defaultCidr: 0 }; // Multicast
    return { char: 'E', defaultCidr: 0 }; // Experimental
  },

  getIpCategory(ip: string): IpCategoryInfo {
    if (!this.isValidIp(ip)) return { type: 'Unknown', isPrivate: false };
    
    const long = this.ipToLong(ip);
    
    // RFC 1918 Private
    for (const range of PRIVATE_RANGES) {
        if (long >= range.start && long <= range.end) {
            return { type: 'Private', isPrivate: true, rangeName: range.name, minCidr: range.minCidr, description: 'RFC 1918 Private' };
        }
    }

    // Loopback 127.0.0.0/8
    if (long >= 2130706432 && long <= 2147483647) return { type: 'Loopback', isPrivate: false, description: 'Loopback Address' };
    
    // Link-Local 169.254.0.0/16
    if (long >= 2851995648 && long <= 2852061183) return { type: 'Link-Local', isPrivate: false, description: 'APIPA / Link-Local' };

    // CGNAT 100.64.0.0/10
    if (long >= 1681915904 && long <= 1686110207) return { type: 'CGNAT', isPrivate: false, description: 'Carrier-Grade NAT' };

    // Multicast 224.0.0.0/4
    if (long >= 3758096384 && long <= 4026531839) return { type: 'Multicast', isPrivate: false, description: 'Multicast' };

    // Reserved (Class E) 240.0.0.0/4
    if (long >= 4026531840 && long <= 4294967295) return { type: 'Reserved', isPrivate: false, description: 'Reserved' };

    return { type: 'Public', isPrivate: false, description: 'Public Internet Address' };
  },

  // Check if a network defined by ip/cidr overlaps with any Private RFC 1918 range
  checkPrivateOverlap(ip: string, cidr: number): string | null {
    if (!this.isValidIp(ip)) return null;

    const ipLong = this.ipToLong(ip);
    const maskLong = (-1 << (32 - cidr)) >>> 0;
    const networkStart = (ipLong & maskLong) >>> 0;
    const networkEnd = (networkStart | ~maskLong) >>> 0;

    for (const range of PRIVATE_RANGES) {
        // Check for intersection: (StartA <= EndB) and (EndA >= StartB)
        if (networkStart <= range.end && networkEnd >= range.start) {
            return range.name;
        }
    }
    return null;
  },

  calculateSubnet(ip: string, cidr: number, parentCidr?: number): SubnetDetails {
    if (!this.isValidIp(ip)) {
      return {
        isValid: false,
        ip, cidr, subnetMask: '', networkAddress: '', broadcastAddress: '',
        firstHost: '', lastHost: '', hostsPerSubnet: 0, hostBits: 0,
        borrowedBits: 0, subnetsCreated: 0, networkClass: '-', defaultCidr: 0, baseCidr: 0,
        binaryIp: '', binaryMask: '', binaryNet: ''
      };
    }

    const ipLong = this.ipToLong(ip);
    const maskLong = -1 << (32 - cidr);
    const networkLong = (ipLong & maskLong) >>> 0;
    const broadcastLong = (networkLong | ~maskLong) >>> 0;

    const hostBits = 32 - cidr;
    const hostsPerSubnet = hostBits > 0 ? Math.pow(2, hostBits) - 2 : 0; 

    const firstOctet = parseInt(ip.split('.')[0], 10);
    const netClass = this.getNetworkClass(firstOctet);
    
    const baseCidr = parentCidr !== undefined ? parentCidr : netClass.defaultCidr;
    
    let borrowedBits = 0;
    if (baseCidr > 0 && cidr >= baseCidr) {
      borrowedBits = cidr - baseCidr;
    } else {
       borrowedBits = 0; 
    }

    const subnetsCreated = Math.pow(2, borrowedBits);

    const firstHostLong = (networkLong + 1) >>> 0;
    const lastHostLong = (broadcastLong - 1) >>> 0;

    return {
      isValid: true,
      ip,
      cidr,
      subnetMask: this.longToIp(maskLong),
      networkAddress: this.longToIp(networkLong),
      broadcastAddress: this.longToIp(broadcastLong),
      firstHost: cidr < 31 ? this.longToIp(firstHostLong) : 'N/A',
      lastHost: cidr < 31 ? this.longToIp(lastHostLong) : 'N/A',
      hostsPerSubnet: hostsPerSubnet > 0 ? hostsPerSubnet : 0,
      hostBits,
      borrowedBits,
      subnetsCreated,
      networkClass: netClass.char,
      defaultCidr: netClass.defaultCidr,
      baseCidr,
      binaryIp: this.toBinaryString(ipLong),
      binaryMask: this.toBinaryString(maskLong),
      binaryNet: this.toBinaryString(networkLong)
    };
  },

  generateSubnetTable(ip: string, cidr: number, baseCidr: number, limit: number = 256): { rows: SubnetRow[], totalCount: number, truncated: boolean } {
    if (!this.isValidIp(ip) || cidr < baseCidr) {
      return { rows: [], totalCount: 0, truncated: false };
    }

    const ipLong = this.ipToLong(ip);
    const baseMaskLong = (-1 << (32 - baseCidr)) >>> 0;
    const baseNetworkLong = (ipLong & baseMaskLong) >>> 0;
    
    const borrowedBits = cidr - baseCidr;
    const totalCount = Math.pow(2, borrowedBits);
    
    const increment = Math.pow(2, 32 - cidr);
    
    const rows: SubnetRow[] = [];
    const loopLimit = Math.min(totalCount, limit);
    
    for (let i = 0; i < loopLimit; i++) {
        const currentNet = (baseNetworkLong + (i * increment)) >>> 0;
        const currentBroadcast = (currentNet + increment - 1) >>> 0;
        const startHost = (currentNet + 1) >>> 0;
        const endHost = (currentBroadcast - 1) >>> 0;
        
        const isCurrent = ipLong >= currentNet && ipLong <= currentBroadcast;
        
        const rangeStr = cidr < 31 
            ? `${this.longToIp(startHost)} - ${this.longToIp(endHost)}`
            : 'N/A';

        rows.push({
            index: i + 1,
            networkAddress: this.longToIp(currentNet),
            range: rangeStr,
            broadcastAddress: this.longToIp(currentBroadcast),
            isCurrent
        });
    }

    return { rows, totalCount, truncated: totalCount > limit };
  }
};