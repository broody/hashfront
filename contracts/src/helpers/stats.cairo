use dojo::model::ModelStorage;
use hashfront::models::player::PlayerState;
use hashfront::models::stats::{PlayerActionStats, PlayerMatchStats};
use hashfront::types::BuildingType;
use starknet::ContractAddress;

pub const WIN_REASON_HQ_CAPTURE: u8 = 1;
pub const WIN_REASON_ELIMINATION: u8 = 2;
pub const WIN_REASON_TIMEOUT: u8 = 3;

fn is_zero_address(address: ContractAddress) -> bool {
    let zero_addr: ContractAddress = 0.try_into().unwrap();
    address == zero_addr
}

pub fn record_unit_kill(
    ref world: dojo::world::WorldStorage, killer: ContractAddress, victim: ContractAddress,
) {
    if !is_zero_address(killer) {
        let mut killer_stats: PlayerActionStats = world.read_model(killer);
        killer_stats.units_killed += 1;
        world.write_model(@killer_stats);
    }

    if !is_zero_address(victim) {
        let mut victim_stats: PlayerActionStats = world.read_model(victim);
        victim_stats.units_lost += 1;
        world.write_model(@victim_stats);
    }
}

pub fn record_units_produced(
    ref world: dojo::world::WorldStorage, player: ContractAddress, produced: u8,
) {
    if produced == 0 || is_zero_address(player) {
        return;
    }

    let mut stats: PlayerActionStats = world.read_model(player);
    stats.units_produced += produced.into();
    world.write_model(@stats);
}

pub fn record_building_capture(
    ref world: dojo::world::WorldStorage, player: ContractAddress, building_type: BuildingType,
) {
    if is_zero_address(player) {
        return;
    }

    let mut stats: PlayerActionStats = world.read_model(player);
    stats.buildings_captured += 1;

    if building_type == BuildingType::City {
        stats.cities_captured += 1;
    } else if building_type == BuildingType::Factory {
        stats.factories_captured += 1;
    } else if building_type == BuildingType::HQ {
        stats.hqs_captured += 1;
    }

    world.write_model(@stats);
}

pub fn record_resignation(ref world: dojo::world::WorldStorage, player: ContractAddress) {
    if is_zero_address(player) {
        return;
    }

    let mut stats: PlayerMatchStats = world.read_model(player);
    stats.resignations += 1;
    world.write_model(@stats);
}

pub fn record_match_result(
    ref world: dojo::world::WorldStorage,
    game_id: u32,
    player_count: u8,
    winner: u8,
    is_test_mode: bool,
    reason: u8,
) {
    if is_test_mode {
        return;
    }

    let mut player_id: u8 = 1;
    while player_id <= player_count {
        let player_state: PlayerState = world.read_model((game_id, player_id));
        let address = player_state.address;

        if !is_zero_address(address) {
            let mut stats: PlayerMatchStats = world.read_model(address);
            stats.games_played += 1;

            if player_id == winner {
                stats.wins += 1;
                stats.win_streak += 1;

                if stats.win_streak > stats.best_win_streak {
                    stats.best_win_streak = stats.win_streak;
                }

                if reason == WIN_REASON_HQ_CAPTURE {
                    stats.wins_by_hq_capture += 1;
                } else if reason == WIN_REASON_ELIMINATION {
                    stats.wins_by_elimination += 1;
                } else if reason == WIN_REASON_TIMEOUT {
                    stats.wins_by_timeout += 1;
                }
            } else {
                stats.losses += 1;
                stats.win_streak = 0;
            }

            world.write_model(@stats);
        }

        player_id += 1;
    }
}
