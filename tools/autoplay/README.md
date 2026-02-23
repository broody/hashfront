# Hashfront Autoplay Bot

Autonomous self-play bot that creates and plays Hashfront games on Starknet Sepolia via the `controller` CLI.

## Features

- **Self-play**: Creates games and plays both sides autonomously
- **Human games**: Maintains an `OPEN_*` game in lobby for humans to join, then plays against them
- **Random maps**: Picks from all available maps when creating games
- **Pathfinding**: Dijkstra-based pathfinder with terrain costs, mountain routing, and occupancy awareness
- **Combat AI**: Front-to-back unit ordering, overkill prevention, ranger sniping prioritization
- **Multicall batching**: Entire turns (moves + attacks + waits + end_turn) in a single transaction
- **Error recovery**: Retries failed turns, resigns after 3 consecutive failures

## Requirements

- Python 3.10+ (stdlib only, no external dependencies)
- [`controller`](https://github.com/cartridge-gg/controller-cli) CLI installed and authenticated
- Access to Torii GraphQL endpoint

## Usage

```bash
# Continuous mode — runs forever, ticking every 15s
python main.py

# Single tick — good for cron
python main.py --once

# Override settings
python main.py --games 3 --interval 30
```

### Cron Setup

```bash
# Run every 5 minutes
*/5 * * * * cd /path/to/tools/autoplay && python3 main.py --once >> cron.log 2>&1
```

## Architecture

```
main.py        — Game manager: lifecycle, discovery, open games for humans
planner.py     — AI turn planner: march/attack/capture phases, overkill prevention
pathfinder.py  — Dijkstra pathfinding with terrain costs and obstacle routing
executor.py    — Multicall JSON builder + controller CLI executor
state.py       — Torii GraphQL client: game state, terrain, units, buildings
config.py      — Constants: unit stats, terrain costs, contract address
```

### Turn Planning

1. **Sort units** front-to-back (closest to enemy first)
2. **Rangers**: Snipe from current position if possible, otherwise reposition
3. **Melee** (Infantry/Tank): Move adjacent to nearest enemy and attack
4. **Capture march**: When no enemies remain, route to enemy HQ
5. **Overkill prevention**: Track expected damage to avoid wasting attacks on dying units
6. **Occupancy simulation**: Each planned move updates the occupied set for subsequent pathfinding

### Pathfinding

- Dijkstra for reachable tiles within movement budget (respects terrain costs)
- Full-map reverse Dijkstra for true path distance (routes around mountain bands)
- Mountains: infantry-only (cost 2), impassable for tanks/rangers
- Friendly units block movement (no pass-through)

## Configuration

Edit `config.py` to change:

- `CONTRACT` — Actions contract address
- `TORII_URL` — Torii GraphQL endpoint
- `BOT_ADDRESS` — Bot's Starknet address (for human game detection)
- `MAX_GAMES` — Max concurrent self-play games (default 5)
- `TICK_INTERVAL` — Seconds between ticks (default 15)
