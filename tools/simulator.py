#!/usr/bin/env python3
"""
Hashfront Headless Game Simulator

Runs many games between AI strategies to test unit balance.
Includes economy: Cities (income), Factories (unit production), gold system.

Usage:
    python3 tools/simulator.py                     # 100 games per matchup, seed 42
    python3 tools/simulator.py --games 500         # 500 games per matchup
    python3 tools/simulator.py --seed 123          # custom seed
    python3 tools/simulator.py --verbose           # print per-game logs
    python3 tools/simulator.py --strategies aggressive defensive  # specific matchup only
"""

import argparse
import collections
import math
import random
import sys
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Optional

# ============================================================================
# Constants (from PRD / balance_analyzer.py)
# ============================================================================

CAPTURE_THRESHOLD = 2
MAX_ROUNDS = 60  # higher than on-chain 30 to let sims finish
STARTING_GOLD = 5

UNIT_COST = {
    "INFANTRY": 1,
    "TANK": 3,
    "RANGER": 2,
}

class Terrain(Enum):
    GRASS = auto()
    ROAD = auto()
    DIRT_ROAD = auto()
    TREE = auto()
    MOUNTAIN = auto()
    HQ = auto()
    CITY = auto()
    FACTORY = auto()

TERRAIN_DEFENSE = {
    Terrain.GRASS: 0, Terrain.ROAD: 0, Terrain.DIRT_ROAD: 0,
    Terrain.TREE: 1, Terrain.MOUNTAIN: 2, Terrain.HQ: 2,
    Terrain.CITY: 1, Terrain.FACTORY: 1,
}
TERRAIN_EVASION = {
    Terrain.GRASS: 0, Terrain.ROAD: 0, Terrain.DIRT_ROAD: 0,
    Terrain.TREE: 5, Terrain.MOUNTAIN: 12, Terrain.HQ: 10,
    Terrain.CITY: 8, Terrain.FACTORY: 8,
}
TERRAIN_MOVE_COST = {
    Terrain.GRASS: 1, Terrain.ROAD: 1, Terrain.DIRT_ROAD: 1,
    Terrain.TREE: 1, Terrain.MOUNTAIN: 2, Terrain.HQ: 1,
    Terrain.CITY: 1, Terrain.FACTORY: 1,
}

class UnitType(Enum):
    INFANTRY = auto()
    TANK = auto()
    RANGER = auto()

UNIT_STATS = {
    UnitType.INFANTRY: {"hp": 3, "atk": 2, "move": 4, "range": (1, 1), "accuracy": 90, "can_attack_after_move": True},
    UnitType.TANK:     {"hp": 5, "atk": 4, "move": 2, "range": (1, 1), "accuracy": 85, "can_attack_after_move": True},
    UnitType.RANGER:   {"hp": 4, "atk": 3, "move": 3, "range": (2, 3), "accuracy": 88, "can_attack_after_move": False},
}

# Vehicle types get road bonus
VEHICLE_TYPES = {UnitType.TANK}
ROAD_BONUS = 2
ROAD_TERRAINS = {Terrain.ROAD, Terrain.DIRT_ROAD}

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
    def alive(self):
        return self.hp > 0

    @property
    def stats(self):
        return UNIT_STATS[self.unit_type]

@dataclass
class Building:
    x: int
    y: int
    owner: int  # 1, 2, or 0 (neutral)
    building_type: str = "hq"  # "hq", "city", or "factory"
    capture_player: int = 0
    capture_progress: int = 0
    production_queue: Optional[UnitType] = None  # for factories

@dataclass
class GameState:
    width: int
    height: int
    terrain: list  # 2D list of Terrain
    units: list  # list of Unit
    buildings: list  # list of Building
    current_player: int = 1
    round_num: int = 1
    winner: Optional[int] = None
    gold: dict = field(default_factory=lambda: {1: STARTING_GOLD, 2: STARTING_GOLD})
    gold_earned: dict = field(default_factory=lambda: {1: 0, 2: 0})
    units_produced: dict = field(default_factory=lambda: {1: 0, 2: 0})
    _next_uid: int = 0

    def next_uid(self):
        self._next_uid += 1
        return self._next_uid

    def terrain_at(self, x, y):
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.terrain[y][x]
        return None

    def unit_at(self, x, y):
        for u in self.units:
            if u.alive and u.x == x and u.y == y:
                return u
        return None

    def player_units(self, player):
        return [u for u in self.units if u.alive and u.player == player]

    def player_hq(self, player):
        for b in self.buildings:
            if b.owner == player and b.building_type == "hq":
                return b
        return None

    def player_buildings(self, player, building_type=None):
        return [b for b in self.buildings
                if b.owner == player and (building_type is None or b.building_type == building_type)]

    def player_factories(self, player):
        return self.player_buildings(player, "factory")

    def player_cities(self, player):
        return self.player_buildings(player, "city")

    def other_player(self, player):
        return 2 if player == 1 else 1

# ============================================================================
# Combat math (from PRD / balance_analyzer.py)
# ============================================================================

def clamp(lo, hi, val):
    return max(lo, min(hi, val))

def hit_chance(accuracy, terrain_evasion, moved, range_penalty=0):
    move_pen = 5 if moved else 0
    return clamp(75, 95, accuracy - terrain_evasion - move_pen - range_penalty) / 100.0

def hit_damage(atk, terrain_defense):
    return max(atk - terrain_defense, 1)

def graze_damage(atk, terrain_defense):
    hd = hit_damage(atk, terrain_defense)
    return 1 if hd >= 2 else 0

def resolve_attack(rng, attacker, defender, attacker_moved, def_terrain, atk_terrain, distance):
    """Resolve one attack exchange. Returns (dmg_to_defender, dmg_to_attacker)."""
    a_stats = attacker.stats
    d_stats = defender.stats

    # Ranger can't attack after moving
    if not a_stats["can_attack_after_move"] and attacker_moved:
        return 0, 0

    a_min, a_max = a_stats["range"]
    if not (a_min <= distance <= a_max):
        return 0, 0

    def_def = TERRAIN_DEFENSE[def_terrain]
    def_eva = TERRAIN_EVASION[def_terrain]
    range_pen = 5 if attacker.unit_type == UnitType.RANGER and distance == 3 else 0

    # Attacker roll
    hc = hit_chance(a_stats["accuracy"], def_eva, attacker_moved, range_pen)
    if rng.random() < hc:
        dmg_to_def = hit_damage(a_stats["atk"], def_def)
    else:
        dmg_to_def = graze_damage(a_stats["atk"], def_def)

    # Check defender survival for counterattack
    defender_survives = defender.hp - dmg_to_def > 0
    dmg_to_atk = 0

    if defender_survives:
        d_min, d_max = d_stats["range"]
        if d_min <= distance <= d_max:
            atk_def = TERRAIN_DEFENSE[atk_terrain]
            atk_eva = TERRAIN_EVASION[atk_terrain]
            counter_range_pen = 5 if defender.unit_type == UnitType.RANGER and distance == 3 else 0
            counter_hc = hit_chance(d_stats["accuracy"], atk_eva, False, counter_range_pen)
            if rng.random() < counter_hc:
                dmg_to_atk = hit_damage(d_stats["atk"], atk_def)
            else:
                dmg_to_atk = graze_damage(d_stats["atk"], atk_def)

    return dmg_to_def, dmg_to_atk

# ============================================================================
# Movement (BFS pathfinding)
# ============================================================================

def manhattan(x1, y1, x2, y2):
    return abs(x1 - x2) + abs(y1 - y2)

def reachable_tiles(state, unit):
    """BFS to find all reachable tiles for a unit. Returns dict {(x,y): cost}."""
    stats = unit.stats
    base_move = stats["move"]

    # Road bonus for vehicles starting on road
    bonus = 0
    start_terrain = state.terrain_at(unit.x, unit.y)
    if unit.unit_type in VEHICLE_TYPES and start_terrain in ROAD_TERRAINS:
        bonus = ROAD_BONUS

    total_move = base_move + bonus
    reached = {(unit.x, unit.y): 0}
    queue = collections.deque([(unit.x, unit.y, 0, bonus)])

    while queue:
        cx, cy, cost, rb = queue.popleft()
        for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            nx, ny = cx + dx, cy + dy
            t = state.terrain_at(nx, ny)
            if t is None:
                continue
            if t == Terrain.MOUNTAIN and unit.unit_type != UnitType.INFANTRY:
                continue
            occupant = state.unit_at(nx, ny)
            if occupant and occupant.uid != unit.uid:
                continue

            move_cost = TERRAIN_MOVE_COST[t]
            new_rb = rb
            if rb > 0 and t in ROAD_TERRAINS:
                if move_cost <= new_rb:
                    new_rb -= move_cost
                    move_cost = 0
                else:
                    move_cost -= new_rb
                    new_rb = 0
            elif rb > 0 and t not in ROAD_TERRAINS:
                new_rb = 0

            new_cost = cost + move_cost
            if new_cost > base_move + bonus - new_rb and new_cost > total_move:
                continue
            if new_cost > total_move:
                continue

            if (nx, ny) not in reached or reached[(nx, ny)] > new_cost:
                reached[(nx, ny)] = new_cost
                queue.append((nx, ny, new_cost, new_rb))

    del reached[(unit.x, unit.y)]
    return reached

def find_path_toward(state, unit, tx, ty):
    """Find the reachable tile closest to (tx,ty) using BFS. Returns (x,y) or None."""
    tiles = reachable_tiles(state, unit)
    if not tiles:
        return None
    if (tx, ty) in tiles:
        return (tx, ty)
    best = min(tiles.keys(), key=lambda p: manhattan(p[0], p[1], tx, ty))
    if manhattan(best[0], best[1], tx, ty) < manhattan(unit.x, unit.y, tx, ty):
        return best
    return None

# ============================================================================
# Map generation
# ============================================================================

def generate_map(width, height, rng):
    """Generate a symmetric 2-player map with terrain variety, cities, and factories."""
    terrain = [[Terrain.GRASS] * width for _ in range(height)]

    # Add some roads through the center
    mid_y = height // 2
    for x in range(width):
        terrain[mid_y][x] = Terrain.ROAD

    # Vertical roads
    mid_x = width // 2
    for y in range(height):
        terrain[y][mid_x] = Terrain.ROAD
    # Second vertical road for even-width maps
    if width % 2 == 0:
        for y in range(height):
            terrain[y][mid_x - 1] = Terrain.ROAD

    # Scatter trees symmetrically
    for _ in range(width * height // 8):
        x = rng.randint(0, width // 2)
        y = rng.randint(0, height - 1)
        if terrain[y][x] == Terrain.GRASS:
            terrain[y][x] = Terrain.TREE
            mx = width - 1 - x
            if terrain[y][mx] == Terrain.GRASS:
                terrain[y][mx] = Terrain.TREE

    # A few mountains symmetrically
    for _ in range(width * height // 20):
        x = rng.randint(1, width // 2 - 1)
        y = rng.randint(1, height - 2)
        if terrain[y][x] == Terrain.GRASS:
            terrain[y][x] = Terrain.MOUNTAIN
            mx = width - 1 - x
            if terrain[y][mx] == Terrain.GRASS:
                terrain[y][mx] = Terrain.MOUNTAIN

    # HQ positions
    hq1_x, hq1_y = 1, height // 2
    hq2_x, hq2_y = width - 2, height // 2
    terrain[hq1_y][hq1_x] = Terrain.HQ
    terrain[hq2_y][hq2_x] = Terrain.HQ

    # Factory positions (near each HQ)
    fac1_x, fac1_y = 2, height // 2 - 2
    fac2_x, fac2_y = width - 3, height // 2 - 2
    terrain[fac1_y][fac1_x] = Terrain.FACTORY
    terrain[fac2_y][fac2_x] = Terrain.FACTORY

    # City positions (contestable, in the middle area)
    city_positions = []
    # 2-3 pairs of symmetric cities
    city_ys = [height // 4, height // 2, 3 * height // 4]
    city_x = width // 2  # center
    for cy in city_ys:
        terrain[cy][city_x] = Terrain.CITY
        city_positions.append((city_x, cy))
    # If even width, also use left-center
    if width % 2 == 0:
        cx2 = mid_x - 1
        terrain[height // 4][cx2] = Terrain.CITY
        city_positions.append((cx2, height // 4))
        terrain[3 * height // 4][cx2] = Terrain.CITY
        city_positions.append((cx2, 3 * height // 4))

    buildings_info = {
        "hq1": (hq1_x, hq1_y),
        "hq2": (hq2_x, hq2_y),
        "fac1": (fac1_x, fac1_y),
        "fac2": (fac2_x, fac2_y),
        "cities": city_positions,
    }
    return terrain, buildings_info

def create_game(width=14, height=14, rng_seed=42):
    """Create a new game state with starting units."""
    rng = random.Random(rng_seed)
    terrain, binfo = generate_map(width, height, rng)

    state = GameState(
        width=width, height=height, terrain=terrain,
        units=[], buildings=[], _next_uid=0,
        gold={1: STARTING_GOLD, 2: STARTING_GOLD},
        gold_earned={1: 0, 2: 0},
        units_produced={1: 0, 2: 0},
    )

    hq1 = binfo["hq1"]
    hq2 = binfo["hq2"]

    # Buildings
    state.buildings.append(Building(x=hq1[0], y=hq1[1], owner=1, building_type="hq"))
    state.buildings.append(Building(x=hq2[0], y=hq2[1], owner=2, building_type="hq"))
    state.buildings.append(Building(x=binfo["fac1"][0], y=binfo["fac1"][1], owner=1, building_type="factory"))
    state.buildings.append(Building(x=binfo["fac2"][0], y=binfo["fac2"][1], owner=2, building_type="factory"))
    for cx, cy in binfo["cities"]:
        state.buildings.append(Building(x=cx, y=cy, owner=0, building_type="city"))

    # Starting units for player 1 (left side)
    p1_units = [
        (UnitType.INFANTRY, hq1[0], hq1[1] - 2),
        (UnitType.INFANTRY, hq1[0], hq1[1] + 2),
        (UnitType.INFANTRY, hq1[0] + 1, hq1[1] - 1),
        (UnitType.TANK, hq1[0] + 1, hq1[1] + 1),
        (UnitType.RANGER, hq1[0], hq1[1] - 1),
        (UnitType.RANGER, hq1[0], hq1[1] + 1),
    ]
    p2_units = [
        (UnitType.INFANTRY, hq2[0], hq2[1] - 2),
        (UnitType.INFANTRY, hq2[0], hq2[1] + 2),
        (UnitType.INFANTRY, hq2[0] - 1, hq2[1] - 1),
        (UnitType.TANK, hq2[0] - 1, hq2[1] + 1),
        (UnitType.RANGER, hq2[0], hq2[1] - 1),
        (UnitType.RANGER, hq2[0], hq2[1] + 1),
    ]

    for ut, x, y in p1_units:
        state.units.append(Unit(uid=state.next_uid(), unit_type=ut, player=1, x=x, y=y, hp=UNIT_STATS[ut]["hp"]))
    for ut, x, y in p2_units:
        state.units.append(Unit(uid=state.next_uid(), unit_type=ut, player=2, x=x, y=y, hp=UNIT_STATS[ut]["hp"]))

    return state

# ============================================================================
# Economy
# ============================================================================

def collect_income(state, player):
    """Collect 1 gold per owned city + 1 base HQ income at start of turn."""
    cities = state.player_cities(player)
    income = len(cities) + 1  # +1 base HQ income
    state.gold[player] += income
    state.gold_earned[player] += income

def process_production(state, player):
    """Spawn queued units at factories if tile is unoccupied."""
    for fac in state.player_factories(player):
        if fac.production_queue is not None:
            if state.unit_at(fac.x, fac.y) is None:
                ut = fac.production_queue
                fac.production_queue = None
                unit = Unit(
                    uid=state.next_uid(), unit_type=ut, player=player,
                    x=fac.x, y=fac.y, hp=UNIT_STATS[ut]["hp"],
                    has_moved=True, has_acted=True,
                )
                state.units.append(unit)
                state.units_produced[player] += 1

def build_unit(state, player, factory, unit_type):
    """Queue a unit at a factory. Returns True if successful."""
    if factory.building_type != "factory" or factory.owner != player:
        return False
    if factory.production_queue is not None:
        return False
    cost = UNIT_COST[unit_type.name]
    if state.gold[player] < cost:
        return False
    state.gold[player] -= cost
    factory.production_queue = unit_type
    return True

# ============================================================================
# Game logic
# ============================================================================

def do_move(state, unit, tx, ty):
    unit.x = tx
    unit.y = ty
    unit.has_moved = True

def do_attack(state, rng, attacker, defender):
    dist = manhattan(attacker.x, attacker.y, defender.x, defender.y)
    def_terrain = state.terrain_at(defender.x, defender.y)
    atk_terrain = state.terrain_at(attacker.x, attacker.y)
    dmg_d, dmg_a = resolve_attack(rng, attacker, defender, attacker.has_moved, def_terrain, atk_terrain, dist)
    defender.hp -= dmg_d
    attacker.hp -= dmg_a
    attacker.has_acted = True
    return dmg_d, dmg_a

def do_capture(state, unit):
    """Attempt to capture building at unit's position."""
    if unit.unit_type != UnitType.INFANTRY:
        return False
    for b in state.buildings:
        if b.x == unit.x and b.y == unit.y and b.owner != unit.player:
            if b.capture_player != unit.player:
                b.capture_player = unit.player
                b.capture_progress = 1
            else:
                b.capture_progress += 1
            if b.capture_progress >= CAPTURE_THRESHOLD:
                b.owner = unit.player
                b.capture_player = 0
                b.capture_progress = 0
                return True  # captured!
            unit.has_acted = True
            return False
    return False

def do_wait(unit):
    unit.has_moved = True
    unit.has_acted = True

def check_winner(state):
    """Check win conditions."""
    # Elimination: 0 units AND 0 factories AND 0 gold
    for p in [1, 2]:
        if (not state.player_units(p) and
            not state.player_factories(p) and
            state.gold[p] <= 0):
            state.winner = state.other_player(p)
            return

    # Timeout
    if state.round_num > MAX_ROUNDS:
        hp1 = sum(u.hp for u in state.player_units(1))
        hp2 = sum(u.hp for u in state.player_units(2))
        state.winner = 1 if hp1 >= hp2 else 2

def end_turn(state):
    """End current player's turn."""
    # Reset stale capture progress
    for b in state.buildings:
        if b.capture_player != 0:
            captor = None
            for u in state.units:
                if u.alive and u.x == b.x and u.y == b.y and u.player == b.capture_player:
                    captor = u
                    break
            if captor is None:
                b.capture_player = 0
                b.capture_progress = 0

    # Advance player
    if state.current_player == 1:
        state.current_player = 2
    else:
        state.current_player = 1
        state.round_num += 1

    # Economy: income + production at start of turn
    collect_income(state, state.current_player)
    process_production(state, state.current_player)

    # Reset unit flags for new current player
    for u in state.player_units(state.current_player):
        u.has_moved = False
        u.has_acted = False

    check_winner(state)

# ============================================================================
# AI Strategies
# ============================================================================

def get_attack_targets(state, unit):
    stats = unit.stats
    if not stats["can_attack_after_move"] and unit.has_moved:
        return []
    a_min, a_max = stats["range"]
    targets = []
    enemy = state.other_player(unit.player)
    for e in state.player_units(enemy):
        d = manhattan(unit.x, unit.y, e.x, e.y)
        if a_min <= d <= a_max:
            targets.append(e)
    return targets

def expected_damage_to(attacker, defender, def_terrain, moved):
    stats = attacker.stats
    if not stats["can_attack_after_move"] and moved:
        return 0
    dist = manhattan(attacker.x, attacker.y, defender.x, defender.y)
    a_min, a_max = stats["range"]
    if not (a_min <= dist <= a_max):
        return 0
    def_def = TERRAIN_DEFENSE[def_terrain]
    def_eva = TERRAIN_EVASION[def_terrain]
    rp = 5 if attacker.unit_type == UnitType.RANGER and dist == 3 else 0
    hc = hit_chance(stats["accuracy"], def_eva, moved, rp)
    hd = hit_damage(stats["atk"], def_def)
    gd = graze_damage(stats["atk"], def_def)
    return hc * hd + (1 - hc) * gd


def _neutral_cities(state):
    """Get all neutral (unowned) cities."""
    return [b for b in state.buildings if b.building_type == "city" and b.owner == 0]

def _uncaptured_cities(state, player):
    """Cities not owned by this player (neutral or enemy)."""
    return [b for b in state.buildings if b.building_type == "city" and b.owner != player]

def _try_send_infantry_to_capture(state, unit, player, rng, targets_buildings):
    """Try to move infantry toward a capturable building. Returns True if handled."""
    if unit.unit_type != UnitType.INFANTRY:
        return False
    if not targets_buildings:
        return False

    # Already on a building to capture?
    for b in targets_buildings:
        if b.x == unit.x and b.y == unit.y:
            if do_capture(state, unit):
                # Check HQ capture
                if b.building_type == "hq":
                    state.winner = player
                return True

    # Move toward nearest capturable building
    nearest = min(targets_buildings, key=lambda b: manhattan(unit.x, unit.y, b.x, b.y))
    dest = find_path_toward(state, unit, nearest.x, nearest.y)
    if dest:
        do_move(state, unit, dest[0], dest[1])
        # If arrived, capture
        for b in targets_buildings:
            if b.x == unit.x and b.y == unit.y:
                if do_capture(state, unit):
                    if b.building_type == "hq":
                        state.winner = player
                    return True
        # Attack if possible after moving
        targets = get_attack_targets(state, unit)
        if targets:
            target = min(targets, key=lambda t: t.hp)
            do_attack(state, rng, unit, target)
        else:
            do_wait(unit)
        return True
    return False


class Strategy:
    """Base strategy class."""
    name = "base"

    def play_turn(self, state, player, rng):
        raise NotImplementedError

    def do_economy(self, state, player, rng):
        """Override to implement build orders."""
        pass


class AggressiveStrategy(Strategy):
    name = "aggressive"

    def do_economy(self, state, player, rng):
        # Build Tanks when affordable, Infantry as filler
        for fac in state.player_factories(player):
            if fac.production_queue is not None:
                continue
            if state.gold[player] >= 3:
                build_unit(state, player, fac, UnitType.TANK)
            elif state.gold[player] >= 1:
                build_unit(state, player, fac, UnitType.INFANTRY)

    def play_turn(self, state, player, rng):
        self.do_economy(state, player, rng)
        enemy_hq = state.player_hq(state.other_player(player))
        units = state.player_units(player)
        capturable = _uncaptured_cities(state, player)
        enemies = state.player_units(state.other_player(player))
        units.sort(key=lambda u: manhattan(u.x, u.y, enemy_hq.x, enemy_hq.y) if enemy_hq else 0)

        for unit in units:
            if not unit.alive or unit.has_acted:
                continue

            # Try attack first without moving
            targets = get_attack_targets(state, unit)
            if targets:
                target = min(targets, key=lambda t: t.hp)
                do_attack(state, rng, unit, target)
                if state.winner:
                    return
                continue

            # Infantry: capture cities if no immediate threats nearby
            if unit.unit_type == UnitType.INFANTRY and capturable:
                nearby_enemies = [e for e in enemies if manhattan(unit.x, unit.y, e.x, e.y) <= 3]
                if not nearby_enemies:
                    if _try_send_infantry_to_capture(state, unit, player, rng, capturable):
                        if state.winner:
                            return
                        continue

            # Move toward nearest enemy
            if not enemies:
                # Try capture enemy HQ
                if enemy_hq and unit.unit_type == UnitType.INFANTRY:
                    _try_send_infantry_to_capture(state, unit, player, rng, [enemy_hq])
                    if state.winner:
                        return
                    continue
                do_wait(unit)
                continue

            if unit.unit_type == UnitType.RANGER:
                nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                dist = manhattan(unit.x, unit.y, nearest.x, nearest.y)
                if 2 <= dist <= 3:
                    do_wait(unit)
                    continue
                best_tile = _best_ranger_tile(state, unit, nearest)
                if best_tile:
                    do_move(state, unit, best_tile[0], best_tile[1])
                do_wait(unit)
                continue

            nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
            dest = find_path_toward(state, unit, nearest.x, nearest.y)
            if dest:
                do_move(state, unit, dest[0], dest[1])

            targets = get_attack_targets(state, unit)
            if targets:
                target = min(targets, key=lambda t: t.hp)
                do_attack(state, rng, unit, target)
                if state.winner:
                    return
            else:
                if unit.unit_type == UnitType.INFANTRY:
                    if do_capture(state, unit):
                        for b in state.buildings:
                            if b.x == unit.x and b.y == unit.y and b.building_type == "hq":
                                state.winner = player
                                return
                do_wait(unit)


class DefensiveStrategy(Strategy):
    name = "defensive"

    def do_economy(self, state, player, rng):
        # Build Rangers for zone control, Infantry for captures
        for fac in state.player_factories(player):
            if fac.production_queue is not None:
                continue
            if state.gold[player] >= 2:
                build_unit(state, player, fac, UnitType.RANGER)
            elif state.gold[player] >= 1:
                build_unit(state, player, fac, UnitType.INFANTRY)

    def play_turn(self, state, player, rng):
        self.do_economy(state, player, rng)
        own_hq = state.player_hq(player)
        units = state.player_units(player)
        capturable = _uncaptured_cities(state, player)
        enemies = state.player_units(state.other_player(player))

        for unit in units:
            if not unit.alive or unit.has_acted:
                continue

            targets = get_attack_targets(state, unit)
            if targets:
                killable = [t for t in targets if t.hp <= hit_damage(unit.stats["atk"], TERRAIN_DEFENSE[state.terrain_at(t.x, t.y)])]
                target = min(killable if killable else targets, key=lambda t: t.hp)
                do_attack(state, rng, unit, target)
                if state.winner:
                    return
                continue

            dist_to_hq = manhattan(unit.x, unit.y, own_hq.x, own_hq.y) if own_hq else 99

            # Early game (rounds 1-4): aggressively capture nearby cities to build a defensive perimeter
            if state.round_num <= 4 and unit.unit_type == UnitType.INFANTRY and own_hq:
                nearby_cities = [b for b in capturable if manhattan(b.x, b.y, own_hq.x, own_hq.y) <= 5]
                if nearby_cities:
                    if _try_send_infantry_to_capture(state, unit, player, rng, nearby_cities):
                        if state.winner:
                            return
                        continue

            # Send idle infantry to capture cities when no threats
            threats = [e for e in enemies if own_hq and manhattan(e.x, e.y, own_hq.x, own_hq.y) <= 5]
            if not threats and unit.unit_type == UnitType.INFANTRY and capturable:
                if _try_send_infantry_to_capture(state, unit, player, rng, capturable):
                    if state.winner:
                        return
                    continue

            if threats:
                nearest_threat = min(threats, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                if unit.unit_type == UnitType.RANGER:
                    best_tile = _best_ranger_tile(state, unit, nearest_threat)
                    if best_tile:
                        do_move(state, unit, best_tile[0], best_tile[1])
                    do_wait(unit)
                    continue
                dest = find_path_toward(state, unit, nearest_threat.x, nearest_threat.y)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
                targets = get_attack_targets(state, unit)
                if targets:
                    target = min(targets, key=lambda t: t.hp)
                    do_attack(state, rng, unit, target)
                    if state.winner:
                        return
                else:
                    do_wait(unit)
                continue

            if dist_to_hq > 3:
                dest = find_path_toward(state, unit, own_hq.x, own_hq.y)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
            do_wait(unit)


class RushStrategy(Strategy):
    name = "rush"

    def do_economy(self, state, player, rng):
        # Infantry only (cheap, fast capture)
        for fac in state.player_factories(player):
            if fac.production_queue is not None:
                continue
            if state.gold[player] >= 1:
                build_unit(state, player, fac, UnitType.INFANTRY)

    def play_turn(self, state, player, rng):
        self.do_economy(state, player, rng)
        enemy_hq = state.player_hq(state.other_player(player))
        units = state.player_units(player)
        capturable = _uncaptured_cities(state, player)

        infantry = [u for u in units if u.unit_type == UnitType.INFANTRY and u.alive and not u.has_acted]
        others = [u for u in units if u.unit_type != UnitType.INFANTRY and u.alive and not u.has_acted]

        # Split infantry: some rush HQ, some capture cities
        hq_rushers = []
        city_capturers = []
        if capturable and infantry:
            # Send up to half infantry to capture cities, rest rush HQ
            n_cap = max(1, len(infantry) // 2)
            # Sort by distance to nearest city
            for_cities = sorted(infantry, key=lambda u: min(manhattan(u.x, u.y, b.x, b.y) for b in capturable))
            city_capturers = for_cities[:n_cap]
            hq_rushers = for_cities[n_cap:]
        else:
            hq_rushers = infantry

        for unit in city_capturers:
            if _try_send_infantry_to_capture(state, unit, player, rng, capturable):
                if state.winner:
                    return
                continue
            hq_rushers.append(unit)  # fallback to rushing

        for unit in hq_rushers:
            if not unit.alive or unit.has_acted:
                continue
            if enemy_hq and unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                if do_capture(state, unit):
                    state.winner = player
                    return
                continue

            if enemy_hq:
                dest = find_path_toward(state, unit, enemy_hq.x, enemy_hq.y)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
                if unit.x == enemy_hq.x and unit.y == enemy_hq.y:
                    if do_capture(state, unit):
                        state.winner = player
                        return
                    continue

            targets = get_attack_targets(state, unit)
            if targets:
                target = min(targets, key=lambda t: t.hp)
                do_attack(state, rng, unit, target)
                if state.winner:
                    return
            else:
                do_wait(unit)

        for unit in others:
            if not unit.alive or unit.has_acted:
                continue
            targets = get_attack_targets(state, unit)
            if targets:
                target = min(targets, key=lambda t: t.hp)
                do_attack(state, rng, unit, target)
                if state.winner:
                    return
                continue

            enemies = state.player_units(state.other_player(player))
            if enemies:
                nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                if unit.unit_type == UnitType.RANGER:
                    best_tile = _best_ranger_tile(state, unit, nearest)
                    if best_tile:
                        do_move(state, unit, best_tile[0], best_tile[1])
                    do_wait(unit)
                    continue
                dest = find_path_toward(state, unit, nearest.x, nearest.y)
                if dest:
                    do_move(state, unit, dest[0], dest[1])
                targets = get_attack_targets(state, unit)
                if targets:
                    target = min(targets, key=lambda t: t.hp)
                    do_attack(state, rng, unit, target)
                    if state.winner:
                        return
                else:
                    do_wait(unit)
            else:
                do_wait(unit)


class BalancedStrategy(Strategy):
    name = "balanced"

    def do_economy(self, state, player, rng):
        # Adapt: Infantry early for city capture, Tanks/Rangers mid-game
        for fac in state.player_factories(player):
            if fac.production_queue is not None:
                continue
            owned_cities = len(state.player_cities(player))
            if state.round_num <= 8 or owned_cities < 2:
                # Early game: infantry for captures
                if state.gold[player] >= 1:
                    build_unit(state, player, fac, UnitType.INFANTRY)
            else:
                # Mid-game: Tanks if affordable, else Rangers
                if state.gold[player] >= 3:
                    build_unit(state, player, fac, UnitType.TANK)
                elif state.gold[player] >= 2:
                    build_unit(state, player, fac, UnitType.RANGER)
                elif state.gold[player] >= 1:
                    build_unit(state, player, fac, UnitType.INFANTRY)

    def play_turn(self, state, player, rng):
        self.do_economy(state, player, rng)
        enemy_hq = state.player_hq(state.other_player(player))
        own_hq = state.player_hq(player)
        units = state.player_units(player)
        enemies = state.player_units(state.other_player(player))
        capturable = _uncaptured_cities(state, player)

        infantry = [u for u in units if u.unit_type == UnitType.INFANTRY and u.alive and not u.has_acted]
        others = [u for u in units if u.unit_type != UnitType.INFANTRY and u.alive and not u.has_acted]

        # Pick closest infantry to enemy HQ as rusher
        rusher = None
        fighters = list(infantry)
        if infantry and enemy_hq:
            rusher = min(infantry, key=lambda u: manhattan(u.x, u.y, enemy_hq.x, enemy_hq.y))
            fighters = [u for u in infantry if u.uid != rusher.uid]

        # Send idle fighters to capture cities first
        remaining_fighters = []
        for unit in fighters:
            if capturable and not any(e for e in enemies if manhattan(unit.x, unit.y, e.x, e.y) <= 3):
                if _try_send_infantry_to_capture(state, unit, player, rng, capturable):
                    if state.winner:
                        return
                    continue
            remaining_fighters.append(unit)

        # Rusher goes for HQ
        if rusher and not rusher.has_acted:
            if enemy_hq and rusher.x == enemy_hq.x and rusher.y == enemy_hq.y:
                if do_capture(state, rusher):
                    state.winner = player
                    return
            elif enemy_hq:
                dest = find_path_toward(state, rusher, enemy_hq.x, enemy_hq.y)
                if dest:
                    do_move(state, rusher, dest[0], dest[1])
                if rusher.x == enemy_hq.x and rusher.y == enemy_hq.y:
                    if do_capture(state, rusher):
                        state.winner = player
                        return
                else:
                    targets = get_attack_targets(state, rusher)
                    if targets:
                        target = min(targets, key=lambda t: t.hp)
                        do_attack(state, rng, rusher, target)
                        if state.winner:
                            return
                    else:
                        do_wait(rusher)
            else:
                do_wait(rusher)

        # Others fight
        for unit in remaining_fighters + others:
            if not unit.alive or unit.has_acted:
                continue

            targets = get_attack_targets(state, unit)
            if targets:
                def score(t):
                    dt = state.terrain_at(t.x, t.y)
                    ed = expected_damage_to(unit, t, dt, unit.has_moved)
                    kill = 1 if ed >= t.hp else 0
                    return (-kill, -ed)
                target = min(targets, key=score)
                do_attack(state, rng, unit, target)
                if state.winner:
                    return
                continue

            if not enemies:
                do_wait(unit)
                continue

            if unit.unit_type == UnitType.RANGER:
                nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
                best_tile = _best_ranger_tile(state, unit, nearest)
                if best_tile:
                    do_move(state, unit, best_tile[0], best_tile[1])
                do_wait(unit)
                continue

            nearest = min(enemies, key=lambda e: manhattan(unit.x, unit.y, e.x, e.y))
            dest = find_path_toward(state, unit, nearest.x, nearest.y)
            if dest:
                do_move(state, unit, dest[0], dest[1])
            targets = get_attack_targets(state, unit)
            if targets:
                target = min(targets, key=lambda t: t.hp)
                do_attack(state, rng, unit, target)
                if state.winner:
                    return
            else:
                do_wait(unit)


def _best_ranger_tile(state, unit, target):
    """Find best reachable tile at range 2-3 from target."""
    tiles = reachable_tiles(state, unit)
    candidates = [(x, y) for (x, y) in tiles if 2 <= manhattan(x, y, target.x, target.y) <= 3]
    if not candidates:
        return find_path_toward(state, unit, target.x, target.y)
    def score(p):
        d = manhattan(p[0], p[1], target.x, target.y)
        t = state.terrain_at(p[0], p[1])
        return (0 if d == 2 else 1, -TERRAIN_DEFENSE[t])
    return min(candidates, key=score)


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
    gold_earned: dict = field(default_factory=dict)  # {1: int, 2: int}
    units_produced: dict = field(default_factory=dict)  # {1: int, 2: int}

def run_game(p1_strategy, p2_strategy, seed, verbose=False, coin_flip=False):
    """Run a single game. Returns GameResult."""
    rng = random.Random(seed)
    state = create_game(width=14, height=14, rng_seed=seed)
    if coin_flip:
        state.current_player = rng.choice([1, 2])
    strategies = {1: p1_strategy, 2: p2_strategy}

    initial_units = {1: len(state.player_units(1)), 2: len(state.player_units(2))}
    log = []

    while state.winner is None:
        player = state.current_player
        alive_before = {
            1: set(u.uid for u in state.player_units(1)),
            2: set(u.uid for u in state.player_units(2)),
        }

        strategies[player].play_turn(state, player, rng)

        if state.winner is None:
            end_turn(state)

        if verbose:
            alive_after = {
                1: set(u.uid for u in state.player_units(1)),
                2: set(u.uid for u in state.player_units(2)),
            }
            for p in [1, 2]:
                killed = alive_before[p] - alive_after[p]
                if killed:
                    log.append(f"  Round {state.round_num} P{player}: killed {len(killed)} P{p} unit(s)")

    # Count kills (include produced units)
    p1_final = len(state.player_units(1))
    p2_final = len(state.player_units(2))
    p1_total = initial_units[1] + state.units_produced[1]
    p2_total = initial_units[2] + state.units_produced[2]
    p1_kills = p2_total - p2_final
    p2_kills = p1_total - p1_final

    # Determine win type
    loser = 1 if state.winner == 2 else 2
    if state.round_num > MAX_ROUNDS:
        win_type = "timeout"
    elif state.player_units(loser):
        win_type = "hq_capture"
    else:
        win_type = "elimination"

    if verbose:
        for line in log:
            print(line)
        print(f"  → P{state.winner} wins ({win_type}) in {state.round_num} rounds | "
              f"kills: P1={p1_kills} P2={p2_kills} | "
              f"gold: P1={state.gold_earned[1]} P2={state.gold_earned[2]} | "
              f"produced: P1={state.units_produced[1]} P2={state.units_produced[2]}")

    return GameResult(
        winner=state.winner,
        rounds=state.round_num,
        p1_kills=p1_kills,
        p2_kills=p2_kills,
        win_type=win_type,
        gold_earned={1: state.gold_earned[1], 2: state.gold_earned[2]},
        units_produced={1: state.units_produced[1], 2: state.units_produced[2]},
    )

# ============================================================================
# Simulation
# ============================================================================

def run_simulation(strategy_names, num_games, base_seed, verbose=False, coin_flip=False):
    """Run all matchups and print results."""
    results = {}

    for s1_name in strategy_names:
        for s2_name in strategy_names:
            key = (s1_name, s2_name)
            s1 = STRATEGIES[s1_name]()
            s2 = STRATEGIES[s2_name]()
            game_results = []

            for i in range(num_games):
                seed = base_seed + hash(key) + i
                if verbose:
                    print(f"\n--- {s1_name} vs {s2_name} game {i+1} (seed={seed}) ---")
                result = run_game(s1, s2, seed, verbose, coin_flip=coin_flip)
                game_results.append(result)

            results[key] = game_results

    # Print summary
    print(f"\n{'='*90}")
    print(f"  HASHFRONT SIMULATION RESULTS — {num_games} games per matchup")
    print(f"{'='*90}\n")

    # Win rate matrix
    print("WIN RATE MATRIX (row = P1, col = P2, value = P1 win %)")
    print(f"{'':>14}", end="")
    for s in strategy_names:
        print(f"{s:>14}", end="")
    print()
    print("-" * (14 + 14 * len(strategy_names)))

    for s1 in strategy_names:
        print(f"{s1:>14}", end="")
        for s2 in strategy_names:
            gr = results[(s1, s2)]
            p1_wins = sum(1 for r in gr if r.winner == 1)
            pct = p1_wins / len(gr) * 100
            print(f"{pct:>13.1f}%", end="")
        print()

    print()

    # Detailed matchup stats
    header = (f"{'MATCHUP':<30} {'P1 Win%':>8} {'Avg Rnd':>8} {'P1 Kills':>9} {'P2 Kills':>9} "
              f"{'HQ Cap%':>8} {'Avg Gold':>9} {'Avg Prod':>9}")
    print(f"\n{header}")
    print("-" * len(header))

    for s1 in strategy_names:
        for s2 in strategy_names:
            gr = results[(s1, s2)]
            n = len(gr)
            p1w = sum(1 for r in gr if r.winner == 1)
            avg_rnd = sum(r.rounds for r in gr) / n
            avg_p1k = sum(r.p1_kills for r in gr) / n
            avg_p2k = sum(r.p2_kills for r in gr) / n
            hq_caps = sum(1 for r in gr if r.win_type == "hq_capture") / n * 100
            avg_gold = sum(r.gold_earned[1] + r.gold_earned[2] for r in gr) / n / 2
            avg_prod = sum(r.units_produced[1] + r.units_produced[2] for r in gr) / n / 2
            label = f"{s1} vs {s2}"
            print(f"{label:<30} {p1w/n*100:>7.1f}% {avg_rnd:>8.1f} {avg_p1k:>9.2f} {avg_p2k:>9.2f} "
                  f"{hq_caps:>7.1f}% {avg_gold:>9.1f} {avg_prod:>9.1f}")

    print(f"\n{'='*90}")
    print("  DONE")
    print(f"{'='*90}")

# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Hashfront headless game simulator")
    parser.add_argument("--games", type=int, default=100, help="Games per matchup (default: 100)")
    parser.add_argument("--seed", type=int, default=42, help="Base RNG seed (default: 42)")
    parser.add_argument("--verbose", action="store_true", help="Print per-game logs")
    parser.add_argument("--coin-flip", action="store_true", help="Randomize first player each game")
    parser.add_argument("--strategies", nargs="+", choices=list(STRATEGIES.keys()),
                        default=list(STRATEGIES.keys()),
                        help="Strategies to test (default: all)")
    args = parser.parse_args()

    print(f"Hashfront Game Simulator")
    flip_str = " | Coin flip: ON" if args.coin_flip else ""
    print(f"Games per matchup: {args.games} | Seed: {args.seed} | Strategies: {', '.join(args.strategies)}{flip_str}")
    run_simulation(args.strategies, args.games, args.seed, args.verbose, coin_flip=args.coin_flip)

if __name__ == "__main__":
    main()
