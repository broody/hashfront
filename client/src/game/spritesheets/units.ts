const TILE = 32;
const ROW_CIVILIAN = 16;
const ROW_RIFLE = ROW_CIVILIAN + TILE;
const ROW_RPG = ROW_RIFLE + TILE;
const ROW_MG = ROW_RPG + TILE;
const ROW_SIDECAR = ROW_MG + TILE;
const ROW_BULLDOZER = ROW_SIDECAR + TILE;
const ROW_TRANSPORTER = ROW_BULLDOZER + TILE;
const ROW_BUGGY = ROW_TRANSPORTER + TILE * 2; // skip one row
const ROW_JEEP = ROW_BUGGY + TILE;
const ROW_ARTILLERY = ROW_JEEP + TILE;
const ROW_TANK = ROW_ARTILLERY + TILE * 3; // skip two rows
const ROW_HEAVY_TANK = ROW_TANK + TILE;

function createUnitAtlas(image: string) {
  return {
    frames: {
      // Civilian - Idle
      civilian_idle_0: { frame: { x: 0, y: ROW_CIVILIAN, w: TILE, h: TILE } },
      civilian_idle_1: {
        frame: { x: TILE, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_idle_2: {
        frame: { x: TILE * 2, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_idle_3: {
        frame: { x: TILE * 3, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      // Civilian - Walk Side
      civilian_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      // Civilian - Walk Down
      civilian_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      // Civilian - Walk Up
      civilian_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      // Civilian - Death
      civilian_death_0: {
        frame: { x: TILE * 24, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_death_1: {
        frame: { x: TILE * 25, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_death_2: {
        frame: { x: TILE * 26, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },
      civilian_death_3: {
        frame: { x: TILE * 27, y: ROW_CIVILIAN, w: TILE, h: TILE },
      },

      // Rifle Infantry - Idle
      rifle_idle_0: { frame: { x: 0, y: ROW_RIFLE, w: TILE, h: TILE } },
      rifle_idle_1: { frame: { x: TILE, y: ROW_RIFLE, w: TILE, h: TILE } },
      rifle_idle_2: { frame: { x: TILE * 2, y: ROW_RIFLE, w: TILE, h: TILE } },
      rifle_idle_3: { frame: { x: TILE * 3, y: ROW_RIFLE, w: TILE, h: TILE } },
      // Rifle Infantry - Walk Side
      rifle_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      // Rifle Infantry - Walk Down
      rifle_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      // Rifle Infantry - Walk Up
      rifle_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      // Rifle Infantry - Attack
      rifle_attack_0: {
        frame: { x: TILE * 16, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_attack_1: {
        frame: { x: TILE * 17, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_attack_2: {
        frame: { x: TILE * 18, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_attack_3: {
        frame: { x: TILE * 19, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      // Rifle Infantry - Death
      rifle_death_0: {
        frame: { x: TILE * 24, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_death_1: {
        frame: { x: TILE * 25, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_death_2: {
        frame: { x: TILE * 26, y: ROW_RIFLE, w: TILE, h: TILE },
      },
      rifle_death_3: {
        frame: { x: TILE * 27, y: ROW_RIFLE, w: TILE, h: TILE },
      },

      // RPG - Idle
      rpg_idle_0: { frame: { x: 0, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_idle_1: { frame: { x: TILE, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_idle_2: { frame: { x: TILE * 2, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_idle_3: { frame: { x: TILE * 3, y: ROW_RPG, w: TILE, h: TILE } },
      // RPG - Walk Side
      rpg_walk_side_0: { frame: { x: TILE * 4, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_walk_side_1: { frame: { x: TILE * 5, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_walk_side_2: { frame: { x: TILE * 6, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_walk_side_3: { frame: { x: TILE * 7, y: ROW_RPG, w: TILE, h: TILE } },
      // RPG - Walk Down
      rpg_walk_down_0: { frame: { x: TILE * 8, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_walk_down_1: { frame: { x: TILE * 9, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_RPG, w: TILE, h: TILE },
      },
      rpg_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_RPG, w: TILE, h: TILE },
      },
      // RPG - Walk Up
      rpg_walk_up_0: { frame: { x: TILE * 12, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_walk_up_1: { frame: { x: TILE * 13, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_walk_up_2: { frame: { x: TILE * 14, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_walk_up_3: { frame: { x: TILE * 15, y: ROW_RPG, w: TILE, h: TILE } },
      // RPG - Attack
      rpg_attack_0: { frame: { x: TILE * 16, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_attack_1: { frame: { x: TILE * 17, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_attack_2: { frame: { x: TILE * 18, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_attack_3: { frame: { x: TILE * 19, y: ROW_RPG, w: TILE, h: TILE } },
      // RPG - Death
      rpg_death_0: { frame: { x: TILE * 24, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_death_1: { frame: { x: TILE * 25, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_death_2: { frame: { x: TILE * 26, y: ROW_RPG, w: TILE, h: TILE } },
      rpg_death_3: { frame: { x: TILE * 27, y: ROW_RPG, w: TILE, h: TILE } },

      // Machine Gun - Idle
      mg_idle_0: { frame: { x: 0, y: ROW_MG, w: TILE, h: TILE } },
      mg_idle_1: { frame: { x: TILE, y: ROW_MG, w: TILE, h: TILE } },
      mg_idle_2: { frame: { x: TILE * 2, y: ROW_MG, w: TILE, h: TILE } },
      mg_idle_3: { frame: { x: TILE * 3, y: ROW_MG, w: TILE, h: TILE } },
      // Machine Gun - Walk Side
      mg_walk_side_0: { frame: { x: TILE * 4, y: ROW_MG, w: TILE, h: TILE } },
      mg_walk_side_1: { frame: { x: TILE * 5, y: ROW_MG, w: TILE, h: TILE } },
      mg_walk_side_2: { frame: { x: TILE * 6, y: ROW_MG, w: TILE, h: TILE } },
      mg_walk_side_3: { frame: { x: TILE * 7, y: ROW_MG, w: TILE, h: TILE } },
      // Machine Gun - Walk Down
      mg_walk_down_0: { frame: { x: TILE * 8, y: ROW_MG, w: TILE, h: TILE } },
      mg_walk_down_1: { frame: { x: TILE * 9, y: ROW_MG, w: TILE, h: TILE } },
      mg_walk_down_2: { frame: { x: TILE * 10, y: ROW_MG, w: TILE, h: TILE } },
      mg_walk_down_3: { frame: { x: TILE * 11, y: ROW_MG, w: TILE, h: TILE } },
      // Machine Gun - Walk Up
      mg_walk_up_0: { frame: { x: TILE * 12, y: ROW_MG, w: TILE, h: TILE } },
      mg_walk_up_1: { frame: { x: TILE * 13, y: ROW_MG, w: TILE, h: TILE } },
      mg_walk_up_2: { frame: { x: TILE * 14, y: ROW_MG, w: TILE, h: TILE } },
      mg_walk_up_3: { frame: { x: TILE * 15, y: ROW_MG, w: TILE, h: TILE } },
      // Machine Gun - Attack
      mg_attack_0: { frame: { x: TILE * 16, y: ROW_MG, w: TILE, h: TILE } },
      mg_attack_1: { frame: { x: TILE * 17, y: ROW_MG, w: TILE, h: TILE } },
      mg_attack_2: { frame: { x: TILE * 18, y: ROW_MG, w: TILE, h: TILE } },
      mg_attack_3: { frame: { x: TILE * 19, y: ROW_MG, w: TILE, h: TILE } },
      // Machine Gun - Death
      mg_death_0: { frame: { x: TILE * 24, y: ROW_MG, w: TILE, h: TILE } },
      mg_death_1: { frame: { x: TILE * 25, y: ROW_MG, w: TILE, h: TILE } },
      mg_death_2: { frame: { x: TILE * 26, y: ROW_MG, w: TILE, h: TILE } },
      mg_death_3: { frame: { x: TILE * 27, y: ROW_MG, w: TILE, h: TILE } },

      // Sidecar - Idle
      sidecar_idle_0: { frame: { x: 0, y: ROW_SIDECAR, w: TILE, h: TILE } },
      sidecar_idle_1: { frame: { x: TILE, y: ROW_SIDECAR, w: TILE, h: TILE } },
      sidecar_idle_2: {
        frame: { x: TILE * 2, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_idle_3: {
        frame: { x: TILE * 3, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      // Sidecar - Walk Side
      sidecar_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      // Sidecar - Walk Down
      sidecar_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      // Sidecar - Walk Up
      sidecar_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      // Sidecar - Attack
      sidecar_attack_0: {
        frame: { x: TILE * 16, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_attack_1: {
        frame: { x: TILE * 17, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_attack_2: {
        frame: { x: TILE * 18, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_attack_3: {
        frame: { x: TILE * 19, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      // Sidecar - Death
      sidecar_death_0: {
        frame: { x: TILE * 24, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_death_1: {
        frame: { x: TILE * 25, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_death_2: {
        frame: { x: TILE * 26, y: ROW_SIDECAR, w: TILE, h: TILE },
      },
      sidecar_death_3: {
        frame: { x: TILE * 27, y: ROW_SIDECAR, w: TILE, h: TILE },
      },

      // Bulldozer - Idle
      bulldozer_idle_0: { frame: { x: 0, y: ROW_BULLDOZER, w: TILE, h: TILE } },
      bulldozer_idle_1: {
        frame: { x: TILE, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_idle_2: {
        frame: { x: TILE * 2, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_idle_3: {
        frame: { x: TILE * 3, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      // Bulldozer - Walk Side
      bulldozer_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      // Bulldozer - Walk Down
      bulldozer_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      // Bulldozer - Walk Up
      bulldozer_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      // Bulldozer - Death
      bulldozer_death_0: {
        frame: { x: TILE * 24, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_death_1: {
        frame: { x: TILE * 25, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_death_2: {
        frame: { x: TILE * 26, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },
      bulldozer_death_3: {
        frame: { x: TILE * 27, y: ROW_BULLDOZER, w: TILE, h: TILE },
      },

      // Transporter - Idle
      transporter_idle_0: {
        frame: { x: 0, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_idle_1: {
        frame: { x: TILE, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_idle_2: {
        frame: { x: TILE * 2, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_idle_3: {
        frame: { x: TILE * 3, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      // Transporter - Walk Side
      transporter_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      // Transporter - Walk Down
      transporter_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      // Transporter - Walk Up
      transporter_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      // Transporter - Death
      transporter_death_0: {
        frame: { x: TILE * 24, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_death_1: {
        frame: { x: TILE * 25, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_death_2: {
        frame: { x: TILE * 26, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },
      transporter_death_3: {
        frame: { x: TILE * 27, y: ROW_TRANSPORTER, w: TILE, h: TILE },
      },

      // Buggy - Idle
      buggy_idle_0: { frame: { x: 0, y: ROW_BUGGY, w: TILE, h: TILE } },
      buggy_idle_1: { frame: { x: TILE, y: ROW_BUGGY, w: TILE, h: TILE } },
      buggy_idle_2: { frame: { x: TILE * 2, y: ROW_BUGGY, w: TILE, h: TILE } },
      buggy_idle_3: { frame: { x: TILE * 3, y: ROW_BUGGY, w: TILE, h: TILE } },
      // Buggy - Walk Side
      buggy_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      // Buggy - Walk Down
      buggy_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      // Buggy - Walk Up
      buggy_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      // Buggy - Attack
      buggy_attack_0: {
        frame: { x: TILE * 16, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_attack_1: {
        frame: { x: TILE * 17, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_attack_2: {
        frame: { x: TILE * 18, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_attack_3: {
        frame: { x: TILE * 19, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      // Buggy - Death
      buggy_death_0: {
        frame: { x: TILE * 24, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_death_1: {
        frame: { x: TILE * 25, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_death_2: {
        frame: { x: TILE * 26, y: ROW_BUGGY, w: TILE, h: TILE },
      },
      buggy_death_3: {
        frame: { x: TILE * 27, y: ROW_BUGGY, w: TILE, h: TILE },
      },

      // Jeep - Idle
      jeep_idle_0: { frame: { x: 0, y: ROW_JEEP, w: TILE, h: TILE } },
      jeep_idle_1: { frame: { x: TILE, y: ROW_JEEP, w: TILE, h: TILE } },
      jeep_idle_2: { frame: { x: TILE * 2, y: ROW_JEEP, w: TILE, h: TILE } },
      jeep_idle_3: { frame: { x: TILE * 3, y: ROW_JEEP, w: TILE, h: TILE } },
      // Jeep - Walk Side
      jeep_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_JEEP, w: TILE, h: TILE },
      },
      jeep_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_JEEP, w: TILE, h: TILE },
      },
      jeep_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_JEEP, w: TILE, h: TILE },
      },
      jeep_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_JEEP, w: TILE, h: TILE },
      },
      // Jeep - Walk Down
      jeep_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_JEEP, w: TILE, h: TILE },
      },
      jeep_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_JEEP, w: TILE, h: TILE },
      },
      jeep_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_JEEP, w: TILE, h: TILE },
      },
      jeep_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_JEEP, w: TILE, h: TILE },
      },
      // Jeep - Walk Up
      jeep_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_JEEP, w: TILE, h: TILE },
      },
      jeep_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_JEEP, w: TILE, h: TILE },
      },
      jeep_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_JEEP, w: TILE, h: TILE },
      },
      jeep_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_JEEP, w: TILE, h: TILE },
      },
      // Jeep - Attack
      jeep_attack_0: { frame: { x: TILE * 16, y: ROW_JEEP, w: TILE, h: TILE } },
      jeep_attack_1: { frame: { x: TILE * 17, y: ROW_JEEP, w: TILE, h: TILE } },
      jeep_attack_2: { frame: { x: TILE * 18, y: ROW_JEEP, w: TILE, h: TILE } },
      jeep_attack_3: { frame: { x: TILE * 19, y: ROW_JEEP, w: TILE, h: TILE } },
      // Jeep - Death
      jeep_death_0: { frame: { x: TILE * 24, y: ROW_JEEP, w: TILE, h: TILE } },
      jeep_death_1: { frame: { x: TILE * 25, y: ROW_JEEP, w: TILE, h: TILE } },
      jeep_death_2: { frame: { x: TILE * 26, y: ROW_JEEP, w: TILE, h: TILE } },
      jeep_death_3: { frame: { x: TILE * 27, y: ROW_JEEP, w: TILE, h: TILE } },

      // Artillery - Idle
      artillery_idle_0: { frame: { x: 0, y: ROW_ARTILLERY, w: TILE, h: TILE } },
      artillery_idle_1: {
        frame: { x: TILE, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_idle_2: {
        frame: { x: TILE * 2, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_idle_3: {
        frame: { x: TILE * 3, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      // Artillery - Walk Side
      artillery_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      // Artillery - Walk Down
      artillery_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      // Artillery - Walk Up
      artillery_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      // Artillery - Attack
      artillery_attack_0: {
        frame: { x: TILE * 16, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_attack_1: {
        frame: { x: TILE * 17, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_attack_2: {
        frame: { x: TILE * 18, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_attack_3: {
        frame: { x: TILE * 19, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      // Artillery - Death
      artillery_death_0: {
        frame: { x: TILE * 24, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_death_1: {
        frame: { x: TILE * 25, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_death_2: {
        frame: { x: TILE * 26, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },
      artillery_death_3: {
        frame: { x: TILE * 27, y: ROW_ARTILLERY, w: TILE, h: TILE },
      },

      // Tank - Idle
      tank_idle_0: { frame: { x: 0, y: ROW_TANK, w: TILE, h: TILE } },
      tank_idle_1: { frame: { x: TILE, y: ROW_TANK, w: TILE, h: TILE } },
      tank_idle_2: { frame: { x: TILE * 2, y: ROW_TANK, w: TILE, h: TILE } },
      tank_idle_3: { frame: { x: TILE * 3, y: ROW_TANK, w: TILE, h: TILE } },
      // Tank - Walk Side
      tank_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_TANK, w: TILE, h: TILE },
      },
      tank_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_TANK, w: TILE, h: TILE },
      },
      tank_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_TANK, w: TILE, h: TILE },
      },
      tank_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_TANK, w: TILE, h: TILE },
      },
      // Tank - Walk Down
      tank_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_TANK, w: TILE, h: TILE },
      },
      tank_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_TANK, w: TILE, h: TILE },
      },
      tank_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_TANK, w: TILE, h: TILE },
      },
      tank_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_TANK, w: TILE, h: TILE },
      },
      // Tank - Walk Up
      tank_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_TANK, w: TILE, h: TILE },
      },
      tank_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_TANK, w: TILE, h: TILE },
      },
      tank_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_TANK, w: TILE, h: TILE },
      },
      tank_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_TANK, w: TILE, h: TILE },
      },
      // Tank - Attack
      tank_attack_0: { frame: { x: TILE * 16, y: ROW_TANK, w: TILE, h: TILE } },
      tank_attack_1: { frame: { x: TILE * 17, y: ROW_TANK, w: TILE, h: TILE } },
      tank_attack_2: { frame: { x: TILE * 18, y: ROW_TANK, w: TILE, h: TILE } },
      tank_attack_3: { frame: { x: TILE * 19, y: ROW_TANK, w: TILE, h: TILE } },
      // Tank - Death
      tank_death_0: { frame: { x: TILE * 24, y: ROW_TANK, w: TILE, h: TILE } },
      tank_death_1: { frame: { x: TILE * 25, y: ROW_TANK, w: TILE, h: TILE } },
      tank_death_2: { frame: { x: TILE * 26, y: ROW_TANK, w: TILE, h: TILE } },
      tank_death_3: { frame: { x: TILE * 27, y: ROW_TANK, w: TILE, h: TILE } },

      // Heavy Tank - Idle
      heavy_tank_idle_0: {
        frame: { x: 0, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_idle_1: {
        frame: { x: TILE, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_idle_2: {
        frame: { x: TILE * 2, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_idle_3: {
        frame: { x: TILE * 3, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      // Heavy Tank - Walk Side
      heavy_tank_walk_side_0: {
        frame: { x: TILE * 4, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_walk_side_1: {
        frame: { x: TILE * 5, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_walk_side_2: {
        frame: { x: TILE * 6, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_walk_side_3: {
        frame: { x: TILE * 7, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      // Heavy Tank - Walk Down
      heavy_tank_walk_down_0: {
        frame: { x: TILE * 8, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_walk_down_1: {
        frame: { x: TILE * 9, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_walk_down_2: {
        frame: { x: TILE * 10, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_walk_down_3: {
        frame: { x: TILE * 11, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      // Heavy Tank - Walk Up
      heavy_tank_walk_up_0: {
        frame: { x: TILE * 12, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_walk_up_1: {
        frame: { x: TILE * 13, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_walk_up_2: {
        frame: { x: TILE * 14, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_walk_up_3: {
        frame: { x: TILE * 15, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      // Heavy Tank - Attack
      heavy_tank_attack_0: {
        frame: { x: TILE * 16, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_attack_1: {
        frame: { x: TILE * 17, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_attack_2: {
        frame: { x: TILE * 18, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_attack_3: {
        frame: { x: TILE * 19, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      // Heavy Tank - Death
      heavy_tank_death_0: {
        frame: { x: TILE * 24, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_death_1: {
        frame: { x: TILE * 25, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_death_2: {
        frame: { x: TILE * 26, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
      heavy_tank_death_3: {
        frame: { x: TILE * 27, y: ROW_HEAVY_TANK, w: TILE, h: TILE },
      },
    },
    animations: {
      civilian_idle: [
        "civilian_idle_0",
        "civilian_idle_1",
        "civilian_idle_2",
        "civilian_idle_3",
      ],
      civilian_walk_side: [
        "civilian_walk_side_0",
        "civilian_walk_side_1",
        "civilian_walk_side_2",
        "civilian_walk_side_3",
      ],
      civilian_walk_down: [
        "civilian_walk_down_0",
        "civilian_walk_down_1",
        "civilian_walk_down_2",
        "civilian_walk_down_3",
      ],
      civilian_walk_up: [
        "civilian_walk_up_0",
        "civilian_walk_up_1",
        "civilian_walk_up_2",
        "civilian_walk_up_3",
      ],
      civilian_death: [
        "civilian_death_0",
        "civilian_death_1",
        "civilian_death_2",
        "civilian_death_3",
      ],
      rifle_idle: [
        "rifle_idle_0",
        "rifle_idle_1",
        "rifle_idle_2",
        "rifle_idle_3",
      ],
      rifle_walk_side: [
        "rifle_walk_side_0",
        "rifle_walk_side_1",
        "rifle_walk_side_2",
        "rifle_walk_side_3",
      ],
      rifle_walk_down: [
        "rifle_walk_down_0",
        "rifle_walk_down_1",
        "rifle_walk_down_2",
        "rifle_walk_down_3",
      ],
      rifle_walk_up: [
        "rifle_walk_up_0",
        "rifle_walk_up_1",
        "rifle_walk_up_2",
        "rifle_walk_up_3",
      ],
      rifle_attack: [
        "rifle_attack_0",
        "rifle_attack_1",
        "rifle_attack_2",
        "rifle_attack_3",
      ],
      rifle_death: [
        "rifle_death_0",
        "rifle_death_1",
        "rifle_death_2",
        "rifle_death_3",
      ],
      rpg_idle: ["rpg_idle_0", "rpg_idle_1", "rpg_idle_2", "rpg_idle_3"],
      rpg_walk_side: [
        "rpg_walk_side_0",
        "rpg_walk_side_1",
        "rpg_walk_side_2",
        "rpg_walk_side_3",
      ],
      rpg_walk_down: [
        "rpg_walk_down_0",
        "rpg_walk_down_1",
        "rpg_walk_down_2",
        "rpg_walk_down_3",
      ],
      rpg_walk_up: [
        "rpg_walk_up_0",
        "rpg_walk_up_1",
        "rpg_walk_up_2",
        "rpg_walk_up_3",
      ],
      rpg_attack: [
        "rpg_attack_0",
        "rpg_attack_1",
        "rpg_attack_2",
        "rpg_attack_3",
      ],
      rpg_death: ["rpg_death_0", "rpg_death_1", "rpg_death_2", "rpg_death_3"],
      mg_idle: ["mg_idle_0", "mg_idle_1", "mg_idle_2", "mg_idle_3"],
      mg_walk_side: [
        "mg_walk_side_0",
        "mg_walk_side_1",
        "mg_walk_side_2",
        "mg_walk_side_3",
      ],
      mg_walk_down: [
        "mg_walk_down_0",
        "mg_walk_down_1",
        "mg_walk_down_2",
        "mg_walk_down_3",
      ],
      mg_walk_up: [
        "mg_walk_up_0",
        "mg_walk_up_1",
        "mg_walk_up_2",
        "mg_walk_up_3",
      ],
      mg_attack: ["mg_attack_0", "mg_attack_1", "mg_attack_2", "mg_attack_3"],
      mg_death: ["mg_death_0", "mg_death_1", "mg_death_2", "mg_death_3"],
      sidecar_idle: [
        "sidecar_idle_0",
        "sidecar_idle_1",
        "sidecar_idle_2",
        "sidecar_idle_3",
      ],
      sidecar_walk_side: [
        "sidecar_walk_side_0",
        "sidecar_walk_side_1",
        "sidecar_walk_side_2",
        "sidecar_walk_side_3",
      ],
      sidecar_walk_down: [
        "sidecar_walk_down_0",
        "sidecar_walk_down_1",
        "sidecar_walk_down_2",
        "sidecar_walk_down_3",
      ],
      sidecar_walk_up: [
        "sidecar_walk_up_0",
        "sidecar_walk_up_1",
        "sidecar_walk_up_2",
        "sidecar_walk_up_3",
      ],
      sidecar_attack: [
        "sidecar_attack_0",
        "sidecar_attack_1",
        "sidecar_attack_2",
        "sidecar_attack_3",
      ],
      sidecar_death: [
        "sidecar_death_0",
        "sidecar_death_1",
        "sidecar_death_2",
        "sidecar_death_3",
      ],
      bulldozer_idle: [
        "bulldozer_idle_0",
        "bulldozer_idle_1",
        "bulldozer_idle_2",
        "bulldozer_idle_3",
      ],
      bulldozer_walk_side: [
        "bulldozer_walk_side_0",
        "bulldozer_walk_side_1",
        "bulldozer_walk_side_2",
        "bulldozer_walk_side_3",
      ],
      bulldozer_walk_down: [
        "bulldozer_walk_down_0",
        "bulldozer_walk_down_1",
        "bulldozer_walk_down_2",
        "bulldozer_walk_down_3",
      ],
      bulldozer_walk_up: [
        "bulldozer_walk_up_0",
        "bulldozer_walk_up_1",
        "bulldozer_walk_up_2",
        "bulldozer_walk_up_3",
      ],
      bulldozer_death: [
        "bulldozer_death_0",
        "bulldozer_death_1",
        "bulldozer_death_2",
        "bulldozer_death_3",
      ],
      transporter_idle: [
        "transporter_idle_0",
        "transporter_idle_1",
        "transporter_idle_2",
        "transporter_idle_3",
      ],
      transporter_walk_side: [
        "transporter_walk_side_0",
        "transporter_walk_side_1",
        "transporter_walk_side_2",
        "transporter_walk_side_3",
      ],
      transporter_walk_down: [
        "transporter_walk_down_0",
        "transporter_walk_down_1",
        "transporter_walk_down_2",
        "transporter_walk_down_3",
      ],
      transporter_walk_up: [
        "transporter_walk_up_0",
        "transporter_walk_up_1",
        "transporter_walk_up_2",
        "transporter_walk_up_3",
      ],
      transporter_death: [
        "transporter_death_0",
        "transporter_death_1",
        "transporter_death_2",
        "transporter_death_3",
      ],
      buggy_idle: [
        "buggy_idle_0",
        "buggy_idle_1",
        "buggy_idle_2",
        "buggy_idle_3",
      ],
      buggy_walk_side: [
        "buggy_walk_side_0",
        "buggy_walk_side_1",
        "buggy_walk_side_2",
        "buggy_walk_side_3",
      ],
      buggy_walk_down: [
        "buggy_walk_down_0",
        "buggy_walk_down_1",
        "buggy_walk_down_2",
        "buggy_walk_down_3",
      ],
      buggy_walk_up: [
        "buggy_walk_up_0",
        "buggy_walk_up_1",
        "buggy_walk_up_2",
        "buggy_walk_up_3",
      ],
      buggy_attack: [
        "buggy_attack_0",
        "buggy_attack_1",
        "buggy_attack_2",
        "buggy_attack_3",
      ],
      buggy_death: [
        "buggy_death_0",
        "buggy_death_1",
        "buggy_death_2",
        "buggy_death_3",
      ],
      jeep_idle: ["jeep_idle_0", "jeep_idle_1", "jeep_idle_2", "jeep_idle_3"],
      jeep_walk_side: [
        "jeep_walk_side_0",
        "jeep_walk_side_1",
        "jeep_walk_side_2",
        "jeep_walk_side_3",
      ],
      jeep_walk_down: [
        "jeep_walk_down_0",
        "jeep_walk_down_1",
        "jeep_walk_down_2",
        "jeep_walk_down_3",
      ],
      jeep_walk_up: [
        "jeep_walk_up_0",
        "jeep_walk_up_1",
        "jeep_walk_up_2",
        "jeep_walk_up_3",
      ],
      jeep_attack: [
        "jeep_attack_0",
        "jeep_attack_1",
        "jeep_attack_2",
        "jeep_attack_3",
      ],
      jeep_death: [
        "jeep_death_0",
        "jeep_death_1",
        "jeep_death_2",
        "jeep_death_3",
      ],
      artillery_idle: [
        "artillery_idle_0",
        "artillery_idle_1",
        "artillery_idle_2",
        "artillery_idle_3",
      ],
      artillery_walk_side: [
        "artillery_walk_side_0",
        "artillery_walk_side_1",
        "artillery_walk_side_2",
        "artillery_walk_side_3",
      ],
      artillery_walk_down: [
        "artillery_walk_down_0",
        "artillery_walk_down_1",
        "artillery_walk_down_2",
        "artillery_walk_down_3",
      ],
      artillery_walk_up: [
        "artillery_walk_up_0",
        "artillery_walk_up_1",
        "artillery_walk_up_2",
        "artillery_walk_up_3",
      ],
      artillery_attack: [
        "artillery_attack_0",
        "artillery_attack_1",
        "artillery_attack_2",
        "artillery_attack_3",
      ],
      artillery_death: [
        "artillery_death_0",
        "artillery_death_1",
        "artillery_death_2",
        "artillery_death_3",
      ],
      tank_idle: ["tank_idle_0", "tank_idle_1", "tank_idle_2", "tank_idle_3"],
      tank_walk_side: [
        "tank_walk_side_0",
        "tank_walk_side_1",
        "tank_walk_side_2",
        "tank_walk_side_3",
      ],
      tank_walk_down: [
        "tank_walk_down_0",
        "tank_walk_down_1",
        "tank_walk_down_2",
        "tank_walk_down_3",
      ],
      tank_walk_up: [
        "tank_walk_up_0",
        "tank_walk_up_1",
        "tank_walk_up_2",
        "tank_walk_up_3",
      ],
      tank_attack: [
        "tank_attack_0",
        "tank_attack_1",
        "tank_attack_2",
        "tank_attack_3",
      ],
      tank_death: [
        "tank_death_0",
        "tank_death_1",
        "tank_death_2",
        "tank_death_3",
      ],
      heavy_tank_idle: [
        "heavy_tank_idle_0",
        "heavy_tank_idle_1",
        "heavy_tank_idle_2",
        "heavy_tank_idle_3",
      ],
      heavy_tank_walk_side: [
        "heavy_tank_walk_side_0",
        "heavy_tank_walk_side_1",
        "heavy_tank_walk_side_2",
        "heavy_tank_walk_side_3",
      ],
      heavy_tank_walk_down: [
        "heavy_tank_walk_down_0",
        "heavy_tank_walk_down_1",
        "heavy_tank_walk_down_2",
        "heavy_tank_walk_down_3",
      ],
      heavy_tank_walk_up: [
        "heavy_tank_walk_up_0",
        "heavy_tank_walk_up_1",
        "heavy_tank_walk_up_2",
        "heavy_tank_walk_up_3",
      ],
      heavy_tank_attack: [
        "heavy_tank_attack_0",
        "heavy_tank_attack_1",
        "heavy_tank_attack_2",
        "heavy_tank_attack_3",
      ],
      heavy_tank_death: [
        "heavy_tank_death_0",
        "heavy_tank_death_1",
        "heavy_tank_death_2",
        "heavy_tank_death_3",
      ],
    },
    meta: {
      image,
      scale: 1,
    },
  };
}

export const unitAtlasBlue = createUnitAtlas("/tilesets/units_blue.png");
export const unitAtlasRed = createUnitAtlas("/tilesets/units_red.png");
export const unitAtlasGreen = createUnitAtlas("/tilesets/units_green.png");
export const unitAtlasYellow = createUnitAtlas("/tilesets/units_yellow.png");
