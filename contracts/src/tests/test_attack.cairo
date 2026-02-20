use dojo::model::{ModelStorage, ModelStorageTest};
use hashfront::models::player::PlayerState;
use hashfront::models::unit::Unit;
use hashfront::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
use starknet::testing::{set_account_contract_address, set_contract_address};
use super::common::{
    PLAYER1, PLAYER2, build_test_buildings, build_test_tiles, build_test_units, setup,
};

/// Setup a 2-player game and position units adjacently for combat.
/// P1 unit (id=1) at (5,5), P2 unit (id=2) at (5,6). It's P1's turn.
fn setup_combat() -> (IActionsDispatcher, dojo::world::WorldStorage, u32) {
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

    // Position units adjacently using write_model_test
    let mut u1: Unit = world.read_model((game_id, 1_u8));
    u1.x = 5;
    u1.y = 5;
    world.write_model_test(@u1);

    let mut u2: Unit = world.read_model((game_id, 2_u8));
    u2.x = 5;
    u2.y = 6;
    world.write_model_test(@u2);

    // Switch to P1 (current player)
    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions_dispatcher, world, game_id)
}

#[test]
#[available_gas(200000000)]
fn test_attack_both_survive() {
    let (actions_dispatcher, mut world, game_id) = setup_combat();

    // Infantry(atk=2) vs Infantry(hp=3) on grass(def=0): dmg=2, defender survives at 1hp
    // Counterattack: Infantry(atk=2) vs attacker(hp=3): dmg=2, attacker survives at 1hp
    actions_dispatcher.attack(game_id, 1, 2);

    let attacker: Unit = world.read_model((game_id, 1_u8));
    assert(attacker.hp == 1, 'attacker hp should be 1');
    assert(attacker.last_acted_round == 1, 'attacker should have acted');
    assert(attacker.is_alive, 'attacker should be alive');

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(defender.hp == 1, 'defender hp should be 1');
    assert(defender.is_alive, 'defender should be alive');
}

#[test]
#[available_gas(200000000)]
fn test_attack_kills_defender() {
    let (actions_dispatcher, mut world, game_id) = setup_combat();

    // Lower defender hp so attack kills it
    let mut u2: Unit = world.read_model((game_id, 2_u8));
    u2.hp = 1;
    world.write_model_test(@u2);

    // dmg=2 >= 1hp → defender dies, no counterattack
    actions_dispatcher.attack(game_id, 1, 2);

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(!defender.is_alive, 'defender should be dead');
    assert(defender.hp == 0, 'defender hp should be 0');

    let attacker: Unit = world.read_model((game_id, 1_u8));
    assert(attacker.hp == 3, 'attacker full hp (no counter)');
    assert(attacker.last_acted_round == 1, 'attacker should have acted');

    // P2 unit count decremented
    let ps2: PlayerState = world.read_model((game_id, 2_u8));
    assert(ps2.unit_count == 0, 'p2 should have 0 units');
}

#[test]
#[available_gas(200000000)]
fn test_attack_counterattack_kills_attacker() {
    let (actions_dispatcher, mut world, game_id) = setup_combat();

    // Lower attacker hp so counterattack kills it
    let mut u1: Unit = world.read_model((game_id, 1_u8));
    u1.hp = 2;
    world.write_model_test(@u1);

    // dmg_to_def=2, defender survives (3-2=1), counter=2 >= attacker hp 2 → attacker dies
    actions_dispatcher.attack(game_id, 1, 2);

    let attacker: Unit = world.read_model((game_id, 1_u8));
    assert(!attacker.is_alive, 'attacker should be dead');
    assert(attacker.hp == 0, 'attacker hp should be 0');

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(defender.is_alive, 'defender should be alive');
    assert(defender.hp == 1, 'defender hp should be 1');

    // P1 unit count decremented
    let ps1: PlayerState = world.read_model((game_id, 1_u8));
    assert(ps1.unit_count == 0, 'p1 should have 0 units');
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_attack_out_of_range() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, _world) = setup();
    let map_id = actions_dispatcher
        .register_map(
            "test", 20, 20, build_test_tiles(), build_test_buildings(), build_test_units(),
        );
    let game_id = actions_dispatcher.create_game("test", map_id, 1, false);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    // Units are far apart: P1 at (1,0), P2 at (18,19). Distance >> 1.
    set_contract_address(p1);
    set_account_contract_address(p1);
    actions_dispatcher.attack(game_id, 1, 2);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_attack_own_unit() {
    let (actions_dispatcher, _, game_id) = setup_combat();

    // P1 attacks own unit
    actions_dispatcher.attack(game_id, 1, 1);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_attack_not_your_turn() {
    let (actions_dispatcher, _, game_id) = setup_combat();

    // P2 tries to attack on P1's turn
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.attack(game_id, 2, 1);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_attack_already_acted() {
    let (actions_dispatcher, _, game_id) = setup_combat();

    actions_dispatcher.attack(game_id, 1, 2);
    // Try attacking again
    actions_dispatcher.attack(game_id, 1, 2);
}
