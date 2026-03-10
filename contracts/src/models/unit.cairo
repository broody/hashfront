use dojo::model::ModelStorage;
use hashfront::helpers::unit_stats;
use hashfront::types::UnitType;

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct Unit {
    #[key]
    pub game_id: u32,
    #[key]
    pub unit_id: u8,
    pub player_id: u8,
    pub unit_type: UnitType,
    pub x: u8,
    pub y: u8,
    pub hp: u8,
    pub last_moved_round: u8,
    pub last_acted_round: u8,
    pub is_alive: bool,
}

#[derive(Introspect, Serde, Drop, DojoStore)]
#[dojo::model]
pub struct UnitPosition {
    #[key]
    pub game_id: u32,
    #[key]
    pub x: u8,
    #[key]
    pub y: u8,
    pub unit_id: u8,
}

#[generate_trait]
pub impl UnitImpl of UnitTrait {
    /// Check if any alive unit occupies (x, y).
    fn exists_at(
        ref world: dojo::world::WorldStorage, game_id: u32, x: u8, y: u8, next_unit_id: u8,
    ) -> bool {
        if next_unit_id == 0 {
            return false;
        }

        let pos: UnitPosition = world.read_model((game_id, x, y));
        if pos.unit_id == 0 || pos.unit_id > next_unit_id {
            return false;
        }

        let u: Unit = world.read_model((game_id, pos.unit_id));
        u.is_alive && u.x == x && u.y == y
    }

    /// Check if an alive enemy unit occupies (x, y).
    fn enemy_exists_at(
        ref world: dojo::world::WorldStorage,
        game_id: u32,
        x: u8,
        y: u8,
        player_id: u8,
        next_unit_id: u8,
    ) -> bool {
        if next_unit_id == 0 {
            return false;
        }

        let pos: UnitPosition = world.read_model((game_id, x, y));
        if pos.unit_id == 0 || pos.unit_id > next_unit_id {
            return false;
        }

        let u: Unit = world.read_model((game_id, pos.unit_id));
        u.is_alive && u.player_id != player_id && u.x == x && u.y == y
    }

    /// Check if a specific player's infantry occupies (x, y).
    fn infantry_exists_at(
        ref world: dojo::world::WorldStorage, game_id: u32, x: u8, y: u8, player_id: u8,
    ) -> bool {
        let pos: UnitPosition = world.read_model((game_id, x, y));
        if pos.unit_id == 0 {
            return false;
        }

        let u: Unit = world.read_model((game_id, pos.unit_id));
        u.is_alive
            && u.player_id == player_id
            && u.unit_type == UnitType::Infantry
            && u.x == x
            && u.y == y
    }

    /// Check if a specific player's capture-capable unit occupies (x, y).
    fn capture_unit_exists_at(
        ref world: dojo::world::WorldStorage, game_id: u32, x: u8, y: u8, player_id: u8,
    ) -> bool {
        let pos: UnitPosition = world.read_model((game_id, x, y));
        if pos.unit_id == 0 {
            return false;
        }

        let u: Unit = world.read_model((game_id, pos.unit_id));
        u.is_alive
            && u.player_id == player_id
            && unit_stats::can_capture(u.unit_type)
            && u.x == x
            && u.y == y
    }
}
