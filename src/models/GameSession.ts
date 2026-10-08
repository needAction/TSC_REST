export type PlayerRole = "A" | "B";
export type SessionPhase = "Waiting" | "Loading" | "Playing";

export interface Player {
  id: string;
  role: PlayerRole;
}

export interface SessionDefinition {
  id: string;
  roles: readonly PlayerRole[];
}

export interface SessionSnapshot {
  id: string;
  phase: SessionPhase;
  players: (Player & { ready: boolean })[];
}

export class GameSession {
  private readonly players: Player[] = [];
  private readonly readyPlayerIds = new Set<string>();

  constructor(private readonly definition: SessionDefinition) {}

  get id(): string {
    return this.definition.id;
  }

  get phase(): SessionPhase {
    if (this.players.length !== this.definition.roles.length) {
      return "Waiting";
    }

    return this.players.every(player => this.readyPlayerIds.has(player.id))
      ? "Playing"
      : "Loading";
  }

  markReady(playerId: string): boolean {
    if (!this.players.some(player => player.id === playerId)) {
      return false;
    }

    this.readyPlayerIds.add(playerId);
    return true;
  }

  getSnapshot(): SessionSnapshot {
    return {
      id: this.id,
      phase: this.phase,
      players: this.players.map(player => ({
        ...player,
        ready: this.readyPlayerIds.has(player.id)
      }))
    };
  }

  addPlayer(playerId: string): Player | undefined {
    const role = this.definition.roles[this.players.length];

    if (role === undefined) {
      return undefined;
    }

    const player: Player = { id: playerId, role };
    this.players.push(player);

    return { ...player };
  }
}
