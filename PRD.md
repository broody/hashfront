# Chain Tactics — Product Requirements Document

## Overview

Chain Tactics is a turn-based tactics game on StarkNet. Two to four players command small armies on a grid, taking alternating turns to move and attack — like classic Advance Wars. The core gameplay is outmaneuvering your opponent through positioning, unit matchups, and resource control.

Built on Dojo with a React + PixiJS client. An AI agent can play either side using the same transaction API as a human. Players can chat with AI agents during the game, attempting to influence their behavior through dialogue and diplomacy.

## Game Flow

### Map Registration

Maps are reusable templates registered on-chain via `register_map`. A map defines three layers:

- **Terrain** — sparse list of non-grass tiles (grass is the default)
- **Buildings** — structures with explicit player slot ownership (HQs, Factories, Cities)
- **Units** — starting army positions per player slot

Player count is derived from the number of HQ buildings (2–4). All data is packed into `u32` arrays for compact calldata.

### Lobby & Player Slots

1. A player calls `create_game(map_id, player_id)` — picks their slot (1–4), copies the map template into per-game state
2. Other players call `join_game(game_id, player_id)` — first come first served for remaining slots
3. When all slots are filled, the game transitions to **Playing** — starting units spawn, buildings are counted, and Player 1's income/production runs

### Turn Structure

```
Player 1's Turn → Player 2's Turn → ... → Player N's Turn → Round increments → ...
```

On your turn, for each unit:
1. **Move** — Move the unit within its movement range (optional)
2. **Act** — Attack an enemy, capture a building, or wait (optional)
3. The unit is marked as acted

System actions **end_turn**:
- Resets stale capture progress (infantry that moved off a building)
- Advances to the next alive player
- Increments round when wrapping back to Player 1
- Runs income and production for the next player

### First Player

Player 1 always goes first. The first player to create the game picks their slot.

## Map

- **Configurable grid size** (e.g. 20x20), stored per game
- Fixed symmetrical layouts (no procedural generation) to ensure balance

### Terrain Types

| Terrain | Char | Movement Cost | Defense Bonus | Notes |
|---------|------|--------------|---------------|-------|
| **Grass** | `.` | 1 | 0 | Default (not stored) |
| **Mountain** | `M` | 2 | +2 | Infantry only |
| **City** | `C` | 1 | +1 | Building: capturable, generates income |
| **Factory** | `F` | 1 | +1 | Building: capturable, produces units |
| **HQ** | `H` | 1 | +2 | Building: lose if captured |
| **Road** | `R` | 1 | 0 | |
| **Tree** | `T` | 1 | +1 | |
| **DirtRoad** | `D` | 1 | 0 | |

### Buildings

Buildings are a separate layer from terrain. Each building has:
- **Type**: City, Factory, or HQ
- **Owner**: player slot (1–4) or 0 (neutral)
- **Capture state**: which player is capturing and progress toward threshold
- **Production queue**: unit type being built (Factory only)

Building ownership is defined in the map template and copied into each game instance.

## Units

Three unit types with rock-paper-scissors dynamics:

| Unit | HP | Attack | Move | Range | Cost | Special |
|------|-----|--------|------|-------|------|---------|
| **Infantry** | 3 | 2 | 3 | 1 | 1 | Captures buildings, traverses mountains |
| **Tank** | 5 | 4 | 2 | 1 | 3 | Raw combat power |
| **Ranger** | 2 | 3 | 2 | 2–3 | 2 | Cannot attack adjacent (min range 2) |

### Combat Resolution

- Attacker deals `attack_power - defender_terrain_defense` damage (minimum 1)
- If defender survives **and** attacker is within defender's attack range, defender counterattacks at full attack power (no terrain defense applied to attacker)
- Ranger attacks at range 2–3 are one-directional — melee units cannot counter
- Unit dies at 0 HP, removed immediately
- After a kill, the system checks for player elimination

### Movement

- Units move along a client-computed path validated step-by-step on-chain
- Each step must be adjacent (no diagonals), in bounds, and on traversable terrain
- Total movement cost must not exceed the unit's move range
- Path tiles (except destination) must be unoccupied
- Mountains cost 2 movement and are infantry-only

### Unit Flags

Each unit tracks `has_moved` and `has_acted` per turn. A unit can:
- Move then act (attack/capture/wait)
- Act without moving
- Wait (sets both flags)

Flags reset at the start of the owning player's next turn.

## Economy

| Constant | Value |
|----------|-------|
| Starting gold | 5 |
| Income per city | 1 gold/turn |
| Capture threshold | 2 turns |

- **Income** runs at the start of each player's turn: `cities_owned × 1 gold`
- **Production** runs at the start of each player's turn: queued units spawn at their factory if the tile is unoccupied
- Produced units spawn with `has_moved = true, has_acted = true` (cannot act on the turn they spawn)
- Units are queued at Factories via `build_unit` — gold is deducted immediately

## Actions

| Action | System Call | Description |
|--------|-----------|-------------|
| **Move** | `move_unit(game_id, unit_id, path)` | Move unit along validated path |
| **Attack** | `attack(game_id, unit_id, target_id)` | Attack enemy unit in range |
| **Capture** | `capture(game_id, unit_id)` | Infantry captures building at current position |
| **Wait** | `wait_unit(game_id, unit_id)` | End unit's turn without acting |
| **Build** | `build_unit(game_id, factory_x, factory_y, unit_type)` | Queue production at owned factory |
| **End Turn** | `end_turn(game_id)` | Pass control to next player |

### Capture Mechanics

- Only **Infantry** can capture
- Standing on an enemy/neutral building increments capture progress
- If a different player starts capturing, progress resets to 1 for the new player
- At threshold (2), ownership transfers — old owner loses building counts, new owner gains them
- Capturing an **HQ** immediately ends the game (capturer wins)
- If infantry moves off a building before capture completes, progress resets on the owner's next turn

## Win Conditions

1. **HQ Captured** — An infantry completes capture of an enemy HQ. Capturer wins instantly.
2. **Elimination** — A player loses their HQ, or has 0 units + 0 factories + 0 gold. They are eliminated. Last player standing wins.
3. **Timeout** — After 30 rounds, the alive player with the highest score (total unit HP + gold) wins.

## On-Chain Architecture

### Models (Dojo ECS)

| Model | Keys | Description |
|-------|------|-------------|
| `GameCounter` | `id` | Global counter for game/map IDs |
| `Game` | `game_id` | Game state, dimensions, current player, round |
| `PlayerState` | `game_id, player_id` | Address, gold, unit/building counts, alive status |
| `Tile` | `game_id, x, y` | Per-game terrain type |
| `Building` | `game_id, x, y` | Per-game building with ownership and capture state |
| `Unit` | `game_id, unit_id` | Position, HP, type, movement/action flags |
| `MapInfo` | `map_id` | Template metadata (dimensions, counts) |
| `MapTile` | `map_id, seq` | Template terrain (sparse, non-grass only) |
| `MapBuilding` | `map_id, seq` | Template building with player slot ownership |
| `MapUnit` | `map_id, seq` | Template starting unit placement |

### Data Encoding

Map data uses packed `u32` values for compact calldata:

- **Tiles**: `(grid_index << 8) | tile_type` — only non-grass tiles
- **Buildings**: `(player_id << 24) | (building_type << 16) | (x << 8) | y`
- **Units**: `(player_id << 24) | (unit_type << 16) | (x << 8) | y`

### View Functions (Debug)

- `get_terrain(map_id)` → `(width, height, Array<u32>)` — sparse terrain tiles
- `get_buildings(map_id)` → `(width, height, Array<u32>)` — buildings with ownership
- `get_units(map_id)` → `(width, height, Array<u32>)` — starting unit placements

The client uses the **Torii indexer** for real-time game state via gRPC subscriptions. View functions are for debugging only.

## In-Game Chat with Agents

Players can chat with AI agents during the game via an async in-game chat panel. Chat does not block gameplay — you can send messages at any time, including during the opponent's turn.

### How It Works

- A chat window is available whenever you're playing against an AI agent
- Messages are processed asynchronously — the agent reads and may respond between moves
- The agent's personality traits influence both chat style and gameplay decisions

### Diplomacy & Influence

Players can attempt to influence agent behavior through dialogue:

- **Bluffing** — "I'm about to rush your HQ with everything I've got"
- **Negotiation** — "Let's focus on the center cities and leave each other's flanks alone"
- **Psychological warfare** — "You're losing this, just resign"
- **Misdirection** — "I'm building Rangers next" (when you're actually building Tanks)

### Agent Susceptibility

Whether an agent is influenced depends on its personality traits:

| Trait | Chat Behavior | Susceptibility |
|-------|--------------|----------------|
| **Stubborn** | Dismissive, short replies | Ignores pleas and threats entirely |
| **Gullible** | Friendly, overly trusting | May shift strategy based on player claims |
| **Analytical** | Logical, asks clarifying questions | Only influenced by sound strategic arguments |
| **Aggressive** | Taunting, competitive | Provoked easily — may overcommit |
| **Cautious** | Polite, hedging | Bluffs about rushes may cause them to turtle up |

Agents combine multiple traits. A "gullible + aggressive" agent might believe a bluff and preemptively attack, while a "stubborn + analytical" agent is nearly impossible to manipulate.

## AI Agent

AI agents are real on-chain players. They use **controller-cli** to submit transactions through Cartridge Controller sessions — the same interface as human players. No backdoors, no separate API.

### Agent Lifecycle

1. **Spawn** — Game server creates agent with personality traits + strategy tier
2. **Auth** — Agents use pre-authorized credentials (preset session keys) so they can play instantly with no browser auth flow
3. **Observe** — Read current game state via Torii indexer
4. **Decide** — LLM evaluates board, chat context, personality → plans moves
5. **Execute** — Submit transactions on-chain (move, attack, capture, end_turn)
6. **Chat** — Respond to player messages with personality-consistent dialogue
7. **Cleanup** — Game resolves → agent discarded, session returned to pool

### Agent Difficulty Tiers

- **Basic**: Greedy — attacks nearest enemy, captures nearest city
- **Intermediate**: Evaluates unit matchups, avoids unfavorable trades, protects HQ
- **Advanced**: Predicts player tendencies based on move history, sets traps, sacrifices units for positional advantage

## Tech Stack

- **Chain**: StarkNet
- **Framework**: Dojo (models for units, buildings, game state)
- **Indexer**: Torii (gRPC subscriptions for real-time state)
- **Client**: React + PixiJS + Vite
- **Wallet**: Cartridge Controller (session keys for gasless play)
- **Agent**: TypeScript, controller-cli for on-chain txs, OpenRouter for LLM

## MVP Scope

1. **Configurable map** with all 8 terrain types + buildings + starting units
2. **3 unit types** (Infantry, Tank, Ranger)
3. **Full turn-based game loop** — move, attack, capture, build, end turn
4. **Economy** — income from cities, unit production at factories
5. **Win conditions** — HQ capture, elimination, timeout
6. **AI opponent** (basic difficulty)
7. **Basic in-game chat** with AI agent (one personality)
8. No fog of war, no advanced terrain effects beyond what's implemented

### Post-MVP

- VRF coin flip for first player
- Human vs Human multiplayer via Torii subscriptions
- Advanced AI agent with multiple personality traits
- Agent chat with full diplomacy/influence system
- Multiple maps with map selection in lobby
- 3–4 player support
- Ranked matchmaking
- Replay system (all state is on-chain)
- Configurable turn timers for PvP lobbies
