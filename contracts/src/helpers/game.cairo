use chain_tactics::consts::INCOME_PER_CITY;
use chain_tactics::events::GameOver;
use chain_tactics::helpers::unit_stats;
use chain_tactics::models::building::Building;
use chain_tactics::models::game::Game;
use chain_tactics::models::player::PlayerState;
use chain_tactics::models::unit::{Unit, UnitImpl};
use chain_tactics::types::{BuildingType, GameState, UnitType, Vec2};
use dojo::event::EventStorage;
use dojo::model::ModelStorage;

pub fn spawn_starting_units(
    ref world: dojo::world::WorldStorage, game_id: u32, player_count: u8, ref game: Game,
) {
    let mut hq_index: u8 = 0;

    let mut y: u8 = 0;
    while y < game.height {
        let mut x: u8 = 0;
        while x < game.width {
            let building: Building = world.read_model((game_id, x, y));
            if building.building_type == BuildingType::HQ && building.owner == 0 {
                hq_index += 1;
                if hq_index <= player_count {
                    let mut b = building;
                    b.owner = hq_index;
                    world.write_model(@b);

                    let spawn_pos = find_spawn_adjacent(
                        ref world, game_id, x, y, game.next_unit_id, game.width, game.height,
                    );
                    game.next_unit_id += 1;
                    let unit_id = game.next_unit_id;

                    world
                        .write_model(
                            @Unit {
                                game_id,
                                unit_id,
                                player_id: hq_index,
                                unit_type: UnitType::Infantry,
                                x: spawn_pos.x,
                                y: spawn_pos.y,
                                hp: unit_stats::max_hp(UnitType::Infantry),
                                has_moved: false,
                                has_acted: false,
                                is_alive: true,
                            },
                        );

                    let mut ps: PlayerState = world.read_model((game_id, hq_index));
                    ps.unit_count += 1;
                    world.write_model(@ps);
                }
            }
            x += 1;
        };
        y += 1;
    };
}

pub fn find_spawn_adjacent(
    ref world: dojo::world::WorldStorage,
    game_id: u32,
    x: u8,
    y: u8,
    next_unit_id: u8,
    width: u8,
    height: u8,
) -> Vec2 {
    if x + 1 < width && !UnitImpl::exists_at(ref world, game_id, x + 1, y, next_unit_id) {
        return Vec2 { x: x + 1, y };
    }
    if y + 1 < height && !UnitImpl::exists_at(ref world, game_id, x, y + 1, next_unit_id) {
        return Vec2 { x, y: y + 1 };
    }
    if x > 0 && !UnitImpl::exists_at(ref world, game_id, x - 1, y, next_unit_id) {
        return Vec2 { x: x - 1, y };
    }
    if y > 0 && !UnitImpl::exists_at(ref world, game_id, x, y - 1, next_unit_id) {
        return Vec2 { x, y: y - 1 };
    }
    panic!("No spawn position")
}

pub fn count_player_buildings(
    ref world: dojo::world::WorldStorage, game_id: u32, player_count: u8, width: u8, height: u8,
) {
    let mut y: u8 = 0;
    while y < height {
        let mut x: u8 = 0;
        while x < width {
            let building: Building = world.read_model((game_id, x, y));
            if building.owner != 0 {
                let mut ps: PlayerState = world.read_model((game_id, building.owner));
                if building.building_type == BuildingType::Factory {
                    ps.factory_count += 1;
                } else if building.building_type == BuildingType::City {
                    ps.city_count += 1;
                }
                world.write_model(@ps);
            }
            x += 1;
        };
        y += 1;
    };
}

pub fn run_income(ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8) {
    let mut ps: PlayerState = world.read_model((game_id, player_id));
    let income = ps.city_count * INCOME_PER_CITY;
    ps.gold += income;
    world.write_model(@ps);
}

pub fn run_production(
    ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8, ref game: Game,
) {
    let mut y: u8 = 0;
    while y < game.height {
        let mut x: u8 = 0;
        while x < game.width {
            let mut building: Building = world.read_model((game_id, x, y));
            if building.building_type == BuildingType::Factory
                && building.owner == player_id
                && building.queued_unit != 0 {
                if !UnitImpl::exists_at(ref world, game_id, x, y, game.next_unit_id) {
                    let ut: UnitType = building.queued_unit.into();
                    game.next_unit_id += 1;
                    let uid = game.next_unit_id;

                    world
                        .write_model(
                            @Unit {
                                game_id,
                                unit_id: uid,
                                player_id,
                                unit_type: ut,
                                x,
                                y,
                                hp: unit_stats::max_hp(ut),
                                has_moved: true,
                                has_acted: true,
                                is_alive: true,
                            },
                        );

                    let mut ps: PlayerState = world.read_model((game_id, player_id));
                    ps.unit_count += 1;
                    world.write_model(@ps);

                    building.queued_unit = 0;
                    world.write_model(@building);
                }
            }
            x += 1;
        };
        y += 1;
    };
}

pub fn reset_unit_flags(
    ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8, next_unit_id: u8,
) {
    let mut i: u8 = 1;
    while i <= next_unit_id {
        let mut u: Unit = world.read_model((game_id, i));
        if u.is_alive && u.player_id == player_id {
            u.has_moved = false;
            u.has_acted = false;
            world.write_model(@u);
        }
        i += 1;
    };
}

pub fn reset_stale_captures(
    ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8, width: u8, height: u8,
) {
    let mut y: u8 = 0;
    while y < height {
        let mut x: u8 = 0;
        while x < width {
            let mut building: Building = world.read_model((game_id, x, y));
            if building.capture_player == player_id && building.capture_progress > 0 {
                if !UnitImpl::infantry_exists_at(ref world, game_id, x, y, player_id) {
                    building.capture_player = 0;
                    building.capture_progress = 0;
                    world.write_model(@building);
                }
            }
            x += 1;
        };
        y += 1;
    };
}

pub fn check_elimination(
    ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8, ref game: Game,
) {
    let ps: PlayerState = world.read_model((game_id, player_id));
    if !ps.is_alive {
        return;
    }

    let mut y: u8 = 0;
    let mut has_hq = false;
    while y < game.height {
        let mut x: u8 = 0;
        while x < game.width {
            let building: Building = world.read_model((game_id, x, y));
            if building.building_type == BuildingType::HQ && building.owner == player_id {
                has_hq = true;
            }
            x += 1;
        };
        y += 1;
    };

    let eliminated = !has_hq
        || (ps.unit_count == 0 && ps.factory_count == 0 && ps.gold == 0);

    if eliminated {
        let mut ps_mut: PlayerState = world.read_model((game_id, player_id));
        ps_mut.is_alive = false;
        world.write_model(@ps_mut);

        let mut alive_count: u8 = 0;
        let mut last_alive: u8 = 0;
        let mut p: u8 = 1;
        while p <= game.player_count {
            let pstate: PlayerState = world.read_model((game_id, p));
            if pstate.is_alive {
                alive_count += 1;
                last_alive = p;
            }
            p += 1;
        };

        if alive_count == 1 {
            game.state = GameState::Finished;
            game.winner = last_alive;
            world.write_model(@game);
            world.emit_event(@GameOver { game_id, winner: last_alive });
        }
    }
}

pub fn timeout_winner(
    ref world: dojo::world::WorldStorage, game_id: u32, player_count: u8,
) -> u8 {
    let mut best_player: u8 = 0;
    let mut best_score: u16 = 0;
    let mut p: u8 = 1;
    while p <= player_count {
        let ps: PlayerState = world.read_model((game_id, p));
        if ps.is_alive {
            let mut total_hp: u16 = 0;
            let mut i: u8 = 1;
            while i < 255 {
                let u: Unit = world.read_model((game_id, i));
                if u.unit_type == UnitType::None && u.hp == 0 {
                    break;
                }
                if u.is_alive && u.player_id == p {
                    total_hp += u.hp.into();
                }
                i += 1;
            };
            let score: u16 = total_hp + ps.gold.into();
            if score > best_score {
                best_score = score;
                best_player = p;
            }
        }
        p += 1;
    };
    best_player
}
