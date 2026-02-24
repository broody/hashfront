use dojo::model::{ModelStorage, ModelStorageTest};
use hashfront::models::game::Game;
use hashfront::models::map::MapTile;
use hashfront::models::unit::{Unit, UnitPosition};
use hashfront::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
use hashfront::types::{TileType, UnitType, Vec2};
use starknet::testing::{set_account_contract_address, set_contract_address};
use super::common::{
    PLAYER1, PLAYER2, build_test_buildings, build_test_tiles, build_test_units, setup,
};

/// Setup a 2-player game in Playing state. Returns (dispatcher, world, game_id).
/// P1 unit (id=1) at (1,0), P2 unit (id=2) at (18,19). It's P1's turn.
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
    assert(unit.last_moved_round == 1, 'should be moved');
}

#[test]
fn test_move_unit_full_range() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // Infantry move_range = 4. Move (1,0) → (2,0) → (3,0) → (4,0) → (5,0)
    actions_dispatcher
        .move_unit(
            game_id,
            1,
            array![
                Vec2 { x: 2, y: 0 }, Vec2 { x: 3, y: 0 }, Vec2 { x: 4, y: 0 }, Vec2 { x: 5, y: 0 },
            ],
        );

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(unit.x == 5, 'x should be 5');
    assert(unit.y == 0, 'y should be 0');
}

#[test]
fn test_move_unit_diagonal_path() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    // Move (1,0) → (1,1) → (2,1)
    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 1, y: 1 }, Vec2 { x: 2, y: 1 }]);

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
fn test_move_unit_after_act() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    let mut unit: Unit = world.read_model((game_id, 1_u8));
    unit.last_acted_round = 1;
    world.write_model_test(@unit);
    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 2, y: 0 }]);
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

    // 5 steps exceeds infantry range of 4
    actions_dispatcher
        .move_unit(
            game_id,
            1,
            array![
                Vec2 { x: 2, y: 0 }, Vec2 { x: 3, y: 0 }, Vec2 { x: 4, y: 0 }, Vec2 { x: 5, y: 0 },
                Vec2 { x: 6, y: 0 },
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

#[test]
fn test_move_unit_can_pass_through_friendly_unit() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    let mut friendly: Unit = world.read_model((game_id, 2_u8));
    friendly.player_id = 1;
    friendly.x = 2;
    friendly.y = 0;
    world.write_model_test(@friendly);
    world.write_model_test(@UnitPosition { game_id, x: 18, y: 19, unit_id: 0 });
    world.write_model_test(@UnitPosition { game_id, x: 2, y: 0, unit_id: 2 });

    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 2, y: 0 }, Vec2 { x: 3, y: 0 }]);

    let moved: Unit = world.read_model((game_id, 1_u8));
    assert(moved.x == 3, 'moved through friendly');
    assert(moved.y == 0, 'y should be 0');
}

#[test]
#[should_panic]
fn test_move_unit_enemy_still_blocks_path() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    let mut enemy: Unit = world.read_model((game_id, 2_u8));
    enemy.x = 2;
    enemy.y = 0;
    world.write_model_test(@enemy);
    world.write_model_test(@UnitPosition { game_id, x: 18, y: 19, unit_id: 0 });
    world.write_model_test(@UnitPosition { game_id, x: 2, y: 0, unit_id: 2 });

    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 2, y: 0 }, Vec2 { x: 3, y: 0 }]);
}

#[test]
#[should_panic]
fn test_move_unit_cannot_end_on_friendly_unit() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();

    let mut friendly: Unit = world.read_model((game_id, 2_u8));
    friendly.player_id = 1;
    friendly.x = 2;
    friendly.y = 0;
    world.write_model_test(@friendly);
    world.write_model_test(@UnitPosition { game_id, x: 18, y: 19, unit_id: 0 });
    world.write_model_test(@UnitPosition { game_id, x: 2, y: 0, unit_id: 2 });

    actions_dispatcher.move_unit(game_id, 1, array![Vec2 { x: 2, y: 0 }]);
}

#[test]
fn test_tank_road_bonus_allows_four_road_steps() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();
    let game: Game = world.read_model(game_id);
    let map_id = game.map_id;

    let mut unit: Unit = world.read_model((game_id, 1_u8));
    unit.unit_type = UnitType::Tank;
    unit.x = 0;
    unit.y = 1;
    world.write_model_test(@unit);

    world.write_model_test(@MapTile { map_id, x: 0, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 1, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 2, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 3, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 4, y: 1, tile_type: TileType::Road });

    actions_dispatcher
        .move_unit(
            game_id,
            1,
            array![
                Vec2 { x: 1, y: 1 }, Vec2 { x: 2, y: 1 }, Vec2 { x: 3, y: 1 }, Vec2 { x: 4, y: 1 },
            ],
        );

    let moved: Unit = world.read_model((game_id, 1_u8));
    assert(moved.x == 4, 'tank road bonus');
    assert(moved.y == 1, 'tank y should remain 1');
}

#[test]
#[should_panic]
fn test_tank_road_bonus_is_lost_after_leaving_road() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();
    let game: Game = world.read_model(game_id);
    let map_id = game.map_id;

    let mut unit: Unit = world.read_model((game_id, 1_u8));
    unit.unit_type = UnitType::Tank;
    unit.x = 0;
    unit.y = 1;
    world.write_model_test(@unit);

    world.write_model_test(@MapTile { map_id, x: 0, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 1, y: 1, tile_type: TileType::Road });

    // Leaves road at step 2; any remaining road bonus is discarded.
    actions_dispatcher
        .move_unit(
            game_id,
            1,
            array![
                Vec2 { x: 1, y: 1 }, Vec2 { x: 2, y: 1 }, Vec2 { x: 3, y: 1 }, Vec2 { x: 4, y: 1 },
            ],
        );
}

#[test]
fn test_ranger_road_bonus_allows_five_road_steps() {
    let (actions_dispatcher, mut world, game_id) = setup_playing_game();
    let game: Game = world.read_model(game_id);
    let map_id = game.map_id;

    let mut unit: Unit = world.read_model((game_id, 1_u8));
    unit.unit_type = UnitType::Ranger;
    unit.x = 0;
    unit.y = 1;
    world.write_model_test(@unit);

    world.write_model_test(@MapTile { map_id, x: 0, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 1, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 2, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 3, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 4, y: 1, tile_type: TileType::Road });
    world.write_model_test(@MapTile { map_id, x: 5, y: 1, tile_type: TileType::Road });

    actions_dispatcher
        .move_unit(
            game_id,
            1,
            array![
                Vec2 { x: 1, y: 1 }, Vec2 { x: 2, y: 1 }, Vec2 { x: 3, y: 1 }, Vec2 { x: 4, y: 1 },
                Vec2 { x: 5, y: 1 },
            ],
        );

    let moved: Unit = world.read_model((game_id, 1_u8));
    assert(moved.x == 5, 'ranger road bonus');
    assert(moved.y == 1, 'ranger y should remain 1');
}
