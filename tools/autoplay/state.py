"""Game state reading from Torii GraphQL."""

import json
import urllib.request
import logging
from dataclasses import dataclass, field
from typing import Optional

from config import TORII_URL, TERRAIN_NAME_MAP, TERRAIN_GRASS

log = logging.getLogger("state")


@dataclass
class Unit:
    unit_id: int
    player_id: int
    unit_type: str
    x: int
    y: int
    hp: int
    is_alive: bool
    last_moved_round: int = 0
    last_acted_round: int = 0


@dataclass
class Building:
    x: int
    y: int
    building_type: str
    player_id: int
    capture_progress: int = 0


@dataclass
class GameInfo:
    game_id: int
    name: str
    state: str
    current_player: int
    round: int
    map_id: int
    winner: int = 0
    player_count: int = 2


@dataclass
class GameState:
    info: GameInfo
    units: list  # List[Unit]
    buildings: list  # List[Building]
    grid: list = field(default_factory=list)  # 20x20 terrain grid

    def alive_units(self, player_id: int) -> list:
        return [u for u in self.units if u.player_id == player_id and u.is_alive]

    def enemy_units(self, player_id: int) -> list:
        return [u for u in self.units if u.player_id != player_id and u.is_alive]

    def get_hq(self, player_id: int) -> Optional[tuple]:
        for b in self.buildings:
            if b.building_type == "HQ" and b.player_id == player_id:
                return (b.x, b.y)
        return None

    def occupied_positions(self) -> set:
        return {(u.x, u.y) for u in self.units if u.is_alive}


def fetch_game_turn(game_id: int) -> tuple:
    """Lightweight poll: returns (current_player, round, state) without fetching units."""
    result = graphql(f"""{{
        hashfrontGameModels(where: {{game_idEQ: {game_id}}}) {{
            edges {{ node {{ current_player round state }} }}
        }}
    }}""")
    edges = result["data"]["hashfrontGameModels"]["edges"]
    if not edges:
        return (0, 0, "Unknown")
    n = edges[0]["node"]
    return (n["current_player"], n["round"], n["state"])


def graphql(query: str) -> dict:
    """Execute a GraphQL query against Torii."""
    data = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        TORII_URL,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


# Cache map terrain per map_id
_terrain_cache: dict = {}


def fetch_terrain(map_id: int, width: int = 20, height: int = 20) -> list:
    """Fetch and cache terrain grid for a map. Returns grid[y][x] = terrain_type."""
    if map_id in _terrain_cache:
        return _terrain_cache[map_id]

    # Initialize all grass
    grid = [[TERRAIN_GRASS] * width for _ in range(height)]

    # Fetch non-grass tiles (paginated)
    cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        result = graphql(f"""{{
            hashfrontMapTileModels(where: {{map_idEQ: {map_id}}}, first: 200{after}) {{
                totalCount
                pageInfo {{ hasNextPage endCursor }}
                edges {{ node {{ x y tile_type }} }}
            }}
        }}""")
        edges = result["data"]["hashfrontMapTileModels"]["edges"]
        for edge in edges:
            node = edge["node"]
            x, y = node["x"], node["y"]
            terrain_name = node["tile_type"]
            grid[y][x] = TERRAIN_NAME_MAP.get(terrain_name, TERRAIN_GRASS)

        page_info = result["data"]["hashfrontMapTileModels"]["pageInfo"]
        if not page_info["hasNextPage"]:
            break
        cursor = page_info["endCursor"]

    _terrain_cache[map_id] = grid
    log.info(f"Cached terrain for map {map_id}: {sum(1 for row in grid for c in row if c != TERRAIN_GRASS)} non-grass tiles")
    return grid


def fetch_game_state(game_id: int) -> GameState:
    """Fetch full game state from Torii."""
    result = graphql(f"""{{
        hashfrontGameModels(where: {{game_idEQ: {game_id}}}) {{
            edges {{ node {{
                game_id name state current_player round map_id winner player_count
            }} }}
        }}
        hashfrontUnitModels(where: {{game_idEQ: {game_id}}}, first: 50) {{
            edges {{ node {{
                unit_id player_id unit_type x y hp is_alive last_moved_round last_acted_round
            }} }}
        }}
        hashfrontBuildingModels(where: {{game_idEQ: {game_id}}}, first: 20) {{
            edges {{ node {{
                x y building_type player_id capture_progress
            }} }}
        }}
    }}""")

    game_node = result["data"]["hashfrontGameModels"]["edges"][0]["node"]
    info = GameInfo(
        game_id=game_node["game_id"],
        name=game_node["name"],
        state=game_node["state"],
        current_player=game_node["current_player"],
        round=game_node["round"],
        map_id=game_node["map_id"],
        winner=game_node.get("winner", 0),
        player_count=game_node.get("player_count", 2),
    )

    units = []
    for edge in result["data"]["hashfrontUnitModels"]["edges"]:
        n = edge["node"]
        units.append(Unit(
            unit_id=n["unit_id"], player_id=n["player_id"],
            unit_type=n["unit_type"], x=n["x"], y=n["y"],
            hp=n["hp"], is_alive=n["is_alive"],
            last_moved_round=n.get("last_moved_round", 0),
            last_acted_round=n.get("last_acted_round", 0),
        ))

    buildings = []
    for edge in result["data"]["hashfrontBuildingModels"]["edges"]:
        n = edge["node"]
        buildings.append(Building(
            x=n["x"], y=n["y"],
            building_type=n["building_type"],
            player_id=n["player_id"],
            capture_progress=n.get("capture_progress", 0),
        ))

    grid = fetch_terrain(info.map_id)

    return GameState(info=info, units=units, buildings=buildings, grid=grid)


def fetch_game_counter() -> int:
    """Get current game counter (next game_id will be counter + 1)."""
    result = graphql("""{ hashfrontGameCounterModels { edges { node { count } } } }""")
    edges = result["data"]["hashfrontGameCounterModels"]["edges"]
    if edges:
        return edges[0]["node"]["count"]
    return 0


def fetch_player_states(game_id: int) -> list:
    """Fetch player states for a game. Returns list of (player_id, address)."""
    result = graphql('{hashfrontPlayerStateModels(where:{game_idEQ:%d}, first:10){edges{node{player_id address}}}}' % game_id)
    players = []
    for edge in result["data"]["hashfrontPlayerStateModels"]["edges"]:
        n = edge["node"]
        players.append((n["player_id"], n["address"]))
    return players


def fetch_map_ids() -> list:
    """Fetch all available map IDs, deduped by name (keeps highest map_id per name)."""
    result = graphql("""{
        hashfrontMapInfoModels(first: 50) {
            edges { node { map_id name } }
        }
    }""")
    by_name = {}
    for edge in result["data"]["hashfrontMapInfoModels"]["edges"]:
        n = edge["node"]
        name = n["name"]
        mid = n["map_id"]
        if name not in by_name or mid > by_name[name]:
            by_name[name] = mid
    return list(by_name.values())


def fetch_all_games() -> list:
    """Fetch all games (any state)."""
    result = graphql("""{
        hashfrontGameModels(first: 50, order: {field: GAME_ID, direction: DESC}) {
            edges { node { game_id name state current_player round map_id winner } }
        }
    }""")
    games = []
    for edge in result["data"]["hashfrontGameModels"]["edges"]:
        n = edge["node"]
        games.append(GameInfo(
            game_id=n["game_id"], name=n["name"], state=n["state"],
            current_player=n["current_player"], round=n["round"],
            map_id=n["map_id"], winner=n.get("winner", 0),
        ))
    return games


def fetch_active_games() -> list:
    """List all games in Playing state."""
    return [g for g in fetch_all_games() if g.state == "Playing"]
