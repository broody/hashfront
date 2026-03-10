use hashfront::helpers::unit_stats;
use hashfront::types::{CombatOutcome, TileType, UnitType};

/// Returns (damage_to_defender, damage_to_attacker).
/// Counterattack only happens if defender survives and attacker is within defender's range.
pub fn resolve_combat(
    attacker_type: UnitType,
    defender_type: UnitType,
    defender_hp: u8,
    attacker_tile: TileType,
    defender_tile: TileType,
    distance: u8,
    attacker_moved_this_turn: bool,
    attack_roll: u8,
    counter_roll: u8,
) -> (u8, u8, CombatOutcome, CombatOutcome) {
    let (damage_to_defender, attack_outcome) = resolve_strike_damage(
        attacker_type,
        defender_type,
        defender_tile,
        distance,
        attacker_moved_this_turn,
        attack_roll,
    );

    let defender_survives = defender_hp > damage_to_defender;

    let (damage_to_attacker, counter_outcome) = if defender_survives {
        let def_min_range = unit_stats::min_attack_range(defender_type);
        let def_max_range = unit_stats::max_attack_range(defender_type);
        if distance >= def_min_range && distance <= def_max_range {
            resolve_strike_damage(
                defender_type, attacker_type, attacker_tile, distance, false, counter_roll,
            )
        } else {
            (0_u8, CombatOutcome::None)
        }
    } else {
        (0_u8, CombatOutcome::None)
    };

    (damage_to_defender, damage_to_attacker, attack_outcome, counter_outcome)
}

fn resolve_strike_damage(
    attacker_type: UnitType,
    defender_type: UnitType,
    defender_tile: TileType,
    distance: u8,
    moved_this_turn: bool,
    roll: u8,
) -> (u8, CombatOutcome) {
    let atk = unit_stats::base_damage(attacker_type, defender_type);
    let def_bonus = unit_stats::defense_bonus(defender_tile);
    let hit_damage = if atk > def_bonus {
        atk - def_bonus
    } else {
        1_u8
    };

    let hit_chance = compute_hit_chance(attacker_type, defender_tile, moved_this_turn, distance);
    if roll <= hit_chance {
        return (hit_damage, CombatOutcome::Hit);
    }

    if hit_damage >= 2 {
        (1, CombatOutcome::Graze)
    } else {
        (0, CombatOutcome::Whiff)
    }
}

fn compute_hit_chance(
    attacker_type: UnitType, defender_tile: TileType, moved_this_turn: bool, distance: u8,
) -> u8 {
    let mut chance = unit_stats::base_accuracy(attacker_type);

    let terrain_penalty = unit_stats::terrain_evasion(defender_tile);
    chance = if chance > terrain_penalty {
        chance - terrain_penalty
    } else {
        0_u8
    };

    let move_penalty = if moved_this_turn {
        5_u8
    } else {
        0_u8
    };
    chance = if chance > move_penalty {
        chance - move_penalty
    } else {
        0_u8
    };

    let range_penalty = unit_stats::range_penalty(attacker_type, distance);
    chance = if chance > range_penalty {
        chance - range_penalty
    } else {
        0_u8
    };

    if chance < 75 {
        75
    } else if chance > 95 {
        95
    } else {
        chance
    }
}
