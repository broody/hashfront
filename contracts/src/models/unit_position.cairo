#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct UnitPosition {
    #[key]
    pub game_id: u32,
    #[key]
    pub x: u8,
    #[key]
    pub y: u8,
    pub unit_id: u8,
}
