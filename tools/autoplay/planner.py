"""AI turn planner — decides actions for each unit."""

import logging
from dataclasses import dataclass
from typing import Optional

from config import (
    INFANTRY, RANGER, TANK, MOVE_RANGE, ATTACK_RANGE,
    UNIT_ATK, TERRAIN_DEFENSE,
)
from state import GameState, Unit
from pathfinder import (
    manhattan, best_move_toward, find_attack_position, find_adjacent_to,
)

log = logging.getLogger("planner")


@dataclass
class MoveAction:
    unit_id: int
    path: list  # list of (x, y) steps


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


def in_attack_range(unit_type: str, attacker_pos: tuple, target_pos: tuple) -> bool:
    """Check if target is in attack range."""
    dist = manhattan(attacker_pos, target_pos)
    r = ATTACK_RANGE[unit_type]
    if isinstance(r, tuple):
        return r[0] <= dist <= r[1]
    return dist == r


def pick_attack_target(unit: Unit, unit_pos: tuple, enemies: list, game_state: GameState,
                        already_targeted: dict = None) -> Optional[Unit]:
    """
    Pick best target in range. Prioritize: low HP > high value > closest.
    already_targeted: dict of {unit_id: total_expected_damage} to avoid overkill.
    """
    if already_targeted is None:
        already_targeted = {}

    in_range = []
    for enemy in enemies:
        if not enemy.is_alive:
            continue
        if in_attack_range(unit.unit_type, unit_pos, (enemy.x, enemy.y)):
            # Calculate expected damage
            terrain = game_state.grid[enemy.y][enemy.x]
            defense = TERRAIN_DEFENSE.get(terrain, 0)
            dmg = max(UNIT_ATK[unit.unit_type] - defense, 1)

            # Check if target would already be dead from prior attacks
            prior_dmg = already_targeted.get(enemy.unit_id, 0)
            if enemy.hp <= prior_dmg:
                continue  # already dead from prior attacks, skip

            effective_hp = enemy.hp - prior_dmg
            can_kill = effective_hp <= dmg
            in_range.append((
                0 if can_kill else 1,  # kills first
                effective_hp,          # then low effective HP
                -dmg,                  # then high damage dealt
                manhattan(unit_pos, (enemy.x, enemy.y)),
                enemy,
                dmg,
            ))
    if not in_range:
        return None
    in_range.sort()
    return in_range[0][-2]  # return the Unit (second to last element)


def plan_turn(game_state: GameState, player_id: int) -> list:
    """
    Plan all actions for one turn. Returns list of action objects.
    Strategy:
    1. If enemies alive: attack if in range, otherwise march toward nearest enemy
    2. If all enemies dead: march toward enemy HQ and capture
    3. Rangers: snipe from range 2-3 (never move + attack)
    4. Infantry/Tank: move adjacent and attack
    """
    actions = []
    my_units = game_state.alive_units(player_id)
    enemies = game_state.enemy_units(player_id)
    opponent_id = 2 if player_id == 1 else 1
    enemy_hq = game_state.get_hq(opponent_id)

    if not my_units:
        # No units, just end turn
        actions.append(EndTurnAction())
        return actions

    # Simulated occupied set — updates as we plan each unit's move
    occupied = game_state.occupied_positions()

    # Sort units: closest to enemy center move first (front-to-back)
    if enemies:
        cx = sum(e.x for e in enemies) / len(enemies)
        cy = sum(e.y for e in enemies) / len(enemies)
        my_units.sort(key=lambda u: manhattan((u.x, u.y), (int(cx), int(cy))))
    elif enemy_hq:
        my_units.sort(key=lambda u: manhattan((u.x, u.y), enemy_hq))

    # Track expected damage dealt to each enemy to avoid overkill
    already_targeted = {}  # {enemy_unit_id: total_expected_damage}

    for unit in my_units:
        unit_pos = (unit.x, unit.y)
        unit_actions = _plan_unit(unit, unit_pos, enemies, enemy_hq, game_state, occupied, already_targeted)
        actions.extend(unit_actions)

    actions.append(EndTurnAction())
    return actions


def _plan_unit(unit, unit_pos, enemies, enemy_hq, game_state, occupied, already_targeted):
    """Plan actions for a single unit, updating occupied set and damage tracking."""
    actions = []
    new_pos = unit_pos

    if enemies:
        # Phase: Combat
        if unit.unit_type == RANGER:
            actions, new_pos = _plan_ranger(unit, unit_pos, enemies, game_state, occupied, already_targeted)
        else:
            actions, new_pos = _plan_melee(unit, unit_pos, enemies, game_state, occupied, already_targeted)
    elif enemy_hq:
        # Phase: HQ capture march
        actions, new_pos = _plan_capture_march(unit, unit_pos, enemy_hq, game_state, occupied)
    else:
        actions.append(WaitAction(unit.unit_id))

    # Update occupied
    if new_pos != unit_pos:
        occupied.discard(unit_pos)
        occupied.add(new_pos)

    # Ensure unit ends with wait if not already
    if actions and not isinstance(actions[-1], WaitAction):
        actions.append(WaitAction(unit.unit_id))

    return actions


def _record_attack(unit, target, game_state, already_targeted):
    """Record expected damage for overkill prevention."""
    terrain = game_state.grid[target.y][target.x]
    defense = TERRAIN_DEFENSE.get(terrain, 0)
    dmg = max(UNIT_ATK[unit.unit_type] - defense, 1)
    already_targeted[target.unit_id] = already_targeted.get(target.unit_id, 0) + dmg


def _plan_ranger(unit, unit_pos, enemies, game_state, occupied, already_targeted):
    """Rangers: prefer to stay put and snipe. Only move if no targets in range."""
    actions = []
    new_pos = unit_pos

    # Can we attack from current position?
    target = pick_attack_target(unit, unit_pos, enemies, game_state, already_targeted)
    if target:
        actions.append(AttackAction(unit.unit_id, target.unit_id))
        _record_attack(unit, target, game_state, already_targeted)
        log.info(f"  Ranger #{unit.unit_id} attacks #{target.unit_id} from {unit_pos}")
        return actions, new_pos

    # Can't attack from here. Move toward a good sniping position.
    # Find nearest enemy and move to range 2-3 from them
    nearest = min(enemies, key=lambda e: manhattan(unit_pos, (e.x, e.y)))
    nearest_pos = (nearest.x, nearest.y)

    # Remove self from occupied for pathfinding
    occ = occupied - {unit_pos}
    path = find_attack_position(
        game_state.grid, unit_pos, nearest_pos,
        unit.unit_type, occ, ATTACK_RANGE[RANGER]
    )

    if path is None:
        # Can't reach attack position. Just move toward enemy.
        path = best_move_toward(game_state.grid, unit_pos, nearest_pos, unit.unit_type, occ)

    if path:
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = path[-1]
        log.info(f"  Ranger #{unit.unit_id} moves {unit_pos}->{new_pos}")
    else:
        log.info(f"  Ranger #{unit.unit_id} stuck at {unit_pos}")

    return actions, new_pos


def _plan_melee(unit, unit_pos, enemies, game_state, occupied, already_targeted):
    """Infantry/Tank: move adjacent to enemy and attack."""
    actions = []
    new_pos = unit_pos

    # Already adjacent to someone?
    target = pick_attack_target(unit, unit_pos, enemies, game_state, already_targeted)
    if target:
        actions.append(AttackAction(unit.unit_id, target.unit_id))
        _record_attack(unit, target, game_state, already_targeted)
        log.info(f"  {unit.unit_type} #{unit.unit_id} attacks #{target.unit_id} from {unit_pos}")
        return actions, new_pos

    # Find nearest enemy and move toward them
    nearest = min(enemies, key=lambda e: manhattan(unit_pos, (e.x, e.y)))
    nearest_pos = (nearest.x, nearest.y)

    occ = occupied - {unit_pos}

    # Try to find a tile adjacent to the enemy
    path = find_adjacent_to(game_state.grid, nearest_pos, unit.unit_type, unit_pos, occ)
    if path:
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = path[-1]

        # Can we attack from new position?
        target = pick_attack_target(unit, new_pos, enemies, game_state, already_targeted)
        if target:
            actions.append(AttackAction(unit.unit_id, target.unit_id))
            _record_attack(unit, target, game_state, already_targeted)
            log.info(f"  {unit.unit_type} #{unit.unit_id} moves {unit_pos}->{new_pos}, attacks #{target.unit_id}")
        else:
            log.info(f"  {unit.unit_type} #{unit.unit_id} moves {unit_pos}->{new_pos}")
    else:
        # Can't reach adjacent. Just move toward enemy.
        path = best_move_toward(game_state.grid, unit_pos, nearest_pos, unit.unit_type, occ)
        if path:
            actions.append(MoveAction(unit.unit_id, path))
            new_pos = path[-1]
            log.info(f"  {unit.unit_type} #{unit.unit_id} marches {unit_pos}->{new_pos}")
        else:
            log.info(f"  {unit.unit_type} #{unit.unit_id} stuck at {unit_pos}")

    return actions, new_pos


def _plan_capture_march(unit, unit_pos, enemy_hq, game_state, occupied):
    """March toward enemy HQ. If on HQ, capture."""
    actions = []
    new_pos = unit_pos

    # On the HQ? Capture!
    if unit_pos == enemy_hq:
        if unit.unit_type in (INFANTRY, RANGER):
            actions.append(CaptureAction(unit.unit_id))
            log.info(f"  #{unit.unit_id} CAPTURING HQ at {enemy_hq}!")
        else:
            # Tanks can't capture, just wait
            log.info(f"  Tank #{unit.unit_id} on HQ but can't capture, waiting")
        return actions, new_pos

    # March toward HQ
    occ = occupied - {unit_pos}
    path = best_move_toward(game_state.grid, unit_pos, enemy_hq, unit.unit_type, occ)
    if path:
        actions.append(MoveAction(unit.unit_id, path))
        new_pos = path[-1]

        # Did we land on HQ?
        if new_pos == enemy_hq and unit.unit_type in (INFANTRY, RANGER):
            actions.append(CaptureAction(unit.unit_id))
            log.info(f"  #{unit.unit_id} reached HQ {enemy_hq}, capturing!")
        else:
            log.info(f"  #{unit.unit_id} marching toward HQ: {unit_pos}->{new_pos}")
    else:
        log.info(f"  #{unit.unit_id} stuck marching to HQ from {unit_pos}")

    return actions, new_pos
