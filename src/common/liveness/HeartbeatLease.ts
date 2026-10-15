import type { IMillisecondClock } from "../IMillisecondClock";

export class HeartbeatLease {
    private lastReceivedMs: number;

    constructor(private readonly clock: IMillisecondClock, private readonly timeoutMs: number)
    {
        if(!Number.isSafeInteger(timeoutMs) || timeoutMs <=0)
        {
            throw new Error("만료 시간은 양의 안전한 정수 ms여야 합니다.");
        }

        this.lastReceivedMs = clock.elapsedMilliseconds;
    }

    get isExpired(): boolean {
        return this.clock.elapsedMilliseconds - this.lastReceivedMs >= this.timeoutMs;
    }

    tryRenew(): boolean {
        const nowMs = this.clock.elapsedMilliseconds;
        
        if(nowMs - this.lastReceivedMs >= this.timeoutMs) {
            return false;
        }

        this.lastReceivedMs =nowMs;
        return true;
    }
}