use hashfront::types::{BuildingType, TileType, UnitType};

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct MapInfo {
    #[key]
    pub map_id: u8,
    pub name: ByteArray,
    pub player_count: u8,
    pub width: u8,
    pub height: u8,
    pub tile_count: u16,
    pub building_count: u16,
    pub unit_count: u16,
}

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct MapTile {
    #[key]
    pub map_id: u8,
    #[key]
    pub x: u8,
    #[key]
    pub y: u8,
    pub tile_type: TileType,
}

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct MapTileSeq {
    #[key]
    pub map_id: u8,
    #[key]
    pub seq: u16,
    pub x: u8,
    pub y: u8,
    pub tile_type: TileType,
}

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct MapBuilding {
    #[key]
    pub map_id: u8,
    #[key]
    pub seq: u16,
    pub player_id: u8,
    pub building_type: BuildingType,
    pub x: u8,
    pub y: u8,
}

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct MapUnit {
    #[key]
    pub map_id: u8,
    #[key]
    pub seq: u16,
    pub player_id: u8,
    pub unit_type: UnitType,
    pub x: u8,
    pub y: u8,
}
