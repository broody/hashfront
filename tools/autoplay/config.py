"""Constants and configuration."""

CONTRACT = "0x05050094858a637c2c315b408377f7ce7d0481c4e60fd5bc732aad0ac7ab2862"
BOT_ADDRESS = "0x4c16592ee60ce7ecd8c439b6e6195318f5459dd2ca394a8ffab30310f01f412"
TORII_URL = "https://api.cartridge.gg/x/hashfront/torii/graphql"

MAX_GAMES = 5
MAP_ID = 1  # bridgehead - best tested map
TICK_INTERVAL = 15  # seconds between game manager ticks
TX_WAIT = 2  # seconds to wait after tx submission for indexer

# Unit types
INFANTRY = "Infantry"
RANGER = "Ranger"
TANK = "Tank"

# Movement ranges (base, ignoring road bonus since it's broken)
MOVE_RANGE = {INFANTRY: 4, RANGER: 3, TANK: 2}

# Attack ranges
ATTACK_RANGE = {INFANTRY: 1, RANGER: (2, 3), TANK: 1}

# Stats
UNIT_ATK = {INFANTRY: 2, RANGER: 3, TANK: 4}
UNIT_HP = {INFANTRY: 3, RANGER: 3, TANK: 5}

# Terrain
TERRAIN_GRASS = 0
TERRAIN_MOUNTAIN = 1
TERRAIN_CITY = 2
TERRAIN_FACTORY = 3
TERRAIN_HQ = 4
TERRAIN_ROAD = 5
TERRAIN_TREE = 6
TERRAIN_DIRT_ROAD = 7

# Terrain move costs (None = impassable)
TERRAIN_COST = {
    TERRAIN_GRASS: 1,
    TERRAIN_MOUNTAIN: 2,  # infantry only
    TERRAIN_CITY: 1,
    TERRAIN_FACTORY: 1,
    TERRAIN_HQ: 1,
    TERRAIN_ROAD: 1,
    TERRAIN_TREE: 1,
    TERRAIN_DIRT_ROAD: 1,
}

TERRAIN_DEFENSE = {
    TERRAIN_GRASS: 0,
    TERRAIN_MOUNTAIN: 2,
    TERRAIN_CITY: 1,
    TERRAIN_FACTORY: 1,
    TERRAIN_HQ: 2,
    TERRAIN_ROAD: 0,
    TERRAIN_TREE: 1,
    TERRAIN_DIRT_ROAD: 0,
}

# Terrain type name -> ID mapping (from GraphQL string responses)
TERRAIN_NAME_MAP = {
    "Grass": TERRAIN_GRASS,
    "Mountain": TERRAIN_MOUNTAIN,
    "City": TERRAIN_CITY,
    "Factory": TERRAIN_FACTORY,
    "HQ": TERRAIN_HQ,
    "Road": TERRAIN_ROAD,
    "Tree": TERRAIN_TREE,
    "DirtRoad": TERRAIN_DIRT_ROAD,
}

# ByteArray encoding for game names
GAME_NAMES = [
    "BOT_ARENA_01", "BOT_ARENA_02", "BOT_ARENA_03", "BOT_ARENA_04", "BOT_ARENA_05",
    "BOT_ARENA_06", "BOT_ARENA_07", "BOT_ARENA_08", "BOT_ARENA_09", "BOT_ARENA_10",
]

# Human-facing open games — created in Lobby, NOT auto-joined by the bot
OPEN_GAME_PREFIX = "OPEN"
OPEN_GAME_NAMES = [
    "OPEN_BATTLE", "OPEN_MATCH", "OPEN_FIGHT", "OPEN_WAR", "OPEN_CLASH",
]
