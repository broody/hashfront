use chain_tactics::consts::MAX_ROUNDS;
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

fn setup_playing_game() -> (IActionsDispatcher, dojo::world::WorldStorage, u32) {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, world) = setup();
    let map_id = actions_dispatcher
        .register_map(20, 20, build_test_tiles(), build_test_buildings(), build_test_units());
    let game_id = actions_dispatcher.create_game(map_id, 1);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions_dispatcher, world, game_id)
}

#[test]
fn test_end_turn_switches_player() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    actions_dispatcher.end_turn(game_id);

    let game: Game = world.read_model(game_id);
    assert(game.current_player == 2, 'should be P2 turn');
    assert(game.round == 1, 'still round 1');
}

#[test]
fn test_end_turn_round_increments() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // P1 ends turn → P2
    actions_dispatcher.end_turn(game_id);

    // P2 ends turn → back to P1, round increments
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.end_turn(game_id);

    let game: Game = world.read_model(game_id);
    assert(game.current_player == 1, 'should be P1 turn');
    assert(game.round == 2, 'should be round 2');
}

#[test]
fn test_end_turn_resets_unit_flags() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // Mark P1's unit as moved/acted
    actions_dispatcher.wait_unit(game_id, 1);

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(unit.has_moved, 'should be moved');
    assert(unit.has_acted, 'should have acted');

    // P1 ends turn
    actions_dispatcher.end_turn(game_id);

    // P2 ends turn → back to P1, flags should be reset
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.end_turn(game_id);

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(!unit.has_moved, 'moved should be reset');
    assert(!unit.has_acted, 'acted should be reset');
}

#[test]
fn test_end_turn_runs_production() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // Give P2 a factory with a queued infantry
    world
        .write_model_test(
            @Building {
                game_id,
                x: 15,
                y: 15,
                building_type: BuildingType::Factory,
                owner: 2,
                capture_player: 0,
                capture_progress: 0,
                queued_unit: 1 // Infantry
            },
        );

    // P1 ends turn → P2's turn begins, production runs
    actions_dispatcher.end_turn(game_id);

    // Factory should have produced the unit
    let building: Building = world.read_model((game_id, 15_u8, 15_u8));
    assert(building.queued_unit == 0, 'queue should be cleared');

    // New unit should exist
    let game: Game = world.read_model(game_id);
    let new_unit: Unit = world.read_model((game_id, game.next_unit_id));
    assert(new_unit.is_alive, 'new unit should be alive');
    assert(new_unit.player_id == 2, 'unit belongs to P2');
    assert(new_unit.unit_type == UnitType::Infantry, 'should be infantry');
    assert(new_unit.x == 15, 'spawned at factory x');
    assert(new_unit.y == 15, 'spawned at factory y');
}

#[test]
fn test_end_turn_runs_income() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // Give P2 a city
    world
        .write_model_test(
            @Building {
                game_id,
                x: 12,
                y: 12,
                building_type: BuildingType::City,
                owner: 2,
                capture_player: 0,
                capture_progress: 0,
                queued_unit: 0,
            },
        );

    let mut ps2: PlayerState = world.read_model((game_id, 2_u8));
    ps2.city_count = 1;
    world.write_model_test(@ps2);

    let gold_before = ps2.gold;

    // P1 ends turn → P2's income runs
    actions_dispatcher.end_turn(game_id);

    let ps2: PlayerState = world.read_model((game_id, 2_u8));
    assert(ps2.gold == gold_before + 1, 'P2 should gain 1 gold');
}

#[test]
fn test_end_turn_timeout() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // Set round to MAX_ROUNDS so next wrap triggers timeout
    let mut game: Game = world.read_model(game_id);
    game.round = MAX_ROUNDS;
    game.current_player = 2;
    world.write_model_test(@game);

    // P2 ends turn → wraps to P1 → round would be MAX_ROUNDS+1 → timeout
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.end_turn(game_id);

    let game: Game = world.read_model(game_id);
    assert(game.state == GameState::Finished, 'should be finished');
    assert(game.winner != 0, 'should have a winner');
}

#[test]
#[should_panic]
fn test_end_turn_not_your_turn() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    // P2 tries to end turn when it's P1's turn
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.end_turn(game_id);
}
