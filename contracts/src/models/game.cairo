use chain_tactics::types::GameState;

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct GameCounter {
    #[key]
    pub id: u32,
    pub count: u32,
}

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct Game {
    #[key]
    pub game_id: u32,
    pub map_id: u8,
    pub state: GameState,
    pub player_count: u8,
    pub num_players: u8,
    pub current_player: u8,
    pub round: u8,
    pub next_unit_id: u8,
    pub winner: u8,
    pub width: u8,
    pub height: u8,
}
