use chain_tactics::consts::STARTING_GOLD;
use chain_tactics::models::building::Building;
use chain_tactics::models::game::Game;
use chain_tactics::models::player::PlayerState;
use chain_tactics::models::tile::Tile;
use chain_tactics::systems::actions::IActionsDispatcherTrait;
use chain_tactics::types::{BuildingType, GameState, TileType};
use dojo::model::ModelStorage;
use starknet::testing::{set_account_contract_address, set_contract_address};
use super::common::{PLAYER1, build_test_buildings, build_test_tiles, build_test_units, setup};

#[test]
fn test_create_game() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, mut world) = setup();

    let map_id = actions_dispatcher
        .register_map(20, 20, build_test_tiles(), build_test_buildings(), build_test_units());
    let game_id = actions_dispatcher.create_game(map_id, 1);
    assert(game_id == 1, 'game_id should be 1');

    // Verify Game model
    let game: Game = world.read_model(game_id);
    assert(game.map_id == map_id, 'wrong map_id');
    assert(game.state == GameState::Lobby, 'should be Lobby');
    assert(game.player_count == 2, 'should be 2 players');
    assert(game.num_players == 1, 'creator is player 1');
    assert(game.current_player == 1, 'current should be 1');
    assert(game.round == 1, 'round should be 1');
    assert(game.next_unit_id == 0, 'no units yet');
    assert(game.winner == 0, 'no winner yet');

    // Verify PlayerState for creator
    let ps: PlayerState = world.read_model((game_id, 1_u8));
    assert(ps.address == caller, 'wrong address');
    assert(ps.gold == STARTING_GOLD, 'wrong starting gold');
    assert(ps.unit_count == 0, 'no units yet');
    assert(ps.is_alive, 'should be alive');

    // Verify HQ buildings were created with ownership from template
    let hq1: Building = world.read_model((game_id, 0_u8, 0_u8));
    assert(hq1.building_type == BuildingType::HQ, 'should be HQ at 0,0');
    assert(hq1.owner == 1, 'HQ1 owned by p1');

    let hq2: Building = world.read_model((game_id, 19_u8, 19_u8));
    assert(hq2.building_type == BuildingType::HQ, 'should be HQ at 19,19');
    assert(hq2.owner == 2, 'HQ2 owned by p2');

    // Verify grass tile defaults correctly (never written)
    let grass_building: Building = world.read_model((game_id, 1_u8, 0_u8));
    assert(grass_building.building_type == BuildingType::None, 'grass has no building');

    let grass_tile: Tile = world.read_model((game_id, 5_u8, 5_u8));
    assert(grass_tile.tile_type == TileType::Grass, 'tile should be Grass');

    // Verify non-grass tile was written
    let tile: Tile = world.read_model((game_id, 0_u8, 0_u8));
    assert(tile.tile_type == TileType::HQ, 'tile should be HQ');
}

#[test]
#[should_panic]
fn test_create_game_invalid_map() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();
    actions_dispatcher.create_game(99, 1);
}
