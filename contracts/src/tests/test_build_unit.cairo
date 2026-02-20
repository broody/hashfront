use dojo::model::{ModelStorage, ModelStorageTest};
use hashfront::models::building::Building;
use hashfront::models::player::PlayerState;
use hashfront::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
use hashfront::types::{BuildingType, UnitType};
use starknet::testing::{set_account_contract_address, set_contract_address};
use super::common::{
    PLAYER1, PLAYER2, build_test_buildings, build_test_tiles, build_test_units, setup,
};

/// Setup a 2-player game with a Factory owned by P1 at (10,10).
fn setup_with_factory() -> (IActionsDispatcher, dojo::world::WorldStorage, u32) {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, mut world) = setup();
    let map_id = actions_dispatcher
        .register_map(
            "test", 20, 20, build_test_tiles(), build_test_buildings(), build_test_units(),
        );
    let game_id = actions_dispatcher.create_game("test", map_id, 1, false);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Place a Factory owned by P1
    world
        .write_model_test(
            @Building {
                game_id,
                x: 10,
                y: 10,
                building_type: BuildingType::Factory,
                player_id: 1,
                capture_player: 0,
                capture_progress: 0,
                queued_unit: 0,
            },
        );

    // Give P1 some gold
    let mut ps1: PlayerState = world.read_model((game_id, 1_u8));
    ps1.factory_count = 1;
    ps1.gold = 10;
    world.write_model_test(@ps1);

    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions_dispatcher, world, game_id)
}

#[test]
#[available_gas(200000000)]
fn test_build_infantry() {
    let (actions_dispatcher, mut world, game_id) = setup_with_factory();

    // Infantry costs 1 gold
    actions_dispatcher.build_unit(game_id, 10, 10, UnitType::Infantry);

    let building: Building = world.read_model((game_id, 10_u8, 10_u8));
    assert(building.queued_unit == 1, 'should queue infantry (1)');

    let ps1: PlayerState = world.read_model((game_id, 1_u8));
    assert(ps1.gold == 9, 'gold should be 9');
}

#[test]
#[available_gas(200000000)]
fn test_build_tank() {
    let (actions_dispatcher, mut world, game_id) = setup_with_factory();

    // Tank costs 3 gold
    actions_dispatcher.build_unit(game_id, 10, 10, UnitType::Tank);

    let building: Building = world.read_model((game_id, 10_u8, 10_u8));
    assert(building.queued_unit == 2, 'should queue tank (2)');

    let ps1: PlayerState = world.read_model((game_id, 1_u8));
    assert(ps1.gold == 7, 'gold should be 7');
}

#[test]
#[available_gas(200000000)]
fn test_build_ranger() {
    let (actions_dispatcher, mut world, game_id) = setup_with_factory();

    // Ranger costs 2 gold
    actions_dispatcher.build_unit(game_id, 10, 10, UnitType::Ranger);

    let building: Building = world.read_model((game_id, 10_u8, 10_u8));
    assert(building.queued_unit == 3, 'should queue ranger (3)');

    let ps1: PlayerState = world.read_model((game_id, 1_u8));
    assert(ps1.gold == 8, 'gold should be 8');
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_build_unit_not_enough_gold() {
    let (actions_dispatcher, mut world, game_id) = setup_with_factory();

    // Set gold to 0
    let mut ps1: PlayerState = world.read_model((game_id, 1_u8));
    ps1.gold = 0;
    world.write_model_test(@ps1);

    actions_dispatcher.build_unit(game_id, 10, 10, UnitType::Infantry);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_build_unit_not_a_factory() {
    let (actions_dispatcher, _, game_id) = setup_with_factory();

    // (5,5) has no factory
    actions_dispatcher.build_unit(game_id, 5, 5, UnitType::Infantry);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_build_unit_not_your_factory() {
    let (actions_dispatcher, mut world, game_id) = setup_with_factory();

    // Change factory owner to P2
    let mut building: Building = world.read_model((game_id, 10_u8, 10_u8));
    building.player_id = 2;
    world.write_model_test(@building);

    actions_dispatcher.build_unit(game_id, 10, 10, UnitType::Infantry);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_build_unit_already_queued() {
    let (actions_dispatcher, _, game_id) = setup_with_factory();

    actions_dispatcher.build_unit(game_id, 10, 10, UnitType::Infantry);
    // Queue again on same factory
    actions_dispatcher.build_unit(game_id, 10, 10, UnitType::Tank);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_build_unit_type_none() {
    let (actions_dispatcher, _, game_id) = setup_with_factory();

    actions_dispatcher.build_unit(game_id, 10, 10, UnitType::None);
}
