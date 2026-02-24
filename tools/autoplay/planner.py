"""AI turn planner v3 — strategy-driven tactics."""

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
    full_path_distance,
)
from strategy import Strategy, pick_strategy_adaptive

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
    For each tile, compute total damage enemies could deal next turn.
    Returns {(x,y): total_potential_damage}.
    """
    danger = {}
    grid = game_state.grid
    for enemy in enemies:
        epos = (enemy.x, enemy.y)
        atk = UNIT_ATK[enemy.unit_type]
        a_range = ATTACK_RANGE[enemy.unit_type]
        reachable = find_reachable(grid, epos, enemy.unit_type, set())
        for tile in reachable:
            for tx, ty in _tiles_in_attack_range(tile, a_range, 20, 20):
                tpos = (tx, ty)
                terrain = grid[ty][tx]
                defense = TERRAIN_DEFENSE.get(terrain, 0)
                dmg = max(atk - defense, 1)
                danger[tpos] = danger.get(tpos, 0) + dmg
    return danger


def _tiles_in_attack_range(pos, a_range, w, h):
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


# ── Focus fire target ordering ─────────────────────────────────────

def _assign_focus_targets(my_units, enemies, game_state, strat: Strategy):
    """
    Sort enemies by kill priority. With high focus_fire, strongly prefer
    the lowest-HP target. With low focus_fire, spread based on proximity.
    """
    if not enemies:
        return []

    cx = sum(u.x for u in my_units) / len(my_units)
    cy = sum(u.y for u in my_units) / len(my_units)

    scored = []
    for e in enemies:
        threat = UNIT_ATK[e.unit_type]
        dist = manhattan((e.x, e.y), (int(cx), int(cy)))
        # High focus_fire → HP dominates. Low → distance matters more.
        hp_weight = 10 * strat.focus_fire
        dist_weight = 5 * (1 - strat.focus_fire)
        score = e.hp * hp_weight + dist * dist_weight - threat * 2
        scored.append((score, e.unit_id, e))
    scored.sort()
    return [s[-1] for s in scored]


# ── Assassin targeting ─────────────────────────────────────────────

def _assign_assassin_targets(enemies, game_state):
    """For Assassin strategy: prioritize highest-value unit (tank > ranger > infantry)."""
    if not enemies:
        return []
    value = {TANK: 30, RANGER: 20, INFANTRY: 10}
    scored = []
    for e in enemies:
        v = value.get(e.unit_type, 10)
        scored.append((-v, e.hp, e.unit_id, e))
    scored.sort()
    return [s[-1] for s in scored]


# ── Main planner ───────────────────────────────────────────────────

def plan_turn(game_state: GameState, player_id: int) -> list:
    """
    Plan all actions for one turn using strategy-driven decision making.
    """
    actions = []
    my_units = game_state.alive_units(player_id)
    enemies = game_state.enemy_units(player_id)
    opponent_id = 2 if player_id == 1 else 1
    enemy_hq = game_state.get_hq(opponent_id)
    my_hq = game_state.get_hq(player_id)

    if not my_units:
        actions.append(EndTurnAction())
        return actions

    occupied = game_state.occupied_positions()
    current_round = game_state.info.round

    actionable = [u for u in my_units if u.last_acted_round < current_round]
    if not actionable:
        actions.append(EndTurnAction())
        return actions

    # Pick strategy for this game/player/round
    strat = pick_strategy_adaptive(game_state, player_id)

    if not enemies:
        # No enemies — capture march (all strategies agree here)
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

    if strat.name == "Assassin":
        focus_order = _assign_assassin_targets(enemies, game_state)
    else:
        focus_order = _assign_focus_targets(my_units, enemies, game_state, strat)

    already_targeted = {}

    # ── Classify units into roles based on strategy ──
    flankers = []
    screeners = []
    retreaters = []
    attackers = []

    # Separate infantry for flanking
    infantry = [u for u in actionable if u.unit_type == INFANTRY]
    others = [u for u in actionable if u.unit_type != INFANTRY]

    n_flankers = int(len(infantry) * strat.flank_ratio)
    # Flankers: furthest from enemies, closest to enemy HQ flank routes
    if n_flankers > 0 and enemy_hq:
        infantry.sort(key=lambda u: -manhattan((u.x, u.y), (
            sum(e.x for e in enemies) / len(enemies),
            sum(e.y for e in enemies) / len(enemies),
        )))
        flankers = infantry[:n_flankers]
        infantry = infantry[n_flankers:]

    # Screeners: low-HP infantry that shield higher-value units
    n_screeners = int(len(infantry) * strat.screen_ratio)
    if n_screeners > 0:
        infantry.sort(key=lambda u: u.hp)
        screeners = infantry[:n_screeners]
        infantry = infantry[n_screeners:]

    remaining = infantry + others

    # Triage: retreat vs attack
    for unit in remaining:
        upos = (unit.x, unit.y)
        incoming = danger_map.get(upos, 0)
        max_hp = UNIT_HP[unit.unit_type]
        # Retreat threshold: strategy controls how cautious we are
        hp_ratio = unit.hp / max_hp
        should_retreat = (
            hp_ratio <= strat.retreat_threshold
            and incoming > 0
            and unit.hp <= incoming
            and unit.hp < max_hp  # don't retreat at full HP
        )
        if should_retreat:
            retreaters.append(unit)
        else:
            attackers.append(unit)

    # ── Phase 1: Flankers sprint toward enemy HQ ──
    for unit in flankers:
        unit_pos = (unit.x, unit.y)
        a, new_pos = _plan_flanker(unit, unit_pos, enemy_hq, enemies,
                                     game_state, occupied, danger_map, strat)
        actions.extend(a)
        if new_pos != unit_pos:
            occupied.discard(unit_pos)
            occupied.add(new_pos)

    # ── Phase 2: Retreat damaged units ──
    for unit in retreaters:
        unit_pos = (unit.x, unit.y)
        a, new_pos = _plan_retreat(unit, unit_pos, enemies, danger_map,
                                    game_state, occupied, my_hq, strat)
        actions.extend(a)
        if new_pos != unit_pos:
            occupied.discard(unit_pos)
            occupied.add(new_pos)

    # ── Phase 3: Screeners position between enemies and rangers ──
    for unit in screeners:
        unit_pos = (unit.x, unit.y)
        a, new_pos = _plan_screener(unit, unit_pos, enemies, my_units,
                                      game_state, occupied, already_targeted, danger_map, strat)
        actions.extend(a)
        if new_pos != unit_pos:
            occupied.discard(unit_pos)
            occupied.add(new_pos)

    # ── Phase 4: Main combat force ──
    if focus_order:
        ft = focus_order[0]
        ft_pos = (ft.x, ft.y)
        attackers.sort(key=lambda u: manhattan((u.x, u.y), ft_pos))

    for unit in attackers:
        unit_pos = (unit.x, unit.y)
        a, new_pos = _plan_combat_unit(
            unit, unit_pos, enemies, focus_order,
            game_state, occupied, already_targeted, danger_map, strat,
        )
        actions.extend(a)
        if new_pos != unit_pos:
            occupied.discard(unit_pos)
            occupied.add(new_pos)

    actions.append(EndTurnAction())
    return actions


# ── Role-specific planners ─────────────────────────────────────────

def _plan_flanker(unit, unit_pos, enemy_hq, enemies, game_state, occupied, danger_map, strat):
    """Flanker: sprint toward enemy HQ, avoiding enemies when possible."""
    actions = []

    if not enemy_hq:
        actions.append(WaitAction(unit.unit_id))
        return actions, unit_pos

    # On HQ? Capture!
    if unit_pos == enemy_hq and unit.unit_type in (INFANTRY, RANGER):
        actions.append(CaptureAction(unit.unit_id))
        log.info(f"  🏴 Flanker #{unit.unit_id} CAPTURING HQ!")
        return actions, unit_pos

    occ = occupied - {unit_pos}
    reachable = find_reachable(game_state.grid, unit_pos, unit.unit_type, occ)

    # Score tiles: progress toward HQ, but penalize high danger
    true_dist = full_path_distance(game_state.grid, (0, 0), enemy_hq, unit.unit_type)
    best_tile = None
    best_score = float('inf')

    for tile, (cost, path) in reachable.items():
        if not path:
            continue
        d = true_dist.get(tile, float('inf'))
        tile_danger = danger_map.get(tile, 0)
        terrain = game_state.grid[tile[1]][tile[0]]
        defense = TERRAIN_DEFENSE.get(terrain, 0)
        # Flankers value progress highly, danger somewhat
        score = d * 2.0 + (tile_danger - defense) * 0.5
        if score < best_score:
            best_score = score
            best_tile = (tile, path)

    if best_tile and best_tile[0] != unit_pos:
        tile, path = best_tile
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = tile
        # Capture if we landed on HQ
        if new_pos == enemy_hq and unit.unit_type in (INFANTRY, RANGER):
            actions.append(CaptureAction(unit.unit_id))
            log.info(f"  🏴 Flanker #{unit.unit_id} reaches HQ {unit_pos}->{new_pos}, capturing!")
        else:
            log.info(f"  🏴 Flanker #{unit.unit_id} sprints {unit_pos}->{new_pos} toward HQ")
        actions.append(WaitAction(unit.unit_id))
        return actions, new_pos

    log.info(f"  🏴 Flanker #{unit.unit_id} stuck at {unit_pos}")
    actions.append(WaitAction(unit.unit_id))
    return actions, unit_pos


def _plan_retreat(unit, unit_pos, enemies, danger_map, game_state, occupied, my_hq, strat):
    """Move unit to safest reachable tile. Turtle strategy retreats toward own HQ."""
    actions = []
    occ = occupied - {unit_pos}
    reachable = find_reachable(game_state.grid, unit_pos, unit.unit_type, occ)

    enemy_center = (
        sum(e.x for e in enemies) / len(enemies),
        sum(e.y for e in enemies) / len(enemies),
    )
    best_tile = unit_pos
    best_score = _retreat_score(unit_pos, danger_map, game_state, enemy_center, my_hq, strat)

    for tile, (cost, path) in reachable.items():
        if not path:
            continue
        score = _retreat_score(tile, danger_map, game_state, enemy_center, my_hq, strat)
        if score < best_score:
            best_score = score
            best_tile = tile

    if best_tile != unit_pos:
        path = reachable[best_tile][1]
        actions.append(MoveAction(unit.unit_id, path))
        log.info(f"  🚑 #{unit.unit_id} RETREATS {unit_pos}->{best_tile} "
                 f"(hp={unit.hp}, danger={danger_map.get(unit_pos,0)}->{danger_map.get(best_tile,0)})")
    else:
        log.info(f"  🚑 #{unit.unit_id} holds (nowhere safer, hp={unit.hp})")

    actions.append(WaitAction(unit.unit_id))
    return actions, best_tile


def _retreat_score(tile, danger_map, game_state, enemy_center, my_hq, strat):
    """Lower is better. Combines danger, terrain defense, distance from enemies."""
    d = danger_map.get(tile, 0)
    terrain = game_state.grid[tile[1]][tile[0]]
    defense = TERRAIN_DEFENSE.get(terrain, 0)
    dist_enemy = manhattan(tile, (int(enemy_center[0]), int(enemy_center[1])))

    score = d - defense * strat.terrain_weight
    # Turtle: value being near own HQ
    if my_hq and strat.aggression < 0.3:
        dist_hq = manhattan(tile, my_hq)
        score += dist_hq * 0.5
    else:
        score -= dist_enemy * 0.3

    return score


def _plan_screener(unit, unit_pos, enemies, my_units, game_state, occupied,
                    already_targeted, danger_map, strat):
    """
    Screener: position between enemies and our high-value units (rangers).
    If adjacent to enemy, attack. Otherwise move to intercept position.
    """
    actions = []

    # If we can attack someone, do it
    target = _pick_focus_target_in_range(unit, unit_pos, enemies, game_state, already_targeted, strat)
    if target:
        actions.append(AttackAction(unit.unit_id, target.unit_id))
        _record_attack(unit, target, game_state, already_targeted)
        log.info(f"  🛡️ Screen #{unit.unit_id} attacks #{target.unit_id}")
        _append_wait_if_safe(actions, unit, unit_pos, target, game_state, already_targeted)
        return actions, unit_pos

    # Find our rangers to protect
    rangers = [u for u in my_units if u.unit_type == RANGER and u.is_alive]
    if not rangers:
        # No rangers — just act as normal melee
        return _plan_melee(unit, unit_pos, enemies, enemies, game_state, occupied,
                           already_targeted, danger_map, strat)

    # Position between nearest enemy and nearest ranger
    nearest_enemy = min(enemies, key=lambda e: manhattan(unit_pos, (e.x, e.y)))
    nearest_ranger = min(rangers, key=lambda r: manhattan(unit_pos, (r.x, r.y)))

    # Target tile: midpoint between enemy and ranger, biased toward enemy
    ex, ey = nearest_enemy.x, nearest_enemy.y
    rx, ry = nearest_ranger.x, nearest_ranger.y
    intercept = (int(ex * 0.6 + rx * 0.4), int(ey * 0.6 + ry * 0.4))

    occ = occupied - {unit_pos}
    path = best_move_toward(game_state.grid, unit_pos, intercept, unit.unit_type, occ)
    if path:
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = path[-1]
        # Attack if now adjacent
        target = _pick_focus_target_in_range(unit, new_pos, enemies, game_state, already_targeted, strat)
        if target:
            actions.append(AttackAction(unit.unit_id, target.unit_id))
            _record_attack(unit, target, game_state, already_targeted)
            log.info(f"  🛡️ Screen #{unit.unit_id} intercepts {unit_pos}->{new_pos}, attacks #{target.unit_id}")
        else:
            log.info(f"  🛡️ Screen #{unit.unit_id} positions {unit_pos}->{new_pos}")
        _append_wait_if_safe(actions, unit, new_pos, target, game_state, already_targeted)
        return actions, new_pos

    log.info(f"  🛡️ Screen #{unit.unit_id} holds at {unit_pos}")
    actions.append(WaitAction(unit.unit_id))
    return actions, unit_pos


def _plan_combat_unit(unit, unit_pos, enemies, focus_order, game_state,
                       occupied, already_targeted, danger_map, strat):
    """Dispatch to ranger or melee based on unit type."""
    if unit.unit_type == RANGER:
        return _plan_ranger(unit, unit_pos, enemies, focus_order,
                             game_state, occupied, already_targeted, danger_map, strat)
    else:
        return _plan_melee(unit, unit_pos, enemies, focus_order,
                            game_state, occupied, already_targeted, danger_map, strat)


def _plan_ranger(unit, unit_pos, enemies, focus_order, game_state,
                  occupied, already_targeted, danger_map, strat):
    """
    Ranger: snipe focus target if in range. Otherwise reposition to
    safe sniping position (terrain-aware kiting).
    """
    actions = []
    new_pos = unit_pos

    # Attack focus target from current position?
    target = _pick_focus_target_in_range(unit, unit_pos, focus_order, game_state, already_targeted, strat)
    if target:
        actions.append(AttackAction(unit.unit_id, target.unit_id))
        _record_attack(unit, target, game_state, already_targeted)
        log.info(f"  🎯 Ranger #{unit.unit_id} snipes #{target.unit_id} from {unit_pos}")
        _append_wait_if_safe(actions, unit, new_pos, target, game_state, already_targeted)
        return actions, new_pos

    # Reposition: find best sniping tile
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
        tile_danger = danger_map.get(tile, 0) - defense * strat.terrain_weight

        score = (0 if in_range else 1, tile_danger, d)
        if score < best_score:
            best_score = score
            best_tile = (tile, path)

    if best_tile and best_tile[0] != unit_pos:
        tile, path = best_tile
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = tile

        target = _pick_focus_target_in_range(unit, new_pos, focus_order, game_state, already_targeted, strat)
        if target:
            actions.append(AttackAction(unit.unit_id, target.unit_id))
            _record_attack(unit, target, game_state, already_targeted)
            log.info(f"  🎯 Ranger #{unit.unit_id} repositions {unit_pos}->{new_pos}, snipes #{target.unit_id}")
        else:
            log.info(f"  🎯 Ranger #{unit.unit_id} kites {unit_pos}->{new_pos}")
    else:
        path = best_move_toward(game_state.grid, unit_pos, primary_pos, unit.unit_type, occ)
        if path:
            actions.append(MoveAction(unit.unit_id, path))
            new_pos = path[-1]
            log.info(f"  🎯 Ranger #{unit.unit_id} advances {unit_pos}->{new_pos}")
        else:
            log.info(f"  🎯 Ranger #{unit.unit_id} stuck at {unit_pos}")

    _append_wait_if_safe(actions, unit, new_pos, None, game_state, already_targeted)
    return actions, new_pos


def _plan_melee(unit, unit_pos, enemies, focus_order, game_state,
                 occupied, already_targeted, danger_map, strat):
    """
    Melee (infantry/tank): attack focus target if adjacent, else advance.
    Turtle strategy: prefer to hold defensive terrain and only attack if target comes to us.
    """
    actions = []
    new_pos = unit_pos

    # Already adjacent to focus target?
    target = _pick_focus_target_in_range(unit, unit_pos, focus_order, game_state, already_targeted, strat)
    if target:
        actions.append(AttackAction(unit.unit_id, target.unit_id))
        _record_attack(unit, target, game_state, already_targeted)
        log.info(f"  ⚔️ {unit.unit_type} #{unit.unit_id} attacks #{target.unit_id} at {unit_pos}")
        _append_wait_if_safe(actions, unit, new_pos, target, game_state, already_targeted)
        return actions, new_pos

    # Turtle: don't advance if we're on good terrain and aggression is low
    if strat.aggression < 0.3:
        terrain = game_state.grid[unit_pos[1]][unit_pos[0]]
        defense = TERRAIN_DEFENSE.get(terrain, 0)
        if defense >= 1:
            log.info(f"  🐢 {unit.unit_type} #{unit.unit_id} holds {unit_pos} (def={defense}, turtle)")
            actions.append(WaitAction(unit.unit_id))
            return actions, unit_pos

    # Advance toward focus target
    primary = focus_order[0] if focus_order else enemies[0]
    primary_pos = (primary.x, primary.y)
    occ = occupied - {unit_pos}

    # Try to reach adjacent to target
    path = find_adjacent_to(game_state.grid, primary_pos, unit.unit_type, unit_pos, occ)
    if path:
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = path[-1]
        target = _pick_focus_target_in_range(unit, new_pos, focus_order, game_state, already_targeted, strat)
        if target:
            actions.append(AttackAction(unit.unit_id, target.unit_id))
            _record_attack(unit, target, game_state, already_targeted)
            log.info(f"  ⚔️ {unit.unit_type} #{unit.unit_id} charges {unit_pos}->{new_pos}, attacks #{target.unit_id}")
        else:
            log.info(f"  ⚔️ {unit.unit_type} #{unit.unit_id} advances {unit_pos}->{new_pos}")
    else:
        # Can't reach adjacent — pick best advance tile
        reachable = find_reachable(game_state.grid, unit_pos, unit.unit_type, occ)
        result = _best_advance_tile(reachable, primary_pos, game_state, danger_map, unit.unit_type, strat)
        if result:
            tile, r_path = result
            actions.append(MoveAction(unit.unit_id, r_path))
            new_pos = tile
            log.info(f"  ⚔️ {unit.unit_type} #{unit.unit_id} advances {unit_pos}->{new_pos}")
        else:
            log.info(f"  ⚔️ {unit.unit_type} #{unit.unit_id} stuck at {unit_pos}")

    _append_wait_if_safe(actions, unit, new_pos, None, game_state, already_targeted)
    return actions, new_pos


def _best_advance_tile(reachable, goal_pos, game_state, danger_map, unit_type, strat):
    """Pick reachable tile balancing progress, safety, and terrain defense."""
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
        # Strategy shapes the scoring
        score = (d * (2.0 - strat.aggression)          # aggressive = care less about distance
                 - defense * strat.terrain_weight        # terrain lovers value defense more
                 + tile_danger * (0.5 - strat.aggression * 0.3))  # aggressive = ignore danger
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


def _pick_focus_target_in_range(unit, unit_pos, targets, game_state, already_targeted, strat):
    """Pick the highest-priority target in attack range."""
    for target in targets:
        if not target.is_alive:
            continue
        prior_dmg = already_targeted.get(target.unit_id, 0)
        if target.hp <= prior_dmg:
            continue
        if in_attack_range(unit.unit_type, unit_pos, (target.x, target.y)):
            return target

    # If no focus target in range, check any enemy in range (opportunistic)
    if strat.focus_fire < 0.8:
        enemies = [t for t in targets]  # already the full list
        for e in game_state.enemy_units(0):  # fallback
            pass
    return None


def _record_attack(unit, target, game_state, already_targeted):
    terrain = game_state.grid[target.y][target.x]
    defense = TERRAIN_DEFENSE.get(terrain, 0)
    dmg = max(UNIT_ATK[unit.unit_type] - defense, 1)
    already_targeted[target.unit_id] = already_targeted.get(target.unit_id, 0) + dmg


def _append_wait_if_safe(actions, unit, pos, last_target, game_state, already_targeted):
    """Add WaitAction unless counterattack would kill us."""
    if not actions:
        actions.append(WaitAction(unit.unit_id))
        return

    if last_target and last_target.is_alive:
        prior_dmg = already_targeted.get(last_target.unit_id, 0)
        target_alive_after = last_target.hp - prior_dmg > 0
        if target_alive_after:
            our_terrain = game_state.grid[pos[1]][pos[0]]
            our_def = TERRAIN_DEFENSE.get(our_terrain, 0)
            counter_dmg = max(UNIT_ATK.get(last_target.unit_type, 0) - our_def, 1)
            if unit.hp <= counter_dmg:
                return

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
