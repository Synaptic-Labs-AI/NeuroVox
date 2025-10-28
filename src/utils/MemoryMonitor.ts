import { DeviceDetection } from './DeviceDetection';
import { StreamingOptions } from '../types';

interface MemoryInfo {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
}

interface AdaptiveSettings {
    chunkDuration: number;
    maxQueueSize: number;
    bitrate: number;
    sampleRate: number;
}

export class MemoryMonitor {
    private static instance: MemoryMonitor;
    private deviceDetection: DeviceDetection;
    private baseSettings: StreamingOptions;
    private lastCheck: number = 0;
    private memoryHistory: number[] = [];
    private readonly HISTORY_SIZE = 10;
    private readonly CHECK_INTERVAL = 5000; // 5 seconds
    private warningCallback?: (usage: number) => void;
    private emergencyCleanupCallback?: () => void;

    private constructor() {
        this.deviceDetection = DeviceDetection.getInstance();
        this.baseSettings = this.deviceDetection.getOptimalStreamingOptions();
    }

    static getInstance(): MemoryMonitor {
        if (!this.instance) {
            this.instance = new MemoryMonitor();
        }
        return this.instance;
    }

    setWarningCallback(callback: (usage: number) => void): void {
        this.warningCallback = callback;
    }

    setEmergencyCleanupCallback(callback: () => void): void {
        this.emergencyCleanupCallback = callback;
    }

    getCurrentMemoryInfo(): MemoryInfo | null {
        if ('memory' in performance && (performance as any).memory) {
            return (performance as any).memory as MemoryInfo;
        }
        return null;
    }

    getMemoryUsagePercent(): number {
        const memoryInfo = this.getCurrentMemoryInfo();
        if (!memoryInfo) {
            // Fallback estimation based on device type
            return this.deviceDetection.isMobile() ? 60 : 30; // Conservative estimates
        }

        return (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100;
    }

    isMemoryPressureHigh(): boolean {
        const usage = this.getMemoryUsagePercent();
        return usage > (this.deviceDetection.isMobile() ? 70 : 80);
    }

    isMemoryPressureCritical(): boolean {
        const usage = this.getMemoryUsagePercent();
        return usage > (this.deviceDetection.isMobile() ? 85 : 90);
    }

    checkMemoryPressure(): void {
        const now = Date.now();
        
        // Don't check too frequently
        if (now - this.lastCheck < this.CHECK_INTERVAL) {
            return;
        }
        
        this.lastCheck = now;
        
        const usage = this.getMemoryUsagePercent();
        
        // Update history
        this.memoryHistory.push(usage);
        if (this.memoryHistory.length > this.HISTORY_SIZE) {
            this.memoryHistory.shift();
        }

        // Check for warnings
        if (this.isMemoryPressureCritical()) {
            if (this.emergencyCleanupCallback) {
                this.emergencyCleanupCallback();
            }
        } else if (this.isMemoryPressureHigh()) {
            if (this.warningCallback) {
                this.warningCallback(usage);
            }
        }
    }

    getAdaptiveSettings(): AdaptiveSettings {
        const usage = this.getMemoryUsagePercent();
        const isMobile = this.deviceDetection.isMobile();
        const isHighPressure = this.isMemoryPressureHigh();
        const isCritical = this.isMemoryPressureCritical();

        // Base settings
        let settings: AdaptiveSettings = {
            chunkDuration: this.baseSettings.chunkDuration,
            maxQueueSize: this.baseSettings.maxQueueSize,
            bitrate: this.baseSettings.bitrate,
            sampleRate: isMobile ? 16000 : 44100
        };

        // Reduce settings under memory pressure
        if (isCritical) {
            // Emergency mode
            settings = {
                chunkDuration: Math.max(3, settings.chunkDuration * 0.6), // Smaller chunks
                maxQueueSize: Math.max(1, Math.floor(settings.maxQueueSize * 0.5)), // Minimal queue
                bitrate: Math.max(8000, Math.floor(settings.bitrate * 0.5)), // Very low bitrate
                sampleRate: 8000 // Minimal sample rate
            };
        } else if (isHighPressure) {
            // High pressure mode
            settings = {
                chunkDuration: Math.max(4, settings.chunkDuration * 0.8),
                maxQueueSize: Math.max(2, Math.floor(settings.maxQueueSize * 0.7)),
                bitrate: Math.max(12000, Math.floor(settings.bitrate * 0.7)),
                sampleRate: isMobile ? 12000 : 22050
            };
        }

        return settings;
    }

    getAverageMemoryUsage(): number {
        if (this.memoryHistory.length === 0) {
            return this.getMemoryUsagePercent();
        }
        
        const sum = this.memoryHistory.reduce((acc, val) => acc + val, 0);
        return sum / this.memoryHistory.length;
    }

    isMemoryTrendIncreasing(): boolean {
        if (this.memoryHistory.length < 3) {
            return false;
        }

        // Check if the last 3 readings show an increasing trend
        const recent = this.memoryHistory.slice(-3);
        return recent[2] > recent[1] && recent[1] > recent[0];
    }

    forceGarbageCollection(): void {
        // Force garbage collection if available (only in development or special contexts)
        if ('gc' in window) {
            try {
                (window as any).gc();
            } catch (e) {
                // Ignore if not available
            }
        }

        // Alternative: create memory pressure to trigger GC
        try {
            const arr = new Array(1000000).fill(0);
            arr.length = 0;
        } catch (e) {
            // Ignore
        }
    }

    getMemoryStats() {
        const memoryInfo = this.getCurrentMemoryInfo();
        const usage = this.getMemoryUsagePercent();
        const adaptive = this.getAdaptiveSettings();

        return {
            memoryInfo,
            usagePercent: usage,
            averageUsage: this.getAverageMemoryUsage(),
            isHighPressure: this.isMemoryPressureHigh(),
            isCritical: this.isMemoryPressureCritical(),
            trendIncreasing: this.isMemoryTrendIncreasing(),
            adaptiveSettings: adaptive,
            isMobile: this.deviceDetection.isMobile()
        };
    }

    // Cleanup and reset
    reset(): void {
        this.memoryHistory = [];
        this.lastCheck = 0;
    }
}