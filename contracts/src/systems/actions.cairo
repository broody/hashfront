use chain_tactics::types::{UnitType, Vec2};

#[starknet::interface]
pub trait IActions<T> {
    fn register_map(ref self: T, player_count: u8, width: u8, height: u8, tiles: Array<u8>) -> u8;
    fn create_game(ref self: T, map_id: u8) -> u32;
    fn join_game(ref self: T, game_id: u32);
    fn move_unit(ref self: T, game_id: u32, unit_id: u8, path: Array<Vec2>);
    fn attack(ref self: T, game_id: u32, unit_id: u8, target_id: u8);
    fn capture(ref self: T, game_id: u32, unit_id: u8);
    fn wait_unit(ref self: T, game_id: u32, unit_id: u8);
    fn build_unit(ref self: T, game_id: u32, factory_x: u8, factory_y: u8, unit_type: UnitType);
    fn end_turn(ref self: T, game_id: u32);
}

#[dojo::contract]
pub mod actions {
    use chain_tactics::consts::{CAPTURE_THRESHOLD, MAX_ROUNDS, STARTING_GOLD};
    use chain_tactics::events::{
        BuildingCaptured, GameCreated, GameOver, GameStarted, PlayerJoined, TurnEnded,
        UnitAttacked, UnitBuilt, UnitDied, UnitMoved,
    };
    use chain_tactics::helpers::{combat, game as game_helpers, map as map_helpers, unit_stats};
    use chain_tactics::models::building::Building;
    use chain_tactics::models::game::{Game, GameCounter};
    use chain_tactics::models::map::{MapInfo, MapTile};
    use chain_tactics::models::player::{PlayerState, PlayerStateImpl};
    use chain_tactics::models::tile::Tile;
    use chain_tactics::models::unit::{Unit, UnitImpl};
    use chain_tactics::types::{BuildingType, GameState, TileType, UnitType, Vec2};
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use starknet::get_caller_address;
    use super::IActions;

    #[abi(embed_v0)]
    impl ActionsImpl of IActions<ContractState> {
        /// Register a reusable map template. Tiles is a flat row-major array of TileType
        /// ordinals (width x height). Returns the new map_id.
        fn register_map(
            ref self: ContractState, player_count: u8, width: u8, height: u8, tiles: Array<u8>,
        ) -> u8 {
            assert(player_count >= 2 && player_count <= 4, 'Invalid player count');
            assert(width > 0 && height > 0, 'Invalid dimensions');

            let expected: u32 = width.into() * height.into();
            assert(tiles.len() == expected, 'Tiles length mismatch');

            let mut world = self.world_default();

            let mut counter: GameCounter = world.read_model(1_u32);
            let map_id: u8 = (counter.count + 1).try_into().unwrap();
            counter.count += 1;
            world.write_model(@counter);

            world
                .write_model(
                    @MapInfo {
                        map_id,
                        player_count,
                        width,
                        height,
                        tile_count: expected.try_into().unwrap(),
                    },
                );

            let mut i: u32 = 0;
            let mut hq_count: u8 = 0;
            let tile_span = tiles.span();
            while i < expected {
                let tile_val: u8 = *tile_span.at(i);
                let tile_type: TileType = tile_val.into();
                if tile_type == TileType::HQ {
                    hq_count += 1;
                }
                if tile_type != TileType::Grass {
                    world
                        .write_model(
                            @MapTile { map_id, index: i.try_into().unwrap(), tile_type },
                        );
                }
                i += 1;
            };

            assert(hq_count == player_count, 'HQ count != player count');

            map_id
        }

        /// Create a new game from a registered map. Copies map tiles into per-game state,
        /// initializes buildings, and registers the caller as player 1. Returns game_id.
        fn create_game(ref self: ContractState, map_id: u8) -> u32 {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let map_info: MapInfo = world.read_model(map_id);
            assert(map_info.tile_count > 0, 'Map not registered');

            let mut counter: GameCounter = world.read_model(0_u32);
            counter.count += 1;
            let game_id = counter.count;
            world.write_model(@counter);

            world
                .write_model(
                    @Game {
                        game_id,
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
                    },
                );

            let width = map_info.width;
            let mut i: u16 = 0;
            while i < map_info.tile_count {
                let map_tile: MapTile = world.read_model((map_id, i));
                let (x, y) = map_helpers::index_to_xy(i, width);

                if map_tile.tile_type != TileType::Grass {
                    world.write_model(@Tile { game_id, x, y, tile_type: map_tile.tile_type });

                    let building_type: BuildingType = map_tile.tile_type.into();
                    if building_type != BuildingType::None {
                        world
                            .write_model(
                                @Building {
                                    game_id,
                                    x,
                                    y,
                                    building_type,
                                    owner: 0,
                                    capture_player: 0,
                                    capture_progress: 0,
                                    queued_unit: 0,
                                },
                            );
                    }
                }

                i += 1;
            };

            world
                .write_model(
                    @PlayerState {
                        game_id,
                        player_id: 1,
                        address: caller,
                        gold: STARTING_GOLD,
                        unit_count: 0,
                        factory_count: 0,
                        city_count: 0,
                        is_alive: true,
                    },
                );

            world.emit_event(@GameCreated { game_id, map_id, player_count: map_info.player_count });

            game_id
        }

        /// Join an existing game in the lobby. When the last player joins, transitions
        /// to Playing state — spawns starting units, counts buildings, and runs P1 income/production.
        fn join_game(ref self: ContractState, game_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            assert(game.state == GameState::Lobby, 'Game not in lobby');
            assert(game.num_players < game.player_count, 'Game is full');

            let mut i: u8 = 1;
            while i <= game.num_players {
                let ps: PlayerState = world.read_model((game_id, i));
                assert(ps.address != caller, 'Already joined');
                i += 1;
            };

            game.num_players += 1;
            let player_id = game.num_players;

            world
                .write_model(
                    @PlayerState {
                        game_id,
                        player_id,
                        address: caller,
                        gold: STARTING_GOLD,
                        unit_count: 0,
                        factory_count: 0,
                        city_count: 0,
                        is_alive: true,
                    },
                );

            world.emit_event(@PlayerJoined { game_id, player_id });

            if game.num_players == game.player_count {
                game.state = GameState::Playing;
                game_helpers::spawn_starting_units(ref world, game_id, game.player_count, ref game);
                game_helpers::count_player_buildings(
                    ref world, game_id, game.player_count, game.width, game.height,
                );
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

            let caller_player = PlayerStateImpl::find_player_id(
                ref world, game_id, caller, game.player_count,
            );
            assert(caller_player == game.current_player, 'Not your turn');

            let mut unit: Unit = world.read_model((game_id, unit_id));
            assert(unit.is_alive, 'Unit is dead');
            assert(unit.player_id == caller_player, 'Not your unit');
            assert(!unit.has_moved, 'Already moved');

            let path_span = path.span();
            assert(path_span.len() > 0, 'Empty path');

            let first = *path_span.at(0);
            assert(
                map_helpers::is_adjacent(unit.x, unit.y, first.x, first.y),
                'Path not adjacent to unit',
            );

            let max_move: u8 = unit_stats::move_range(unit.unit_type);
            let mut total_cost: u8 = 0;
            let mut prev_x = unit.x;
            let mut prev_y = unit.y;
            let mut i: u32 = 0;

            while i < path_span.len() {
                let step = *path_span.at(i);
                assert(step.x < game.width && step.y < game.height, 'Out of bounds');
                assert(
                    map_helpers::is_adjacent(prev_x, prev_y, step.x, step.y), 'Steps not adjacent',
                );

                let tile: Tile = world.read_model((game_id, step.x, step.y));
                assert(unit_stats::can_traverse(unit.unit_type, tile.tile_type), 'Cannot traverse');

                total_cost += unit_stats::move_cost(tile.tile_type);
                assert(total_cost <= max_move, 'Exceeds movement range');

                if i + 1 < path_span.len() {
                    assert(
                        !UnitImpl::exists_at(
                            ref world, game_id, step.x, step.y, game.next_unit_id,
                        ),
                        'Path blocked',
                    );
                }

                prev_x = step.x;
                prev_y = step.y;
                i += 1;
            };

            let dest = *path_span.at(path_span.len() - 1);
            assert(
                !UnitImpl::exists_at(ref world, game_id, dest.x, dest.y, game.next_unit_id),
                'Destination occupied',
            );

            unit.x = dest.x;
            unit.y = dest.y;
            unit.has_moved = true;
            world.write_model(@unit);

            world.emit_event(@UnitMoved { game_id, unit_id, x: dest.x, y: dest.y });
        }

        /// Attack an enemy unit. Resolves combat damage with terrain defense, applies
        /// counterattack if defender survives and is in range, and checks for elimination.
        fn attack(ref self: ContractState, game_id: u32, unit_id: u8, target_id: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            assert(game.state == GameState::Playing, 'Game not playing');

            let caller_player = PlayerStateImpl::find_player_id(
                ref world, game_id, caller, game.player_count,
            );
            assert(caller_player == game.current_player, 'Not your turn');

            let mut attacker: Unit = world.read_model((game_id, unit_id));
            assert(attacker.is_alive, 'Attacker is dead');
            assert(attacker.player_id == caller_player, 'Not your unit');
            assert(!attacker.has_acted, 'Already acted');

            let mut defender: Unit = world.read_model((game_id, target_id));
            assert(defender.is_alive, 'Target is dead');
            assert(defender.player_id != caller_player, 'Cannot attack own unit');

            let distance = map_helpers::manhattan_distance(
                attacker.x, attacker.y, defender.x, defender.y,
            );
            let min_range = unit_stats::min_attack_range(attacker.unit_type);
            let max_range = unit_stats::max_attack_range(attacker.unit_type);
            assert(distance >= min_range && distance <= max_range, 'Out of attack range');

            let defender_tile: Tile = world.read_model((game_id, defender.x, defender.y));
            let (dmg_to_def, dmg_to_atk) = combat::resolve_combat(
                attacker.unit_type,
                attacker.hp,
                defender.unit_type,
                defender.hp,
                defender_tile.tile_type,
                distance,
            );

            if dmg_to_def >= defender.hp {
                defender.hp = 0;
                defender.is_alive = false;
                world.write_model(@defender);
                world.emit_event(@UnitDied { game_id, unit_id: target_id });

                let mut def_player: PlayerState = world.read_model((game_id, defender.player_id));
                def_player.unit_count -= 1;
                world.write_model(@def_player);

                game_helpers::check_elimination(ref world, game_id, defender.player_id, ref game);
            } else {
                defender.hp -= dmg_to_def;
                world.write_model(@defender);
            }

            if dmg_to_atk > 0 {
                if dmg_to_atk >= attacker.hp {
                    attacker.hp = 0;
                    attacker.is_alive = false;
                    world.write_model(@attacker);
                    world.emit_event(@UnitDied { game_id, unit_id });

                    let mut atk_player: PlayerState = world.read_model((game_id, caller_player));
                    atk_player.unit_count -= 1;
                    world.write_model(@atk_player);
                } else {
                    attacker.hp -= dmg_to_atk;
                    attacker.has_acted = true;
                    world.write_model(@attacker);
                }
            } else {
                attacker.has_acted = true;
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
                    },
                );
            world.write_model(@game);
        }

        /// Capture a building with an infantry unit. Increments capture progress; when it
        /// reaches the threshold, transfers ownership. Capturing an HQ ends the game.
        fn capture(ref self: ContractState, game_id: u32, unit_id: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            assert(game.state == GameState::Playing, 'Game not playing');

            let caller_player = PlayerStateImpl::find_player_id(
                ref world, game_id, caller, game.player_count,
            );
            assert(caller_player == game.current_player, 'Not your turn');

            let mut unit: Unit = world.read_model((game_id, unit_id));
            assert(unit.is_alive, 'Unit is dead');
            assert(unit.player_id == caller_player, 'Not your unit');
            assert(unit.unit_type == UnitType::Infantry, 'Only infantry captures');
            assert(!unit.has_acted, 'Already acted');

            let mut building: Building = world.read_model((game_id, unit.x, unit.y));
            assert(building.building_type != BuildingType::None, 'No building here');
            assert(building.owner != caller_player, 'Already own building');

            if building.capture_player != caller_player {
                building.capture_player = caller_player;
                building.capture_progress = 1;
            } else {
                building.capture_progress += 1;
            }

            if building.capture_progress >= CAPTURE_THRESHOLD {
                let old_owner = building.owner;

                if old_owner != 0 {
                    let mut old_ps: PlayerState = world.read_model((game_id, old_owner));
                    if building.building_type == BuildingType::Factory {
                        old_ps.factory_count -= 1;
                    } else if building.building_type == BuildingType::City {
                        old_ps.city_count -= 1;
                    }
                    world.write_model(@old_ps);
                }

                building.owner = caller_player;
                building.capture_player = 0;
                building.capture_progress = 0;

                let mut new_ps: PlayerState = world.read_model((game_id, caller_player));
                if building.building_type == BuildingType::Factory {
                    new_ps.factory_count += 1;
                } else if building.building_type == BuildingType::City {
                    new_ps.city_count += 1;
                }
                world.write_model(@new_ps);

                world
                    .emit_event(
                        @BuildingCaptured {
                            game_id, x: unit.x, y: unit.y, player_id: caller_player,
                        },
                    );

                if building.building_type == BuildingType::HQ {
                    game.state = GameState::Finished;
                    game.winner = caller_player;
                    world.write_model(@game);
                    world.emit_event(@GameOver { game_id, winner: caller_player });
                }

                if old_owner != 0 {
                    game_helpers::check_elimination(ref world, game_id, old_owner, ref game);
                }
            }

            world.write_model(@building);
            unit.has_acted = true;
            world.write_model(@unit);
            world.write_model(@game);
        }

        /// End a unit's turn without acting. Marks both has_moved and has_acted.
        fn wait_unit(ref self: ContractState, game_id: u32, unit_id: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let game: Game = world.read_model(game_id);
            assert(game.state == GameState::Playing, 'Game not playing');

            let caller_player = PlayerStateImpl::find_player_id(
                ref world, game_id, caller, game.player_count,
            );
            assert(caller_player == game.current_player, 'Not your turn');

            let mut unit: Unit = world.read_model((game_id, unit_id));
            assert(unit.is_alive, 'Unit is dead');
            assert(unit.player_id == caller_player, 'Not your unit');

            unit.has_moved = true;
            unit.has_acted = true;
            world.write_model(@unit);
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

            let caller_player = PlayerStateImpl::find_player_id(
                ref world, game_id, caller, game.player_count,
            );
            assert(caller_player == game.current_player, 'Not your turn');

            assert(unit_type != UnitType::None, 'Invalid unit type');

            let mut building: Building = world.read_model((game_id, factory_x, factory_y));
            assert(building.building_type == BuildingType::Factory, 'Not a factory');
            assert(building.owner == caller_player, 'Not your factory');
            assert(building.queued_unit == 0, 'Factory already queued');

            let unit_cost = unit_stats::cost(unit_type);
            let mut player: PlayerState = world.read_model((game_id, caller_player));
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

            let caller_player = PlayerStateImpl::find_player_id(
                ref world, game_id, caller, game.player_count,
            );
            assert(caller_player == game.current_player, 'Not your turn');

            game_helpers::reset_stale_captures(
                ref world, game_id, caller_player, game.width, game.height,
            );
            game_helpers::reset_unit_flags(ref world, game_id, caller_player, game.next_unit_id);

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
            };

            assert(found, 'No alive players');

            if new_round > MAX_ROUNDS {
                game.state = GameState::Finished;
                game.winner = game_helpers::timeout_winner(ref world, game_id, game.player_count);
                world.write_model(@game);
                world.emit_event(@GameOver { game_id, winner: game.winner });
                return;
            }

            game.current_player = next;
            game.round = new_round;

            game_helpers::run_income(ref world, game_id, next);
            game_helpers::run_production(ref world, game_id, next, ref game);

            world.write_model(@game);
            world.emit_event(@TurnEnded { game_id, next_player: next, round: new_round });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"chain_tactics")
        }
    }
}
