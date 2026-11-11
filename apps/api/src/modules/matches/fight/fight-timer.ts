import { Injectable } from '@nestjs/common';

/** One timeout per match, so the server can finish a fight on its own when time runs out */
@Injectable()
export class FightTimer {
    private readonly timers = new Map<string, NodeJS.Timeout>();

    /** Replaces the match's previous timer. A negative delay counts as 0. */
    arm(matchId: string, delayMs: number, onFire: () => void): void {
        this.cancel(matchId);
        const timer = setTimeout(
            () => {
                // Forgets itself first, so `onFire` can arm again
                this.timers.delete(matchId);
                onFire();
            },
            Math.max(0, delayMs),
        );
        // Never holds the process open
        timer.unref();
        this.timers.set(matchId, timer);
    }

    cancel(matchId: string): void {
        const timer = this.timers.get(matchId);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(matchId);
        }
    }

    cancelAll(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }

    armed(matchId: string): boolean {
        return this.timers.has(matchId);
    }
}
