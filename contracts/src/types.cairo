#[derive(Serde, Drop, Copy, PartialEq, Introspect, DojoStore, Default)]
pub enum GameState {
    #[default]
    Lobby,
    Playing,
    Finished,
}

// Must match client TileType ordinals: Grass=0, Mountain=1, City=2, Factory=3, HQ=4, Road=5,
// Tree=6, DirtRoad=7
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

#[derive(Serde, Drop, Copy, Introspect)]
pub struct Vec2 {
    pub x: u8,
    pub y: u8,
}

// ───────────────────── Into impls ─────────────────────

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
