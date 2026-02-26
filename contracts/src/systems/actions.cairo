use hashfront::types::{UnitType, Vec2};

#[starknet::interface]
pub trait IActions<T> {
    fn register_map(
        ref self: T,
        name: ByteArray,
        width: u8,
        height: u8,
        tiles: Array<u32>,
        buildings: Array<u32>,
        units: Array<u32>,
    ) -> u8;
    fn create_game(
        ref self: T, name: ByteArray, map_id: u8, player_id: u8, is_test_mode: bool,
    ) -> u32;
    fn join_game(ref self: T, game_id: u32, player_id: u8);
    fn move_unit(ref self: T, game_id: u32, unit_id: u8, path: Array<Vec2>);
    fn attack(ref self: T, game_id: u32, unit_id: u8, target_id: u8);
    fn capture(ref self: T, game_id: u32, unit_id: u8);
    fn build_unit(ref self: T, game_id: u32, factory_x: u8, factory_y: u8, unit_type: UnitType);
    fn end_turn(ref self: T, game_id: u32);
    fn resign(ref self: T, game_id: u32);
    fn get_terrain(self: @T, map_id: u8) -> (u8, u8, Array<u32>);
    fn get_buildings(self: @T, map_id: u8) -> (u8, u8, Array<u32>);
    fn get_units(self: @T, map_id: u8) -> (u8, u8, Array<u32>);
}

#[dojo::contract]
pub mod actions {
    use core::dict::{Felt252Dict, Felt252DictTrait};
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use hashfront::consts::{
        CAPTURE_THRESHOLD, MAX_ROUNDS, NON_P1_STARTING_GOLD_BONUS, STARTING_GOLD,
    };
    use hashfront::events::{
        BuildingCaptured, GameCreated, GameStarted, PlayerJoined, TurnEnded, UnitAttacked,
        UnitBuilt, UnitDied, UnitMoved,
    };
    use hashfront::helpers::{combat, game as game_helpers, map as map_helpers, stats, unit_stats};
    use hashfront::models::building::Building;
    use hashfront::models::game::{Game, GameCounter};
    use hashfront::models::map::{MapBuilding, MapInfo, MapTile, MapTileSeq, MapUnit};
    use hashfront::models::player::{PlayerHQ, PlayerState};
    use hashfront::models::unit::{Unit, UnitImpl, UnitPosition};
    use hashfront::types::{BorderType, BuildingType, GameState, TileType, UnitType, Vec2};
    use starknet::syscalls::get_block_hash_syscall;
    use starknet::{get_block_number, get_caller_address};
    use super::IActions;

    #[abi(embed_v0)]
    impl ActionsImpl of IActions<ContractState> {
        /// Register a reusable map template.
        /// `tiles`: sparse packed u32 for non-grass tiles: (grid_index << 8) | tile_type.
        /// `buildings`: packed u32: (player_id << 24) | (building_type << 16) | (x << 8) | y.
        /// `units`: packed u32: (player_id << 24) | (unit_type << 16) | (x << 8) | y.
        /// Player count is derived from the number of HQ buildings. Returns the new map_id.
        fn register_map(
            ref self: ContractState,
            name: ByteArray,
            width: u8,
            height: u8,
            tiles: Array<u32>,
            buildings: Array<u32>,
            units: Array<u32>,
        ) -> u8 {
            assert(width > 0 && height > 0, 'Invalid dimensions');

            let total: u32 = width.into() * height.into();
            let tile_span = tiles.span();
            let tile_count: u16 = tile_span.len().try_into().unwrap();
            let building_span = buildings.span();
            let building_count: u16 = building_span.len().try_into().unwrap();
            let unit_span = units.span();
            let unit_count: u16 = unit_span.len().try_into().unwrap();

            let mut world = self.world_default();

            let mut counter: GameCounter = world.read_model(1_u32);
            let map_id: u8 = (counter.count + 1).try_into().unwrap();
            counter.count += 1;
            world.write_model(@counter);

            let ocean_tile_type: u8 = TileType::Ocean.into();
            let mut tile_type_by_index: Felt252Dict<u8> = Default::default();

            // Validate tile payload and cache final tile types in-memory by grid index.
            // Packing: packed = grid_index * 256 + tile_val
            // tile_val = (border_type << 4) | tile_type
            let mut i: u32 = 0;
            while i < tile_span.len() {
                let packed: u32 = *tile_span.at(i);
                let grid_index: u16 = (packed / 256).try_into().unwrap();
                let tile_val: u8 = (packed % 256).try_into().unwrap();

                assert(grid_index.into() < total, 'Index out of bounds');
                let tile_type_val: u8 = tile_val % 16;
                let tile_type: TileType = tile_type_val.into();
                let border_type: BorderType = (tile_val / 16).into();
                assert(tile_type != TileType::Grass, 'Grass tiles not allowed');

                // Only ocean tiles may carry a border type.
                if tile_type != TileType::Ocean {
                    assert(border_type == BorderType::None, 'Only ocean has border');
                }

                tile_type_by_index.insert(grid_index.into(), tile_type_val);

                i += 1;
            }

            // Validate: ocean tiles adjacent to non-ocean must have a border_type
            let mut v: u32 = 0;
            while v < tile_span.len() {
                let packed: u32 = *tile_span.at(v);
                let tile_val: u8 = (packed % 256).try_into().unwrap();
                let tile_type_val: u8 = tile_val % 16;

                if tile_type_val == ocean_tile_type {
                    let grid_index: u16 = (packed / 256).try_into().unwrap();
                    let (x, y) = map_helpers::index_to_xy(grid_index, width);
                    let border_type: BorderType = (tile_val / 16).into();

                    // Check 4 neighbors; out-of-bounds counts as non-ocean (map edge)
                    let mut has_land_neighbor = false;
                    if x == 0 {
                        has_land_neighbor = true;
                    } else {
                        let left_index = map_helpers::xy_to_index(x - 1, y, width);
                        let left_tile_type: u8 = tile_type_by_index.get(left_index.into());
                        if left_tile_type != ocean_tile_type {
                            has_land_neighbor = true;
                        }
                    }
                    if !has_land_neighbor && x + 1 >= width {
                        has_land_neighbor = true;
                    }
                    if !has_land_neighbor {
                        let right_index = map_helpers::xy_to_index(x + 1, y, width);
                        let right_tile_type: u8 = tile_type_by_index.get(right_index.into());
                        if right_tile_type != ocean_tile_type {
                            has_land_neighbor = true;
                        }
                    }
                    if !has_land_neighbor && y == 0 {
                        has_land_neighbor = true;
                    }
                    if !has_land_neighbor {
                        let up_index = map_helpers::xy_to_index(x, y - 1, width);
                        let up_tile_type: u8 = tile_type_by_index.get(up_index.into());
                        if up_tile_type != ocean_tile_type {
                            has_land_neighbor = true;
                        }
                    }
                    if !has_land_neighbor && y + 1 >= height {
                        has_land_neighbor = true;
                    }
                    if !has_land_neighbor {
                        let down_index = map_helpers::xy_to_index(x, y + 1, width);
                        let down_tile_type: u8 = tile_type_by_index.get(down_index.into());
                        if down_tile_type != ocean_tile_type {
                            has_land_neighbor = true;
                        }
                    }

                    if has_land_neighbor {
                        assert(border_type != BorderType::None, 'Ocean adj land needs border');
                    }
                }

                v += 1;
            }

            // Store tiles after validation.
            let mut t: u32 = 0;
            while t < tile_span.len() {
                let packed: u32 = *tile_span.at(t);
                let grid_index: u16 = (packed / 256).try_into().unwrap();
                let tile_val: u8 = (packed % 256).try_into().unwrap();
                let tile_type: TileType = (tile_val % 16).into();
                let border_type: BorderType = (tile_val / 16).into();

                let (x, y) = map_helpers::index_to_xy(grid_index, width);
                let seq: u16 = t.try_into().unwrap();
                world.write_model(@MapTile { map_id, x, y, tile_type, border_type });
                world.write_model(@MapTileSeq { map_id, seq, x, y, tile_type, border_type });

                t += 1;
            }

            // Store buildings and count HQs for player_count
            let mut j: u32 = 0;
            let mut hq_count: u8 = 0;
            while j < building_span.len() {
                let packed: u32 = *building_span.at(j);
                let player_id: u8 = (packed / 16777216).try_into().unwrap();
                let building_type_val: u8 = ((packed / 65536) % 256).try_into().unwrap();
                let x: u8 = ((packed / 256) % 256).try_into().unwrap();
                let y: u8 = (packed % 256).try_into().unwrap();

                let building_type: BuildingType = building_type_val.into();
                assert(building_type != BuildingType::None, 'Invalid building type');
                assert(x < width && y < height, 'Building out of bounds');

                // Cannot place buildings on ocean tiles
                let tile_index = map_helpers::xy_to_index(x, y, width);
                let building_tile_type: u8 = tile_type_by_index.get(tile_index.into());
                assert(building_tile_type != ocean_tile_type, 'No building on ocean');

                if building_type == BuildingType::HQ {
                    hq_count += 1;
                    assert(player_id >= 1, 'HQ must have owner');
                }

                world
                    .write_model(
                        @MapBuilding {
                            map_id, seq: j.try_into().unwrap(), player_id, building_type, x, y,
                        },
                    );

                j += 1;
            }

            assert(hq_count >= 2 && hq_count <= 4, 'Invalid HQ count');

            // Store units
            let mut k: u32 = 0;
            while k < unit_span.len() {
                let packed: u32 = *unit_span.at(k);
                let player_id: u8 = (packed / 16777216).try_into().unwrap();
                let unit_type_val: u8 = ((packed / 65536) % 256).try_into().unwrap();
                let x: u8 = ((packed / 256) % 256).try_into().unwrap();
                let y: u8 = (packed % 256).try_into().unwrap();

                assert(player_id >= 1 && player_id <= hq_count, 'Invalid player_id');
                let unit_type: UnitType = unit_type_val.into();
                assert(unit_type != UnitType::None, 'Invalid unit type');
                assert(x < width && y < height, 'Unit out of bounds');

                // Cannot place units on ocean tiles
                let tile_index = map_helpers::xy_to_index(x, y, width);
                let unit_tile_type: u8 = tile_type_by_index.get(tile_index.into());
                assert(unit_tile_type != ocean_tile_type, 'No unit on ocean');

                world
                    .write_model(
                        @MapUnit { map_id, seq: k.try_into().unwrap(), player_id, unit_type, x, y },
                    );

                k += 1;
            }

            world
                .write_model(
                    @MapInfo {
                        map_id,
                        name,
                        player_count: hq_count,
                        width,
                        height,
                        tile_count,
                        building_count,
                        unit_count,
                    },
                );

            map_id
        }

        /// Create a new game from a registered map. Copies tiles and buildings into per-game
        /// state and registers the caller as the chosen player_id. Returns game_id.
        fn create_game(
            ref self: ContractState, name: ByteArray, map_id: u8, player_id: u8, is_test_mode: bool,
        ) -> u32 {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let map_info: MapInfo = world.read_model(map_id);
            assert(map_info.tile_count > 0, 'Map not registered');
            assert(player_id >= 1 && player_id <= map_info.player_count, 'Invalid player_id');

            let mut counter: GameCounter = world.read_model(0_u32);
            counter.count += 1;
            let game_id = counter.count;
            world.write_model(@counter);

            world
                .write_model(
                    @Game {
                        game_id,
                        name,
                        map_id,
                        state: GameState::Lobby,
                        player_count: map_info.player_count,
                        num_players: 1,
                        current_player: 1,
                        round: 1,
                        next_unit_id: 0,
                        winner: 0,
                        width: map_info.width,
                        height: map_info.height,
                        is_test_mode,
                    },
                );

            // Copy buildings with ownership from template
            let mut j: u16 = 0;
            while j < map_info.building_count {
                let mb: MapBuilding = world.read_model((map_id, j));

                if mb.building_type == BuildingType::HQ {
                    world
                        .write_model(
                            @PlayerHQ { game_id, player_id: mb.player_id, x: mb.x, y: mb.y },
                        );
                }

                world
                    .write_model(
                        @Building {
                            game_id,
                            x: mb.x,
                            y: mb.y,
                            building_type: mb.building_type,
                            player_id: mb.player_id,
                            capture_player: 0,
                            capture_progress: 0,
                            queued_unit: 0,
                        },
                    );
                j += 1;
            }

            world
                .write_model(
                    @PlayerState {
                        game_id,
                        player_id,
                        address: caller,
                        gold: if player_id == 1 {
                            STARTING_GOLD
                        } else {
                            STARTING_GOLD + NON_P1_STARTING_GOLD_BONUS
                        },
                        unit_count: 0,
                        factory_count: 0,
                        city_count: 0,
                        is_alive: true,
                    },
                );

            let mut game: Game = world.read_model(game_id);
            game_helpers::spawn_player_units(ref world, game_id, ref game, map_id, player_id);
            world.write_model(@game);

            world.emit_event(@GameCreated { game_id, map_id, player_count: map_info.player_count });

            game_id
        }

        /// Join an existing game in the lobby. The caller picks their player slot
        /// (first come first serve). When the last player joins, transitions to Playing
        /// state — spawns starting units, counts buildings, and runs P1 income/production.
        fn join_game(ref self: ContractState, game_id: u32, player_id: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            assert(game.state == GameState::Lobby, 'Game not in lobby');
            assert(game.num_players < game.player_count, 'Game is full');
            assert(player_id >= 1 && player_id <= game.player_count, 'Invalid player_id');

            // Check slot is available and caller hasn't already joined
            let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
            if !game.is_test_mode {
                let mut i: u8 = 1;
                while i <= game.player_count {
                    let ps: PlayerState = world.read_model((game_id, i));
                    if ps.address != zero_addr {
                        assert(ps.address != caller, 'Already joined');
                    }
                    i += 1;
                }
            }

            let slot: PlayerState = world.read_model((game_id, player_id));
            assert(slot.address == zero_addr, 'Slot taken');

            game.num_players += 1;

            world
                .write_model(
                    @PlayerState {
                        game_id,
                        player_id,
                        address: caller,
                        gold: if player_id == 1 {
                            STARTING_GOLD
                        } else {
                            STARTING_GOLD + NON_P1_STARTING_GOLD_BONUS
                        },
                        unit_count: 0,
                        factory_count: 0,
                        city_count: 0,
                        is_alive: true,
                    },
                );

            game_helpers::spawn_player_units(ref world, game_id, ref game, game.map_id, player_id);

            world.emit_event(@PlayerJoined { game_id, player_id });

            if game.num_players == game.player_count {
                game.state = GameState::Playing;
                game_helpers::count_player_buildings(ref world, game_id, game.map_id);
                game_helpers::run_income(ref world, game_id, 1);
                game_helpers::run_production(ref world, game_id, 1, ref game);
                world.emit_event(@GameStarted { game_id, player_count: game.player_count });
            }

            world.write_model(@game);
        }

        /// Move a unit along a client-computed path. Validates each step is adjacent,
        /// traversable, within movement budget, and free of collisions.
        fn move_unit(ref self: ContractState, game_id: u32, unit_id: u8, path: Array<Vec2>) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let game: Game = world.read_model(game_id);
            assert(game.state == GameState::Playing, 'Game not playing');

            let current_ps: PlayerState = world.read_model((game_id, game.current_player));
            assert(current_ps.address == caller, 'Not your turn');

            let mut unit: Unit = world.read_model((game_id, unit_id));
            assert(unit.is_alive, 'Unit is dead');
            assert(unit.player_id == game.current_player, 'Not your unit');
            assert(unit.last_moved_round < game.round, 'Already moved');
            assert(unit.last_acted_round < game.round, 'Already acted');

            let path_span = path.span();
            assert(path_span.len() > 0, 'Empty path');

            let first = *path_span.at(0);
            assert(
                map_helpers::is_adjacent(unit.x, unit.y, first.x, first.y),
                'Path not adjacent to unit',
            );

            let max_move: u8 = unit_stats::move_range(unit.unit_type);
            let mut total_cost: u8 = 0;
            let mut road_bonus_remaining: u8 = if unit_stats::gets_road_bonus(unit.unit_type) {
                let start_tile: MapTile = world.read_model((game.map_id, unit.x, unit.y));
                if start_tile.tile_type == TileType::Road
                    || start_tile.tile_type == TileType::DirtRoad {
                    2
                } else {
                    0
                }
            } else {
                0
            };
            let mut prev_x = unit.x;
            let mut prev_y = unit.y;
            let mut i: u32 = 0;

            while i < path_span.len() {
                let step = *path_span.at(i);
                assert(step.x < game.width && step.y < game.height, 'Out of bounds');
                assert(
                    map_helpers::is_adjacent(prev_x, prev_y, step.x, step.y), 'Steps not adjacent',
                );

                let map_tile: MapTile = world.read_model((game.map_id, step.x, step.y));
                assert(
                    unit_stats::can_traverse(unit.unit_type, map_tile.tile_type), 'Cannot traverse',
                );

                let mut step_cost = unit_stats::move_cost(map_tile.tile_type);
                if road_bonus_remaining > 0 {
                    if map_tile.tile_type == TileType::Road
                        || map_tile.tile_type == TileType::DirtRoad {
                        let road_spend = if step_cost > road_bonus_remaining {
                            road_bonus_remaining
                        } else {
                            step_cost
                        };
                        step_cost -= road_spend;
                        road_bonus_remaining -= road_spend;
                    } else {
                        road_bonus_remaining = 0;
                    }
                }

                total_cost += step_cost;
                assert(total_cost <= max_move, 'Exceeds movement range');

                if i + 1 < path_span.len() {
                    assert(
                        !UnitImpl::enemy_exists_at(
                            ref world,
                            game_id,
                            step.x,
                            step.y,
                            game.current_player,
                            game.next_unit_id,
                        ),
                        'Path blocked',
                    );
                }

                prev_x = step.x;
                prev_y = step.y;
                i += 1;
            }

            let dest = *path_span.at(path_span.len() - 1);
            assert(
                !UnitImpl::exists_at(ref world, game_id, dest.x, dest.y, game.next_unit_id),
                'Destination occupied',
            );

            let old_x = unit.x;
            let old_y = unit.y;
            unit.x = dest.x;
            unit.y = dest.y;
            unit.last_moved_round = game.round;
            world.write_model(@unit);

            // Optimization: Reset capture if a capture-capable unit moves away.
            if unit_stats::can_capture(unit.unit_type) {
                let mut old_building: Building = world.read_model((game_id, old_x, old_y));
                if old_building.capture_player == game.current_player
                    && old_building.capture_progress > 0 {
                    old_building.capture_player = 0;
                    old_building.capture_progress = 0;
                    world.write_model(@old_building);
                }
            }

            world.write_model(@UnitPosition { game_id, x: old_x, y: old_y, unit_id: 0 });
            world.write_model(@UnitPosition { game_id, x: dest.x, y: dest.y, unit_id });

            world.emit_event(@UnitMoved { game_id, unit_id, x: dest.x, y: dest.y });
        }

        /// Attack an enemy unit. Resolves combat damage with terrain defense, applies
        /// counterattack if defender survives and is in range, and checks for elimination.
        fn attack(ref self: ContractState, game_id: u32, unit_id: u8, target_id: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            assert(game.state == GameState::Playing, 'Game not playing');

            let current_ps: PlayerState = world.read_model((game_id, game.current_player));
            assert(current_ps.address == caller, 'Not your turn');

            let mut attacker: Unit = world.read_model((game_id, unit_id));
            assert(attacker.is_alive, 'Attacker is dead');
            assert(attacker.player_id == game.current_player, 'Not your unit');
            assert(attacker.last_acted_round < game.round, 'Already acted');

            let mut defender: Unit = world.read_model((game_id, target_id));
            assert(defender.is_alive, 'Target is dead');
            assert(defender.player_id != game.current_player, 'Cannot attack own unit');

            let distance = map_helpers::manhattan_distance(
                attacker.x, attacker.y, defender.x, defender.y,
            );
            let min_range = unit_stats::min_attack_range(attacker.unit_type);
            let max_range = unit_stats::max_attack_range(attacker.unit_type);
            assert(distance >= min_range && distance <= max_range, 'Out of attack range');

            let attacker_moved_this_turn = attacker.last_moved_round == game.round;
            if attacker.unit_type == UnitType::Ranger {
                assert(!attacker_moved_this_turn, 'Ranger moved');
            }

            let attack_roll = self
                .combat_roll(game_id, unit_id, target_id, game.round, distance, 17);
            let counter_roll = self
                .combat_roll(game_id, unit_id, target_id, game.round, distance, 53);

            let attacker_tile: MapTile = world.read_model((game.map_id, attacker.x, attacker.y));
            let defender_tile: MapTile = world.read_model((game.map_id, defender.x, defender.y));
            let (dmg_to_def, dmg_to_atk, attack_outcome, counter_outcome) = combat::resolve_combat(
                attacker.unit_type,
                defender.unit_type,
                defender.hp,
                attacker_tile.tile_type,
                defender_tile.tile_type,
                distance,
                attacker_moved_this_turn,
                attack_roll,
                counter_roll,
            );

            if dmg_to_def >= defender.hp {
                world
                    .write_model(
                        @UnitPosition { game_id, x: defender.x, y: defender.y, unit_id: 0 },
                    );
                defender.hp = 0;
                defender.is_alive = false;
                world.write_model(@defender);
                world.emit_event(@UnitDied { game_id, unit_id: target_id });

                let mut def_player: PlayerState = world.read_model((game_id, defender.player_id));
                def_player.unit_count -= 1;
                world.write_model(@def_player);
                if !game.is_test_mode {
                    stats::record_unit_kill(ref world, current_ps.address, def_player.address);
                }

                game_helpers::check_elimination(ref world, game_id, defender.player_id, ref game);
            } else {
                defender.hp -= dmg_to_def;
                world.write_model(@defender);
            }

            if dmg_to_atk > 0 {
                if dmg_to_atk >= attacker.hp {
                    world
                        .write_model(
                            @UnitPosition { game_id, x: attacker.x, y: attacker.y, unit_id: 0 },
                        );
                    attacker.hp = 0;
                    attacker.is_alive = false;
                    world.write_model(@attacker);
                    world.emit_event(@UnitDied { game_id, unit_id });

                    let mut atk_player: PlayerState = world
                        .read_model((game_id, game.current_player));
                    atk_player.unit_count -= 1;
                    world.write_model(@atk_player);
                    if !game.is_test_mode {
                        let def_player: PlayerState = world
                            .read_model((game_id, defender.player_id));
                        stats::record_unit_kill(ref world, def_player.address, atk_player.address);
                    }

                    game_helpers::check_elimination(
                        ref world, game_id, attacker.player_id, ref game,
                    );
                } else {
                    attacker.hp -= dmg_to_atk;
                    attacker.last_acted_round = game.round;
                    world.write_model(@attacker);
                }
            } else {
                attacker.last_acted_round = game.round;
                world.write_model(@attacker);
            }

            world
                .emit_event(
                    @UnitAttacked {
                        game_id,
                        attacker_id: unit_id,
                        target_id,
                        damage_to_defender: dmg_to_def,
                        damage_to_attacker: dmg_to_atk,
                        attack_outcome,
                        counter_outcome,
                    },
                );
            world.write_model(@game);
        }

        /// Capture a building with an infantry or ranger unit. Increments capture progress; when it
        /// reaches the threshold, transfers ownership. Capturing an HQ ends the game.
        fn capture(ref self: ContractState, game_id: u32, unit_id: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            assert(game.state == GameState::Playing, 'Game not playing');

            let current_ps: PlayerState = world.read_model((game_id, game.current_player));
            assert(current_ps.address == caller, 'Not your turn');

            let mut unit: Unit = world.read_model((game_id, unit_id));
            assert(unit.is_alive, 'Unit is dead');
            assert(unit.player_id == game.current_player, 'Not your unit');
            assert(unit_stats::can_capture(unit.unit_type), 'Only infantry/ranger captures');
            assert(unit.last_acted_round < game.round, 'Already acted');

            let mut building: Building = world.read_model((game_id, unit.x, unit.y));
            assert(building.building_type != BuildingType::None, 'No building here');
            assert(building.player_id != game.current_player, 'Already own building');

            if building.capture_player != game.current_player {
                building.capture_player = game.current_player;
                building.capture_progress = 1;
            } else {
                building.capture_progress += 1;
            }

            if building.capture_progress >= CAPTURE_THRESHOLD {
                let old_owner = building.player_id;

                if old_owner != 0 {
                    let mut old_ps: PlayerState = world.read_model((game_id, old_owner));
                    if building.building_type == BuildingType::Factory {
                        old_ps.factory_count -= 1;
                    } else if building.building_type == BuildingType::City {
                        old_ps.city_count -= 1;
                    }
                    world.write_model(@old_ps);
                }

                building.player_id = game.current_player;
                building.capture_player = 0;
                building.capture_progress = 0;

                let mut new_ps: PlayerState = world.read_model((game_id, game.current_player));
                if building.building_type == BuildingType::Factory {
                    new_ps.factory_count += 1;
                } else if building.building_type == BuildingType::City {
                    new_ps.city_count += 1;
                }
                world.write_model(@new_ps);
                if !game.is_test_mode {
                    stats::record_building_capture(
                        ref world, new_ps.address, building.building_type,
                    );
                }

                world
                    .emit_event(
                        @BuildingCaptured {
                            game_id, x: unit.x, y: unit.y, player_id: game.current_player,
                        },
                    );

                if building.building_type == BuildingType::HQ {
                    game_helpers::finish_game(
                        ref world,
                        game_id,
                        ref game,
                        game.current_player,
                        stats::WIN_REASON_HQ_CAPTURE,
                    );
                }

                if old_owner != 0 {
                    game_helpers::check_elimination(ref world, game_id, old_owner, ref game);
                }
            }

            world.write_model(@building);
            unit.last_acted_round = game.round;
            world.write_model(@unit);
            world.write_model(@game);
        }

        /// Queue a unit for production at an owned factory. Deducts gold immediately;
        /// the unit spawns at the start of the player's next turn via run_production.
        fn build_unit(
            ref self: ContractState,
            game_id: u32,
            factory_x: u8,
            factory_y: u8,
            unit_type: UnitType,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let game: Game = world.read_model(game_id);
            assert(game.state == GameState::Playing, 'Game not playing');

            let current_ps: PlayerState = world.read_model((game_id, game.current_player));
            assert(current_ps.address == caller, 'Not your turn');

            assert(unit_type != UnitType::None, 'Invalid unit type');

            let mut building: Building = world.read_model((game_id, factory_x, factory_y));
            assert(building.building_type == BuildingType::Factory, 'Not a factory');
            assert(building.player_id == game.current_player, 'Not your factory');
            assert(building.queued_unit == 0, 'Factory already queued');

            let unit_cost = unit_stats::cost(unit_type);
            let mut player: PlayerState = world.read_model((game_id, game.current_player));
            assert(player.gold >= unit_cost, 'Not enough gold');

            player.gold -= unit_cost;
            world.write_model(@player);

            let queued: u8 = unit_type.into();
            building.queued_unit = queued;
            world.write_model(@building);

            world.emit_event(@UnitBuilt { game_id, unit_type, x: factory_x, y: factory_y });
        }

        /// End the current player's turn. Resets stale captures, advances to the next
        /// alive player, increments round on wrap, checks timeout, and runs income/production.
        fn end_turn(ref self: ContractState, game_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            assert(game.state == GameState::Playing, 'Game not playing');

            let current_ps: PlayerState = world.read_model((game_id, game.current_player));
            assert(current_ps.address == caller, 'Not your turn');

            game_helpers::reset_stale_captures(
                ref world, game_id, game.current_player, game.map_id,
            );

            let mut next = game.current_player;
            let mut new_round = game.round;
            let mut found = false;
            let mut attempts: u8 = 0;

            while attempts < game.player_count && !found {
                next = if next == game.player_count {
                    1
                } else {
                    next + 1
                };
                if next == 1 {
                    new_round += 1;
                }
                let ps: PlayerState = world.read_model((game_id, next));
                if ps.is_alive {
                    found = true;
                }
                attempts += 1;
            }

            assert(found, 'No alive players');

            if new_round > MAX_ROUNDS {
                let winner = game_helpers::timeout_winner(
                    ref world, game_id, game.player_count, game.next_unit_id,
                );
                game_helpers::finish_game(
                    ref world, game_id, ref game, winner, stats::WIN_REASON_TIMEOUT,
                );
                return;
            }

            game.current_player = next;
            game.round = new_round;

            game_helpers::run_income(ref world, game_id, next);
            game_helpers::run_production(ref world, game_id, next, ref game);

            world.write_model(@game);
            world.emit_event(@TurnEnded { game_id, next_player: next, round: new_round });
        }

        /// Resign from an active game. Marks the caller's player slot as eliminated.
        /// If only one player remains alive, ends the game immediately.
        fn resign(ref self: ContractState, game_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            assert(game.state == GameState::Playing, 'Game not playing');

            // Use current turn's player to resolve ambiguity when the same
            // address controls multiple seats (e.g. self-play / bot games).
            let current_ps: PlayerState = world.read_model((game_id, game.current_player));

            let mut caller_player: u8 = 0;
            if current_ps.address == caller && current_ps.is_alive {
                caller_player = game.current_player;
            } else {
                // Fallback: scan for a unique alive match (original behaviour).
                let mut matches: u8 = 0;
                let mut p: u8 = 1;
                while p <= game.player_count {
                    let ps: PlayerState = world.read_model((game_id, p));
                    if ps.address == caller && ps.is_alive {
                        caller_player = p;
                        matches += 1;
                    }
                    p += 1;
                }
                assert(matches > 0, 'Not an alive player');
                assert(matches == 1, 'Ambiguous player');
            }

            let mut resigned_ps: PlayerState = world.read_model((game_id, caller_player));
            resigned_ps.is_alive = false;
            world.write_model(@resigned_ps);
            if !game.is_test_mode {
                stats::record_resignation(ref world, resigned_ps.address);
            }

            let mut alive_count: u8 = 0;
            let mut last_alive: u8 = 0;
            let mut p: u8 = 1;
            while p <= game.player_count {
                let ps: PlayerState = world.read_model((game_id, p));
                if ps.is_alive {
                    alive_count += 1;
                    last_alive = p;
                }
                p += 1;
            }

            assert(alive_count > 0, 'No alive players');

            if alive_count == 1 {
                game_helpers::finish_game(
                    ref world, game_id, ref game, last_alive, stats::WIN_REASON_ELIMINATION,
                );
                return;
            }

            // If the current player resigns, advance turn immediately.
            if caller_player == game.current_player {
                let mut next = game.current_player;
                let mut new_round = game.round;
                let mut found = false;
                let mut attempts: u8 = 0;

                while attempts < game.player_count && !found {
                    next = if next == game.player_count {
                        1
                    } else {
                        next + 1
                    };
                    if next == 1 {
                        new_round += 1;
                    }
                    let ps: PlayerState = world.read_model((game_id, next));
                    if ps.is_alive {
                        found = true;
                    }
                    attempts += 1;
                }

                assert(found, 'No alive players');

                if new_round > MAX_ROUNDS {
                    let winner = game_helpers::timeout_winner(
                        ref world, game_id, game.player_count, game.next_unit_id,
                    );
                    game_helpers::finish_game(
                        ref world, game_id, ref game, winner, stats::WIN_REASON_TIMEOUT,
                    );
                    return;
                }

                game.current_player = next;
                game.round = new_round;
                game_helpers::run_income(ref world, game_id, next);
                game_helpers::run_production(ref world, game_id, next, ref game);

                world.write_model(@game);
                world.emit_event(@TurnEnded { game_id, next_player: next, round: new_round });
                return;
            }

            world.write_model(@game);
        }

        fn get_terrain(self: @ContractState, map_id: u8) -> (u8, u8, Array<u32>) {
            let world = self.world_default();
            let map_info: MapInfo = world.read_model(map_id);
            assert(map_info.tile_count > 0, 'Map not registered');

            let mut tiles: Array<u32> = array![];
            let mut i: u16 = 0;
            while i < map_info.tile_count {
                let map_tile: MapTileSeq = world.read_model((map_id, i));
                let tile_type_val: u8 = map_tile.tile_type.into();
                let border_type_val: u8 = map_tile.border_type.into();
                let tile_val: u8 = border_type_val * 16 + tile_type_val;
                let index = map_helpers::xy_to_index(map_tile.x, map_tile.y, map_info.width);
                let packed: u32 = index.into() * 256 + tile_val.into();
                tiles.append(packed);
                i += 1;
            }

            (map_info.width, map_info.height, tiles)
        }

        fn get_buildings(self: @ContractState, map_id: u8) -> (u8, u8, Array<u32>) {
            let world = self.world_default();
            let map_info: MapInfo = world.read_model(map_id);
            assert(map_info.tile_count > 0, 'Map not registered');

            let mut result: Array<u32> = array![];
            let mut i: u16 = 0;
            while i < map_info.building_count {
                let mb: MapBuilding = world.read_model((map_id, i));
                let bt_val: u8 = mb.building_type.into();
                let packed: u32 = mb.player_id.into() * 16777216
                    + bt_val.into() * 65536
                    + mb.x.into() * 256
                    + mb.y.into();
                result.append(packed);
                i += 1;
            }

            (map_info.width, map_info.height, result)
        }

        fn get_units(self: @ContractState, map_id: u8) -> (u8, u8, Array<u32>) {
            let world = self.world_default();
            let map_info: MapInfo = world.read_model(map_id);
            assert(map_info.tile_count > 0, 'Map not registered');

            let mut result: Array<u32> = array![];
            let mut i: u16 = 0;
            while i < map_info.unit_count {
                let mu: MapUnit = world.read_model((map_id, i));
                let ut_val: u8 = mu.unit_type.into();
                let packed: u32 = mu.player_id.into() * 16777216
                    + ut_val.into() * 65536
                    + mu.x.into() * 256
                    + mu.y.into();
                result.append(packed);
                i += 1;
            }

            (map_info.width, map_info.height, result)
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"hashfront")
        }

        fn combat_roll(
            self: @ContractState,
            game_id: u32,
            attacker_id: u8,
            target_id: u8,
            round: u8,
            distance: u8,
            salt: u8,
        ) -> u8 {
            let block_number = get_block_number();
            let entropy_block = if block_number > 10_u64 {
                block_number - 10_u64
            } else {
                0_u64
            };

            let block_hash = match get_block_hash_syscall(entropy_block) {
                Ok(hash) => hash,
                Err(_) => entropy_block.into(),
            };

            let entropy: u256 = block_hash.try_into().unwrap();
            let seed_modulus: u256 = 1000003;
            let roll_modulus: u256 = 100;
            let one: u256 = 1;

            let mut mixed = entropy % seed_modulus;
            mixed = mixed + game_id.into();
            mixed = mixed + attacker_id.into();
            mixed = mixed + target_id.into();
            mixed = mixed + round.into();
            mixed = mixed + distance.into();
            mixed = mixed + salt.into();

            let roll_u256 = (mixed % roll_modulus) + one;
            roll_u256.try_into().unwrap()
        }
    }
}
