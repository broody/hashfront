use dojo::model::ModelStorage;
use hashfront::models::map::{MapInfo, MapTileSeq, MapUnit};
use hashfront::systems::actions::IActionsDispatcherTrait;
use hashfront::types::{TileType, UnitType};
use starknet::testing::{set_account_contract_address, set_contract_address};
use super::common::{PLAYER1, build_test_buildings, build_test_tiles, build_test_units, setup};

#[test]
#[available_gas(200000000)]
fn test_register_map() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, mut world) = setup();

    let map_id = actions_dispatcher
        .register_map(
            "test", 20, 20, build_test_tiles(), build_test_buildings(), build_test_units(),
        );
    assert(map_id == 1, 'map_id should be 1');

    // Verify MapInfo
    let info: MapInfo = world.read_model(map_id);
    assert(info.player_count == 2, 'wrong player_count');
    assert(info.width == 20, 'wrong width');
    assert(info.height == 20, 'wrong height');
    assert(info.tile_count == 2, 'wrong tile_count');
    assert(info.building_count == 2, 'wrong building_count');
    assert(info.unit_count == 2, 'wrong unit_count');

    // Verify HQ tiles were written (keyed by seq)
    let hq_tile: MapTileSeq = world.read_model((map_id, 0_u16));
    assert(hq_tile.x == 0 && hq_tile.y == 0, 'first tile should be 0,0');
    assert(hq_tile.tile_type == TileType::HQ, 'first tile should be HQ');

    let hq_tile2: MapTileSeq = world.read_model((map_id, 1_u16));
    assert(hq_tile2.x == 19 && hq_tile2.y == 19, 'second tile should be 19,19');
    assert(hq_tile2.tile_type == TileType::HQ, 'second tile should be HQ');

    // Verify units were written
    let u0: MapUnit = world.read_model((map_id, 0_u16));
    assert(u0.player_id == 1, 'u0 player_id');
    assert(u0.unit_type == UnitType::Infantry, 'u0 unit_type');
    assert(u0.x == 1, 'u0 x');
    assert(u0.y == 0, 'u0 y');

    let u1: MapUnit = world.read_model((map_id, 1_u16));
    assert(u1.player_id == 2, 'u1 player_id');
    assert(u1.unit_type == UnitType::Infantry, 'u1 unit_type');
    assert(u1.x == 18, 'u1 x');
    assert(u1.y == 19, 'u1 y');
}

#[test]
#[available_gas(200000000)]
fn test_register_map_with_mixed_tiles() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, mut world) = setup();

    // Sparse tiles: only non-grass
    let tiles: Array<u32> = array![
        0 * 256 + 4, // HQ at index 0
        1 * 256 + 1, // Mountain at index 1
        2 * 256 + 3, // Factory at index 2
        3 * 256 + 2, // City at index 3
        4 * 256 + 5, // Road at index 4
        5 * 256 + 6, // Tree at index 5
        399 * 256 + 4 // HQ at index 399
    ];

    let units: Array<u32> = array![
        1 * 16777216 + 1 * 65536 + 1 * 256 + 0, // P1 Infantry @ (1,0)
        2 * 16777216 + 2 * 65536 + 18 * 256 + 19 // P2 Tank @ (18,19)
    ];

    let map_id = actions_dispatcher
        .register_map("test", 20, 20, tiles, build_test_buildings(), units);

    // Verify stored tiles by seq
    let t0: MapTileSeq = world.read_model((map_id, 0_u16));
    assert(t0.x == 0 && t0.y == 0, 'idx 0');
    assert(t0.tile_type == TileType::HQ, 'should be HQ');

    let t1: MapTileSeq = world.read_model((map_id, 1_u16));
    assert(t1.x == 1 && t1.y == 0, 'idx 1');
    assert(t1.tile_type == TileType::Mountain, 'should be Mountain');

    let t2: MapTileSeq = world.read_model((map_id, 2_u16));
    assert(t2.x == 2 && t2.y == 0, 'idx 2');
    assert(t2.tile_type == TileType::Factory, 'should be Factory');

    let t3: MapTileSeq = world.read_model((map_id, 3_u16));
    assert(t3.x == 3 && t3.y == 0, 'idx 3');
    assert(t3.tile_type == TileType::City, 'should be City');

    let t4: MapTileSeq = world.read_model((map_id, 4_u16));
    assert(t4.x == 4 && t4.y == 0, 'idx 4');
    assert(t4.tile_type == TileType::Road, 'should be Road');

    let t5: MapTileSeq = world.read_model((map_id, 5_u16));
    assert(t5.x == 5 && t5.y == 0, 'idx 5');
    assert(t5.tile_type == TileType::Tree, 'should be Tree');

    // Verify units
    let u1: MapUnit = world.read_model((map_id, 1_u16));
    assert(u1.player_id == 2, 'u1 player_id');
    assert(u1.unit_type == UnitType::Tank, 'u1 should be Tank');
    assert(u1.x == 18, 'u1 x');
    assert(u1.y == 19, 'u1 y');
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_register_map_too_few_hqs() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();
    let tiles: Array<u32> = array![0 * 256 + 4]; // 1 HQ tile
    let buildings: Array<u32> = array![1 * 16777216 + 3 * 65536 + 0 * 256 + 0]; // 1 HQ building
    actions_dispatcher.register_map("test", 20, 20, tiles, buildings, array![]);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_register_map_too_many_hqs() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();
    let tiles: Array<u32> = array![0 * 256 + 4, 1 * 256 + 4, 2 * 256 + 4, 3 * 256 + 4, 4 * 256 + 4];
    let buildings: Array<u32> = array![
        1 * 16777216 + 3 * 65536 + 0 * 256 + 0, 2 * 16777216 + 3 * 65536 + 1 * 256 + 0,
        3 * 16777216 + 3 * 65536 + 2 * 256 + 0, 4 * 16777216 + 3 * 65536 + 3 * 256 + 0,
        5 * 16777216 + 3 * 65536 + 4 * 256 + 0,
    ];
    actions_dispatcher.register_map("test", 20, 20, tiles, buildings, array![]);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_register_map_out_of_bounds() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();
    let tiles: Array<u32> = array![0 * 256 + 4, 399 * 256 + 4, 400 * 256 + 1];
    actions_dispatcher.register_map("test", 20, 20, tiles, build_test_buildings(), array![]);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_register_map_grass_not_allowed() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();
    let tiles: Array<u32> = array![0 * 256 + 4, 1 * 256 + 0, 399 * 256 + 4];
    actions_dispatcher.register_map("test", 20, 20, tiles, build_test_buildings(), array![]);
}

#[test]
#[should_panic]
#[available_gas(200000000)]
fn test_register_map_unit_invalid_player() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();
    // player_id 3 invalid for a 2-HQ map
    let units: Array<u32> = array![3 * 16777216 + 1 * 65536 + 1 * 256 + 0];
    actions_dispatcher
        .register_map("test", 20, 20, build_test_tiles(), build_test_buildings(), units);
}
