use dojo::model::{ModelStorage, ModelStorageTest};
use hashfront::models::building::Building;
use hashfront::models::game::Game;
use hashfront::models::stats::{PlayerActionStats, PlayerMatchStats};
use hashfront::models::unit::Unit;
use hashfront::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
use hashfront::types::BuildingType;
use starknet::testing::{set_account_contract_address, set_contract_address};
use super::common::{PLAYER1, PLAYER2, build_test_tiles, build_test_units, setup};

fn setup_basic_game() -> (IActionsDispatcher, dojo::world::WorldStorage, u32) {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, world) = setup();
    let hq: u32 = 3;
    let map_id = actions_dispatcher
        .register_map(
            "stats",
            20,
            20,
            build_test_tiles(),
            array![
                1 * 16777216 + hq * 65536 + 0 * 256 + 0, 2 * 16777216 + hq * 65536 + 19 * 256 + 19,
            ],
            build_test_units(),
        );
    let game_id = actions_dispatcher.create_game("stats", map_id, 1, false);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions_dispatcher, world, game_id)
}

fn setup_factory_game() -> (IActionsDispatcher, dojo::world::WorldStorage, u32) {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions_dispatcher, world) = setup();
    let hq: u32 = 3;
    let factory: u32 = 2;
    let map_id = actions_dispatcher
        .register_map(
            "stats_factory",
            20,
            20,
            build_test_tiles(),
            array![
                1 * 16777216 + hq * 65536 + 0 * 256 + 0, 2 * 16777216 + hq * 65536 + 19 * 256 + 19,
                1 * 16777216 + factory * 65536 + 10 * 256 + 10,
            ],
            build_test_units(),
        );
    let game_id = actions_dispatcher.create_game("stats_factory", map_id, 1, false);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions_dispatcher.join_game(game_id, 2);

    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions_dispatcher, world, game_id)
}

#[test]
#[available_gas(300000000)]
fn test_attack_kill_updates_global_action_stats() {
    let (actions_dispatcher, mut world, game_id) = setup_basic_game();

    let mut defender: Unit = world.read_model((game_id, 2_u8));
    defender.x = 5;
    defender.y = 6;
    defender.hp = 1;
    world.write_model_test(@defender);

    let mut attacker: Unit = world.read_model((game_id, 1_u8));
    attacker.x = 5;
    attacker.y = 5;
    world.write_model_test(@attacker);

    actions_dispatcher.attack(game_id, 1, 2);

    let p1_stats: PlayerActionStats = world.read_model(PLAYER1());
    assert(p1_stats.units_killed == 1, 'p1_kill');
    assert(p1_stats.units_lost == 0, 'p1_loss_0');

    let p2_stats: PlayerActionStats = world.read_model(PLAYER2());
    assert(p2_stats.units_lost == 1, 'p2_loss_1');
    assert(p2_stats.units_killed == 0, 'p2_kill_0');
}

#[test]
#[available_gas(300000000)]
fn test_production_spawn_updates_global_action_stats() {
    let (actions_dispatcher, mut world, game_id) = setup_factory_game();

    actions_dispatcher.build_unit(game_id, 10, 10, hashfront::types::UnitType::Infantry);

    // End P1 turn, then P2 turn to start P1 turn again and run production.
    actions_dispatcher.end_turn(game_id);
    set_contract_address(PLAYER2());
    set_account_contract_address(PLAYER2());
    actions_dispatcher.end_turn(game_id);

    let p1_stats: PlayerActionStats = world.read_model(PLAYER1());
    assert(p1_stats.units_produced == 1, 'p1_prod_1');
}

#[test]
#[available_gas(300000000)]
fn test_hq_capture_updates_match_and_capture_stats() {
    let (actions_dispatcher, mut world, game_id) = setup_basic_game();

    let mut attacker: Unit = world.read_model((game_id, 1_u8));
    attacker.x = 19;
    attacker.y = 19;
    world.write_model_test(@attacker);

    let mut hq: Building = world.read_model((game_id, 19_u8, 19_u8));
    hq.building_type = BuildingType::HQ;
    hq.player_id = 2;
    hq.capture_player = 1;
    hq.capture_progress = 1;
    world.write_model_test(@hq);

    actions_dispatcher.capture(game_id, 1);

    let game: Game = world.read_model(game_id);
    assert(game.winner == 1, 'p1_win');

    let p1_match: PlayerMatchStats = world.read_model(PLAYER1());
    assert(p1_match.games_played == 1, 'p1_gp_1');
    assert(p1_match.wins == 1, 'p1_w_1');
    assert(p1_match.losses == 0, 'p1_l_0');
    assert(p1_match.win_streak == 1, 'p1_ws_1');
    assert(p1_match.best_win_streak == 1, 'p1_bws_1');
    assert(p1_match.wins_by_hq_capture == 1, 'p1_hq_1');

    let p2_match: PlayerMatchStats = world.read_model(PLAYER2());
    assert(p2_match.games_played == 1, 'p2_gp_1');
    assert(p2_match.wins == 0, 'p2_w_0');
    assert(p2_match.losses == 1, 'p2_l_1');

    let p1_action: PlayerActionStats = world.read_model(PLAYER1());
    assert(p1_action.buildings_captured == 1, 'p1_cap_1');
    assert(p1_action.hqs_captured == 1, 'p1_hqcap_1');
}

#[test]
#[available_gas(300000000)]
fn test_resign_updates_resignation_and_elimination_win_stats() {
    let (actions_dispatcher, mut world, game_id) = setup_basic_game();

    set_contract_address(PLAYER2());
    set_account_contract_address(PLAYER2());
    actions_dispatcher.resign(game_id);

    let game: Game = world.read_model(game_id);
    assert(game.winner == 1, 'p1_res_win');

    let p1_match: PlayerMatchStats = world.read_model(PLAYER1());
    assert(p1_match.games_played == 1, 'p1_gp_1');
    assert(p1_match.wins == 1, 'p1_w_1');
    assert(p1_match.wins_by_elimination == 1, 'p1_elim_1');

    let p2_match: PlayerMatchStats = world.read_model(PLAYER2());
    assert(p2_match.games_played == 1, 'p2_gp_1');
    assert(p2_match.losses == 1, 'p2_l_1');
    assert(p2_match.resignations == 1, 'p2_res_1');
}
