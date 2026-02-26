use dojo::model::ModelStorage;
use hashfront::models::map::{MapInfo, MapTile};
use hashfront::models::unit::Unit;
use hashfront::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
use hashfront::types::{BorderType, TileType, Vec2};
use starknet::testing::{set_account_contract_address, set_contract_address};
use super::common::{PLAYER1, PLAYER2, build_test_buildings, setup};

// ── Helpers
// ──────────────────────────────────────────────────────────

/// Tiles: HQ at (0,0) and (19,19), ocean strip at y=10 (x=0..19).
/// All ocean tiles are adjacent to grass, so they get BorderType::Bluff.
fn build_ocean_tiles() -> Array<u32> {
    let hq: u32 = 4; // TileType::HQ
    let ocean_bluff: u32 = (1 * 16) + 8; // (BorderType::Bluff << 4) | TileType::Ocean = 24
    let mut tiles: Array<u32> = array![
        0 * 256 + hq, // HQ at index 0 = (0,0)
        399 * 256 + hq // HQ at index 399 = (19,19)
    ];
    // Ocean wall at y=10 → indices 200..219
    let mut x: u32 = 0;
    while x < 20 {
        tiles.append((200 + x) * 256 + ocean_bluff);
        x += 1;
    }
    tiles
}

/// Units on safe tiles only — P1 at (1,0), P2 at (18,19).
fn build_ocean_units() -> Array<u32> {
    array![
        1 * 16777216 + 1 * 65536 + 1 * 256 + 0, // P1 Infantry @ (1,0)
        2 * 16777216 + 1 * 65536 + 18 * 256 + 19 // P2 Infantry @ (18,19)
    ]
}

/// Register an ocean map and create a 2-player game in Playing state.
fn setup_ocean_game() -> (IActionsDispatcher, dojo::world::WorldStorage, u32) {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions, world) = setup();
    let map_id = actions
        .register_map(
            "ocean", 20, 20, build_ocean_tiles(), build_test_buildings(), build_ocean_units(),
        );
    let game_id = actions.create_game("ocean", map_id, 1, false);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions.join_game(game_id, 2);

    set_contract_address(p1);
    set_account_contract_address(p1);

    (actions, world, game_id)
}

// ── Registration tests
// ───────────────────────────────────────────────

#[test]
#[available_gas(200000000)]
fn test_register_map_with_ocean() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions, mut world) = setup();
    let map_id = actions
        .register_map(
            "ocean", 20, 20, build_ocean_tiles(), build_test_buildings(), build_ocean_units(),
        );

    // Verify ocean tiles stored correctly with border_type
    let ocean_tile: MapTile = world.read_model((map_id, 0_u8, 10_u8));
    assert(ocean_tile.tile_type == TileType::Ocean, 'should be ocean');
    assert(ocean_tile.border_type == BorderType::Bluff, 'should be bluff');

    let ocean_tile2: MapTile = world.read_model((map_id, 10_u8, 10_u8));
    assert(ocean_tile2.tile_type == TileType::Ocean, 'mid ocean');
    assert(ocean_tile2.border_type == BorderType::Bluff, 'mid should be bluff');

    // Non-ocean tile should be default Grass
    let grass_tile: MapTile = world.read_model((map_id, 5_u8, 5_u8));
    assert(grass_tile.tile_type == TileType::Grass, 'should be grass');

    // Info should have correct tile count (2 HQs + 20 ocean = 22)
    let info: MapInfo = world.read_model(map_id);
    assert(info.tile_count == 22, 'wrong tile_count');
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_register_map_building_on_ocean() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions, _) = setup();

    // Ocean at y=10, try placing a city on (5,10) which is ocean
    let buildings: Array<u32> = array![
        1 * 16777216 + 3 * 65536 + 0 * 256 + 0, // P1 HQ @ (0,0)
        2 * 16777216 + 3 * 65536 + 19 * 256 + 19, // P2 HQ @ (19,19)
        0 * 16777216 + 1 * 65536 + 5 * 256 + 10 // Neutral City @ (5,10) — ocean!
    ];

    actions.register_map("bad", 20, 20, build_ocean_tiles(), buildings, build_ocean_units());
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_register_map_unit_on_ocean() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions, _) = setup();

    // Try placing infantry on (5,10) which is ocean
    let units: Array<u32> = array![
        1 * 16777216 + 1 * 65536 + 1 * 256 + 0, // P1 Infantry @ (1,0) OK
        2 * 16777216 + 1 * 65536 + 18 * 256 + 19, // P2 Infantry @ (18,19) OK
        1 * 16777216 + 1 * 65536 + 5 * 256 + 10 // P1 Infantry @ (5,10) — ocean!
    ];

    actions.register_map("bad", 20, 20, build_ocean_tiles(), build_test_buildings(), units);
}

// ── Movement tests
// ───────────────────────────────────────────────────

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_infantry_cannot_traverse_ocean() {
    let (actions, _, game_id) = setup_ocean_game();

    // P1 Infantry at (1,0). Move south toward ocean at y=10.
    // Path: (1,0) → (1,1) → (1,2) → (1,3) — first just move closer (4 moves).
    // Then next turn try to cross. But we can test directly by placing near ocean.
    // Infantry has range 4. Move from (1,0) → (1,1) → (1,2) → (1,3) → (1,4)
    actions
        .move_unit(
            game_id,
            1,
            array![
                Vec2 { x: 1, y: 1 }, Vec2 { x: 1, y: 2 }, Vec2 { x: 1, y: 3 }, Vec2 { x: 1, y: 4 },
            ],
        );

    // End turn for P1, then P2
    actions.end_turn(game_id);
    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions.end_turn(game_id);

    // Back to P1 — move infantry from (1,4) toward ocean
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);
    actions
        .move_unit(
            game_id,
            1,
            array![
                Vec2 { x: 1, y: 5 }, Vec2 { x: 1, y: 6 }, Vec2 { x: 1, y: 7 }, Vec2 { x: 1, y: 8 },
            ],
        );

    // End turns again
    actions.end_turn(game_id);
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions.end_turn(game_id);

    // P1 again — infantry at (1,8), try to move to (1,9) then (1,10) = ocean
    set_contract_address(p1);
    set_account_contract_address(p1);
    actions
        .move_unit(
            game_id, 1, array![Vec2 { x: 1, y: 9 }, Vec2 { x: 1, y: 10 } // OCEAN — should panic
            ],
        );
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_tank_cannot_traverse_ocean() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions, _world) = setup();

    // Build a small map with ocean+bluff at (3,0)
    let tiles: Array<u32> = array![
        0 * 256 + 4, // HQ @ (0,0)
        99 * 256 + 4, // HQ @ (9,9) for a 10x10 map
        3 * 256 + 24 // Ocean+Bluff @ (3,0): (1<<4)|8 = 24
    ];
    let buildings: Array<u32> = array![
        1 * 16777216 + 3 * 65536 + 0 * 256 + 0, 2 * 16777216 + 3 * 65536 + 9 * 256 + 9,
    ];
    let units: Array<u32> = array![
        1 * 16777216 + 2 * 65536 + 1 * 256 + 0, // P1 Tank @ (1,0)
        2 * 16777216 + 1 * 65536 + 8 * 256 + 9 // P2 Infantry @ (8,9)
    ];

    let map_id = actions.register_map("ocean_small", 10, 10, tiles, buildings, units);
    let game_id = actions.create_game("ocean_small", map_id, 1, false);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions.join_game(game_id, 2);

    set_contract_address(p1);
    set_account_contract_address(p1);

    // Tank at (1,0), range 2. Try (2,0) → (3,0) where (3,0) is ocean.
    actions
        .move_unit(
            game_id, 1, array![Vec2 { x: 2, y: 0 }, Vec2 { x: 3, y: 0 } // OCEAN — should panic
            ],
        );
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_ranger_cannot_traverse_ocean() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions, _) = setup();

    let tiles: Array<u32> = array![
        0 * 256 + 4, // HQ @ (0,0)
        99 * 256 + 4, // HQ @ (9,9)
        3 * 256 + 24 // Ocean+Bluff @ (3,0): (1<<4)|8 = 24
    ];
    let buildings: Array<u32> = array![
        1 * 16777216 + 3 * 65536 + 0 * 256 + 0, 2 * 16777216 + 3 * 65536 + 9 * 256 + 9,
    ];
    let units: Array<u32> = array![
        1 * 16777216 + 3 * 65536 + 1 * 256 + 0, // P1 Ranger @ (1,0)
        2 * 16777216 + 1 * 65536 + 8 * 256 + 9 // P2 Infantry @ (8,9)
    ];

    let map_id = actions.register_map("ocean_ranger", 10, 10, tiles, buildings, units);
    let game_id = actions.create_game("ocean_ranger", map_id, 1, false);

    let p2 = PLAYER2();
    set_contract_address(p2);
    set_account_contract_address(p2);
    actions.join_game(game_id, 2);

    set_contract_address(p1);
    set_account_contract_address(p1);

    // Ranger at (1,0), try (2,0) → (3,0) where (3,0) is ocean
    actions
        .move_unit(
            game_id, 1, array![Vec2 { x: 2, y: 0 }, Vec2 { x: 3, y: 0 } // OCEAN — should panic
            ],
        );
}

#[test]
#[available_gas(200000000)]
fn test_ground_units_move_adjacent_to_ocean() {
    let (actions, mut world, game_id) = setup_ocean_game();

    // P1 Infantry at (1,0). Move to (1,1) — safe tile next to no ocean. Just verify movement
    // works on a map that contains ocean elsewhere.
    actions.move_unit(game_id, 1, array![Vec2 { x: 1, y: 1 }, Vec2 { x: 1, y: 2 }]);

    let unit: Unit = world.read_model((game_id, 1_u8));
    assert(unit.x == 1, 'x should be 1');
    assert(unit.y == 2, 'y should be 2');
}

// ── Border validation tests
// ─────────────────────────────────────────

#[test]
#[should_panic(expected: ('Ocean adj land needs border', 'ENTRYPOINT_FAILED'))]
#[available_gas(200000000)]
fn test_ocean_adjacent_land_must_have_border() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions, _) = setup();

    // Ocean at (3,0) with BorderType::None — adjacent to grass, should panic
    let tiles: Array<u32> = array![
        0 * 256 + 4, // HQ @ (0,0)
        99 * 256 + 4, // HQ @ (9,9)
        3 * 256 + 8 // Ocean @ (3,0) — no border! tile_val = 8
    ];
    let buildings: Array<u32> = array![
        1 * 16777216 + 3 * 65536 + 0 * 256 + 0, 2 * 16777216 + 3 * 65536 + 9 * 256 + 9,
    ];
    let units: Array<u32> = array![
        1 * 16777216 + 1 * 65536 + 1 * 256 + 0, 2 * 16777216 + 1 * 65536 + 8 * 256 + 9,
    ];

    actions.register_map("bad_border", 10, 10, tiles, buildings, units);
}

#[test]
#[available_gas(200000000)]
fn test_interior_ocean_no_border_ok() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions, _) = setup();

    // 10x10 map: ocean block at (3,1),(4,1),(3,2),(4,2)
    // (3,1) and (4,1) are adjacent to grass at y=0 → need border
    // (3,2) and (4,2) are adjacent to grass at y=3 → need border
    // But (3,1) also adjacent to (3,2)=ocean, (4,1)=ocean, (2,1)=grass → needs border
    // Interior ocean would need a 3x3+ block. Let's use a 3x3 with interior:
    // Ocean at (3,1),(4,1),(5,1),(3,2),(4,2),(5,2),(3,3),(4,3),(5,3)
    // (4,2) has all 4 neighbors as ocean → interior, BorderType::None is OK
    let bluff: u32 = (1 * 16) + 8; // 24
    let ocean: u32 = 8; // no border
    let tiles: Array<u32> = array![
        0 * 256 + 4, // HQ @ (0,0)
        99 * 256 + 4, // HQ @ (9,9)
        // Row y=1: (3,1),(4,1),(5,1)
        13 * 256 + bluff, // (3,1) adj grass above
        14 * 256 + bluff, // (4,1) adj grass above
        15 * 256 + bluff, // (5,1) adj grass above
        // Row y=2: (3,2),(4,2),(5,2)
        23 * 256 + bluff, // (3,2) adj grass left at (2,2)
        24 * 256 + ocean, // (4,2) interior — all 4 neighbors are ocean
        25 * 256 + bluff, // (5,2) adj grass right at (6,2)
        // Row y=3: (3,3),(4,3),(5,3)
        33 * 256 + bluff, // (3,3) adj grass below
        34 * 256 + bluff, // (4,3) adj grass below
        35 * 256 + bluff // (5,3) adj grass below
    ];
    let buildings: Array<u32> = array![
        1 * 16777216 + 3 * 65536 + 0 * 256 + 0, 2 * 16777216 + 3 * 65536 + 9 * 256 + 9,
    ];
    let units: Array<u32> = array![
        1 * 16777216 + 1 * 65536 + 1 * 256 + 0, 2 * 16777216 + 1 * 65536 + 8 * 256 + 9,
    ];

    // Should succeed — interior ocean (4,2) has no border, which is fine
    actions.register_map("interior_ok", 10, 10, tiles, buildings, units);
}

#[test]
#[should_panic(expected: ('Only ocean has border', 'ENTRYPOINT_FAILED'))]
#[available_gas(200000000)]
fn test_land_tile_cannot_have_border() {
    let p1 = PLAYER1();
    set_contract_address(p1);
    set_account_contract_address(p1);

    let (actions, _) = setup();

    // Mountain at (2,0) with BorderType::Bluff — invalid, land can't have border
    let bad_mountain: u32 = (1 * 16) + 1; // border_type=Bluff(1), tile_type=Mountain(1)
    let tiles: Array<u32> = array![
        0 * 256 + 4, // HQ @ (0,0)
        99 * 256 + 4, // HQ @ (9,9)
        2 * 256 + bad_mountain // Mountain @ (2,0) with Bluff border — should panic
    ];
    let buildings: Array<u32> = array![
        1 * 16777216 + 3 * 65536 + 0 * 256 + 0, 2 * 16777216 + 3 * 65536 + 9 * 256 + 9,
    ];
    let units: Array<u32> = array![
        1 * 16777216 + 1 * 65536 + 1 * 256 + 0, 2 * 16777216 + 1 * 65536 + 8 * 256 + 9,
    ];

    actions.register_map("bad_land_border", 10, 10, tiles, buildings, units);
}
