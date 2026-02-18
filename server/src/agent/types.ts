export interface AgentPersonality {
  name: string;
  description: string;
  systemPrompt: string;
  traits: string[];
}

export interface AgentConfig {
  personality: AgentPersonality;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface GameAgent {
  gameId: string;
  config: AgentConfig;
  createdAt: number;
  lastActiveAt: number;
}
