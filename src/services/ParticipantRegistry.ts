import type {
    IMillisecondClock
} from "../common/IMillisecondClock";

import {
    HeartbeatLease
} from "../common/liveness/HeartbeatLease";

interface ParticipantRecord {
    readonly playerId: string;
    readonly lease: HeartbeatLease;
}

export class ParticipantRegistry {
    private readonly records = new Map<string, ParticipantRecord>();

    constructor(private readonly clock: IMillisecondClock,private readonly timeoutMs: number) {
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
            throw new Error("만료 시간은 양의 안전한 정수 ms여야 합니다.");
        }
    }

    register(participantToken: string, playerId: string): void {
        if (!participantToken.trim() || !playerId.trim()) {
            throw new Error("참가 토큰과 참가자 ID가 필요합니다.");
        }

        if (this.records.has(participantToken)) {
            throw new Error("이미 등록된 참가 토큰입니다.");
        }

        for (const record of this.records.values()) {
            if (record.playerId === playerId) {
                throw new Error("이미 등록된 참가자입니다.");
            }
        }

        this.records.set(participantToken, {
            playerId, lease: new HeartbeatLease(this.clock, this.timeoutMs)
        });
    }

    getPlayerId(participantToken: string): string | undefined {
        const record = this.records.get(participantToken);

        if (record === undefined || record.lease.isExpired) {
            return undefined;
        }

        return record.playerId;
    }

    heartbeat(participantToken: string): boolean {
        const record = this.records.get(participantToken);

        return record?.lease.tryRenew() ?? false;
    }

    getExpiredTokens(): string[] {
        const expiredTokens: string[] = [];

        for (const [token, record] of this.records) {
            if (record.lease.isExpired) {
                expiredTokens.push(token);
            }
        }

        return expiredTokens;
    }

    remove(participantToken: string): string | undefined {
        const record = this.records.get(participantToken);

        if (record === undefined) {
            return undefined;
        }

        this.records.delete(participantToken);
        return record.playerId;
    }
}