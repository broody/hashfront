# Chain Tactics — Product Requirements Document

## Overview

Chain Tactics is a simultaneous-turn tactics game on StarkNet. Two players command small armies on a grid, submitting orders blind via commit-reveal. Orders resolve simultaneously each round — the core gameplay is predicting your opponent's moves, not reacting to them.

Built on Dojo with a React + PixiJS client. An AI agent can play either side using the same transaction API as a human.

## Core Loop

```
PLAN (5s)  →  COMMIT (5s)  →  REVEAL + RESOLVE (5s)
   ↑                                      |
   └──────────────────────────────────────┘
```

Round timing depends on game mode. A typical game lasts 10-20 rounds.

1. **Plan** — Both players see the board and queue orders for their units
2. **Commit** — Both submit `hash(orders + salt)` on-chain
3. **Reveal** — Both submit plaintext orders + salt. Contract verifies hashes, then resolves all orders simultaneously: Movement → Combat → Capture → Income → Production

## Map

- **20x20 grid**, each tile is one of: Grass, City, Factory, Mountain, HQ
- Fixed symmetrical layouts (no procedural generation) to ensure balance
- Tile pixel size: 32-40px for clear tactical readability

### Terrain Effects

| Terrain | Movement Cost | Defense Bonus | Notes |
|---------|--------------|---------------|-------|
| **Grass** | 1 | 0 | Default |
| **Mountain** | 2 | +2 | Infantry only |
| **City** | 1 | +1 | Capturable, generates 1 gold/round |
| **Factory** | 1 | +1 | Capturable, produces units |
| **HQ** | 1 | +2 | Lose if captured |

### Example Layout (20x20 symmetrical)

```
  Player A's HQ + Factory at top
  3-4 Cities scattered in top half
  Mountains/chokepoints in center
  3-4 Cities scattered in bottom half
  Player B's HQ + Factory at bottom
```

## Units

Three unit types with rock-paper-scissors dynamics:

| Unit | Move | Attack Range | HP | Attack | Strong vs | Weak vs | Cost |
|------|------|--------------|----|--------|-----------|---------|------|
| **Infantry** | 3 | 1 | 3 | 2 | Captures buildings, cheap fodder | Tank, Ranger | 1 |
| **Tank** | 2 | 1 | 5 | 4 | Infantry, other Tanks | Ranger (at range) | 3 |
| **Ranger** | 2 | 2-3 | 2 | 3 | Tank (from distance) | Infantry (up close) | 2 |

### Combat Resolution

- Attacker deals `attack - target.defense_bonus` damage (minimum 1)
- Both units in melee range deal damage simultaneously (no attacker advantage)
- Ranged attacks (Ranger at range 2-3) are one-directional — target cannot counter
- Unit dies when HP reaches 0, removed from board

### Unit Abilities

- **Infantry**: Can capture buildings by standing on them for 2 consecutive rounds
- **Tank**: No special ability, raw stats
- **Ranger**: Cannot attack adjacent units (minimum range 2)

## Economy

- Each captured **City** generates **1 gold per round** during income phase
- Each player starts with **5 gold**
- Units are built at captured **Factories** — one unit queued per factory per round
- Queued units spawn adjacent to factory on the following round

## Orders

Each round, a player submits one order per unit plus optional factory orders:

```
orders = [
  { unit: 0, action: "move", path: [[5,3], [5,4], [5,5]] },
  { unit: 1, action: "attack", target: [7, 4] },
  { unit: 2, action: "wait" },
  { factory: 0, build: "ranger" }
]
```

### Order Types

| Order | Description |
|-------|-------------|
| **move** | Move unit along a path (up to unit's movement range) |
| **attack** | Attack an enemy unit within attack range (from current or post-move position) |
| **capture** | Infantry begins/continues capturing a building |
| **wait** | Unit holds position |
| **build** | Queue a unit at a factory (costs gold) |

### Move + Attack

A unit can move AND attack in the same round if it has remaining range after moving. Path is resolved first, then attack from the destination.

## Resolution Order

Within a single round, orders resolve in this sequence:

1. **Movement** — All units move simultaneously. If two units move to the same tile, the heavier unit type gets priority (Tank > Infantry > Ranger). The heavier unit claims the tile; the lighter unit is pushed back one tile from the contested position. If same unit type, both stop one tile short.
2. **Combat** — All attacks resolve simultaneously. Damage is dealt based on pre-combat HP (no kill-then-act advantage).
3. **Deaths** — Units at 0 HP are removed.
4. **Capture** — Infantry on buildings tick their capture counter.
5. **Income** — Each captured city generates 1 gold.
6. **Production** — Queued units spawn at factories.

## Win Conditions

The game ends when:

1. **HQ Captured** — An infantry unit completes capture of the enemy HQ (2 rounds standing on it). Capturer wins.
2. **Elimination** — All enemy units are destroyed and they cannot produce more (no factories + no gold). Destroyer wins.
3. **Timeout** — After 30 rounds, the player with more total unit HP + gold wins. Tie = draw.

## Game Modes & Timing

| Mode | Plan Phase | Commit Phase | Reveal + Resolve | Notes |
|------|-----------|-------------|------------------|-------|
| **PvP** | Configurable (10s / 15s / 30s) | 5s | 5s | Set by lobby host |
| **vs AI** | Unlimited | Instant | Instant | No timer — player submits when ready |

In PvP, the plan phase timer is a lobby setting to accommodate different play styles (casual vs competitive). In player vs AI, there is no time pressure — the agent commits immediately after the player.

## Commit-Reveal

### Why

On-chain state is public. Without commit-reveal, the second player to submit always sees the first player's orders and can counter perfectly. Commit-reveal ensures both players are blind.

Attacks target **coordinates, not units**. If the target moved away during simultaneous resolution, the attack misses. This is by design — the core skill is predicting your opponent's moves, not reacting to them.

### Flow

```
Block N:   Player A submits commit_A = keccak256(orders_A, salt_A)
           Player B submits commit_B = keccak256(orders_B, salt_B)

Block N+1: Player A submits (orders_A, salt_A) — contract verifies hash
           Player B submits (orders_B, salt_B) — contract verifies hash
           Contract resolves round
```

### Edge Cases

| Scenario | Resolution |
|----------|-----------|
| Player doesn't commit | All their units hold position (skip turn) |
| Player commits but doesn't reveal | Forfeit round, units hold, lose 1 gold penalty |
| Hash doesn't match reveal | Treated as no-reveal |
| Both don't reveal | Board unchanged, round skipped |

## Starting State

Each player begins with:

- **1 HQ**
- **1 Factory**
- **3 Infantry**
- **1 Tank**
- **5 Gold**
- **2-3 neutral Cities** near their side

Total: 4 units per side at game start. Max army size grows as cities/factories are captured.

## AI Agent

An AI agent plays the game using the same API as a human:

1. Poll Torii indexer for current board state
2. Compute orders (evaluate threats, prioritize targets, position units)
3. Submit commit transaction
4. Submit reveal transaction

### Agent Difficulty Tiers

- **Basic**: Greedy — attacks nearest enemy, captures nearest city
- **Intermediate**: Evaluates unit matchups, avoids unfavorable trades, protects HQ
- **Advanced**: Predicts player moves based on board state, sets traps, sacrifices units for positional advantage

## Tech Stack

- **Chain**: StarkNet
- **Framework**: Dojo (models for units, buildings, game state)
- **Indexer**: Torii (gRPC subscriptions for real-time state)
- **Client**: React + PixiJS + Vite
- **Agent**: TypeScript/Python, Torii polling + direct RPC

## MVP Scope (Prototype)

For the first playable build, ship with:

1. **20x20 fixed map** with Grass, Cities, HQ, Factory
2. **3 unit types** (Infantry, Tank, Ranger)
3. **Client-side commit-reveal simulation** (no on-chain yet)
4. **AI opponent** (basic difficulty)
5. **Unit selection, movement, and attack via mouse**
6. **Simultaneous resolution with animation**
7. **Win by elimination or HQ capture**
8. No fog of war, no advanced terrain, no multiplayer networking

### Post-MVP

- On-chain contracts (Dojo models + systems)
- Real commit-reveal with StarkNet transactions
- Human vs Human multiplayer via Torii subscriptions
- Advanced AI agent
- Multiple maps
- Ranked matchmaking
- Replay system (all state is on-chain)
