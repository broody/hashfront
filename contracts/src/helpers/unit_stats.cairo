use hashfront::types::{TileType, UnitType};

#[derive(Copy, Drop)]
enum TargetClass {
    Light,
    Heavy,
    Artillery,
}

pub fn max_hp(unit_type: UnitType) -> u8 {
    match unit_type {
        UnitType::None => 0,
        UnitType::Infantry => 10,
        UnitType::Tank => 10,
        UnitType::Artillery => 10,
    }
}

fn target_class(unit_type: UnitType) -> TargetClass {
    match unit_type {
        UnitType::Tank => TargetClass::Heavy,
        UnitType::Artillery => TargetClass::Artillery,
        _ => TargetClass::Light,
    }
}

pub fn base_damage(attacker_type: UnitType, defender_type: UnitType) -> u8 {
    let defender_class = target_class(defender_type);
    match attacker_type {
        UnitType::None => 0,
        UnitType::Infantry => match defender_class {
            TargetClass::Light => 3,
            TargetClass::Heavy => 1,
            TargetClass::Artillery => 4,
        },
        UnitType::Tank => match defender_class {
            TargetClass::Light => 5,
            TargetClass::Heavy => 4,
            TargetClass::Artillery => 5,
        },
        UnitType::Artillery => match defender_class {
            TargetClass::Light => 3,
            TargetClass::Heavy => 5,
            TargetClass::Artillery => 2,
        },
    }
}

pub fn move_range(unit_type: UnitType) -> u8 {
    match unit_type {
        UnitType::None => 0,
        UnitType::Infantry => 2,
        UnitType::Tank => 3,
        UnitType::Artillery => 3,
    }
}

pub fn min_attack_range(unit_type: UnitType) -> u8 {
    match unit_type {
        UnitType::None => 0,
        UnitType::Infantry => 1,
        UnitType::Tank => 1,
        UnitType::Artillery => 2,
    }
}

pub fn max_attack_range(unit_type: UnitType) -> u8 {
    match unit_type {
        UnitType::None => 0,
        UnitType::Infantry => 1,
        UnitType::Tank => 1,
        UnitType::Artillery => 3,
    }
}

pub fn cost(unit_type: UnitType) -> u8 {
    match unit_type {
        UnitType::None => 0,
        UnitType::Infantry => 1,
        UnitType::Tank => 4,
        UnitType::Artillery => 2,
    }
}

pub fn move_cost(unit_type: UnitType, tile_type: TileType) -> u8 {
    match tile_type {
        TileType::Grass => 1,
        TileType::Mountain => if unit_type == UnitType::Infantry {
            1
        } else {
            2
        },
        TileType::City => 1,
        TileType::Factory => 1,
        TileType::HQ => 1,
        TileType::Road => 1,
        TileType::Tree => 1,
        TileType::DirtRoad => 1,
        TileType::Ocean => 1,
    }
}

pub fn defense_bonus(tile_type: TileType) -> u8 {
    match tile_type {
        TileType::Grass => 0,
        TileType::Mountain => 2,
        TileType::City => 1,
        TileType::Factory => 1,
        TileType::HQ => 2,
        TileType::Road => 0,
        TileType::Tree => 1,
        TileType::DirtRoad => 0,
        TileType::Ocean => 0,
    }
}

pub fn base_accuracy(unit_type: UnitType) -> u8 {
    match unit_type {
        UnitType::None => 0,
        UnitType::Infantry => 90,
        UnitType::Tank => 85,
        UnitType::Artillery => 88,
    }
}

pub fn terrain_evasion(tile_type: TileType) -> u8 {
    match tile_type {
        TileType::Grass => 0,
        TileType::Road => 0,
        TileType::DirtRoad => 0,
        TileType::Tree => 5,
        TileType::City => 8,
        TileType::Factory => 8,
        TileType::HQ => 10,
        TileType::Mountain => 12,
        TileType::Ocean => 0,
    }
}

pub fn range_penalty(unit_type: UnitType, distance: u8) -> u8 {
    if unit_type == UnitType::Artillery && distance == 3 {
        5
    } else {
        0
    }
}

pub fn can_traverse(unit_type: UnitType, tile_type: TileType) -> bool {
    match tile_type {
        TileType::Mountain => unit_type == UnitType::Infantry,
        TileType::Ocean => false, // Air units will be able to traverse once added
        _ => true,
    }
}

pub fn gets_road_bonus(unit_type: UnitType) -> bool {
    unit_type == UnitType::Tank || unit_type == UnitType::Artillery
}

pub fn road_bonus_amount(unit_type: UnitType) -> u8 {
    if gets_road_bonus(unit_type) {
        1
    } else {
        0
    }
}

pub fn can_capture(unit_type: UnitType) -> bool {
    unit_type == UnitType::Infantry
}
