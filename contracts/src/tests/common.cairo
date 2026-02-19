use dojo::world::{WorldStorage, WorldStorageTrait, world};
use dojo_cairo_test::{
    ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
    spawn_test_world,
};
use starknet::ContractAddress;

use chain_tactics::events as events;
use chain_tactics::models::building::m_Building;
use chain_tactics::models::game::{m_Game, m_GameCounter};
use chain_tactics::models::map::{m_MapInfo, m_MapTile};
use chain_tactics::models::player::m_PlayerState;
use chain_tactics::models::tile::m_Tile;
use chain_tactics::models::unit::m_Unit;
use chain_tactics::systems::actions::{IActionsDispatcher, actions};

pub fn PLAYER1() -> ContractAddress {
    'PLAYER1'.try_into().unwrap()
}

pub fn PLAYER2() -> ContractAddress {
    'PLAYER2'.try_into().unwrap()
}

fn namespace_def() -> NamespaceDef {
    NamespaceDef {
        namespace: "chain_tactics",
        resources: [
            TestResource::Model(m_GameCounter::TEST_CLASS_HASH),
            TestResource::Model(m_Game::TEST_CLASS_HASH),
            TestResource::Model(m_MapInfo::TEST_CLASS_HASH),
            TestResource::Model(m_MapTile::TEST_CLASS_HASH),
            TestResource::Model(m_PlayerState::TEST_CLASS_HASH),
            TestResource::Model(m_Tile::TEST_CLASS_HASH),
            TestResource::Model(m_Building::TEST_CLASS_HASH),
            TestResource::Model(m_Unit::TEST_CLASS_HASH),
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
        ContractDefTrait::new(@"chain_tactics", @"actions")
            .with_writer_of([dojo::utils::bytearray_hash(@"chain_tactics")].span()),
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

/// Build a minimal 20x20 tile array: all grass except two HQ tiles at (0,0) and (19,19).
pub fn build_test_tiles() -> Array<u8> {
    let size: u32 = 20 * 20;
    let mut tiles: Array<u8> = array![];
    let mut i: u32 = 0;
    let hq: u8 = 4; // TileType::HQ ordinal
    let last: u32 = size - 1;
    while i < size {
        if i == 0 || i == last {
            tiles.append(hq);
        } else {
            tiles.append(0); // Grass
        }
        i += 1;
    };
    tiles
}
