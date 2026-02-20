use dojo::model::ModelStorage;
use hashfront::models::unit::Unit;
use hashfront::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
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
        .register_map(
            "test", 20, 20, build_test_tiles(), build_test_buildings(), build_test_units(),
        );
    let game_id = actions_dispatcher.create_game("test", map_id, 1, false);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions_dispatcher, world, game_id)
}

#[test]
#[available_gas(200000000)]
fn test_wait_unit() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    actions_dispatcher.wait_unit(game_id, 1);

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(unit.last_moved_round == 1, 'should be moved');
    assert(unit.last_acted_round == 1, 'should have acted');
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_wait_unit_not_your_turn() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.wait_unit(game_id, 2);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_wait_unit_not_your_unit() {
    let (actions_dispatcher, _, game_id) = setup_playing_game();

    // P1 tries to wait P2's unit
    actions_dispatcher.wait_unit(game_id, 2);
}
