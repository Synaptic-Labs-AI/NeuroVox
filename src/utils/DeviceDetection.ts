import { StreamingOptions } from '../types';

export class DeviceDetection {
    private static instance: DeviceDetection;
    private isMobileDevice: boolean;
    private availableMemory: number | null = null;

    private constructor() {
        this.isMobileDevice = this.detectMobile();
        this.updateMemoryInfo();
    }

    static getInstance(): DeviceDetection {
        if (!this.instance) {
            this.instance = new DeviceDetection();
        }
        return this.instance;
    }

    private detectMobile(): boolean {
        // Check for mobile/tablet devices
        const userAgent = navigator.userAgent.toLowerCase();
        const mobileKeywords = ['mobile', 'tablet', 'android', 'iphone', 'ipad', 'ipod'];
        const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));
        
        // Check screen size
        const isSmallScreen = window.innerWidth <= 768 || window.innerHeight <= 768;
        
        // Check for touch support
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Conservative approach: if any two conditions are true, consider it mobile
        const mobileIndicators = [isMobileUA, isSmallScreen, hasTouch];
        const mobileCount = mobileIndicators.filter(Boolean).length;
        
        return mobileCount >= 2;
    }

    private updateMemoryInfo(): void {
        // Try to get memory info if available (Chrome/Edge)
        if ('memory' in performance && (performance as any).memory) {
            const memoryInfo = (performance as any).memory;
            this.availableMemory = memoryInfo.jsHeapSizeLimit - memoryInfo.usedJSHeapSize;
        } else {
            // Fallback: estimate based on device type
            this.availableMemory = this.isMobileDevice ? 
                512 * 1024 * 1024 :  // 512MB for mobile
                2048 * 1024 * 1024;  // 2GB for desktop
        }
    }

    isMobile(): boolean {
        return this.isMobileDevice;
    }

    getAvailableMemory(): number {
        this.updateMemoryInfo();
        return this.availableMemory || 0;
    }

    getOptimalStreamingOptions(): StreamingOptions {
        const isMobile = this.isMobile();
        const availableMemory = this.getAvailableMemory();
        
        if (isMobile || availableMemory < 1024 * 1024 * 1024) { // Mobile or < 1GB
            return {
                chunkDuration: 5,      // 5 second chunks
                maxQueueSize: 3,       // Max 3 chunks in memory
                bitrate: 16000,        // 16kbps
                processingMode: 'streaming',
                memoryLimit: 100       // 100MB limit
            };
        } else {
            return {
                chunkDuration: 10,     // 10 second chunks
                maxQueueSize: 5,       // Max 5 chunks in memory
                bitrate: 48000,        // 48kbps
                processingMode: 'streaming',
                memoryLimit: 300       // 300MB limit
            };
        }
    }

    shouldUseStreamingMode(): boolean {
        // Always use streaming on mobile or when memory is constrained
        return this.isMobile() || this.getAvailableMemory() < 1024 * 1024 * 1024;
    }

    getRecommendedBitrate(): number {
        return this.isMobile() ? 16000 : 48000;
    }

    getRecommendedSampleRate(): number {
        return this.isMobile() ? 16000 : 44100;
    }

    // Memory pressure check
    isMemoryConstrained(): boolean {
        const available = this.getAvailableMemory();
        const threshold = this.isMobile() ? 50 * 1024 * 1024 : 200 * 1024 * 1024; // 50MB mobile, 200MB desktop
        return available < threshold;
    }
}