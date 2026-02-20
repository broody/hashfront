use dojo::event::EventStorage;
use dojo::model::ModelStorage;
use hashfront::consts::INCOME_PER_CITY;
use hashfront::events::GameOver;
use hashfront::helpers::unit_stats;
use hashfront::models::building::Building;
use hashfront::models::game::Game;
use hashfront::models::map::{MapBuilding, MapInfo, MapUnit};
use hashfront::models::player::PlayerState;
use hashfront::models::unit::{Unit, UnitImpl};
use hashfront::models::unit_position::UnitPosition;
use hashfront::types::{BuildingType, GameState, UnitType};

pub fn spawn_starting_units(
    ref world: dojo::world::WorldStorage, game_id: u32, ref game: Game, map_id: u8,
) {
    // Spawn units from map template
    let map_info: MapInfo = world.read_model(map_id);
    let mut i: u16 = 0;
    while i < map_info.unit_count {
        let map_unit: MapUnit = world.read_model((map_id, i));
        game.next_unit_id += 1;
        let unit_id = game.next_unit_id;

        world
            .write_model(
                @Unit {
                    game_id,
                    unit_id,
                    player_id: map_unit.player_id,
                    unit_type: map_unit.unit_type,
                    x: map_unit.x,
                    y: map_unit.y,
                    hp: unit_stats::max_hp(map_unit.unit_type),
                    has_moved: false,
                    has_acted: false,
                    is_alive: true,
                },
            );
        world.write_model(@UnitPosition { game_id, x: map_unit.x, y: map_unit.y, unit_id });

        let mut ps: PlayerState = world.read_model((game_id, map_unit.player_id));
        ps.unit_count += 1;
        world.write_model(@ps);

        i += 1;
    };
}

pub fn count_player_buildings(ref world: dojo::world::WorldStorage, game_id: u32, map_id: u8) {
    let map_info: MapInfo = world.read_model(map_id);
    let mut i: u16 = 0;
    while i < map_info.building_count {
        let mb: MapBuilding = world.read_model((map_id, i));
        let building: Building = world.read_model((game_id, mb.x, mb.y));
        if building.player_id != 0 {
            let mut ps: PlayerState = world.read_model((game_id, building.player_id));
            if building.building_type == BuildingType::Factory {
                ps.factory_count += 1;
            } else if building.building_type == BuildingType::City {
                ps.city_count += 1;
            }
            world.write_model(@ps);
        }
        i += 1;
    };
}

pub fn run_income(ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8) {
    let mut ps: PlayerState = world.read_model((game_id, player_id));
    let income = ps.city_count * INCOME_PER_CITY;
    if income == 0 {
        return;
    }
    ps.gold += income;
    world.write_model(@ps);
}

pub fn run_production(
    ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8, ref game: Game,
) {
    let map_info: MapInfo = world.read_model(game.map_id);
    let mut produced: u8 = 0;
    let mut i: u16 = 0;
    while i < map_info.building_count {
        let mb: MapBuilding = world.read_model((game.map_id, i));
        let x = mb.x;
        let y = mb.y;
        let mut building: Building = world.read_model((game_id, x, y));
        if building.building_type == BuildingType::Factory
            && building.player_id == player_id
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
                world.write_model(@UnitPosition { game_id, x, y, unit_id: uid });

                produced += 1;
                building.queued_unit = 0;
                world.write_model(@building);
            }
        }
        i += 1;
    }

    if produced > 0 {
        let mut ps: PlayerState = world.read_model((game_id, player_id));
        ps.unit_count += produced;
        world.write_model(@ps);
    };
}

pub fn reset_unit_flags(
    ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8, next_unit_id: u8,
) {
    let mut i: u8 = 1;
    while i <= next_unit_id {
        let mut u: Unit = world.read_model((game_id, i));
        if u.is_alive && u.player_id == player_id {
            if u.has_moved || u.has_acted {
                u.has_moved = false;
                u.has_acted = false;
                world.write_model(@u);
            }
        }
        i += 1;
    };
}

pub fn reset_stale_captures(
    ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8, map_id: u8,
) {
    let map_info: MapInfo = world.read_model(map_id);
    let mut i: u16 = 0;
    while i < map_info.building_count {
        let mb: MapBuilding = world.read_model((map_id, i));
        let x = mb.x;
        let y = mb.y;
        let mut building: Building = world.read_model((game_id, x, y));
        if building.capture_player == player_id && building.capture_progress > 0 {
            if !UnitImpl::infantry_exists_at(ref world, game_id, x, y, player_id) {
                building.capture_player = 0;
                building.capture_progress = 0;
                world.write_model(@building);
            }
        }
        i += 1;
    };
}

pub fn check_elimination(
    ref world: dojo::world::WorldStorage, game_id: u32, player_id: u8, ref game: Game,
) {
    let ps: PlayerState = world.read_model((game_id, player_id));
    if !ps.is_alive {
        return;
    }

    let map_info: MapInfo = world.read_model(game.map_id);
    let mut i: u16 = 0;
    let mut has_hq = false;
    while i < map_info.building_count {
        let mb: MapBuilding = world.read_model((game.map_id, i));
        let building: Building = world.read_model((game_id, mb.x, mb.y));
        if building.building_type == BuildingType::HQ && building.player_id == player_id {
            has_hq = true;
        }
        i += 1;
    }

    let eliminated = !has_hq || (ps.unit_count == 0 && ps.factory_count == 0 && ps.gold == 0);

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
        }

        if alive_count == 1 {
            game.state = GameState::Finished;
            game.winner = last_alive;
            world.write_model(@game);
            world.emit_event(@GameOver { game_id, winner: last_alive });
        }
    }
}

pub fn timeout_winner(
    ref world: dojo::world::WorldStorage, game_id: u32, player_count: u8, next_unit_id: u8,
) -> u8 {
    let mut best_player: u8 = 0;
    let mut best_score: u16 = 0;
    let mut p: u8 = 1;
    while p <= player_count {
        let ps: PlayerState = world.read_model((game_id, p));
        if ps.is_alive {
            let mut total_hp: u16 = 0;
            let mut i: u8 = 1;
            while i <= next_unit_id {
                let u: Unit = world.read_model((game_id, i));
                if u.is_alive && u.player_id == p {
                    total_hp += u.hp.into();
                }
                i += 1;
            }
            let score: u16 = total_hp + ps.gold.into();
            if score > best_score {
                best_score = score;
                best_player = p;
            }
        }
        p += 1;
    }
    best_player
}
