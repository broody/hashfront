#[derive(Serde, Drop, Copy, PartialEq, Introspect, DojoStore, Default)]
pub enum GameState {
    #[default]
    Lobby,
    Playing,
    Finished,
}

// Must match client TileType ordinals: Grass=0, Mountain=1, City=2, Factory=3, HQ=4, Road=5,
// Tree=6, DirtRoad=7, Ocean=8
#[derive(Serde, Drop, Copy, PartialEq, Introspect, DojoStore, Default)]
pub enum TileType {
    #[default]
    Grass,
    Mountain,
    City,
    Factory,
    HQ,
    Road,
    Tree,
    DirtRoad,
    Ocean,
}

#[derive(Serde, Drop, Copy, PartialEq, Introspect, DojoStore, Default)]
pub enum UnitType {
    #[default]
    None,
    Infantry,
    Tank,
    Ranger,
}

#[derive(Serde, Drop, Copy, PartialEq, Introspect, DojoStore, Default)]
pub enum BuildingType {
    #[default]
    None,
    City,
    Factory,
    HQ,
}

// BorderType: None=0, Bluff=1, Cliff=2, Beach=3
#[derive(Serde, Drop, Copy, PartialEq, Introspect, DojoStore, Default)]
pub enum BorderType {
    #[default]
    None,
    Bluff,
    Cliff,
    Beach,
}

#[derive(Serde, Drop, Copy, PartialEq, Introspect, DojoStore, Default)]
pub enum CombatOutcome {
    #[default]
    None,
    Hit,
    Graze,
    Whiff,
}

#[derive(Serde, Drop, Copy, Introspect)]
pub struct Vec2 {
    pub x: u8,
    pub y: u8,
}

// ───────────────────── Into impls
// ─────────────────────

pub impl U8IntoTileType of Into<u8, TileType> {
    fn into(self: u8) -> TileType {
        match self {
            0 => TileType::Grass,
            1 => TileType::Mountain,
            2 => TileType::City,
            3 => TileType::Factory,
            4 => TileType::HQ,
            5 => TileType::Road,
            6 => TileType::Tree,
            7 => TileType::DirtRoad,
            8 => TileType::Ocean,
            _ => panic!("Invalid tile type"),
        }
    }
}

pub impl U8IntoUnitType of Into<u8, UnitType> {
    fn into(self: u8) -> UnitType {
        match self {
            0 => UnitType::None,
            1 => UnitType::Infantry,
            2 => UnitType::Tank,
            3 => UnitType::Ranger,
            _ => panic!("Invalid unit type"),
        }
    }
}

pub impl UnitTypeIntoU8 of Into<UnitType, u8> {
    fn into(self: UnitType) -> u8 {
        match self {
            UnitType::None => 0,
            UnitType::Infantry => 1,
            UnitType::Tank => 2,
            UnitType::Ranger => 3,
        }
    }
}

pub impl TileTypeIntoU8 of Into<TileType, u8> {
    fn into(self: TileType) -> u8 {
        match self {
            TileType::Grass => 0,
            TileType::Mountain => 1,
            TileType::City => 2,
            TileType::Factory => 3,
            TileType::HQ => 4,
            TileType::Road => 5,
            TileType::Tree => 6,
            TileType::DirtRoad => 7,
            TileType::Ocean => 8,
        }
    }
}

pub impl TileTypeIntoBuildingType of Into<TileType, BuildingType> {
    fn into(self: TileType) -> BuildingType {
        match self {
            TileType::City => BuildingType::City,
            TileType::Factory => BuildingType::Factory,
            TileType::HQ => BuildingType::HQ,
            _ => BuildingType::None,
        }
    }
}

pub impl U8IntoBuildingType of Into<u8, BuildingType> {
    fn into(self: u8) -> BuildingType {
        match self {
            0 => BuildingType::None,
            1 => BuildingType::City,
            2 => BuildingType::Factory,
            3 => BuildingType::HQ,
            _ => panic!("Invalid building type"),
        }
    }
}

pub impl BuildingTypeIntoU8 of Into<BuildingType, u8> {
    fn into(self: BuildingType) -> u8 {
        match self {
            BuildingType::None => 0,
            BuildingType::City => 1,
            BuildingType::Factory => 2,
            BuildingType::HQ => 3,
        }
    }
}

pub impl U8IntoBorderType of Into<u8, BorderType> {
    fn into(self: u8) -> BorderType {
        match self {
            0 => BorderType::None,
            1 => BorderType::Bluff,
            2 => BorderType::Cliff,
            3 => BorderType::Beach,
            _ => panic!("Invalid border type"),
        }
    }
}

pub impl BorderTypeIntoU8 of Into<BorderType, u8> {
    fn into(self: BorderType) -> u8 {
        match self {
            BorderType::None => 0,
            BorderType::Bluff => 1,
            BorderType::Cliff => 2,
            BorderType::Beach => 3,
        }
    }
}
