"""Strategy system — weighted parameters that shape AI behavior."""

import random
import logging
from dataclasses import dataclass, field

log = logging.getLogger("strategy")


@dataclass
class Strategy:
    """Weights that control planner behavior. All values 0.0–1.0 unless noted."""
    name: str
    description: str

    # Core weights
    aggression: float = 0.5       # 0=passive/defensive, 1=all-in attack
    focus_fire: float = 0.8       # 0=spread damage, 1=always focus one target
    retreat_threshold: float = 0.5  # higher=retreat earlier (% of max hp)
    terrain_weight: float = 1.0   # multiplier for terrain defense in tile scoring
    hq_pressure: float = 0.3     # tendency to send units toward enemy HQ vs fighting
    formation: float = 0.5       # 0=spread/flank, 1=tight blob

    # Role weights (what fraction of army to assign to each role)
    flank_ratio: float = 0.0     # fraction of infantry to send flanking
    screen_ratio: float = 0.0    # fraction of units to use as meat shields


# ── Preset Strategies ──────────────────────────────────────────────

DEATHBALL = Strategy(
    name="Deathball",
    description="Tight formation, overwhelming local force. Tanks front, rangers back.",
    aggression=0.6,
    focus_fire=1.0,
    retreat_threshold=0.4,
    terrain_weight=1.5,
    hq_pressure=0.3,
    formation=1.0,
    flank_ratio=0.0,
    screen_ratio=0.0,
)

TURTLE = Strategy(
    name="Turtle",
    description="Defensive posture. Hold terrain, let enemies come to us.",
    aggression=0.15,
    focus_fire=0.8,
    retreat_threshold=0.7,  # retreat early — preserve units
    terrain_weight=2.5,     # heavily favor defensive tiles
    hq_pressure=0.1,
    formation=0.8,
    flank_ratio=0.0,
    screen_ratio=0.0,
)

GUERRILLA = Strategy(
    name="Guerrilla",
    description="Split forces. Flankers pressure HQ while main force skirmishes.",
    aggression=0.5,
    focus_fire=0.6,
    retreat_threshold=0.5,
    terrain_weight=1.0,
    hq_pressure=0.8,        # high HQ pressure
    formation=0.2,           # spread out
    flank_ratio=0.4,         # 40% of infantry flank
    screen_ratio=0.0,
)

RUSH = Strategy(
    name="Rush",
    description="All-in sprint toward enemy HQ. Ignore fights, capture to win.",
    aggression=1.0,
    focus_fire=0.3,
    retreat_threshold=0.1,   # never retreat
    terrain_weight=0.0,      # ignore terrain — speed matters
    hq_pressure=1.0,         # everything toward HQ
    formation=0.3,
    flank_ratio=0.6,         # most infantry rush HQ
    screen_ratio=0.0,
)

RANGER_FORTRESS = Strategy(
    name="Ranger Fortress",
    description="Rangers on defensive terrain behind tank wall. Outrange everything.",
    aggression=0.3,
    focus_fire=0.9,
    retreat_threshold=0.6,
    terrain_weight=2.0,
    hq_pressure=0.2,
    formation=0.9,           # tight — tanks shield rangers
    flank_ratio=0.0,
    screen_ratio=0.3,        # infantry screens for rangers
)

ASSASSIN = Strategy(
    name="Assassin",
    description="All-in on killing the highest-value enemy unit. Sacrifice if needed.",
    aggression=0.9,
    focus_fire=1.0,          # absolute focus
    retreat_threshold=0.2,   # don't retreat — commit
    terrain_weight=0.5,
    hq_pressure=0.2,
    formation=0.6,
    flank_ratio=0.0,
    screen_ratio=0.0,
)

ALL_STRATEGIES = [DEATHBALL, TURTLE, GUERRILLA, RUSH, RANGER_FORTRESS, ASSASSIN]

# Weighted pool — some strategies appear more often than others
# (Deathball and Guerrilla are the most balanced/interesting)
STRATEGY_WEIGHTS = {
    "Deathball": 3,
    "Turtle": 2,
    "Guerrilla": 3,
    "Rush": 1,
    "Ranger Fortress": 2,
    "Assassin": 1,
}


def pick_strategy(game_id: int = 0, player_id: int = 0) -> Strategy:
    """
    Pick a random strategy, weighted by STRATEGY_WEIGHTS.
    Uses game_id + player_id as seed component so each side in the same
    game can get different strategies, but results are reproducible.
    """
    # Seeded RNG so same game+player always gets same strategy
    rng = random.Random(game_id * 10 + player_id)
    pool = []
    for s in ALL_STRATEGIES:
        weight = STRATEGY_WEIGHTS.get(s.name, 1)
        pool.extend([s] * weight)
    choice = rng.choice(pool)
    log.info(f"G{game_id} P{player_id}: Strategy → {choice.name} ({choice.description})")
    return choice


def pick_strategy_adaptive(game_state, player_id: int) -> Strategy:
    """
    Pick strategy based on game state. Mixes RNG with situational awareness.
    Overrides the random pick when game state strongly suggests a strategy.
    """
    from config import UNIT_ATK, INFANTRY, RANGER, TANK

    my_units = game_state.alive_units(player_id)
    enemies = game_state.enemy_units(player_id)
    rnd = game_state.info.round

    if not enemies:
        return RUSH  # no enemies → just rush HQ

    my_count = len(my_units)
    enemy_count = len(enemies)

    # Count unit types
    my_rangers = sum(1 for u in my_units if u.unit_type == RANGER)
    my_infantry = sum(1 for u in my_units if u.unit_type == INFANTRY)
    my_tanks = sum(1 for u in my_units if u.unit_type == TANK)
    enemy_rangers = sum(1 for u in enemies if u.unit_type == RANGER)

    # Strong situational overrides (30% chance to override)
    rng = random.Random(game_state.info.game_id * 10 + player_id + rnd)

    # Way ahead on units → turtle and grind
    if my_count >= enemy_count + 3:
        if rng.random() < 0.5:
            return TURTLE

    # Way behind → guerrilla or rush (desperate plays)
    if enemy_count >= my_count + 3:
        return rng.choice([GUERRILLA, RUSH])

    # Lots of rangers → ranger fortress
    if my_rangers >= 2 and my_tanks >= 1:
        if rng.random() < 0.4:
            return RANGER_FORTRESS

    # Enemy has no rangers → deathball is very strong
    if enemy_rangers == 0:
        if rng.random() < 0.4:
            return DEATHBALL

    # Late game (round 12+) and roughly even → assassin (pick off key unit)
    if rnd >= 12 and abs(my_count - enemy_count) <= 1:
        if rng.random() < 0.3:
            return ASSASSIN

    # Default: weighted random
    return pick_strategy(game_state.info.game_id, player_id)
