export interface TimerConfig {
    maxDuration: number;
    warningThreshold: number;
    updateInterval: number;
}

export class TimerController {
    private intervalId: number | null = null;
    private seconds: number = 0;
    private isRunning: boolean = false;

    constructor(
        private config: TimerConfig,
        private onTick: (seconds: number) => void,
        private onMaxDuration: () => void
    ) {}

    start(): void {
        this.seconds = 0;
        this.isRunning = true;
        this.tick();
        
        this.intervalId = window.setInterval(() => {
            this.tick();
        }, this.config.updateInterval);
    }

    pause(): void {
        this.isRunning = false;
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    resume(): void {
        if (!this.intervalId && this.isRunning) {
            this.intervalId = window.setInterval(() => {
                this.tick();
            }, this.config.updateInterval);
        }
    }

    stop(): void {
        this.isRunning = false;
        this.pause();
        this.seconds = 0;
    }

    private tick(): void {
        this.seconds++;
        this.onTick(this.seconds);

        if (this.seconds >= this.config.maxDuration) {
            this.onMaxDuration();
        }
    }

    getSeconds(): number {
        return this.seconds;
    }
}