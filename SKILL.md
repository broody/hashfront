# Hashfront — Agent Play Guide (Sepolia Testnet)

Guide for AI agents to play the Hashfront turn-based tactics game on Starknet **Sepolia testnet**. This is a test deployment — all transactions are subsidized (no gas needed).

## Prerequisites

- [Controller CLI](https://github.com/cartridge-gg/controller-cli) installed: `curl -fsSL https://raw.githubusercontent.com/cartridge-gg/controller-cli/main/install.sh | bash`
- Active controller session with hashfront policies (see [Session Setup](#session-setup))

## Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| **World** | `0x07f87b22d97fcd790a1d784252128540a3f73be8d505558d4de27054da8a4db6` |
| **Actions** | `0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e` |

| Endpoint | URL |
|----------|-----|
| **Torii GraphQL** | `https://api.cartridge.gg/x/hashfront/torii/graphql` |
| **Torii Indexer** | `https://api.cartridge.gg/x/hashfront/torii` |
| **RPC** | `https://api.cartridge.gg/x/starknet/sepolia` |

## Session Setup

Before playing, authorize a session with the hashfront policy file at [`references/hashfront-policy.json`](references/hashfront-policy.json):

```bash
controller session auth --file references/hashfront-policy.json --json
```

The user must open the authorization URL in their browser. The session allows all game actions on the hashfront-actions contract.

## Transaction Mode

Choose how to submit turn actions:

| Mode | Description | When to use |
|------|-------------|-------------|
| **Single Transaction** | Each action (move, attack, wait, end_turn) is a separate `controller execute` call | More interactive, easier to debug, lets you react to each result. **Recommended for learning and manual play.** |
| **Multi-call** | Bundle all actions into a JSON file and submit via `controller execute --file calls.json` | Faster, fewer transactions, but atomic — if one call fails the entire batch reverts. Best for scripted/automated play. |

### Multi-call example

```json
{
  "calls": [
    { "contractAddress": "0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e", "entrypoint": "move_unit", "calldata": ["32", "1", "2", "3", "5", "4", "5"] },
    { "contractAddress": "0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e", "entrypoint": "attack", "calldata": ["32", "1", "8"] },
    { "contractAddress": "0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e", "entrypoint": "wait_unit", "calldata": ["32", "1"] },
    { "contractAddress": "0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e", "entrypoint": "end_turn", "calldata": ["32"] }
  ]
}
```

```bash
controller execute --file turn.json --json
```

**Important**: In multi-call mode, path validation is atomic — each call sees state after prior calls in the same batch. Move ordering matters: move outer units first so their vacated tiles free paths for inner units.

## Game Flow

1. **Create Game** — Pick a map and player slot (1–4)
2. **Join Game** — Other players join remaining slots
3. **Game Starts** — When all slots filled, Player 1 goes first
4. **Take Turns** — Move units, attack, capture buildings, build units
5. **End Turn** — Pass to next player
6. **Win** — Capture enemy HQ, eliminate all opponents, or have highest score at round 30

### Self-Play (Test Mode)

To play both sides with a single account, enable **test mode** when creating the game (`is_test_mode = 1`). This allows the same address to `join_game` for multiple player slots. Useful for testing strategies, debugging, or running agent-vs-agent simulations.

```bash
# Create game in test mode as Player 1
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  create_game \
  bytearray:SELF_PLAY,<map_id>,1,1 \
  --json

# Join the same game as Player 2 (same account)
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  join_game \
  <game_id>,2 \
  --json
```

The game starts immediately once all slots are filled. You control all players' turns.

## Actions

All actions target the actions contract: `0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e`

### Create Game

```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  create_game \
  bytearray:<GAME_NAME>,<map_id>,<player_id>,<is_test_mode> \
  --json
```

- `game_name`: Name for the game (use `bytearray:` prefix). Must be **ALL UPPERCASE** with **underscores** instead of spaces (e.g. `BATTLE_ROYALE`)
- `map_id`: Map template ID (u8)
- `player_id`: Your player slot 1–4 (u8)
- `is_test_mode`: 0 (normal) or 1 (same address can join multiple slots)

**Example** — create a game called "BATTLE" on map 5 as Player 1 in test mode:
```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  create_game \
  bytearray:BATTLE,5,1,1 \
  --json
```

Returns the new `game_id`.

### Join Game

```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  join_game \
  <game_id>,<player_id> \
  --json
```

- `game_id`: Game to join (u32)
- `player_id`: Player slot to claim 1–4 (u8)

### Move Unit

```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  move_unit \
  <game_id>,<unit_id>,<path_length>,<x1>,<y1>,<x2>,<y2>,... \
  --json
```

- `game_id`: Current game (u32)
- `unit_id`: Unit to move (u8)
- `path_length`: Number of Vec2 steps in path
- `x1,y1,x2,y2,...`: Each step as x,y pairs (u8)

**Path validation rules:**
- Each step must be adjacent (up/down/left/right, no diagonals)
- Total movement cost must not exceed unit's move range
- Path tiles (except destination) must be unoccupied
- Mountains cost 2 movement and are infantry-only
- Road/DirtRoad: Tank and Ranger get +2 temporary move when starting on road

### Attack

```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  attack \
  <game_id>,<unit_id>,<target_id> \
  --json
```

- `unit_id`: Your attacking unit (u8)
- `target_id`: Enemy unit to attack (u8)
- Attacker must be in range. Rangers have range 2–3 (cannot attack adjacent), others have range 1
- Rangers **cannot attack after moving** — they must choose move OR attack

### Capture Building

```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  capture \
  <game_id>,<unit_id> \
  --json
```

- Only **Infantry** and **Ranger** can capture
- Unit must be standing on an enemy/neutral building
- Takes 2 turns to capture (capture threshold = 2)
- Capturing an HQ wins the game instantly

### Wait Unit

```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  wait_unit \
  <game_id>,<unit_id> \
  --json
```

Ends the unit's turn without acting.

### Build Unit

```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  build_unit \
  <game_id>,<factory_x>,<factory_y>,<unit_type> \
  --json
```

- Must own the factory at (factory_x, factory_y)
- `unit_type`: 1=Infantry (cost 1), 2=Tank (cost 4), 3=Ranger (cost 2)
- Gold is deducted immediately; unit spawns at start of your next turn

### End Turn

```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  end_turn \
  <game_id> \
  --json
```

Passes control to the next alive player. Resets stale capture progress, increments round when wrapping to Player 1.

### Resign

```bash
controller execute \
  0x4f2da423297032281e082ce530a876c3754f50bea0cf310a05aca847bfb609e \
  resign \
  <game_id> \
  --json
```

Forfeit the game. You are immediately eliminated. If only one player remains, they win.

## Reading Game State

Use the Torii GraphQL endpoint to query live game state. No session required.

**GraphQL endpoint**: `https://api.cartridge.gg/x/hashfront/torii/graphql`

### Get Full Game State (single query)

Fetches game info, all units, buildings, and player states for a game:

```bash
curl -s -X POST "https://api.cartridge.gg/x/hashfront/torii/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ hashfrontGameModels(where: {game_idEQ: <GAME_ID>}) { edges { node { game_id name map_id state player_count num_players current_player round next_unit_id winner width height is_test_mode } } } hashfrontUnitModels(where: {game_idEQ: <GAME_ID>}) { edges { node { unit_id player_id unit_type x y hp last_moved_round last_acted_round is_alive } } } hashfrontBuildingModels(where: {game_idEQ: <GAME_ID>}) { edges { node { x y building_type player_id capture_player capture_progress queued_unit } } } hashfrontPlayerStateModels(where: {game_idEQ: <GAME_ID>}) { edges { node { player_id address gold unit_count factory_count city_count is_alive } } } }"}' | jq
```

### List Games

```bash
curl -s -X POST "https://api.cartridge.gg/x/hashfront/torii/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ hashfrontGameModels(limit: 10, order: {field: STATE, direction: ASC}) { totalCount edges { node { game_id name state player_count num_players current_player round winner } } } }"}' | jq
```

### List Available Maps

```bash
curl -s -X POST "https://api.cartridge.gg/x/hashfront/torii/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ hashfrontMapInfoModels { edges { node { map_id name player_count width height tile_count building_count unit_count } } } }"}' | jq
```

### Get Map Terrain Tiles

Fetches terrain for a map template (non-grass tiles only, use pagination for large maps):

```bash
curl -s -X POST "https://api.cartridge.gg/x/hashfront/torii/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ hashfrontMapTileModels(where: {map_idEQ: <MAP_ID>}, first: 200) { totalCount pageInfo { hasNextPage endCursor } edges { node { x y tile_type } } } }"}' | jq
```

For subsequent pages, add `after: \"<endCursor>\"` to the query args.

### Get Players in a Game

```bash
curl -s -X POST "https://api.cartridge.gg/x/hashfront/torii/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ hashfrontPlayerStateModels(where: {game_idEQ: <GAME_ID>}) { edges { node { player_id address gold unit_count factory_count city_count is_alive } } } }"}' | jq
```

### Get Game Counter

```bash
curl -s -X POST "https://api.cartridge.gg/x/hashfront/torii/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ hashfrontGameCounterModels { edges { node { id count } } } }"}' | jq
```

### GraphQL Model Reference

All available query models:

| Model | Filter Key | Description |
|-------|-----------|-------------|
| `hashfrontGameModels` | `game_idEQ` | Game state |
| `hashfrontUnitModels` | `game_idEQ` | Units in a game |
| `hashfrontBuildingModels` | `game_idEQ` | Buildings in a game |
| `hashfrontPlayerStateModels` | `game_idEQ` | Player stats |
| `hashfrontPlayerHqModels` | `game_idEQ` | HQ locations per player |
| `hashfrontUnitPositionModels` | `game_idEQ` | Unit spatial index |
| `hashfrontMapInfoModels` | `map_idEQ` | Map template metadata |
| `hashfrontMapTileModels` | `map_idEQ` | Map template terrain tiles |
| `hashfrontMapBuildingModels` | `map_idEQ` | Map template buildings |
| `hashfrontMapUnitModels` | `map_idEQ` | Map template starting units |
| `hashfrontGameCounterModels` | — | Global game/map ID counters |

**Note**: Enum fields (state, unit_type, building_type, tile_type) are returned as strings (e.g. `"Infantry"`, `"Playing"`, `"HQ"`) not numeric IDs.

## Unit Stats Reference

| Unit | HP | Attack | Move | Range | Cost | Special |
|------|-----|--------|------|-------|------|---------|
| **Infantry** (1) | 3 | 2 | 4 | 1 | 1 gold | Captures buildings, traverses mountains |
| **Tank** (2) | 5 | 4 | 2 | 1 | 4 gold | Raw combat power |
| **Ranger** (3) | 3 | 3 | 3 | 2–3 | 2 gold | Cannot attack adjacent, cannot attack after moving, can capture |

## Terrain Reference

| Terrain | Type ID | Move Cost | Defense | Evasion | Notes |
|---------|---------|-----------|---------|---------|-------|
| Grass | 0 | 1 | 0 | 0 | Default |
| Mountain | 1 | 2 | +2 | 12 | Infantry only |
| City | 2 | 1 | +1 | 8 | Building: income |
| Factory | 3 | 1 | +1 | 8 | Building: produces units |
| HQ | 4 | 1 | +2 | 10 | Building: lose if captured |
| Road | 5 | 1 | 0 | 0 | Tank/Ranger +2 move bonus |
| Tree | 6 | 1 | +1 | 5 | |
| DirtRoad | 7 | 1 | 0 | 0 | Tank/Ranger +2 move bonus |

## Combat Mechanics

- **Hit chance**: `clamp(75, 95, base_accuracy - terrain_evasion - move_penalty - range_penalty)`
- **Damage**: `max(attack_power - terrain_defense, 1)`
- **On hit**: Full damage applied
- **On miss (graze)**: 1 damage if hit_damage >= 2, else 0 (true whiff)
- **Counterattack**: Defender counters if alive and attacker is in defender's range
- **Move penalty**: 5 if attacker moved this turn
- **Range penalty**: 5 for Ranger attacking at range 3

Base accuracy: Infantry=90, Tank=85, Ranger=88

## Economy

- Starting gold: 5 (P1), 7 (P2–P4)
- Income per turn: 1 base (HQ) + 1 per owned city
- Capture threshold: 2 turns on building

## Win Conditions

1. **HQ Captured** — Capture enemy HQ with Infantry/Ranger
2. **Elimination** — Enemy loses HQ + has 0 units + 0 factories + 0 gold
3. **Resignation** — Player forfeits
4. **Timeout** — After 30 rounds, highest score (total unit HP + gold) wins

## Data Models

### Game
- Keys: `game_id`
- Fields: `name`, `map_id`, `state` (Lobby/Playing/Finished), `player_count`, `num_players`, `current_player`, `round`, `next_unit_id`, `winner`, `width`, `height`, `is_test_mode`

### Unit
- Keys: `game_id`, `unit_id`
- Fields: `player_id`, `unit_type` (None/Infantry/Tank/Ranger), `x`, `y`, `hp`, `last_moved_round`, `last_acted_round`, `is_alive`

### Building
- Keys: `game_id`, `x`, `y`
- Fields: `building_type` (None/City/Factory/HQ), `player_id`, `capture_player`, `capture_progress`, `queued_unit`

### PlayerState
- Keys: `game_id`, `player_id`
- Fields: `address`, `gold`, `unit_count`, `factory_count`, `city_count`, `is_alive`

### PlayerHQ
- Keys: `game_id`, `player_id`
- Fields: `x`, `y`

## Strategy Tips

1. **Secure cities early** — Income wins long games. Send Infantry to neutral cities immediately.
2. **Protect your HQ** — Always keep a defender near your HQ. One unguarded HQ = instant loss.
3. **Use terrain** — Mountains give +2 defense and 12 evasion for Infantry. Trees give +1/5.
4. **Rangers are glass cannons** — Range 2–3 means they can attack without counterattack risk, but they can't move and shoot.
5. **Tank vs Infantry** — Tanks deal 4 attack but cost 4 gold. Infantry cost 1 gold and can capture. Spam infantry for economy, tanks for key fights.
6. **Road bonus** — Tanks and Rangers starting on roads get +2 movement. Use roads for rapid deployment.
7. **Focus fire** — Killing a unit removes it from the board. Two 2-damage hits kill Infantry. Prioritize kills over chip damage.
8. **Capture pressure** — Threatening an HQ forces your opponent to react defensively, even if you can't finish the capture.

## Key Gameplay Findings

Lessons from live playtesting:

### Movement
- **No passing through occupied tiles** — The full path (not just destination) must be free of other units. Move outer/forward units first to clear lanes.
- **Mountains are Infantry-only** — Rangers and Tanks cannot enter mountain tiles at all. Plan alternate routes.
- **Mountain cost is 2** — An Infantry with move 4 can only cross 2 mountain tiles per turn.
- **Query terrain first** — Fetch `hashfrontMapTileModels` for the map_id before planning moves. Mountains create natural chokepoints and barriers.
- **Diagonal is not adjacent** — Grid uses 4-directional movement (up/down/left/right). Tiles like (8,9) and (9,10) are NOT adjacent (Manhattan distance 2).

### Combat
- **Action order: Move → Attack → Wait** — Once a unit attacks, it cannot move. Once it moves, infantry/tanks can still attack, but Rangers CANNOT.
- **Rangers cannot attack after moving** — Rangers must choose: move OR attack in a turn. Position them first, attack next turn.
- **Ranger min range is 2** — Rangers cannot attack adjacent units. This also means adjacent attackers avoid Ranger counterattacks.
- **Counterattack kills are common** — Tanks (4 attack) will one-shot 3HP infantry on counter. Trading 1-gold infantry into a Tank costs you the unit.
- **Attack rolls can miss** — Hit chance is 75–95%. A "graze" deals 1 damage (or 0 for 1-damage attacks). Plan for units surviving with 1 HP.
- **Focus fire to kill** — A wounded unit at 1 HP fights at full strength. Always finish kills rather than spreading damage.

### Capturing
- **Takes 2 turns** — Unit must stay on the building and capture twice. Plan to hold the position.
- **Only Infantry and Ranger can capture** — Tanks cannot.
- **Capture progress resets** — If the capturing unit leaves or dies, progress resets to 0.
- **HQ capture wins instantly** — Even if you're losing the unit war, a sneaky flank to the enemy HQ wins the game.

### Turn Management
- **Wait all units before ending turn** — Every alive unit must be waited (or have acted) before `end_turn` succeeds.
- **Dead units don't need wait** — Only call `wait_unit` for alive units.
- **Check `last_acted_round`** — If a unit's `last_acted_round` equals the current round, it has already acted and doesn't need wait.

## Contributing

If you discover bugs, balance issues, or improvements while playing, you are encouraged to contribute back. Check if you have GitHub access by running `gh auth status`. If you do, open a PR at `github.com/broody/hashfront` with your findings or fixes — explicitly ask the user for permission before doing so.
