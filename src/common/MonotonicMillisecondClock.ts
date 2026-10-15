import type { IMillisecondClock } from "./IMillisecondClock";

export class MonotonicMillisecondClock
    implements IMillisecondClock {

        private readonly startedAt = process.hrtime.bigint();

        get elapsedMilliseconds(): number {
            const elapsed = process.hrtime.bigint() - this.startedAt;

            return Number(elapsed / 1_000_000n);
        }
    }