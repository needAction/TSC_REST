export type PlayerRole = "A" | "B";
export type SessionPhase = "Waiting" | "Loading" | "Playing";

export interface Player {
  id: string;
  role: PlayerRole;
  // 플레이용 씬 로딩 완료 여부입니다.
  ready: boolean;
}

export interface SessionDefinition {
  id: string;
  roles: readonly PlayerRole[];
}

export interface SessionSnapshot {
  sessionId: string;
  phase: SessionPhase;
  players: Player[];
}

export class GameSession {
  private readonly players: Player[] = [];

  constructor(private readonly definition: SessionDefinition) {}

  get id(): string {
    return this.definition.id;
  }

  get phase(): SessionPhase {
    if (this.players.length < this.definition.roles.length) {
      return "Waiting";
    }

    return this.players.every(player => player.ready)
      ? "Playing"
      : "Loading";
  }

  addPlayer(playerId: string): Player | undefined {
    const role = this.definition.roles[this.players.length];

    if (role === undefined) {
      return undefined;
    }

    const player: Player = {
      id: playerId,
      role,
      ready: false
    };

    this.players.push(player);
    return { ...player };
  }

  markSceneLoaded(playerId: string): boolean {
    const player = this.players.find(player => player.id === playerId);

    if (player === undefined) {
      return false;
    }

    player.ready = true;
    return true;
  }

  getSnapshot(): SessionSnapshot {
    return {
      sessionId: this.id,
      phase: this.phase,
      players: this.players.map(player => ({ ...player }))
    };
  }
}
