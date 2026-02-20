use dojo::world::{WorldStorage, WorldStorageTrait, world};
use dojo_cairo_test::{
    ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
    spawn_test_world,
};
use hashfront::events as events;
use hashfront::models::building::m_Building;
use hashfront::models::game::{m_Game, m_GameCounter};
use hashfront::models::map::{m_MapBuilding, m_MapInfo, m_MapTile, m_MapUnit};
use hashfront::models::player::m_PlayerState;
use hashfront::models::tile::m_Tile;
use hashfront::models::unit::m_Unit;
use hashfront::models::unit_position::m_UnitPosition;
use hashfront::systems::actions::{IActionsDispatcher, actions};
use starknet::ContractAddress;

pub fn PLAYER1() -> ContractAddress {
    'PLAYER1'.try_into().unwrap()
}

pub fn PLAYER2() -> ContractAddress {
    'PLAYER2'.try_into().unwrap()
}

fn namespace_def() -> NamespaceDef {
    NamespaceDef {
        namespace: "hashfront",
        resources: [
            TestResource::Model(m_GameCounter::TEST_CLASS_HASH),
            TestResource::Model(m_Game::TEST_CLASS_HASH),
            TestResource::Model(m_MapInfo::TEST_CLASS_HASH),
            TestResource::Model(m_MapTile::TEST_CLASS_HASH),
            TestResource::Model(m_MapBuilding::TEST_CLASS_HASH),
            TestResource::Model(m_MapUnit::TEST_CLASS_HASH),
            TestResource::Model(m_PlayerState::TEST_CLASS_HASH),
            TestResource::Model(m_Tile::TEST_CLASS_HASH),
            TestResource::Model(m_Building::TEST_CLASS_HASH),
            TestResource::Model(m_Unit::TEST_CLASS_HASH),
            TestResource::Model(m_UnitPosition::TEST_CLASS_HASH),
            TestResource::Event(events::e_GameCreated::TEST_CLASS_HASH),
            TestResource::Event(events::e_GameStarted::TEST_CLASS_HASH),
            TestResource::Event(events::e_PlayerJoined::TEST_CLASS_HASH),
            TestResource::Event(events::e_UnitMoved::TEST_CLASS_HASH),
            TestResource::Event(events::e_UnitAttacked::TEST_CLASS_HASH),
            TestResource::Event(events::e_UnitDied::TEST_CLASS_HASH),
            TestResource::Event(events::e_UnitBuilt::TEST_CLASS_HASH),
            TestResource::Event(events::e_BuildingCaptured::TEST_CLASS_HASH),
            TestResource::Event(events::e_TurnEnded::TEST_CLASS_HASH),
            TestResource::Event(events::e_GameOver::TEST_CLASS_HASH),
            TestResource::Contract(actions::TEST_CLASS_HASH),
        ]
            .span(),
    }
}

fn contract_defs() -> Span<ContractDef> {
    [
        ContractDefTrait::new(@"hashfront", @"actions")
            .with_writer_of([dojo::utils::bytearray_hash(@"hashfront")].span()),
    ]
        .span()
}

/// Spawn a test world and return the actions dispatcher.
pub fn setup() -> (IActionsDispatcher, WorldStorage) {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (contract_address, _) = world.dns(@"actions").unwrap();
    let actions_dispatcher = IActionsDispatcher { contract_address };

    (actions_dispatcher, world)
}

/// Build a minimal 20x20 sparse tile array: only HQ tiles at (0,0) and (19,19).
/// Each entry is packed as (grid_index << 8) | tile_type_ordinal.
pub fn build_test_tiles() -> Array<u32> {
    let hq: u32 = 4; // TileType::HQ ordinal
    array![0 * 256 + hq, // HQ at index 0 = (0,0)
    399 * 256 + hq // HQ at index 399 = (19,19)
    ]
}

/// Build buildings for the test map.
/// Each entry is packed as (player_id << 24) | (building_type << 16) | (x << 8) | y.
/// BuildingType::HQ = 3.
pub fn build_test_buildings() -> Array<u32> {
    let hq: u32 = 3; // BuildingType::HQ ordinal
    array![
        1 * 16777216 + hq * 65536 + 0 * 256 + 0, // P1 HQ @ (0,0)
        2 * 16777216 + hq * 65536 + 19 * 256 + 19 // P2 HQ @ (19,19)
    ]
}

/// Build starting units for the test map.
/// Each entry is packed as (player_id << 24) | (unit_type << 16) | (x << 8) | y.
pub fn build_test_units() -> Array<u32> {
    // P1 Infantry at (1,0), P2 Infantry at (18,19)
    array![
        1 * 16777216 + 1 * 65536 + 1 * 256 + 0, // P1 Infantry @ (1,0)
        2 * 16777216 + 1 * 65536 + 18 * 256 + 19 // P2 Infantry @ (18,19)
    ]
}
