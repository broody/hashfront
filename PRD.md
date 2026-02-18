# Chain Tactics — Product Requirements Document

## Overview

Chain Tactics is a turn-based tactics game on StarkNet. Two players command small armies on a grid, taking alternating turns to move and attack — like classic Advance Wars. The core gameplay is outmaneuvering your opponent through positioning, unit matchups, and resource control.

Built on Dojo with a React + PixiJS client. An AI agent can play either side using the same transaction API as a human. Players can chat with AI agents during the game, attempting to influence their behavior through dialogue and diplomacy.

## Core Loop

```
Player A's Turn → Player B's Turn → Player A's Turn → ...
```

A typical game lasts 10-20 rounds (one round = both players have taken a turn).

### Turn Structure

On your turn:
1. **Select a unit** — Pick any unit that hasn't acted this turn
2. **Move** — Move the unit within its movement range (optional)
3. **Attack** — Attack an enemy in range from the unit's current position (optional)
4. **End unit turn** — The unit is marked as "acted"
5. Repeat for remaining units, or **End Turn** early to pass to opponent

Once all units have acted (or the player ends their turn), control switches to the opponent.

### First Player

- **On-chain**: Determined by VRF coin flip at game start
- **MVP**: Random coin flip

### Turn Timer

Turn timers are optional, configurable per lobby for PvP. In vs AI mode, there is no time pressure — take as long as you want.

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
- Defender counterattacks if the attacker is within the defender's attack range (and defender survives)
- Ranged attacks (Ranger at range 2-3) are one-directional — target cannot counter
- Unit dies when HP reaches 0, removed from board immediately

### Unit Abilities

- **Infantry**: Can capture buildings by standing on them for 2 consecutive turns
- **Tank**: No special ability, raw stats
- **Ranger**: Cannot attack adjacent units (minimum range 2)

## Economy

- Each captured **City** generates **1 gold per round** during income phase (at the start of each player's turn)
- Each player starts with **5 gold**
- Units are built at captured **Factories** — one unit per factory per turn
- Built units spawn adjacent to factory at the start of your next turn

## Actions

On each unit's turn, a player can issue one of the following:

| Action | Description |
|--------|-------------|
| **move** | Move unit along a path (up to unit's movement range) |
| **attack** | Attack an enemy unit within attack range (from current or post-move position) |
| **capture** | Infantry begins/continues capturing a building |
| **wait** | Unit holds position |
| **build** | Queue a unit at a factory (costs gold) |

### Move + Attack

A unit can move AND attack in the same turn if it has remaining range after moving. The unit moves first, then attacks from its destination.

## Resolution

Each unit's action resolves immediately when executed:

1. **Movement** — Unit moves along its path
2. **Combat** — Damage is dealt, defender counterattacks if able
3. **Death** — Units at 0 HP are removed immediately
4. **Capture** — Infantry on buildings tick their capture counter
5. **Income** — Generated at the start of each player's turn
6. **Production** — Queued units spawn at the start of your turn

## Win Conditions

The game ends when:

1. **HQ Captured** — An infantry unit completes capture of the enemy HQ (2 turns standing on it). Capturer wins.
2. **Elimination** — All enemy units are destroyed and they cannot produce more (no factories + no gold). Destroyer wins.
3. **Timeout** — After 30 rounds, the player with more total unit HP + gold wins. Tie = draw.

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

### Chat in MVP

- Basic chat UI with text input
- One default agent personality (analytical)
- Agent responds to messages with personality-appropriate replies
- Minimal gameplay influence (agent acknowledges but mostly plays its strategy)

## AI Agent

AI agents are real on-chain players. They use **controller-cli** to submit transactions through Cartridge Controller sessions — the same interface as human players. No backdoors, no separate API.

### Agent Lifecycle

1. **Spawn** — Game server creates agent with personality traits + strategy tier
2. **Auth** — Agents use pre-authorized credentials (preset session keys) so they can play instantly with no browser auth flow. The game server holds a pool of pre-provisioned Controller sessions scoped to the game contract.
3. **Observe** — `controller call <world> get_board_state <game_id>` via RPC to read current state
4. **Decide** — LLM evaluates board, chat context, personality → plans moves
5. **Execute** — `controller execute <world> submit_orders <calldata>` to submit moves on-chain
6. **Chat** — Respond to player messages with personality-consistent dialogue
7. **Cleanup** — Game resolves → agent discarded, session returned to pool

The agent sees the same information as a human player and takes its turn just like a human would — one unit at a time.

### Agent Difficulty Tiers

- **Basic**: Greedy — attacks nearest enemy, captures nearest city
- **Intermediate**: Evaluates unit matchups, avoids unfavorable trades, protects HQ
- **Advanced**: Predicts player tendencies based on move history, sets traps, sacrifices units for positional advantage

## Tech Stack

- **Chain**: StarkNet
- **Framework**: Dojo (models for units, buildings, game state)
- **Indexer**: Torii (gRPC subscriptions for real-time state)
- **Client**: React + PixiJS + Vite
- **Agent**: TypeScript, controller-cli for on-chain txs, OpenRouter for LLM

## MVP Scope (Prototype)

For the first playable build, ship with:

1. **20x20 fixed map** with Grass, Cities, HQ, Factory
2. **3 unit types** (Infantry, Tank, Ranger)
3. **Turn-based game loop** — alternating turns with unit selection, move, attack
4. **AI opponent** (basic difficulty)
5. **Unit selection, movement, and attack via mouse**
6. **Immediate resolution with animation**
7. **Win by elimination or HQ capture**
8. **Basic in-game chat** with AI agent (one personality)
9. No fog of war, no advanced terrain, no multiplayer networking

### Post-MVP

- On-chain contracts (Dojo models + systems)
- VRF coin flip for first player
- Human vs Human multiplayer via Torii subscriptions
- Advanced AI agent with multiple personality traits
- Agent chat with full diplomacy/influence system
- Multiple maps
- Ranked matchmaking
- Replay system (all state is on-chain)
- Configurable turn timers for PvP lobbies
