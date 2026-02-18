# Chain Tactics

Turn-based tactics game on StarkNet. Two players command armies on a grid, taking alternating turns to outmaneuver each other — inspired by Advance Wars.

## Monorepo Structure

```
chain-tactics/
├── client/          # React + PixiJS + Vite frontend
├── server/          # Hono API + AI agent backend
├── contracts/       # StarkNet smart contracts (planned)
├── PRD.md
├── AGENTS.md
└── README.md
```

## How It Works

```
Player A's Turn → Player B's Turn → Player A's Turn → ...
```

Each turn: select units → move → attack → end turn. Simple, strategic, no hidden information.

## Game

- **40x40 grid** with Grass, Mountains, Cities, Factories, Roads, Trees, and HQs
- **3 unit types** — Infantry, Tank, Ranger (rock-paper-scissors dynamics)
- **Economy** — Capture cities for income, build units at factories
- **Win** by capturing the enemy HQ or eliminating all their units
- **Chat with AI agents** — Bluff, negotiate, and try to influence their strategy mid-game

## Development

```bash
# Install all dependencies
pnpm install

# Run client (port 5173)
pnpm dev:client

# Run server (port 3001)
pnpm dev:server

# Run both
pnpm dev
```

## Stack

- **Chain**: StarkNet + Dojo
- **Client**: React + PixiJS + Vite
- **Server**: Hono + TypeScript
- **AI**: OpenRouter LLM integration
- **Indexer**: Torii

## License

MIT
