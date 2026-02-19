pub mod consts;
pub mod events;
pub mod types;

pub mod models {
    pub mod building;
    pub mod game;
    pub mod map;
    pub mod player;
    pub mod tile;
    pub mod unit;
}

pub mod systems {
    pub mod actions;
}

pub mod helpers {
    pub mod combat;
    pub mod game;
    pub mod map;
    pub mod unit_stats;
}

#[cfg(test)]
mod tests {
    mod common;
    mod test_attack;
    mod test_build_unit;
    mod test_capture;
    mod test_create_game;
    mod test_end_turn;
    mod test_join_game;
    mod test_move_unit;
    mod test_register_map;
    mod test_wait_unit;
}
