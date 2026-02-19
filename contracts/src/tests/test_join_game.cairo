use chain_tactics::consts::STARTING_GOLD;
use chain_tactics::models::building::Building;
use chain_tactics::models::game::Game;
use chain_tactics::models::player::PlayerState;
use chain_tactics::models::unit::Unit;
use chain_tactics::systems::actions::IActionsDispatcherTrait;
use chain_tactics::types::{BuildingType, GameState, UnitType};
use dojo::model::ModelStorage;
use starknet::testing::{set_account_contract_address, set_contract_address};
use super::common::{
    PLAYER1, PLAYER2, build_test_buildings, build_test_tiles, build_test_units, setup,
};

/// Helper: register map + create game as PLAYER1, return (map_id, game_id).
fn create_test_game() -> (
    chain_tactics::systems::actions::IActionsDispatcher, dojo::world::WorldStorage, u32,
) {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, world) = setup();
    let map_id = actions_dispatcher
        .register_map(20, 20, build_test_tiles(), build_test_buildings(), build_test_units());
    let game_id = actions_dispatcher.create_game(map_id, 1);
    (actions_dispatcher, world, game_id)
}

#[test]
fn test_join_game() {
    let (actions_dispatcher, mut world, game_id) = create_test_game();

    // Player 2 joins
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Game should transition to Playing (2-player map is now full)
    let game: Game = world.read_model(game_id);
    assert(game.state == GameState::Playing, 'should be Playing');
    assert(game.num_players == 2, 'should have 2 players');

    // Player 2 state
    let ps2: PlayerState = world.read_model((game_id, 2_u8));
    assert(ps2.address == p2, 'wrong p2 address');
    assert(ps2.gold == STARTING_GOLD, 'wrong p2 gold');
    assert(ps2.is_alive, 'p2 should be alive');
}

#[test]
fn test_join_game_spawns_units() {
    let (actions_dispatcher, mut world, game_id) = create_test_game();

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Game should have spawned 2 infantry (one per player)
    let game: Game = world.read_model(game_id);
    assert(game.next_unit_id == 2, 'should have 2 units');

    // Verify unit 1 belongs to player 1
    let u1: Unit = world.read_model((game_id, 1_u8));
    assert(u1.player_id == 1, 'unit 1 is player 1');
    assert(u1.unit_type == UnitType::Infantry, 'unit 1 is infantry');
    assert(u1.is_alive, 'unit 1 alive');
    assert(u1.hp == 3, 'infantry has 3 hp');

    // Verify unit 2 belongs to player 2
    let u2: Unit = world.read_model((game_id, 2_u8));
    assert(u2.player_id == 2, 'unit 2 is player 2');
    assert(u2.unit_type == UnitType::Infantry, 'unit 2 is infantry');
    assert(u2.is_alive, 'unit 2 alive');

    // Unit counts updated
    let ps1: PlayerState = world.read_model((game_id, 1_u8));
    assert(ps1.unit_count == 1, 'p1 has 1 unit');
    let ps2: PlayerState = world.read_model((game_id, 2_u8));
    assert(ps2.unit_count == 1, 'p2 has 1 unit');
}

#[test]
fn test_join_game_assigns_hqs() {
    let (actions_dispatcher, mut world, game_id) = create_test_game();

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // HQs should be assigned to players
    let hq1: Building = world.read_model((game_id, 0_u8, 0_u8));
    assert(hq1.building_type == BuildingType::HQ, 'should be HQ');
    assert(hq1.owner == 1, 'HQ1 owned by p1');

    let hq2: Building = world.read_model((game_id, 19_u8, 19_u8));
    assert(hq2.building_type == BuildingType::HQ, 'should be HQ');
    assert(hq2.owner == 2, 'HQ2 owned by p2');
}

#[test]
fn test_join_game_runs_p1_income() {
    let (actions_dispatcher, mut world, game_id) = create_test_game();

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // P1 should have starting gold (no cities on test map, so income = 0)
    let ps1: PlayerState = world.read_model((game_id, 1_u8));
    assert(ps1.gold == STARTING_GOLD, 'p1 gold unchanged');
}

#[test]
#[should_panic]
fn test_join_game_already_joined() {
    let (actions_dispatcher, _, game_id) = create_test_game();

    // PLAYER1 (creator) tries to join again
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);
    actions_dispatcher.join_game(game_id, 2);
}

#[test]
#[should_panic]
fn test_join_game_full() {
    let (actions_dispatcher, _, game_id) = create_test_game();

    // Player 2 joins (fills 2-player game)
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Player 3 tries to join a full game
    let p3: starknet::ContractAddress = 'PLAYER3'.try_into().unwrap();
    set_contract_address(p3);
    set_account_contract_address(p3);
    actions_dispatcher.join_game(game_id, 2);
}

#[test]
#[should_panic]
fn test_join_game_already_playing() {
    let (actions_dispatcher, _, game_id) = create_test_game();

    // Fill the game
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Try joining a game that's already Playing
    let p3: starknet::ContractAddress = 'PLAYER3'.try_into().unwrap();
    set_contract_address(p3);
    set_account_contract_address(p3);
    actions_dispatcher.join_game(game_id, 2);
}
