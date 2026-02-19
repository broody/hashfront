use chain_tactics::types::UnitType;
use dojo::model::ModelStorage;

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
    pub has_moved: bool,
    pub has_acted: bool,
    pub is_alive: bool,
}

#[generate_trait]
pub impl UnitImpl of UnitTrait {
    /// Check if any alive unit occupies (x, y).
    fn exists_at(
        ref world: dojo::world::WorldStorage, game_id: u32, x: u8, y: u8, next_unit_id: u8,
    ) -> bool {
        let mut i: u8 = 1;
        let mut found = false;
        while i <= next_unit_id && !found {
            let u: Unit = world.read_model((game_id, i));
            if u.is_alive && u.x == x && u.y == y {
                found = true;
            }
            i += 1;
        };
        found
    }

    /// Check if a specific player's infantry occupies (x, y).
    fn infantry_exists_at(
        ref world: dojo::world::WorldStorage, game_id: u32, x: u8, y: u8, player_id: u8,
    ) -> bool {
        let mut i: u8 = 1;
        let mut found = false;
        while i < 255 && !found {
            let u: Unit = world.read_model((game_id, i));
            if u.unit_type == UnitType::None && u.hp == 0 && !u.is_alive {
                break;
            }
            if u.is_alive
                && u.player_id == player_id
                && u.unit_type == UnitType::Infantry
                && u.x == x
                && u.y == y {
                found = true;
            }
            i += 1;
        };
        found
    }
}
