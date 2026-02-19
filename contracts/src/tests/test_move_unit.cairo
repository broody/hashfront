use dojo::model::ModelStorage;
use starknet::testing::{set_contract_address, set_account_contract_address};

use chain_tactics::models::unit::Unit;
use chain_tactics::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
use chain_tactics::types::Vec2;
use super::common::{PLAYER1, PLAYER2, build_test_tiles, setup};

/// Setup a 2-player game in Playing state. Returns (dispatcher, world, game_id).
/// P1 unit (id=1) at (1,0), P2 unit (id=2) at (18,19). It's P1's turn.
fn setup_playing_game() -> (IActionsDispatcher, dojo::world::WorldStorage, u32) {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, world) = setup();
    let map_id = actions_dispatcher.register_map(2, 20, 20, build_test_tiles());
    let game_id = actions_dispatcher.create_game(map_id);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id);

    // Switch back to P1 (current player)
    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions_dispatcher, world, game_id)
}

#[test]
fn test_move_unit_one_step() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // P1 unit at (1,0), move right to (2,0)
    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 2, y: 0 }]);

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(unit.x == 2, 'x should be 2');
    assert(unit.y == 0, 'y should be 0');
    assert(unit.has_moved, 'should be moved');
}

#[test]
fn test_move_unit_full_range() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // Infantry move_range = 3. Move (1,0) → (2,0) → (3,0) → (4,0)
    actions_dispatcher
        .move_unit(
            game_id,
            1,
            array![Vec2 { x: 2, y: 0 }, Vec2 { x: 3, y: 0 }, Vec2 { x: 4, y: 0 }],
        );

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(unit.x == 4, 'x should be 4');
    assert(unit.y == 0, 'y should be 0');
}

#[test]
fn test_move_unit_diagonal_path() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // Move (1,0) → (1,1) → (2,1)
    actions_dispatcher
        .move_unit(game_id, 1, array![Vec2 { x: 1, y: 1 }, Vec2 { x: 2, y: 1 }]);

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(unit.x == 2, 'x should be 2');
    assert(unit.y == 1, 'y should be 1');
}

#[test]
#[should_panic]
fn test_move_unit_already_moved() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 2, y: 0 }]);
    // Try moving again
    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 3, y: 0 }]);
}

#[test]
#[should_panic]
fn test_move_unit_not_your_turn() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    // P2 tries to move their unit on P1's turn
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.move_unit(game_id, 2, array![Vec2 { x: 17, y: 19 }]);
}

#[test]
#[should_panic]
fn test_move_unit_not_your_unit() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    // P1 tries to move P2's unit
    actions_dispatcher.move_unit(game_id, 2, array![Vec2 { x: 17, y: 19 }]);
}

#[test]
#[should_panic]
fn test_move_unit_empty_path() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    actions_dispatcher.move_unit(game_id, 1, array![]);
}

#[test]
#[should_panic]
fn test_move_unit_exceeds_range() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    // 4 steps exceeds infantry range of 3
    actions_dispatcher
        .move_unit(
            game_id,
            1,
            array![
                Vec2 { x: 2, y: 0 },
                Vec2 { x: 3, y: 0 },
                Vec2 { x: 4, y: 0 },
                Vec2 { x: 5, y: 0 },
            ],
        );
}

#[test]
#[should_panic]
fn test_move_unit_path_not_adjacent() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    // First step (3,0) is not adjacent to unit at (1,0)
    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 3, y: 0 }]);
}

#[test]
#[should_panic]
fn test_move_unit_steps_not_adjacent() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    // (2,0) is adjacent to unit, but (4,0) is not adjacent to (2,0)
    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 2, y: 0 }, Vec2 { x: 4, y: 0 }]);
}
