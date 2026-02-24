"""AI turn planner v2 — smarter tactics: focus fire, retreat, terrain, kiting."""

import logging
from dataclasses import dataclass
from typing import Optional

from config import (
    INFANTRY, RANGER, TANK, MOVE_RANGE, ATTACK_RANGE,
    UNIT_ATK, UNIT_HP, TERRAIN_DEFENSE,
)
from state import GameState, Unit
from pathfinder import (
    manhattan, neighbors, find_reachable, best_move_toward,
    find_attack_position, find_adjacent_to, move_cost,
)

log = logging.getLogger("planner")

# ── Action dataclasses ──────────────────────────────────────────────

@dataclass
class MoveAction:
    unit_id: int
    path: list

@dataclass
class AttackAction:
    unit_id: int
    target_id: int

@dataclass
class CaptureAction:
    unit_id: int

@dataclass
class WaitAction:
    unit_id: int

@dataclass
class EndTurnAction:
    pass


# ── Threat / danger map ────────────────────────────────────────────

def build_danger_map(game_state: GameState, enemies: list) -> dict:
    """
    For each tile, compute total damage enemies *could* deal next turn.
    An enemy can move (full range) + attack from new position.
    Returns {(x,y): total_potential_damage}.
    """
    danger = {}
    grid = game_state.grid
    # Use empty occupied set — enemies can move freely in theory
    for enemy in enemies:
        epos = (enemy.x, enemy.y)
        atk = UNIT_ATK[enemy.unit_type]
        a_range = ATTACK_RANGE[enemy.unit_type]

        # All tiles enemy can reach (including current position)
        reachable = find_reachable(grid, epos, enemy.unit_type, set())
        for tile in reachable:
            # From this tile, what can enemy attack?
            for tx, ty in _tiles_in_attack_range(tile, a_range, 20, 20):
                tpos = (tx, ty)
                terrain = grid[ty][tx]
                defense = TERRAIN_DEFENSE.get(terrain, 0)
                dmg = max(atk - defense, 1)
                danger[tpos] = danger.get(tpos, 0) + dmg
    return danger


def _tiles_in_attack_range(pos, a_range, w, h):
    """Yield all tiles within attack range of pos."""
    if isinstance(a_range, tuple):
        min_r, max_r = a_range
    else:
        min_r, max_r = a_range, a_range
    x0, y0 = pos
    for dx in range(-max_r, max_r + 1):
        for dy in range(-max_r, max_r + 1):
            d = abs(dx) + abs(dy)
            if min_r <= d <= max_r:
                nx, ny = x0 + dx, y0 + dy
                if 0 <= nx < w and 0 <= ny < h:
                    yield nx, ny


# ── Focus fire: assign kill targets ────────────────────────────────

def _assign_focus_targets(my_units, enemies, game_state):
    """
    Assign enemies as priority targets. Focus fire = kill one at a time.
    Returns sorted enemy list — units should prefer targets at the top.
    Prioritize: lowest effective HP (easiest to kill) > highest threat > closest to our army.
    """
    if not enemies:
        return []

    # Center of our army
    cx = sum(u.x for u in my_units) / len(my_units)
    cy = sum(u.y for u in my_units) / len(my_units)

    scored = []
    for e in enemies:
        threat = UNIT_ATK[e.unit_type]  # higher threat = prioritize
        dist_to_us = manhattan((e.x, e.y), (int(cx), int(cy)))
        scored.append((
            e.hp,           # low HP first (easiest kill)
            -threat,        # high threat first
            dist_to_us,     # closer first
            e.unit_id,
            e,
        ))
    scored.sort()
    return [s[-1] for s in scored]


# ── Terrain-aware positioning ──────────────────────────────────────

def _best_defensive_tile(reachable: dict, game_state: GameState, goal_pos: tuple):
    """
    Among reachable tiles, pick the one that balances progress toward
    goal with terrain defense. Returns (tile, path) or None.
    """
    from pathfinder import full_path_distance
    grid = game_state.grid

    # True distances to goal
    # (We accept any unit type for distance since this is heuristic)
    # Use infantry to get most permissive distances
    true_dist = full_path_distance(grid, (0, 0), goal_pos, INFANTRY)

    best = None
    best_score = float('inf')
    for tile, (cost, path) in reachable.items():
        if not path:
            continue
        d = true_dist.get(tile, float('inf'))
        terrain = grid[tile[1]][tile[0]]
        defense = TERRAIN_DEFENSE.get(terrain, 0)
        # Score: distance matters most, but favor defensive tiles
        # Each defense point is "worth" ~2 tiles of progress
        score = d - defense * 2
        if score < best_score:
            best_score = score
            best = (tile, path)
    return best


# ── Main planner ───────────────────────────────────────────────────

def plan_turn(game_state: GameState, player_id: int) -> list:
    """
    Plan all actions for one turn.

    v2 Strategy:
    1. Build danger map (where can enemies hit us next turn?)
    2. Focus fire: prioritize killing one enemy at a time
    3. Retreat damaged units out of danger
    4. Rangers kite: attack then reposition if possible
    5. Melee: advance through defensive terrain when possible
    6. If all enemies dead: march to capture HQ
    """
    actions = []
    my_units = game_state.alive_units(player_id)
    enemies = game_state.enemy_units(player_id)
    opponent_id = 2 if player_id == 1 else 1
    enemy_hq = game_state.get_hq(opponent_id)

    if not my_units:
        actions.append(EndTurnAction())
        return actions

    occupied = game_state.occupied_positions()
    current_round = game_state.info.round

    # Filter to actionable units
    actionable = [u for u in my_units if u.last_acted_round < current_round]
    if not actionable:
        actions.append(EndTurnAction())
        return actions

    if not enemies:
        # No enemies — capture march
        if enemy_hq:
            actionable.sort(key=lambda u: manhattan((u.x, u.y), enemy_hq))
        for unit in actionable:
            unit_pos = (unit.x, unit.y)
            a, new_pos = _plan_capture_march(unit, unit_pos, enemy_hq, game_state, occupied)
            actions.extend(a)
            if new_pos != unit_pos:
                occupied.discard(unit_pos)
                occupied.add(new_pos)
        actions.append(EndTurnAction())
        return actions

    # ── Build tactical context ──
    danger_map = build_danger_map(game_state, enemies)
    focus_order = _assign_focus_targets(my_units, enemies, game_state)
    already_targeted = {}  # {enemy_unit_id: total_expected_damage}

    # ── Phase 1: Triage units into roles ──
    retreaters = []   # damaged, should flee
    attackers = []    # can contribute to combat
    for unit in actionable:
        upos = (unit.x, unit.y)
        incoming = danger_map.get(upos, 0)
        # Retreat if: HP is low AND we're in danger
        # Threshold: retreat if we'd die to incoming damage
        if unit.hp <= incoming and unit.hp < UNIT_HP[unit.unit_type]:
            retreaters.append(unit)
        else:
            attackers.append(unit)

    # ── Phase 2: Retreat damaged units ──
    for unit in retreaters:
        unit_pos = (unit.x, unit.y)
        a, new_pos = _plan_retreat(unit, unit_pos, enemies, danger_map, game_state, occupied)
        actions.extend(a)
        if new_pos != unit_pos:
            occupied.discard(unit_pos)
            occupied.add(new_pos)

    # ── Phase 3: Attack with remaining units ──
    # Sort attackers: those closest to focus target #1 go first
    if focus_order:
        ft = focus_order[0]
        ft_pos = (ft.x, ft.y)
        attackers.sort(key=lambda u: manhattan((u.x, u.y), ft_pos))

    for unit in attackers:
        unit_pos = (unit.x, unit.y)
        a, new_pos = _plan_combat_unit(
            unit, unit_pos, enemies, focus_order,
            game_state, occupied, already_targeted, danger_map,
        )
        actions.extend(a)
        if new_pos != unit_pos:
            occupied.discard(unit_pos)
            occupied.add(new_pos)

    actions.append(EndTurnAction())
    return actions


# ── Unit planning functions ────────────────────────────────────────

def _plan_retreat(unit, unit_pos, enemies, danger_map, game_state, occupied):
    """Move unit to the safest reachable tile (lowest danger)."""
    actions = []
    occ = occupied - {unit_pos}
    reachable = find_reachable(game_state.grid, unit_pos, unit.unit_type, occ)

    # Pick tile with lowest danger that's further from enemies
    enemy_center = (
        sum(e.x for e in enemies) / len(enemies),
        sum(e.y for e in enemies) / len(enemies),
    )
    best_tile = unit_pos
    best_score = (danger_map.get(unit_pos, 0), -manhattan(unit_pos, (int(enemy_center[0]), int(enemy_center[1]))))

    for tile, (cost, path) in reachable.items():
        if not path:
            continue
        d = danger_map.get(tile, 0)
        dist_from_enemy = manhattan(tile, (int(enemy_center[0]), int(enemy_center[1])))
        terrain = game_state.grid[tile[1]][tile[0]]
        defense = TERRAIN_DEFENSE.get(terrain, 0)
        # Prefer: low danger, high defense, far from enemies
        score = (d - defense, -dist_from_enemy)
        if score < best_score:
            best_score = score
            best_tile = tile

    if best_tile != unit_pos:
        path = reachable[best_tile][1]
        actions.append(MoveAction(unit.unit_id, path))
        log.info(f"  #{unit.unit_id} RETREATS {unit_pos}->{best_tile} (hp={unit.hp}, danger={danger_map.get(unit_pos,0)}->{danger_map.get(best_tile,0)})")
        actions.append(WaitAction(unit.unit_id))
        return actions, best_tile
    else:
        log.info(f"  #{unit.unit_id} wants to retreat but nowhere safer (hp={unit.hp})")
        # Fall through — will wait in place
        actions.append(WaitAction(unit.unit_id))
        return actions, unit_pos


def _plan_combat_unit(unit, unit_pos, enemies, focus_order, game_state,
                       occupied, already_targeted, danger_map):
    """Plan combat actions for a unit — dispatches to ranger/melee logic."""
    if unit.unit_type == RANGER:
        return _plan_ranger_v2(unit, unit_pos, enemies, focus_order,
                                game_state, occupied, already_targeted, danger_map)
    else:
        return _plan_melee_v2(unit, unit_pos, enemies, focus_order,
                               game_state, occupied, already_targeted, danger_map)


def _pick_focus_target_in_range(unit, unit_pos, focus_order, game_state, already_targeted):
    """Pick the highest-priority focus target that's in attack range."""
    for target in focus_order:
        if not target.is_alive:
            continue
        prior_dmg = already_targeted.get(target.unit_id, 0)
        if target.hp <= prior_dmg:
            continue  # already dead from focus fire
        if in_attack_range(unit.unit_type, unit_pos, (target.x, target.y)):
            return target
    return None


def _plan_ranger_v2(unit, unit_pos, enemies, focus_order, game_state,
                     occupied, already_targeted, danger_map):
    """
    Ranger v2: Attack focus target if in range. Otherwise reposition to
    a sniping spot that's low-danger (kiting).
    """
    actions = []
    new_pos = unit_pos

    # Can we attack a focus target from current position?
    target = _pick_focus_target_in_range(unit, unit_pos, focus_order, game_state, already_targeted)
    if target:
        actions.append(AttackAction(unit.unit_id, target.unit_id))
        _record_attack(unit, target, game_state, already_targeted)
        log.info(f"  Ranger #{unit.unit_id} snipes #{target.unit_id} (focus) from {unit_pos}")
        _append_wait_if_safe(actions, unit, new_pos, target, game_state, already_targeted)
        return actions, new_pos

    # No target in range — move to best sniping position
    # Prefer tiles that are: in range of focus target #1, low danger, high defense
    primary = focus_order[0] if focus_order else enemies[0]
    primary_pos = (primary.x, primary.y)

    occ = occupied - {unit_pos}
    reachable = find_reachable(game_state.grid, unit_pos, unit.unit_type, occ)

    best_tile = None
    best_score = (float('inf'),)
    a_range = ATTACK_RANGE[RANGER]

    for tile, (cost, path) in reachable.items():
        if not path:
            continue
        d = manhattan(tile, primary_pos)
        in_range = a_range[0] <= d <= a_range[1]
        terrain = game_state.grid[tile[1]][tile[0]]
        defense = TERRAIN_DEFENSE.get(terrain, 0)
        tile_danger = danger_map.get(tile, 0) - defense

        # Score: prefer in-range tiles, then low danger
        score = (0 if in_range else 1, tile_danger, d)
        if score < best_score:
            best_score = score
            best_tile = (tile, path)

    if best_tile and best_tile[0] != unit_pos:
        tile, path = best_tile
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = tile

        # Check if we can attack from new position
        target = _pick_focus_target_in_range(unit, new_pos, focus_order, game_state, already_targeted)
        if target:
            actions.append(AttackAction(unit.unit_id, target.unit_id))
            _record_attack(unit, target, game_state, already_targeted)
            log.info(f"  Ranger #{unit.unit_id} repositions {unit_pos}->{new_pos}, snipes #{target.unit_id}")
        else:
            log.info(f"  Ranger #{unit.unit_id} repositions {unit_pos}->{new_pos} (kiting)")
    else:
        # Can't reach a good position, try just moving closer
        path = best_move_toward(game_state.grid, unit_pos, primary_pos, unit.unit_type, occ)
        if path:
            actions.append(MoveAction(unit.unit_id, path))
            new_pos = path[-1]
            log.info(f"  Ranger #{unit.unit_id} advances {unit_pos}->{new_pos}")
        else:
            log.info(f"  Ranger #{unit.unit_id} stuck at {unit_pos}")

    _append_wait_if_safe(actions, unit, new_pos, None, game_state, already_targeted)
    return actions, new_pos


def _plan_melee_v2(unit, unit_pos, enemies, focus_order, game_state,
                    occupied, already_targeted, danger_map):
    """
    Melee v2: Attack focus target if adjacent. Otherwise advance through
    defensive terrain toward focus target.
    """
    actions = []
    new_pos = unit_pos

    # Already adjacent to focus target?
    target = _pick_focus_target_in_range(unit, unit_pos, focus_order, game_state, already_targeted)
    if target:
        actions.append(AttackAction(unit.unit_id, target.unit_id))
        _record_attack(unit, target, game_state, already_targeted)
        log.info(f"  {unit.unit_type} #{unit.unit_id} attacks #{target.unit_id} (focus) at {unit_pos}")
        _append_wait_if_safe(actions, unit, new_pos, target, game_state, already_targeted)
        return actions, new_pos

    # Move toward focus target — prefer defensive tiles
    primary = focus_order[0] if focus_order else enemies[0]
    primary_pos = (primary.x, primary.y)
    occ = occupied - {unit_pos}

    # Try to reach a tile adjacent to primary target
    path = find_adjacent_to(game_state.grid, primary_pos, unit.unit_type, unit_pos, occ)
    if path:
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = path[-1]

        target = _pick_focus_target_in_range(unit, new_pos, focus_order, game_state, already_targeted)
        if target:
            actions.append(AttackAction(unit.unit_id, target.unit_id))
            _record_attack(unit, target, game_state, already_targeted)
            log.info(f"  {unit.unit_type} #{unit.unit_id} charges {unit_pos}->{new_pos}, attacks #{target.unit_id}")
        else:
            log.info(f"  {unit.unit_type} #{unit.unit_id} advances {unit_pos}->{new_pos}")
    else:
        # Can't reach adjacent — pick best tile toward target favoring defense
        reachable = find_reachable(game_state.grid, unit_pos, unit.unit_type, occ)
        result = _best_advance_tile(reachable, primary_pos, game_state, danger_map, unit.unit_type)
        if result:
            tile, r_path = result
            actions.append(MoveAction(unit.unit_id, r_path))
            new_pos = tile
            log.info(f"  {unit.unit_type} #{unit.unit_id} advances {unit_pos}->{new_pos} (def terrain)")
        else:
            log.info(f"  {unit.unit_type} #{unit.unit_id} stuck at {unit_pos}")

    _append_wait_if_safe(actions, unit, new_pos, None, game_state, already_targeted)
    return actions, new_pos


def _best_advance_tile(reachable, goal_pos, game_state, danger_map, unit_type):
    """Pick reachable tile that balances progress toward goal with safety."""
    from pathfinder import full_path_distance
    grid = game_state.grid
    true_dist = full_path_distance(grid, (0, 0), goal_pos, unit_type)

    best = None
    best_score = float('inf')
    for tile, (cost, path) in reachable.items():
        if not path:
            continue
        d = true_dist.get(tile, float('inf'))
        if d == float('inf'):
            continue
        terrain = grid[tile[1]][tile[0]]
        defense = TERRAIN_DEFENSE.get(terrain, 0)
        tile_danger = danger_map.get(tile, 0)
        # Score: progress is king, but defense is tiebreaker
        # Each defense point offsets ~1.5 tiles of distance
        score = d - defense * 1.5 + tile_danger * 0.3
        if score < best_score:
            best_score = score
            best = (tile, path)
    return best


# ── Shared helpers ─────────────────────────────────────────────────

def in_attack_range(unit_type: str, attacker_pos: tuple, target_pos: tuple) -> bool:
    dist = manhattan(attacker_pos, target_pos)
    r = ATTACK_RANGE[unit_type]
    if isinstance(r, tuple):
        return r[0] <= dist <= r[1]
    return dist == r


def _record_attack(unit, target, game_state, already_targeted):
    terrain = game_state.grid[target.y][target.x]
    defense = TERRAIN_DEFENSE.get(terrain, 0)
    dmg = max(UNIT_ATK[unit.unit_type] - defense, 1)
    already_targeted[target.unit_id] = already_targeted.get(target.unit_id, 0) + dmg


def _append_wait_if_safe(actions, unit, pos, last_target, game_state, already_targeted):
    """Add WaitAction unless we'd die from counterattack."""
    if not actions:
        actions.append(WaitAction(unit.unit_id))
        return

    # If we attacked, check if the target's counter would kill us
    if last_target and last_target.is_alive:
        prior_dmg = already_targeted.get(last_target.unit_id, 0)
        target_alive_after = last_target.hp - prior_dmg > 0
        if target_alive_after:
            our_terrain = game_state.grid[pos[1]][pos[0]]
            our_def = TERRAIN_DEFENSE.get(our_terrain, 0)
            counter_dmg = max(UNIT_ATK.get(last_target.unit_type, 0) - our_def, 1)
            if unit.hp <= counter_dmg:
                return  # skip wait — we'd die

    actions.append(WaitAction(unit.unit_id))


def _plan_capture_march(unit, unit_pos, enemy_hq, game_state, occupied):
    """March toward enemy HQ. If on HQ, capture."""
    actions = []
    new_pos = unit_pos

    if unit_pos == enemy_hq:
        if unit.unit_type in (INFANTRY, RANGER):
            actions.append(CaptureAction(unit.unit_id))
            log.info(f"  #{unit.unit_id} CAPTURING HQ at {enemy_hq}!")
        else:
            log.info(f"  Tank #{unit.unit_id} on HQ but can't capture, waiting")
        return actions, new_pos

    occ = occupied - {unit_pos}
    path = best_move_toward(game_state.grid, unit_pos, enemy_hq, unit.unit_type, occ)
    if path:
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = path[-1]

        if new_pos == enemy_hq and unit.unit_type in (INFANTRY, RANGER):
            actions.append(CaptureAction(unit.unit_id))
            log.info(f"  #{unit.unit_id} reached HQ {enemy_hq}, capturing!")
        else:
            log.info(f"  #{unit.unit_id} marching toward HQ: {unit_pos}->{new_pos}")
    else:
        log.info(f"  #{unit.unit_id} stuck marching to HQ from {unit_pos}")

    return actions, new_pos
