use starknet::ContractAddress;

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct PlayerMatchStats {
    #[key]
    pub address: ContractAddress,
    pub games_played: u32,
    pub wins: u32,
    pub losses: u32,
    pub resignations: u32,
    pub win_streak: u16,
    pub best_win_streak: u16,
    pub wins_by_hq_capture: u32,
    pub wins_by_elimination: u32,
    pub wins_by_timeout: u32,
}

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct PlayerActionStats {
    #[key]
    pub address: ContractAddress,
    pub units_killed: u32,
    pub units_lost: u32,
    pub units_produced: u32,
    pub buildings_captured: u32,
    pub cities_captured: u32,
    pub factories_captured: u32,
    pub hqs_captured: u32,
}
