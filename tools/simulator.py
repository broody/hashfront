#!/usr/bin/env python3
"""
Hashfront Headless Game Simulator

Loads real maps from contracts/scripts/maps/, uses contract-accurate combat,
and renders ASCII battle replays.

Usage:
    python3 tools/simulator.py                         # 100 games per matchup
    python3 tools/simulator.py --games 500             # 500 games
    python3 tools/simulator.py --map bridgehead        # specific map
    python3 tools/simulator.py --verbose               # per-game logs
    python3 tools/simulator.py --replay                # ASCII replay of first game
    python3 tools/simulator.py --strategies aggressive balanced
"""

import argparse
import collections
import os
import random
import sys
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Optional, List, Dict, Tuple

# ============================================================================
# Constants — matched to contracts/src/consts.cairo + unit_stats.cairo
# ============================================================================

CAPTURE_THRESHOLD = 2
MAX_ROUNDS = 30
MAPS_DIR = os.path.join(os.path.dirname(__file__), "..", "contracts", "scripts", "maps")

class TileType(Enum):
    GRASS = "."
    ROAD = "R"
    DIRT_ROAD = "D"
    TREE = "T"
    MOUNTAIN = "M"
    HQ = "H"
    CITY = "C"
    FACTORY = "F"

# Terrain char mapping from map files
TILE_CHAR = {
    ".": TileType.GRASS,
    "R": TileType.ROAD,
    "D": TileType.DIRT_ROAD,
    "T": TileType.TREE,
    "M": TileType.MOUNTAIN,
    "H": TileType.HQ,
    "C": TileType.CITY,
    "F": TileType.FACTORY,
}

class UnitType(Enum):
    INFANTRY = 1
    TANK = 2
    RANGER = 3

# Contract-accurate stats
UNIT_HP =    {UnitType.INFANTRY: 3, UnitType.TANK: 5, UnitType.RANGER: 3}
UNIT_ATK =   {UnitType.INFANTRY: 2, UnitType.TANK: 4, UnitType.RANGER: 3}
UNIT_MOVE =  {UnitType.INFANTRY: 4, UnitType.TANK: 2, UnitType.RANGER: 3}
UNIT_MIN_RANGE = {UnitType.INFANTRY: 1, UnitType.TANK: 1, UnitType.RANGER: 2}
UNIT_MAX_RANGE = {UnitType.INFANTRY: 1, UnitType.TANK: 1, UnitType.RANGER: 3}
UNIT_ACCURACY =  {UnitType.INFANTRY: 90, UnitType.TANK: 85, UnitType.RANGER: 88}

MOVE_COST = {
    TileType.GRASS: 1, TileType.ROAD: 1, TileType.DIRT_ROAD: 1,
    TileType.TREE: 1, TileType.MOUNTAIN: 2, TileType.HQ: 1,
    TileType.CITY: 1, TileType.FACTORY: 1,
}
DEFENSE_BONUS = {
    TileType.GRASS: 0, TileType.ROAD: 0, TileType.DIRT_ROAD: 0,
    TileType.TREE: 1, TileType.MOUNTAIN: 2, TileType.HQ: 2,
    TileType.CITY: 1, TileType.FACTORY: 1,
}
TERRAIN_EVASION = {
    TileType.GRASS: 0, TileType.ROAD: 0, TileType.DIRT_ROAD: 0,
    TileType.TREE: 5, TileType.MOUNTAIN: 12, TileType.HQ: 10,
    TileType.CITY: 8, TileType.FACTORY: 8,
}

ROAD_TILES = {TileType.ROAD, TileType.DIRT_ROAD}

def gets_road_bonus(ut: UnitType) -> bool:
    return ut in (UnitType.TANK, UnitType.RANGER)

def can_traverse(ut: UnitType, tile: TileType) -> bool:
    if tile == TileType.MOUNTAIN:
        return ut == UnitType.INFANTRY
    return True

def can_capture(ut: UnitType) -> bool:
    return ut in (UnitType.INFANTRY, UnitType.RANGER)

# ============================================================================
# Data structures
# ============================================================================

@dataclass
class Unit:
    uid: int
    unit_type: UnitType
    player: int  # 1 or 2
    x: int
    y: int
    hp: int
    has_moved: bool = False
    has_acted: bool = False

    @property
    def alive(self): return self.hp > 0

@dataclass
class Building:
    x: int
    y: int
    owner: int
    building_type: str  # "hq"
    capture_player: int = 0
    capture_progress: int = 0

@dataclass
class GameState:
    width: int
    height: int
    terrain: List[List[TileType]]
    units: List[Unit]
    buildings: List[Building]
    current_player: int = 1
    round_num: int = 1
    winner: Optional[int] = None
    _next_uid: int = 0
    map_name: str = ""

    def next_uid(self):
        self._next_uid += 1
        return self._next_uid

    def tile_at(self, x, y) -> Optional[TileType]:
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.terrain[y][x]
        return None

    def unit_at(self, x, y) -> Optional[Unit]:
        for u in self.units:
            if u.alive and u.x == x and u.y == y:
                return u
        return None

    def player_units(self, player) -> List[Unit]:
        return [u for u in self.units if u.alive and u.player == player]

    def enemy_units(self, player) -> List[Unit]:
        return [u for u in self.units if u.alive and u.player != player]

    def player_hq(self, player) -> Optional[Building]:
        for b in self.buildings:
            if b.owner == player and b.building_type == "hq":
                return b
        return None

    def other_player(self, p): return 2 if p == 1 else 1

# ============================================================================
# Map loading
# ============================================================================

def list_maps() -> List[str]:
    """List available map names."""
    maps = []
    for d in sorted(os.listdir(MAPS_DIR)):
        if d.startswith("_"):
            continue
        terrain_path = os.path.join(MAPS_DIR, d, "terrain.txt")
        if os.path.isfile(terrain_path):
            maps.append(d)
    return maps

def load_map(name: str) -> GameState:
    """Load a map from contracts/scripts/maps/<name>/."""
    base = os.path.join(MAPS_DIR, name)
    # Terrain
    with open(os.path.join(base, "terrain.txt")) as f:
        rows = []
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            cells = line.split()
            rows.append([TILE_CHAR.get(c, TileType.GRASS) for c in cells])
    height = len(rows)
    width = len(rows[0]) if rows else 0

    # Buildings
    buildings = []
    bpath = os.path.join(base, "buildings.txt")
    if os.path.isfile(bpath):
        with open(bpath) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split()
                btype = parts[0].lower()
                owner = int(parts[1])
                bx, by = int(parts[2]), int(parts[3])
                buildings.append(Building(x=bx, y=by, owner=owner, building_type=btype))
                # Mark terrain
                if 0 <= by < height and 0 <= bx < width:
                    if btype == "hq":
                        rows[by][bx] = TileType.HQ

    # Units
    units = []
    uid = 0
    upath = os.path.join(base, "units.txt")
    if os.path.isfile(upath):
        with open(upath) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split()
                ut_name = parts[0]
                player = int(parts[1])
                ux, uy = int(parts[2]), int(parts[3])
                ut = UnitType[ut_name.upper()]
                uid += 1
                units.append(Unit(uid=uid, unit_type=ut, player=player,
                                  x=ux, y=uy, hp=UNIT_HP[ut]))

    return GameState(width=width, height=height, terrain=rows,
                     units=units, buildings=buildings, _next_uid=uid,
                     map_name=name)

# ============================================================================
# ASCII renderer
# ============================================================================

TILE_DISPLAY = {
    TileType.GRASS: "·", TileType.ROAD: "═", TileType.DIRT_ROAD: "─",
    TileType.TREE: "♣", TileType.MOUNTAIN: "▲", TileType.HQ: "★",
    TileType.CITY: "◆", TileType.FACTORY: "⚙",
}
UNIT_DISPLAY = {
    (UnitType.INFANTRY, 1): "\033[94mI\033[0m",  # blue
    (UnitType.INFANTRY, 2): "\033[91mI\033[0m",  # red
    (UnitType.TANK, 1): "\033[94mT\033[0m",
    (UnitType.TANK, 2): "\033[91mT\033[0m",
    (UnitType.RANGER, 1): "\033[94mR\033[0m",
    (UnitType.RANGER, 2): "\033[91mR\033[0m",
}

def render_map(state: GameState, show_hp=True) -> str:
    """Render the game state as colored ASCII art."""
    lines = []
    # Header
    lines.append(f"  Map: {state.map_name}  Round: {state.round_num}  Turn: P{state.current_player}")
    p1u = state.player_units(1)
    p2u = state.player_units(2)
    lines.append(f"  \033[94mP1: {len(p1u)} units ({sum(u.hp for u in p1u)} HP)\033[0m  "
                 f"\033[91mP2: {len(p2u)} units ({sum(u.hp for u in p2u)} HP)\033[0m")
    lines.append("")

    # Column numbers
    col_nums = "   " + "".join(f"{x:2d}" for x in range(state.width))
    lines.append(col_nums)

    for y in range(state.height):
        row = f"{y:2d} "
        for x in range(state.width):
            unit = state.unit_at(x, y)
            if unit:
                sym = UNIT_DISPLAY.get((unit.unit_type, unit.player), "?")
                if show_hp and unit.hp < UNIT_HP[unit.unit_type]:
                    # Show damaged units with hp suffix
                    row += sym + str(unit.hp)
                else:
                    row += sym + " "
            else:
                tile = state.tile_at(x, y)
                # Check if building here
                is_hq = any(b.x == x and b.y == y and b.building_type == "hq" for b in state.buildings)
                if is_hq:
                    owner = next((b.owner for b in state.buildings if b.x == x and b.y == y), 0)
                    if owner == 1:
                        row += "\033[94m★\033[0m "
                    elif owner == 2:
                        row += "\033[91m★\033[0m "
                    else:
                        row += "★ "
                else:
                    row += TILE_DISPLAY.get(tile, "?") + " "
        lines.append(row)

    lines.append("")
    # Legend
    lines.append("  ·=grass ═=road ─=dirt ♣=tree ▲=mountain ★=HQ  "
                 "\033[94mBlue=P1\033[0m \033[91mRed=P2\033[0m  I=Infantry T=Tank R=Ranger")
    return "\n".join(lines)

# ============================================================================
# Combat — exact contract logic
# ============================================================================

def manhattan(x1, y1, x2, y2):
    return abs(x1 - x2) + abs(y1 - y2)

def compute_hit_chance(attacker_type: UnitType, def_tile: TileType,
                       moved: bool, distance: int) -> int:
    """Returns hit chance 75-95 (roll <= this = hit)."""
    chance = UNIT_ACCURACY[attacker_type]
    chance -= TERRAIN_EVASION[def_tile]
    if moved:
        chance -= 5
    if attacker_type == UnitType.RANGER and distance == 3:
        chance -= 5
    return max(75, min(95, chance))

def resolve_strike(rng: random.Random, atk_type: UnitType, def_tile: TileType,
                   moved: bool, distance: int) -> int:
    """Resolve a single strike. Returns damage dealt."""
    atk = UNIT_ATK[atk_type]
    defense = DEFENSE_BONUS[def_tile]
    hit_dmg = max(atk - defense, 1)
    hit_ch = compute_hit_chance(atk_type, def_tile, moved, distance)
    roll = rng.randint(1, 100)
    if roll <= hit_ch:
        return hit_dmg  # Hit
    elif hit_dmg >= 2:
        return 1  # Graze
    else:
        return 0  # Whiff

def resolve_combat(rng: random.Random, attacker: Unit, defender: Unit,
                   atk_tile: TileType, def_tile: TileType,
                   distance: int, attacker_moved: bool) -> Tuple[int, int]:
    """Contract-accurate combat. Returns (dmg_to_defender, dmg_to_attacker)."""
    dmg_to_def = resolve_strike(rng, attacker.unit_type, def_tile,
                                attacker_moved, distance)
    dmg_to_atk = 0
    defender_survives = defender.hp > dmg_to_def
    if defender_survives:
        d_min = UNIT_MIN_RANGE[defender.unit_type]
        d_max = UNIT_MAX_RANGE[defender.unit_type]
        if d_min <= distance <= d_max:
            dmg_to_atk = resolve_strike(rng, defender.unit_type, atk_tile,
                                        False, distance)
    return dmg_to_def, dmg_to_atk

# ============================================================================
# Movement — Dijkstra with road bonus (contract-accurate)
# ============================================================================

def reachable_tiles(state: GameState, unit: Unit,
                    occupied: set = None) -> Dict[Tuple[int,int], int]:
    """Dijkstra BFS. Returns {(x,y): cost}. Matches contract move logic."""
    base_move = UNIT_MOVE[unit.unit_type]
    start_tile = state.tile_at(unit.x, unit.y)

    # Road bonus: +2 if unit gets_road_bonus and starts on road
    road_bonus = 0
    if gets_road_bonus(unit.unit_type) and start_tile in ROAD_TILES:
        road_bonus = 2
    total_budget = base_move + road_bonus

    # Dijkstra: state = (cost, road_bonus_remaining, x, y)
    reached = {}  # (x,y) -> min cost
    heap = [(0, road_bonus, unit.x, unit.y)]
    visited = set()
    if occupied is None:
        occupied = set()

    import heapq
    while heap:
        cost, rb, cx, cy = heapq.heappop(heap)
        if (cx, cy) in visited:
            continue
        visited.add((cx, cy))
        if (cx, cy) != (unit.x, unit.y):
            reached[(cx, cy)] = cost

        for dx, dy in [(0,1),(0,-1),(1,0),(-1,0)]:
            nx, ny = cx+dx, cy+dy
            tile = state.tile_at(nx, ny)
            if tile is None:
                continue
            if not can_traverse(unit.unit_type, tile):
                continue
            # Can't move through other units
            occ = state.unit_at(nx, ny)
            if occ and occ.uid != unit.uid:
                continue
            if (nx, ny) in occupied:
                continue

            step_cost = MOVE_COST[tile]
            new_rb = rb
            if new_rb > 0 and tile in ROAD_TILES:
                spend = min(step_cost, new_rb)
                step_cost -= spend
                new_rb -= spend
            elif new_rb > 0 and tile not in ROAD_TILES:
                new_rb = 0

            new_cost = cost + step_cost
            if new_cost > total_budget:
                continue
            if (nx, ny) not in visited:
                heapq.heappush(heap, (new_cost, new_rb, nx, ny))

    return reached

def best_move_toward(state: GameState, unit: Unit, tx: int, ty: int,
                     occupied: set = None) -> Optional[Tuple[int,int]]:
    """Find reachable tile closest to target."""
    tiles = reachable_tiles(state, unit, occupied)
    if not tiles:
        return None
    if (tx, ty) in tiles:
        return (tx, ty)
    best = min(tiles.keys(), key=lambda p: manhattan(p[0], p[1], tx, ty))
    if manhattan(best[0], best[1], tx, ty) < manhattan(unit.x, unit.y, tx, ty):
        return best
    return None

# ============================================================================
# Game logic
# ============================================================================

def do_move(state: GameState, unit: Unit, tx: int, ty: int):
    """Move unit. Resets capture progress if leaving a building being captured."""
    # Reset capture if leaving
    if can_capture(unit.unit_type):
        for b in state.buildings:
            if b.x == unit.x and b.y == unit.y and b.capture_player == state.current_player and b.capture_progress > 0:
                b.capture_player = 0
                b.capture_progress = 0
    unit.x = tx
    unit.y = ty
    unit.has_moved = True

def do_attack(state: GameState, rng: random.Random, attacker: Unit, defender: Unit) -> Tuple[int, int]:
    dist = manhattan(attacker.x, attacker.y, defender.x, defender.y)
    atk_tile = state.tile_at(attacker.x, attacker.y)
    def_tile = state.tile_at(defender.x, defender.y)
    dmg_d, dmg_a = resolve_combat(rng, attacker, defender, atk_tile, def_tile,
                                   dist, attacker.has_moved)
    defender.hp -= dmg_d
    attacker.hp -= dmg_a
    attacker.has_acted = True
    # Check elimination
    enemy = state.other_player(attacker.player)
    if not state.player_units(enemy):
        state.winner = attacker.player
    if not state.player_units(attacker.player):
        state.winner = enemy
    return dmg_d, dmg_a

def do_capture(state: GameState, unit: Unit) -> bool:
    """Attempt capture. Returns True if building was captured."""
    if not can_capture(unit.unit_type):
        return False
    for b in state.buildings:
        if b.x == unit.x and b.y == unit.y and b.owner != unit.player:
            if b.capture_player != unit.player:
                b.capture_player = unit.player
                b.capture_progress = 1
            else:
                b.capture_progress += 1
            if b.capture_progress >= CAPTURE_THRESHOLD:
                old_owner = b.owner
                b.owner = unit.player
                b.capture_player = 0
                b.capture_progress = 0
                if b.building_type == "hq":
                    state.winner = unit.player
                return True
            unit.has_acted = True
            return False
    return False

def do_wait(unit: Unit):
    unit.has_moved = True
    unit.has_acted = True

def end_turn(state: GameState):
    """Advance turn. Check round limit."""
    if state.current_player == 1:
        state.current_player = 2
    else:
        state.current_player = 1
        state.round_num += 1

    # Reset flags
    for u in state.player_units(state.current_player):
        u.has_moved = False
        u.has_acted = False

    # Round limit
    if state.round_num > MAX_ROUNDS and state.winner is None:
        hp1 = sum(u.hp for u in state.player_units(1))
        hp2 = sum(u.hp for u in state.player_units(2))
        if hp1 > hp2:
            state.winner = 1
        elif hp2 > hp1:
            state.winner = 2
        else:
            # Tie: count units
            n1 = len(state.player_units(1))
            n2 = len(state.player_units(2))
            state.winner = 1 if n1 >= n2 else 2

# ============================================================================
# AI Strategies
# ============================================================================

def get_attack_targets(state: GameState, unit: Unit) -> List[Unit]:
    """Get units this unit can attack from current position."""
    if unit.unit_type == UnitType.RANGER and unit.has_moved:
        return []  # Rangers can't attack after moving
    mn = UNIT_MIN_RANGE[unit.unit_type]
    mx = UNIT_MAX_RANGE[unit.unit_type]
    targets = []
    for e in state.enemy_units(unit.player):
        d = manhattan(unit.x, unit.y, e.x, e.y)
        if mn <= d <= mx:
            targets.append(e)
    return targets

def expected_damage(atk_type: UnitType, def_tile: TileType,
                    moved: bool, distance: int) -> float:
    """Expected damage from one strike."""
    atk = UNIT_ATK[atk_type]
    defense = DEFENSE_BONUS[def_tile]
    hit_dmg = max(atk - defense, 1)
    hit_ch = compute_hit_chance(atk_type, def_tile, moved, distance) / 100.0
    graze = 1 if hit_dmg >= 2 else 0
    return hit_ch * hit_dmg + (1 - hit_ch) * graze

def pick_target(state: GameState, unit: Unit, targets: List[Unit]) -> Optional[Unit]:
    """Focus fire: prefer killable > lowest HP > highest value."""
    if not targets:
        return None
    def score(t):
        dt = state.tile_at(t.x, t.y)
        dist = manhattan(unit.x, unit.y, t.x, t.y)
        ed = expected_damage(unit.unit_type, dt, unit.has_moved, dist)
        killable = 1 if ed >= t.hp else 0
        value = {UnitType.TANK: 3, UnitType.RANGER: 2, UnitType.INFANTRY: 1}[t.unit_type]
        return (-killable, t.hp, -value)
    return min(targets, key=score)

def find_ranger_position(state: GameState, unit: Unit, target: Unit,
                         occupied: set) -> Optional[Tuple[int,int]]:
    """Find reachable tile at range 2-3 from target, prefer range 2 + defensive terrain."""
    tiles = reachable_tiles(state, unit, occupied)
    candidates = [(x, y) for (x, y) in tiles
                  if 2 <= manhattan(x, y, target.x, target.y) <= 3]
    if not candidates:
        return None
    def score(p):
        d = manhattan(p[0], p[1], target.x, target.y)
        t = state.tile_at(p[0], p[1])
        return (0 if d == 2 else 1, -DEFENSE_BONUS[t])
    return min(candidates, key=score)


class Strategy:
    name = "base"
    def play_turn(self, state: GameState, player: int, rng: random.Random):
        raise NotImplementedError


class AggressiveStrategy(Strategy):
    """Push hard, attack everything, rush HQ when able."""
    name = "aggressive"

    def play_turn(self, state, player, rng):
        enemy_hq = state.player_hq(state.other_player(player))
        units = state.player_units(player)
        enemies = state.enemy_units(player)
        occupied = set()

        # Sort: closest to enemy HQ first
        if enemy_hq:
            units.sort(key=lambda u: manhattan(u.x, u.y, enemy_hq.x, enemy_hq.y))

        for unit in units:
            if not unit.alive or unit.has_acted:
                continue

            # Attack without moving first
            targets = get_attack_targets(state, unit)
            if targets:
                t = pick_target(state, unit, targets)
                do_attack(state, rng, unit, t)
                occupied.add((unit.x, unit.y))
                if state.winner: return
                continue

            # Ranger: find attack position
            if unit.unit_type == UnitType.RANGER:
                if enemies:
                    nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                    pos = find_ranger_position(state, unit, nearest, occupied)
                    if pos:
                        do_move(state, unit, pos[0], pos[1])
                        # Rangers can't attack after moving
                        do_wait(unit)
                        occupied.add((unit.x, unit.y))
                        continue
                    # Can't find good position, move closer
                    dest = best_move_toward(state, unit, nearest.x, nearest.y, occupied)
                    if dest:
                        do_move(state, unit, dest[0], dest[1])
                    do_wait(unit)
                    occupied.add((unit.x, unit.y))
                    continue

            # Infantry/Tank: capture HQ or attack
            if can_capture(unit.unit_type) and enemy_hq:
                if unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                    do_capture(state, unit)
                    if state.winner: return
                    occupied.add((unit.x, unit.y))
                    continue

            # Move toward enemy HQ (infantry/ranger) or nearest enemy (tank)
            if can_capture(unit.unit_type) and enemy_hq:
                target_x, target_y = enemy_hq.x, enemy_hq.y
            elif enemies:
                nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                target_x, target_y = nearest.x, nearest.y
            else:
                do_wait(unit)
                occupied.add((unit.x, unit.y))
                continue

            dest = best_move_toward(state, unit, target_x, target_y, occupied)
            if dest:
                do_move(state, unit, dest[0], dest[1])

            # Try capture after moving
            if can_capture(unit.unit_type) and enemy_hq:
                if unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                    do_capture(state, unit)
                    if state.winner: return
                    occupied.add((unit.x, unit.y))
                    continue

            # Attack after moving
            targets = get_attack_targets(state, unit)
            if targets:
                t = pick_target(state, unit, targets)
                do_attack(state, rng, unit, t)
                if state.winner: return
            else:
                do_wait(unit)
            occupied.add((unit.x, unit.y))


class DefensiveStrategy(Strategy):
    """Hold position, let enemies come to you, protect HQ."""
    name = "defensive"

    def play_turn(self, state, player, rng):
        own_hq = state.player_hq(player)
        enemy_hq = state.player_hq(state.other_player(player))
        units = state.player_units(player)
        enemies = state.enemy_units(player)
        occupied = set()

        # Sort: closest to own HQ first (defend what matters)
        if own_hq:
            units.sort(key=lambda u: manhattan(u.x, u.y, own_hq.x, own_hq.y))

        # Are we winning? If so, push
        pushing = len(units) > len(enemies) + 2

        for unit in units:
            if not unit.alive or unit.has_acted:
                continue

            # Always attack without moving if possible
            targets = get_attack_targets(state, unit)
            if targets:
                t = pick_target(state, unit, targets)
                do_attack(state, rng, unit, t)
                occupied.add((unit.x, unit.y))
                if state.winner: return
                continue

            # Retreat at 1 HP
            if unit.hp == 1 and own_hq:
                dest = best_move_toward(state, unit, own_hq.x, own_hq.y, occupied)
                if dest and manhattan(dest[0], dest[1], own_hq.x, own_hq.y) < manhattan(unit.x, unit.y, own_hq.x, own_hq.y):
                    do_move(state, unit, dest[0], dest[1])
                    do_wait(unit)
                    occupied.add((unit.x, unit.y))
                    continue

            # Ranger: kite — retreat from adjacent enemies, hold at range 2-3
            if unit.unit_type == UnitType.RANGER:
                close = [e for e in enemies if manhattan(unit.x, unit.y, e.x, e.y) <= 1]
                if close:
                    # Move away from melee threats
                    tiles = reachable_tiles(state, unit, occupied)
                    safe = [(x, y) for (x, y) in tiles
                            if all(manhattan(x, y, e.x, e.y) >= 2 for e in close)]
                    if safe:
                        # Pick tile with best defense
                        best = max(safe, key=lambda p: DEFENSE_BONUS[state.tile_at(p[0], p[1])])
                        do_move(state, unit, best[0], best[1])
                    do_wait(unit)
                    occupied.add((unit.x, unit.y))
                    continue

                # Threats near HQ
                if own_hq:
                    threats = [e for e in enemies if manhattan(e.x, e.y, own_hq.x, own_hq.y) <= 6]
                    if threats:
                        nearest = min(threats, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                        pos = find_ranger_position(state, unit, nearest, occupied)
                        if pos:
                            do_move(state, unit, pos[0], pos[1])
                        do_wait(unit)
                        occupied.add((unit.x, unit.y))
                        continue

                if pushing and enemies:
                    nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                    pos = find_ranger_position(state, unit, nearest, occupied)
                    if pos:
                        do_move(state, unit, pos[0], pos[1])
                    do_wait(unit)
                    occupied.add((unit.x, unit.y))
                    continue

                do_wait(unit)
                occupied.add((unit.x, unit.y))
                continue

            # Intercept threats near HQ
            if own_hq:
                threats = [e for e in enemies if manhattan(e.x, e.y, own_hq.x, own_hq.y) <= 5]
                if threats:
                    nearest = min(threats, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                    dest = best_move_toward(state, unit, nearest.x, nearest.y, occupied)
                    if dest:
                        do_move(state, unit, dest[0], dest[1])
                    targets = get_attack_targets(state, unit)
                    if targets:
                        t = pick_target(state, unit, targets)
                        do_attack(state, rng, unit, t)
                        if state.winner: return
                    else:
                        do_wait(unit)
                    occupied.add((unit.x, unit.y))
                    continue

            # Push if winning
            if pushing and enemies:
                nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                dest = best_move_toward(state, unit, nearest.x, nearest.y, occupied)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
                targets = get_attack_targets(state, unit)
                if targets:
                    t = pick_target(state, unit, targets)
                    do_attack(state, rng, unit, t)
                    if state.winner: return
                else:
                    do_wait(unit)
                occupied.add((unit.x, unit.y))
                continue

            # Hold position near HQ
            if own_hq and manhattan(unit.x, unit.y, own_hq.x, own_hq.y) > 4:
                dest = best_move_toward(state, unit, own_hq.x, own_hq.y, occupied)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
            do_wait(unit)
            occupied.add((unit.x, unit.y))


class RushStrategy(Strategy):
    """Beeline infantry/rangers to enemy HQ. Ignore combat unless blocking."""
    name = "rush"

    def play_turn(self, state, player, rng):
        enemy_hq = state.player_hq(state.other_player(player))
        units = state.player_units(player)
        enemies = state.enemy_units(player)
        occupied = set()

        if enemy_hq:
            units.sort(key=lambda u: manhattan(u.x, u.y, enemy_hq.x, enemy_hq.y))

        for unit in units:
            if not unit.alive or unit.has_acted:
                continue

            # Attack without moving
            targets = get_attack_targets(state, unit)
            if targets:
                # Only attack if target is killable or blocking HQ
                killable = [t for t in targets if t.hp <= expected_damage(
                    unit.unit_type, state.tile_at(t.x, t.y), unit.has_moved,
                    manhattan(unit.x, unit.y, t.x, t.y))]
                hq_blockers = [t for t in targets if enemy_hq and
                               manhattan(t.x, t.y, enemy_hq.x, enemy_hq.y) <= 1] if enemy_hq else []
                priority = killable or hq_blockers or targets
                t = pick_target(state, unit, priority)
                do_attack(state, rng, unit, t)
                occupied.add((unit.x, unit.y))
                if state.winner: return
                continue

            # Capture if on HQ
            if can_capture(unit.unit_type) and enemy_hq:
                if unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                    do_capture(state, unit)
                    if state.winner: return
                    occupied.add((unit.x, unit.y))
                    continue

            # Rush toward HQ
            if can_capture(unit.unit_type) and enemy_hq:
                dest = best_move_toward(state, unit, enemy_hq.x, enemy_hq.y, occupied)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
                if unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                    do_capture(state, unit)
                    if state.winner: return
                    occupied.add((unit.x, unit.y))
                    continue
                targets = get_attack_targets(state, unit)
                if targets:
                    t = pick_target(state, unit, targets)
                    do_attack(state, rng, unit, t)
                    if state.winner: return
                else:
                    do_wait(unit)
                occupied.add((unit.x, unit.y))
                continue

            # Tanks: just fight nearest
            if enemies:
                nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                dest = best_move_toward(state, unit, nearest.x, nearest.y, occupied)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
                targets = get_attack_targets(state, unit)
                if targets:
                    t = pick_target(state, unit, targets)
                    do_attack(state, rng, unit, t)
                    if state.winner: return
                else:
                    do_wait(unit)
            else:
                do_wait(unit)
            occupied.add((unit.x, unit.y))


class BalancedStrategy(Strategy):
    """Fight smart, capture HQ when opportunity arises, protect own HQ."""
    name = "balanced"

    def play_turn(self, state, player, rng):
        own_hq = state.player_hq(player)
        enemy_hq = state.player_hq(state.other_player(player))
        units = state.player_units(player)
        enemies = state.enemy_units(player)
        occupied = set()

        # Designate 1 infantry as HQ rusher if close enough
        rusher_uid = None
        if enemy_hq:
            capturers = [u for u in units if can_capture(u.unit_type)]
            if capturers:
                closest = min(capturers, key=lambda u: manhattan(u.x, u.y, enemy_hq.x, enemy_hq.y))
                if manhattan(closest.x, closest.y, enemy_hq.x, enemy_hq.y) <= 8:
                    rusher_uid = closest.uid

        # Sort by distance to nearest enemy (engage front-line first)
        if enemies:
            units.sort(key=lambda u: min(manhattan(u.x, u.y, e.x, e.y) for e in enemies))

        for unit in units:
            if not unit.alive or unit.has_acted:
                continue

            is_rusher = (unit.uid == rusher_uid)

            # Attack without moving
            targets = get_attack_targets(state, unit)
            if targets:
                t = pick_target(state, unit, targets)
                do_attack(state, rng, unit, t)
                occupied.add((unit.x, unit.y))
                if state.winner: return
                continue

            # Retreat at 1 HP
            if unit.hp == 1 and own_hq and not is_rusher:
                dest = best_move_toward(state, unit, own_hq.x, own_hq.y, occupied)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
                do_wait(unit)
                occupied.add((unit.x, unit.y))
                continue

            # Rusher: beeline HQ
            if is_rusher and enemy_hq:
                if unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                    do_capture(state, unit)
                    if state.winner: return
                    occupied.add((unit.x, unit.y))
                    continue
                dest = best_move_toward(state, unit, enemy_hq.x, enemy_hq.y, occupied)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
                if unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                    do_capture(state, unit)
                    if state.winner: return
                    occupied.add((unit.x, unit.y))
                    continue
                targets = get_attack_targets(state, unit)
                if targets:
                    t = pick_target(state, unit, targets)
                    do_attack(state, rng, unit, t)
                    if state.winner: return
                else:
                    do_wait(unit)
                occupied.add((unit.x, unit.y))
                continue

            # Ranger: position at range 2-3, kite melee
            if unit.unit_type == UnitType.RANGER:
                close = [e for e in enemies if manhattan(unit.x, unit.y, e.x, e.y) <= 1]
                if close:
                    tiles = reachable_tiles(state, unit, occupied)
                    safe = [(x, y) for (x, y) in tiles
                            if all(manhattan(x, y, e.x, e.y) >= 2 for e in close)]
                    if safe:
                        best = max(safe, key=lambda p: DEFENSE_BONUS[state.tile_at(p[0], p[1])])
                        do_move(state, unit, best[0], best[1])
                    do_wait(unit)
                    occupied.add((unit.x, unit.y))
                    continue
                if enemies:
                    nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                    pos = find_ranger_position(state, unit, nearest, occupied)
                    if pos:
                        do_move(state, unit, pos[0], pos[1])
                    do_wait(unit)
                    occupied.add((unit.x, unit.y))
                    continue
                do_wait(unit)
                occupied.add((unit.x, unit.y))
                continue

            # Infantry/Tank: engage nearest enemy
            if enemies:
                nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                dest = best_move_toward(state, unit, nearest.x, nearest.y, occupied)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
                # Capture if ended up on enemy HQ
                if can_capture(unit.unit_type) and enemy_hq:
                    if unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                        do_capture(state, unit)
                        if state.winner: return
                        occupied.add((unit.x, unit.y))
                        continue
                targets = get_attack_targets(state, unit)
                if targets:
                    t = pick_target(state, unit, targets)
                    do_attack(state, rng, unit, t)
                    if state.winner: return
                else:
                    do_wait(unit)
            else:
                # No enemies, push to HQ
                if can_capture(unit.unit_type) and enemy_hq:
                    dest = best_move_toward(state, unit, enemy_hq.x, enemy_hq.y, occupied)
                    if dest:
                        do_move(state, unit, dest[0], dest[1])
                    if unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                        do_capture(state, unit)
                        if state.winner: return
                do_wait(unit)
            occupied.add((unit.x, unit.y))


STRATEGIES = {
    "aggressive": AggressiveStrategy,
    "defensive": DefensiveStrategy,
    "rush": RushStrategy,
    "balanced": BalancedStrategy,
}

# ============================================================================
# Game runner
# ============================================================================

@dataclass
class GameResult:
    winner: int
    rounds: int
    p1_kills: int
    p2_kills: int
    win_type: str  # "hq_capture", "elimination", "timeout"
    map_name: str = ""

def run_game(p1_strat, p2_strat, map_name: str, seed: int,
             verbose=False, replay=False) -> GameResult:
    """Run one game. Returns GameResult."""
    rng = random.Random(seed)
    state = load_map(map_name)
    strategies = {1: p1_strat, 2: p2_strat}
    initial_units = {1: len(state.player_units(1)), 2: len(state.player_units(2))}
    frames = []

    if replay:
        frames.append(render_map(state))

    while state.winner is None and state.round_num <= MAX_ROUNDS:
        player = state.current_player
        strategies[player].play_turn(state, player, rng)
        if state.winner is None:
            end_turn(state)
        if replay:
            frames.append(render_map(state))

    # Determine win type
    if state.winner is None:
        # Timeout — resolve by HP
        hp1 = sum(u.hp for u in state.player_units(1))
        hp2 = sum(u.hp for u in state.player_units(2))
        state.winner = 1 if hp1 >= hp2 else 2
        win_type = "timeout"
    else:
        loser = state.other_player(state.winner)
        if state.player_units(loser):
            win_type = "hq_capture"
        else:
            win_type = "elimination"

    p1_kills = initial_units[2] - len(state.player_units(2))
    p2_kills = initial_units[1] - len(state.player_units(1))

    if verbose:
        print(f"  → P{state.winner} wins ({win_type}) R{state.round_num} "
              f"kills: P1={p1_kills} P2={p2_kills} [{map_name}]")

    if replay:
        for i, frame in enumerate(frames):
            print(f"\n{'─'*60}")
            print(frame)
        print(f"\n{'═'*60}")
        print(f"  RESULT: P{state.winner} wins by {win_type} in {state.round_num} rounds")
        print(f"{'═'*60}")

    return GameResult(winner=state.winner, rounds=state.round_num,
                      p1_kills=p1_kills, p2_kills=p2_kills,
                      win_type=win_type, map_name=map_name)

# ============================================================================
# Simulation
# ============================================================================

def run_simulation(strategy_names, maps, num_games, base_seed, verbose=False, replay=False):
    results = {}

    for s1_name in strategy_names:
        for s2_name in strategy_names:
            key = (s1_name, s2_name)
            s1 = STRATEGIES[s1_name]()
            s2 = STRATEGIES[s2_name]()
            game_results = []

            for i in range(num_games):
                map_name = maps[i % len(maps)]
                seed = base_seed + hash(key) + i
                if verbose:
                    print(f"\n--- {s1_name} vs {s2_name} G{i+1} [{map_name}] seed={seed} ---")
                do_replay = replay and i == 0  # replay first game only
                result = run_game(s1, s2, map_name, seed, verbose, do_replay)
                game_results.append(result)

            results[key] = game_results

    # Summary
    print(f"\n{'='*90}")
    print(f"  HASHFRONT SIMULATION — {num_games} games/matchup — maps: {', '.join(maps)}")
    print(f"{'='*90}\n")

    # Win rate matrix
    print("WIN RATE MATRIX (row=P1, col=P2, value=P1 win%)")
    print(f"{'':>14}", end="")
    for s in strategy_names:
        print(f"{s:>14}", end="")
    print()
    print("-" * (14 + 14 * len(strategy_names)))
    for s1 in strategy_names:
        print(f"{s1:>14}", end="")
        for s2 in strategy_names:
            gr = results[(s1, s2)]
            pct = sum(1 for r in gr if r.winner == 1) / len(gr) * 100
            print(f"{pct:>13.1f}%", end="")
        print()

    # Detailed stats
    print(f"\n{'MATCHUP':<30} {'P1 Win%':>8} {'Avg Rnd':>8} {'P1 Kills':>9} "
          f"{'P2 Kills':>9} {'HQ Cap%':>8} {'Elim%':>7} {'Timeout%':>9}")
    print("-" * 100)
    for s1 in strategy_names:
        for s2 in strategy_names:
            gr = results[(s1, s2)]
            n = len(gr)
            p1w = sum(1 for r in gr if r.winner == 1)
            avg_rnd = sum(r.rounds for r in gr) / n
            avg_p1k = sum(r.p1_kills for r in gr) / n
            avg_p2k = sum(r.p2_kills for r in gr) / n
            hq_pct = sum(1 for r in gr if r.win_type == "hq_capture") / n * 100
            elim_pct = sum(1 for r in gr if r.win_type == "elimination") / n * 100
            to_pct = sum(1 for r in gr if r.win_type == "timeout") / n * 100
            label = f"{s1} vs {s2}"
            print(f"{label:<30} {p1w/n*100:>7.1f}% {avg_rnd:>8.1f} {avg_p1k:>9.2f} "
                  f"{avg_p2k:>9.2f} {hq_pct:>7.1f}% {elim_pct:>6.1f}% {to_pct:>8.1f}%")

    # Per-map breakdown
    print(f"\n{'MAP BREAKDOWN':<30} ", end="")
    for s1 in strategy_names:
        for s2 in strategy_names:
            print(f" {s1[:3]}v{s2[:3]}", end="")
    print()
    print("-" * (30 + 8 * len(strategy_names)**2))
    for m in maps:
        print(f"{m:<30} ", end="")
        for s1 in strategy_names:
            for s2 in strategy_names:
                gr = [r for r in results[(s1, s2)] if r.map_name == m]
                if gr:
                    pct = sum(1 for r in gr if r.winner == 1) / len(gr) * 100
                    print(f" {pct:5.0f}%", end="")
                else:
                    print(f"    - ", end="")
        print()

    print(f"\n{'='*90}")
    print("  DONE")
    print(f"{'='*90}")

# ============================================================================
# CLI
# ============================================================================

def main():
    available_maps = list_maps()

    parser = argparse.ArgumentParser(description="Hashfront headless game simulator")
    parser.add_argument("--games", type=int, default=100, help="Games per matchup (default: 100)")
    parser.add_argument("--seed", type=int, default=42, help="Base RNG seed")
    parser.add_argument("--verbose", action="store_true", help="Per-game logs")
    parser.add_argument("--replay", action="store_true", help="ASCII replay of first game per matchup")
    parser.add_argument("--map", nargs="+", choices=available_maps, default=None,
                        help=f"Maps to use (default: all). Available: {', '.join(available_maps)}")
    parser.add_argument("--strategies", nargs="+", choices=list(STRATEGIES.keys()),
                        default=list(STRATEGIES.keys()), help="Strategies to test")
    parser.add_argument("--show-map", metavar="MAP", help="Just render a map and exit")
    args = parser.parse_args()

    if args.show_map:
        if args.show_map not in available_maps:
            print(f"Unknown map: {args.show_map}. Available: {', '.join(available_maps)}")
            sys.exit(1)
        state = load_map(args.show_map)
        print(render_map(state))
        sys.exit(0)

    maps = args.map or available_maps
    print(f"Hashfront Simulator")
    print(f"Games/matchup: {args.games} | Seed: {args.seed}")
    print(f"Strategies: {', '.join(args.strategies)}")
    print(f"Maps ({len(maps)}): {', '.join(maps)}")
    run_simulation(args.strategies, maps, args.games, args.seed, args.verbose, args.replay)

if __name__ == "__main__":
    main()
