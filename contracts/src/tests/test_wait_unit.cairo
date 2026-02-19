use dojo::model::ModelStorage;
use starknet::testing::{set_contract_address, set_account_contract_address};

use chain_tactics::models::unit::Unit;
use chain_tactics::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
use super::common::{PLAYER1, PLAYER2, build_test_tiles, setup};

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

    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions_dispatcher, world, game_id)
}

#[test]
fn test_wait_unit() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    actions_dispatcher.wait_unit(game_id, 1);

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(unit.has_moved, 'should be moved');
    assert(unit.has_acted, 'should have acted');
}

#[test]
#[should_panic]
fn test_wait_unit_not_your_turn() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.wait_unit(game_id, 2);
}

#[test]
#[should_panic]
fn test_wait_unit_not_your_unit() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    // P1 tries to wait P2's unit
    actions_dispatcher.wait_unit(game_id, 2);
}
