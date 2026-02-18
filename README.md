# Chain Tactics

Simultaneous-turn tactics game on StarkNet. Two players command armies on a grid, submitting orders blind via commit-reveal.

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
PLAN (5s)  →  COMMIT (5s)  →  REVEAL + RESOLVE (5s)
   ↑                                      |
   └──────────────────────────────────────┘
```

Both players plan moves, commit hashed orders on-chain, then reveal. No one sees the other's orders until both are locked in.

## Game

- **40x40 grid** with Grass, Mountains, Cities, Factories, Roads, Trees, and HQs
- **3 unit types** — Infantry, Tank, Ranger (rock-paper-scissors dynamics)
- **Economy** — Capture cities for income, build units at factories
- **Win** by capturing the enemy HQ or eliminating all their units

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
