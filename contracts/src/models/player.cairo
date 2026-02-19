use dojo::model::ModelStorage;
use starknet::ContractAddress;

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct PlayerState {
    #[key]
    pub game_id: u32,
    #[key]
    pub player_id: u8,
    pub address: ContractAddress,
    pub gold: u8,
    pub unit_count: u8,
    pub factory_count: u8,
    pub city_count: u8,
    pub is_alive: bool,
}

#[generate_trait]
pub impl PlayerStateImpl of PlayerStateTrait {
    /// Find player_id by caller address. Panics if not found.
    fn find_player_id(
        ref world: dojo::world::WorldStorage,
        game_id: u32,
        address: ContractAddress,
        player_count: u8,
    ) -> u8 {
        let mut i: u8 = 1;
        let mut found: u8 = 0;
        while i <= player_count {
            let ps: PlayerState = world.read_model((game_id, i));
            if ps.address == address {
                found = i;
                break;
            }
            i += 1;
        };
        assert(found > 0, 'Not in this game');
        found
    }
}
