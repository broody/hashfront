use chain_tactics::models::building::Building;
use chain_tactics::models::game::Game;
use chain_tactics::models::player::PlayerState;
use chain_tactics::models::unit::Unit;
use chain_tactics::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
use chain_tactics::types::{BuildingType, GameState, UnitType};
use dojo::model::{ModelStorage, ModelStorageTest};
use starknet::testing::{set_account_contract_address, set_contract_address};
use super::common::{
    PLAYER1, PLAYER2, build_test_buildings, build_test_tiles, build_test_units, setup,
};

/// Setup a 2-player game. Place P1 infantry (id=1) on a neutral City at (10,10).
fn setup_capture() -> (IActionsDispatcher, dojo::world::WorldStorage, u32) {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, mut world) = setup();
    let map_id = actions_dispatcher
        .register_map(20, 20, build_test_tiles(), build_test_buildings(), build_test_units());
    let game_id = actions_dispatcher.create_game(map_id, 1);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Place a neutral City building at (10,10)
    world
        .write_model_test(
            @Building {
                game_id,
                x: 10,
                y: 10,
                building_type: BuildingType::City,
                owner: 0,
                capture_player: 0,
                capture_progress: 0,
                queued_unit: 0,
            },
        );

    // Move P1's infantry onto the city
    let mut u1: Unit = world.read_model((game_id, 1_u8));
    u1.x = 10;
    u1.y = 10;
    world.write_model_test(@u1);

    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions_dispatcher, world, game_id)
}

#[test]
fn test_capture_first_step() {
    let (actions_dispatcher, mut world, game_id) = setup_capture();

    // First capture: progress goes to 1 (threshold is 2)
    actions_dispatcher.capture(game_id, 1);

    let building: Building = world.read_model((game_id, 10_u8, 10_u8));
    assert(building.capture_player == 1, 'capture_player should be 1');
    assert(building.capture_progress == 1, 'progress should be 1');
    assert(building.owner == 0, 'still unowned');

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(unit.has_acted, 'unit should have acted');
}

#[test]
fn test_capture_completes() {
    let (actions_dispatcher, mut world, game_id) = setup_capture();

    // Pre-set capture progress to 1 (one more needed)
    let mut building: Building = world.read_model((game_id, 10_u8, 10_u8));
    building.capture_player = 1;
    building.capture_progress = 1;
    world.write_model_test(@building);

    actions_dispatcher.capture(game_id, 1);

    let building: Building = world.read_model((game_id, 10_u8, 10_u8));
    assert(building.owner == 1, 'P1 should own city');
    assert(building.capture_player == 0, 'capture_player reset');
    assert(building.capture_progress == 0, 'progress reset');

    // P1 city_count incremented
    let ps1: PlayerState = world.read_model((game_id, 1_u8));
    assert(ps1.city_count == 1, 'p1 should have 1 city');
}

#[test]
fn test_capture_hq_wins_game() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, mut world) = setup();
    let map_id = actions_dispatcher
        .register_map(20, 20, build_test_tiles(), build_test_buildings(), build_test_units());
    let game_id = actions_dispatcher.create_game(map_id, 1);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Move P1 infantry onto P2's HQ at (19,19)
    let mut u1: Unit = world.read_model((game_id, 1_u8));
    u1.x = 19;
    u1.y = 19;
    world.write_model_test(@u1);

    // Pre-set capture progress (one more to complete)
    let mut hq: Building = world.read_model((game_id, 19_u8, 19_u8));
    hq.capture_player = 1;
    hq.capture_progress = 1;
    world.write_model_test(@hq);

    set_contract_address(p1);
    set_account_contract_address(p1);
    actions_dispatcher.capture(game_id, 1);

    // Game should be finished with P1 as winner
    let game: Game = world.read_model(game_id);
    assert(game.state == GameState::Finished, 'game should be finished');
    assert(game.winner == 1, 'P1 should win');
}

#[test]
fn test_capture_enemy_building_updates_counts() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, mut world) = setup();
    let map_id = actions_dispatcher
        .register_map(20, 20, build_test_tiles(), build_test_buildings(), build_test_units());
    let game_id = actions_dispatcher.create_game(map_id, 1);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Create a Factory owned by P2 at (10,10)
    world
        .write_model_test(
            @Building {
                game_id,
                x: 10,
                y: 10,
                building_type: BuildingType::Factory,
                owner: 2,
                capture_player: 1,
                capture_progress: 1,
                queued_unit: 0,
            },
        );

    // Give P2 a factory count
    let mut ps2: PlayerState = world.read_model((game_id, 2_u8));
    ps2.factory_count = 1;
    world.write_model_test(@ps2);

    // Move P1 infantry there
    let mut u1: Unit = world.read_model((game_id, 1_u8));
    u1.x = 10;
    u1.y = 10;
    world.write_model_test(@u1);

    set_contract_address(p1);
    set_account_contract_address(p1);
    actions_dispatcher.capture(game_id, 1);

    // P2 loses factory, P1 gains it
    let ps2: PlayerState = world.read_model((game_id, 2_u8));
    assert(ps2.factory_count == 0, 'p2 factory count 0');

    let ps1: PlayerState = world.read_model((game_id, 1_u8));
    assert(ps1.factory_count == 1, 'p1 factory count 1');
}

#[test]
#[should_panic]
fn test_capture_not_infantry() {
    let (actions_dispatcher, mut world, game_id) = setup_capture();

    // Change unit to Tank
    let mut u1: Unit = world.read_model((game_id, 1_u8));
    u1.unit_type = UnitType::Tank;
    world.write_model_test(@u1);

    actions_dispatcher.capture(game_id, 1);
}

#[test]
#[should_panic]
fn test_capture_no_building() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, _world) = setup();
    let map_id = actions_dispatcher
        .register_map(20, 20, build_test_tiles(), build_test_buildings(), build_test_units());
    let game_id = actions_dispatcher.create_game(map_id, 1);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // P1 unit at (1,0) — grass tile, no building
    set_contract_address(p1);
    set_account_contract_address(p1);
    actions_dispatcher.capture(game_id, 1);
}

#[test]
#[should_panic]
fn test_capture_own_building() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, mut world) = setup();
    let map_id = actions_dispatcher
        .register_map(20, 20, build_test_tiles(), build_test_buildings(), build_test_units());
    let game_id = actions_dispatcher.create_game(map_id, 1);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Move P1 infantry onto P1's own HQ at (0,0)
    let mut u1: Unit = world.read_model((game_id, 1_u8));
    u1.x = 0;
    u1.y = 0;
    world.write_model_test(@u1);

    set_contract_address(p1);
    set_account_contract_address(p1);
    actions_dispatcher.capture(game_id, 1);
}
