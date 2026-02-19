use dojo::model::ModelStorage;
use starknet::testing::{set_contract_address, set_account_contract_address};

use chain_tactics::models::map::{MapInfo, MapTile};
use chain_tactics::systems::actions::IActionsDispatcherTrait;
use chain_tactics::types::TileType;
use super::common::{PLAYER1, build_test_tiles, setup};

#[test]
fn test_register_map() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, mut world) = setup();

    let map_id = actions_dispatcher.register_map(2, 20, 20, build_test_tiles());
    assert(map_id == 1, 'map_id should be 1');

    // Verify MapInfo
    let info: MapInfo = world.read_model(map_id);
    assert(info.player_count == 2, 'wrong player_count');
    assert(info.width == 20, 'wrong width');
    assert(info.height == 20, 'wrong height');
    let expected: u16 = 20 * 20;
    assert(info.tile_count == expected, 'wrong tile_count');

    // Verify HQ tiles were written
    let hq_tile: MapTile = world.read_model((map_id, 0_u16)); // index 0 = (0,0)
    assert(hq_tile.tile_type == TileType::HQ, 'first tile should be HQ');

    let last_index: u16 = expected - 1;
    let hq_tile2: MapTile = world.read_model((map_id, last_index)); // index 399 = (19,19)
    assert(hq_tile2.tile_type == TileType::HQ, 'last tile should be HQ');

    // Verify grass tiles were NOT written (default to Grass)
    let grass_tile: MapTile = world.read_model((map_id, 1_u16));
    assert(grass_tile.tile_type == TileType::Grass, 'should default to Grass');
}

#[test]
fn test_register_map_with_mixed_tiles() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, mut world) = setup();

    // Build a map with various tile types
    let size: u32 = 20 * 20;
    let mut tiles: Array<u8> = array![];
    let mut i: u32 = 0;
    while i < size {
        if i == 0 {
            tiles.append(4); // HQ
        } else if i == size - 1 {
            tiles.append(4); // HQ
        } else if i == 1 {
            tiles.append(1); // Mountain
        } else if i == 2 {
            tiles.append(3); // Factory
        } else if i == 3 {
            tiles.append(2); // City
        } else if i == 4 {
            tiles.append(5); // Road
        } else if i == 5 {
            tiles.append(6); // Tree
        } else {
            tiles.append(0); // Grass
        }
        i += 1;
    };

    let map_id = actions_dispatcher.register_map(2, 20, 20, tiles);

    // Verify non-grass tiles were stored
    let mountain: MapTile = world.read_model((map_id, 1_u16));
    assert(mountain.tile_type == TileType::Mountain, 'should be Mountain');

    let factory: MapTile = world.read_model((map_id, 2_u16));
    assert(factory.tile_type == TileType::Factory, 'should be Factory');

    let city: MapTile = world.read_model((map_id, 3_u16));
    assert(city.tile_type == TileType::City, 'should be City');

    let road: MapTile = world.read_model((map_id, 4_u16));
    assert(road.tile_type == TileType::Road, 'should be Road');

    let tree: MapTile = world.read_model((map_id, 5_u16));
    assert(tree.tile_type == TileType::Tree, 'should be Tree');

    // Grass tile at index 6 should default
    let grass: MapTile = world.read_model((map_id, 6_u16));
    assert(grass.tile_type == TileType::Grass, 'should default Grass');
}

#[test]
#[should_panic]
fn test_register_map_invalid_player_count_low() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();
    actions_dispatcher.register_map(1, 20, 20, build_test_tiles());
}

#[test]
#[should_panic]
fn test_register_map_invalid_player_count_high() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();
    actions_dispatcher.register_map(5, 20, 20, build_test_tiles());
}

#[test]
#[should_panic]
fn test_register_map_wrong_tile_count() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();
    // Only 10 tiles instead of 400
    let tiles: Array<u8> = array![0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    actions_dispatcher.register_map(2, 20, 20, tiles);
}

#[test]
#[should_panic]
fn test_register_map_hq_mismatch() {
    let caller = PLAYER1();
    set_contract_address(caller);
    set_account_contract_address(caller);

    let (actions_dispatcher, _) = setup();

    // Build map with only 1 HQ but request 2 players
    let size: u32 = 20 * 20;
    let mut tiles: Array<u8> = array![];
    let mut i: u32 = 0;
    while i < size {
        if i == 0 {
            tiles.append(4); // Only one HQ
        } else {
            tiles.append(0);
        }
        i += 1;
    };
    actions_dispatcher.register_map(2, 20, 20, tiles);
}
