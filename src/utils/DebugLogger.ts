import NeuroVoxPlugin from '../main';

export interface DebugLogEntry {
    timestamp: number;
    category: 'audio' | 'api' | 'file' | 'chunk' | 'general';
    operation: string;
    details: any;
    duration?: number;
}

export class DebugLogger {
    private logs: DebugLogEntry[] = [];
    private operationTimers: Map<string, number> = new Map();

    constructor(private plugin: NeuroVoxPlugin) {}

    isEnabled(): boolean {
        return this.plugin.settings.debugMode;
    }

    log(category: DebugLogEntry['category'], operation: string, details: any): void {
        if (!this.isEnabled()) return;

        const entry: DebugLogEntry = {
            timestamp: Date.now(),
            category,
            operation,
            details
        };

        this.logs.push(entry);
        console.log(`[NeuroVox Debug] ${category.toUpperCase()} - ${operation}:`, details);
    }

    startTimer(operationId: string): void {
        if (!this.isEnabled()) return;
        this.operationTimers.set(operationId, Date.now());
    }

    endTimer(operationId: string, category: DebugLogEntry['category'], operation: string, details: any = {}): void {
        if (!this.isEnabled()) return;

        const startTime = this.operationTimers.get(operationId);
        if (startTime) {
            const duration = Date.now() - startTime;
            this.operationTimers.delete(operationId);

            const entry: DebugLogEntry = {
                timestamp: Date.now(),
                category,
                operation,
                details,
                duration
            };

            this.logs.push(entry);
            console.log(`[NeuroVox Debug] ${category.toUpperCase()} - ${operation} (${duration}ms):`, details);
        }
    }

    getLogs(): DebugLogEntry[] {
        return [...this.logs];
    }

    getFormattedLogs(): string {
        if (this.logs.length === 0) {
            return 'No debug logs available.';
        }

        const lines: string[] = ['## 🐛 Debug Log\n'];
        
        // Group by category
        const categories = ['audio', 'chunk', 'api', 'file', 'general'] as const;
        
        for (const category of categories) {
            const categoryLogs = this.logs.filter(log => log.category === category);
            if (categoryLogs.length === 0) continue;

            lines.push(`### ${this.getCategoryIcon(category)} ${category.toUpperCase()}\n`);
            
            for (const log of categoryLogs) {
                const time = new Date(log.timestamp).toISOString().split('T')[1].split('.')[0];
                const durationStr = log.duration ? ` (${log.duration}ms)` : '';
                lines.push(`- **${time}** - ${log.operation}${durationStr}`);
                
                // Format details
                if (log.details && Object.keys(log.details).length > 0) {
                    const detailsStr = Object.entries(log.details)
                        .map(([key, value]) => {
                            if (typeof value === 'object') {
                                return `  - ${key}: ${JSON.stringify(value, null, 2)}`;
                            }
                            return `  - ${key}: ${value}`;
                        })
                        .join('\n');
                    lines.push(detailsStr);
                }
            }
            lines.push('');
        }

        // Add summary
        lines.push('### 📊 Summary\n');
        const totalDuration = this.logs
            .filter(log => log.duration)
            .reduce((sum, log) => sum + (log.duration || 0), 0);
        
        lines.push(`- Total operations: ${this.logs.length}`);
        lines.push(`- Total time: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
        lines.push(`- Audio operations: ${this.logs.filter(l => l.category === 'audio').length}`);
        lines.push(`- API calls: ${this.logs.filter(l => l.category === 'api').length}`);
        lines.push(`- File operations: ${this.logs.filter(l => l.category === 'file').length}`);
        lines.push(`- Chunks processed: ${this.logs.filter(l => l.category === 'chunk').length}`);

        return lines.join('\n');
    }

    private getCategoryIcon(category: DebugLogEntry['category']): string {
        const icons = {
            audio: '🎵',
            api: '🌐',
            file: '📁',
            chunk: '🧩',
            general: '📝'
        };
        return icons[category] || '📝';
    }

    clear(): void {
        this.logs = [];
        this.operationTimers.clear();
    }
}
