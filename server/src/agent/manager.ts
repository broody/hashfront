import type { AgentConfig, GameAgent } from "./types.js";

export class AgentManager {
  private agents: Map<string, GameAgent> = new Map();

  spawn(gameId: string, config: AgentConfig): GameAgent {
    const agent: GameAgent = {
      gameId,
      config,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.agents.set(gameId, agent);
    return agent;
  }

  get(gameId: string): GameAgent | undefined {
    return this.agents.get(gameId);
  }

  cleanup(gameId: string): boolean {
    return this.agents.delete(gameId);
  }

  cleanupStale(maxAgeMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, agent] of this.agents) {
      if (now - agent.lastActiveAt > maxAgeMs) {
        this.agents.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  list(): GameAgent[] {
    return Array.from(this.agents.values());
  }
}
