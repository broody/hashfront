use dojo::model::{ModelStorage, ModelStorageTest};
use hashfront::models::game::Game;
use hashfront::models::map::MapTile;
use hashfront::models::player::PlayerState;
use hashfront::models::unit::Unit;
use hashfront::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
use hashfront::types::{BorderType, TileType, UnitType};
use starknet::testing::{
    set_account_contract_address, set_block_hash, set_block_number, set_contract_address,
};
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

    // Infantry vs Infantry on grass: 3 damage each way, both survive at 7 HP.
    actions_dispatcher.attack(game_id, 1, 2);

    let attacker: Unit = world.read_model((game_id, 1_u8));
    assert(attacker.hp == 7, 'attacker hp should be 7');
    assert(attacker.last_acted_round == 1, 'attacker should have acted');
    assert(attacker.is_alive, 'attacker should be alive');

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(defender.hp == 7, 'defender hp should be 7');
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

    // 3 damage >= 1 HP → defender dies, no counterattack.
    actions_dispatcher.attack(game_id, 1, 2);

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(!defender.is_alive, 'defender should be dead');
    assert(defender.hp == 0, 'defender hp should be 0');

    let attacker: Unit = world.read_model((game_id, 1_u8));
    assert(attacker.hp == 10, 'attacker full hp (no counter)');
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
    u1.hp = 3;
    world.write_model_test(@u1);

    // Defender survives the first hit, then the 3-damage counter kills the attacker.
    actions_dispatcher.attack(game_id, 1, 2);

    let attacker: Unit = world.read_model((game_id, 1_u8));
    assert(!attacker.is_alive, 'attacker should be dead');
    assert(attacker.hp == 0, 'attacker hp should be 0');

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(defender.is_alive, 'defender should be alive');
    assert(defender.hp == 7, 'defender hp should be 7');

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

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_artillery_cannot_attack_after_moving() {
    let (actions_dispatcher, mut world, game_id) = setup_combat();

    let mut artillery: Unit = world.read_model((game_id, 1_u8));
    artillery.unit_type = UnitType::Artillery;
    artillery.x = 5;
    artillery.y = 4; // distance 2 from defender at (5,6)
    artillery.last_moved_round = 1;
    world.write_model_test(@artillery);

    actions_dispatcher.attack(game_id, 1, 2);
}

#[test]
#[available_gas(200000000)]
fn test_infantry_only_chips_tank() {
    let (actions_dispatcher, mut world, game_id) = setup_combat();

    let mut defender: Unit = world.read_model((game_id, 2_u8));
    defender.unit_type = UnitType::Tank;
    world.write_model_test(@defender);

    actions_dispatcher.attack(game_id, 1, 2);

    let attacker: Unit = world.read_model((game_id, 1_u8));
    assert(attacker.hp == 5, 'tank counter should deal 5');

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(defender.hp == 9, 'infantry should deal 1 to tank');
}

#[test]
#[available_gas(200000000)]
fn test_artillery_hits_tank_without_counterattack() {
    let (actions_dispatcher, mut world, game_id) = setup_combat();

    let mut attacker: Unit = world.read_model((game_id, 1_u8));
    attacker.unit_type = UnitType::Artillery;
    attacker.x = 5;
    attacker.y = 4; // distance 2 from defender
    world.write_model_test(@attacker);

    let mut defender: Unit = world.read_model((game_id, 2_u8));
    defender.unit_type = UnitType::Tank;
    world.write_model_test(@defender);

    actions_dispatcher.attack(game_id, 1, 2);

    let attacker: Unit = world.read_model((game_id, 1_u8));
    assert(attacker.hp == 10, 'no tank counter');

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(defender.hp == 5, 'artillery should deal 5 to tank');
}

#[test]
#[available_gas(200000000)]
fn test_attack_miss_causes_graze_when_hit_damage_at_least_two() {
    let (actions_dispatcher, mut world, game_id) = setup_combat();

    // Force attack roll to miss (>90) while counter roll still hits.
    set_block_number(50);
    set_block_hash(40, 71);

    actions_dispatcher.attack(game_id, 1, 2);

    let attacker: Unit = world.read_model((game_id, 1_u8));
    assert(attacker.hp == 7, 'counter should still hit for 3');

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(defender.hp == 9, 'miss should graze for 1');
}

#[test]
#[available_gas(200000000)]
fn test_attack_miss_whiffs_when_hit_damage_is_one() {
    let (actions_dispatcher, mut world, game_id) = setup_combat();
    let game: Game = world.read_model(game_id);

    // Put defender on mountain: infantry damage 3 vs defense 2 => hit_damage = 1.
    world
        .write_model_test(
            @MapTile {
                map_id: game.map_id,
                x: 5,
                y: 6,
                tile_type: TileType::Mountain,
                border_type: BorderType::None,
            },
        );

    // Force attack miss.
    set_block_number(50);
    set_block_hash(40, 71);

    actions_dispatcher.attack(game_id, 1, 2);

    let defender: Unit = world.read_model((game_id, 2_u8));
    assert(defender.hp == 10, 'expected whiff');
}
