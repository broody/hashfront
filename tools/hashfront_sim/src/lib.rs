use pyo3::prelude::*;
use pyo3::exceptions::PyValueError;
use pyo3::types::PyDict;
use rand::Rng;
use rand::SeedableRng;
use rand_pcg::Pcg64Mcg;
use std::collections::{BinaryHeap, HashMap};
use std::cmp::Reverse;
use std::path::PathBuf;

// ============================================================================
// Constants — matched to contracts/src/consts.cairo + unit_stats.cairo
// ============================================================================

const CAPTURE_THRESHOLD: i32 = 2;
const MAX_ROUNDS: i32 = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum TileType {
    Grass,
    Road,
    DirtRoad,
    Tree,
    Mountain,
    Hq,
    City,
    Factory,
}

impl TileType {
    fn from_char(c: char) -> Self {
        match c {
            '.' => TileType::Grass,
            'R' => TileType::Road,
            'D' => TileType::DirtRoad,
            'T' => TileType::Tree,
            'M' => TileType::Mountain,
            'H' => TileType::Hq,
            'C' => TileType::City,
            'F' => TileType::Factory,
            _ => TileType::Grass,
        }
    }

    fn to_str(&self) -> &'static str {
        match self {
            TileType::Grass => "GRASS",
            TileType::Road => "ROAD",
            TileType::DirtRoad => "DIRT_ROAD",
            TileType::Tree => "TREE",
            TileType::Mountain => "MOUNTAIN",
            TileType::Hq => "HQ",
            TileType::City => "CITY",
            TileType::Factory => "FACTORY",
        }
    }

    fn from_str(s: &str) -> Option<Self> {
        match s {
            "GRASS" => Some(TileType::Grass),
            "ROAD" => Some(TileType::Road),
            "DIRT_ROAD" => Some(TileType::DirtRoad),
            "TREE" => Some(TileType::Tree),
            "MOUNTAIN" => Some(TileType::Mountain),
            "HQ" => Some(TileType::Hq),
            "CITY" => Some(TileType::City),
            "FACTORY" => Some(TileType::Factory),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum UnitType {
    Infantry,
    Tank,
    Artillery,
}

impl UnitType {
    fn hp(&self) -> i32 { 10 }

    fn movement(&self) -> i32 {
        match self {
            UnitType::Infantry => 2,
            UnitType::Tank => 3,
            UnitType::Artillery => 3,
        }
    }

    fn min_range(&self) -> i32 {
        match self {
            UnitType::Infantry => 1,
            UnitType::Tank => 1,
            UnitType::Artillery => 2,
        }
    }

    fn max_range(&self) -> i32 {
        match self {
            UnitType::Infantry => 1,
            UnitType::Tank => 1,
            UnitType::Artillery => 3,
        }
    }

    fn accuracy(&self) -> i32 {
        match self {
            UnitType::Infantry => 90,
            UnitType::Tank => 85,
            UnitType::Artillery => 88,
        }
    }

    fn damage_vs(&self, other: UnitType) -> i32 {
        match (self, other) {
            (UnitType::Infantry, UnitType::Infantry) => 3,
            (UnitType::Infantry, UnitType::Tank) => 1,
            (UnitType::Infantry, UnitType::Artillery) => 4,
            (UnitType::Tank, UnitType::Infantry) => 5,
            (UnitType::Tank, UnitType::Tank) => 4,
            (UnitType::Tank, UnitType::Artillery) => 5,
            (UnitType::Artillery, UnitType::Infantry) => 3,
            (UnitType::Artillery, UnitType::Tank) => 5,
            (UnitType::Artillery, UnitType::Artillery) => 2,
        }
    }

    fn gets_road_bonus(&self) -> bool {
        matches!(self, UnitType::Tank | UnitType::Artillery)
    }

    fn can_capture(&self) -> bool {
        matches!(self, UnitType::Infantry)
    }

    fn can_traverse(&self, tile: TileType) -> bool {
        if tile == TileType::Mountain {
            return *self == UnitType::Infantry;
        }
        true
    }

    fn from_str(s: &str) -> Option<Self> {
        match s.to_uppercase().as_str() {
            "INFANTRY" => Some(UnitType::Infantry),
            "TANK" => Some(UnitType::Tank),
            "ARTILLERY" | "RANGER" => Some(UnitType::Artillery),
            _ => None,
        }
    }

    fn to_int(&self) -> i32 {
        match self {
            UnitType::Infantry => 1,
            UnitType::Tank => 2,
            UnitType::Artillery => 3,
        }
    }
}

fn move_cost(_tile: TileType) -> i32 { 1 }

fn defense_bonus(tile: TileType) -> i32 {
    match tile {
        TileType::Grass | TileType::Road | TileType::DirtRoad => 0,
        TileType::Tree | TileType::City | TileType::Factory => 1,
        TileType::Mountain | TileType::Hq => 2,
    }
}

fn terrain_evasion(tile: TileType) -> i32 {
    match tile {
        TileType::Grass | TileType::Road | TileType::DirtRoad => 0,
        TileType::Tree => 5,
        TileType::Mountain => 12,
        TileType::Hq => 10,
        TileType::City | TileType::Factory => 8,
    }
}

fn is_road(tile: TileType) -> bool {
    matches!(tile, TileType::Road | TileType::DirtRoad)
}

fn manhattan(x1: i32, y1: i32, x2: i32, y2: i32) -> i32 {
    (x1 - x2).abs() + (y1 - y2).abs()
}

// ============================================================================
// Data structures (internal)
// ============================================================================

#[derive(Debug, Clone)]
struct UnitData {
    uid: i32,
    unit_type: UnitType,
    player: i32,
    x: i32,
    y: i32,
    hp: i32,
    has_moved: bool,
    has_acted: bool,
}

impl UnitData {
    fn alive(&self) -> bool { self.hp > 0 }
}

#[derive(Debug, Clone)]
struct BuildingData {
    x: i32,
    y: i32,
    owner: i32,
    building_type: String,
    capture_player: i32,
    capture_progress: i32,
}

// ============================================================================
// Combat
// ============================================================================

fn compute_hit_chance(atk_type: UnitType, def_tile: TileType, moved: bool, distance: i32) -> i32 {
    let mut chance = atk_type.accuracy();
    chance -= terrain_evasion(def_tile);
    if moved { chance -= 5; }
    if atk_type == UnitType::Artillery && distance == 3 { chance -= 5; }
    chance.clamp(75, 95)
}

fn resolve_strike(rng: &mut Pcg64Mcg, atk_type: UnitType, def_type: UnitType,
                  def_tile: TileType, moved: bool, distance: i32) -> i32 {
    let base_damage = atk_type.damage_vs(def_type);
    let defense = defense_bonus(def_tile);
    let hit_dmg = (base_damage - defense).max(1);
    let hit_ch = compute_hit_chance(atk_type, def_tile, moved, distance);
    let roll = rng.random_range(1..=100);
    if roll <= hit_ch {
        hit_dmg
    } else if hit_dmg >= 2 {
        1 // graze
    } else {
        0 // whiff
    }
}

fn resolve_combat(rng: &mut Pcg64Mcg, atk_type: UnitType, def_type: UnitType,
                  atk_tile: TileType, def_tile: TileType,
                  distance: i32, attacker_moved: bool, defender_hp: i32) -> (i32, i32) {
    let dmg_to_def = resolve_strike(rng, atk_type, def_type, def_tile, attacker_moved, distance);
    let mut dmg_to_atk = 0;
    let defender_survives = defender_hp > dmg_to_def;
    if defender_survives {
        let d_min = def_type.min_range();
        let d_max = def_type.max_range();
        if d_min <= distance && distance <= d_max {
            dmg_to_atk = resolve_strike(rng, def_type, atk_type, atk_tile, false, distance);
        }
    }
    (dmg_to_def, dmg_to_atk)
}

// ============================================================================
// Movement — Dijkstra
// ============================================================================

fn reachable_tiles_internal(
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &[UnitData],
    unit_idx: usize,
    occupied: &[(i32, i32)],
) -> HashMap<(i32, i32), i32> {
    let unit = &units[unit_idx];
    let ut = unit.unit_type;
    let base_move = ut.movement();
    let sx = unit.x;
    let sy = unit.y;

    let start_tile = terrain[sy as usize][sx as usize];
    let road_bonus = if ut.gets_road_bonus() && is_road(start_tile) { 1 } else { 0 };
    let total_budget = base_move + road_bonus;

    // Build occupied set (positions of other alive units + explicit occupied)
    let mut occ_set: std::collections::HashSet<(i32, i32)> = std::collections::HashSet::new();
    for (i, u) in units.iter().enumerate() {
        if i != unit_idx && u.alive() {
            occ_set.insert((u.x, u.y));
        }
    }
    for &(ox, oy) in occupied {
        occ_set.insert((ox, oy));
    }

    let mut reached: HashMap<(i32, i32), i32> = HashMap::new();
    // state: (cost, road_bonus_remaining, x, y)
    let mut heap: BinaryHeap<Reverse<(i32, i32, i32, i32)>> = BinaryHeap::new();
    // best_state_cost: (x, y, rb) -> cost
    let mut best: HashMap<(i32, i32, i32), i32> = HashMap::new();

    heap.push(Reverse((0, road_bonus, sx, sy)));
    best.insert((sx, sy, road_bonus), 0);

    static DIRS: [(i32, i32); 4] = [(0, 1), (0, -1), (1, 0), (-1, 0)];

    while let Some(Reverse((cost, rb, cx, cy))) = heap.pop() {
        if cost > *best.get(&(cx, cy, rb)).unwrap_or(&i32::MAX) {
            continue;
        }
        if (cx, cy) != (sx, sy) {
            let prev = reached.get(&(cx, cy));
            if prev.is_none() || cost < *prev.unwrap() {
                reached.insert((cx, cy), cost);
            }
        }
        for &(dx, dy) in &DIRS {
            let nx = cx + dx;
            let ny = cy + dy;
            if nx < 0 || nx >= width || ny < 0 || ny >= height { continue; }
            let tile = terrain[ny as usize][nx as usize];
            if !ut.can_traverse(tile) { continue; }
            if occ_set.contains(&(nx, ny)) { continue; }

            let mut step_cost = move_cost(tile);
            let mut new_rb = rb;
            if new_rb > 0 && is_road(tile) {
                let spend = step_cost.min(new_rb);
                step_cost -= spend;
                new_rb -= spend;
            } else if new_rb > 0 {
                new_rb = 0;
            }

            let new_cost = cost + step_cost;
            if new_cost > total_budget { continue; }
            let state_key = (nx, ny, new_rb);
            if new_cost >= *best.get(&state_key).unwrap_or(&i32::MAX) { continue; }
            best.insert(state_key, new_cost);
            heap.push(Reverse((new_cost, new_rb, nx, ny)));
        }
    }
    reached
}

fn best_move_toward_internal(
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &[UnitData],
    unit_idx: usize,
    occupied: &[(i32, i32)],
    tx: i32,
    ty: i32,
) -> Option<(i32, i32)> {
    let tiles = reachable_tiles_internal(terrain, width, height, units, unit_idx, occupied);
    if tiles.is_empty() { return None; }
    if tiles.contains_key(&(tx, ty)) { return Some((tx, ty)); }
    let unit = &units[unit_idx];
    let best = tiles.keys()
        .min_by_key(|&&(x, y)| manhattan(x, y, tx, ty))?;
    if manhattan(best.0, best.1, tx, ty) < manhattan(unit.x, unit.y, tx, ty) {
        Some(*best)
    } else {
        None
    }
}

// ============================================================================
// Helper functions for strategies
// ============================================================================

fn get_attack_targets(units: &[UnitData], unit_idx: usize) -> Vec<usize> {
    let unit = &units[unit_idx];
    if unit.unit_type == UnitType::Artillery && unit.has_moved {
        return vec![];
    }
    let mn = unit.unit_type.min_range();
    let mx = unit.unit_type.max_range();
    let mut targets = vec![];
    for (i, e) in units.iter().enumerate() {
        if !e.alive() || e.player == unit.player { continue; }
        let d = manhattan(unit.x, unit.y, e.x, e.y);
        if mn <= d && d <= mx {
            targets.push(i);
        }
    }
    targets
}

fn expected_damage(atk_type: UnitType, def_type: UnitType, def_tile: TileType,
                   moved: bool, distance: i32) -> f64 {
    let base_damage = atk_type.damage_vs(def_type);
    let defense = defense_bonus(def_tile);
    let hit_dmg = (base_damage - defense).max(1);
    let hit_ch = compute_hit_chance(atk_type, def_tile, moved, distance) as f64 / 100.0;
    let graze = if hit_dmg >= 2 { 1.0 } else { 0.0 };
    hit_ch * hit_dmg as f64 + (1.0 - hit_ch) * graze
}

fn pick_target(units: &[UnitData], terrain: &[Vec<TileType>], unit_idx: usize, targets: &[usize]) -> Option<usize> {
    if targets.is_empty() { return None; }
    let unit = &units[unit_idx];
    targets.iter().copied().min_by(|&a, &b| {
        let ta = &units[a];
        let tb = &units[b];
        let dt_a = terrain[ta.y as usize][ta.x as usize];
        let dt_b = terrain[tb.y as usize][tb.x as usize];
        let dist_a = manhattan(unit.x, unit.y, ta.x, ta.y);
        let dist_b = manhattan(unit.x, unit.y, tb.x, tb.y);
        let ed_a = expected_damage(unit.unit_type, ta.unit_type, dt_a, unit.has_moved, dist_a);
        let ed_b = expected_damage(unit.unit_type, tb.unit_type, dt_b, unit.has_moved, dist_b);
        let kill_a = if ed_a >= ta.hp as f64 { 0 } else { 1 };
        let kill_b = if ed_b >= tb.hp as f64 { 0 } else { 1 };
        let val = |ut: UnitType| -> i32 { match ut { UnitType::Tank => 3, UnitType::Artillery => 2, UnitType::Infantry => 1 } };
        let score_a = (kill_a, ta.hp, -val(ta.unit_type));
        let score_b = (kill_b, tb.hp, -val(tb.unit_type));
        score_a.cmp(&score_b)
    })
}

fn find_artillery_position(
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &[UnitData],
    unit_idx: usize,
    occupied: &[(i32, i32)],
    target_x: i32,
    target_y: i32,
) -> Option<(i32, i32)> {
    let tiles = reachable_tiles_internal(terrain, width, height, units, unit_idx, occupied);
    let candidates: Vec<(i32, i32)> = tiles.keys()
        .filter(|&&(x, y)| {
            let d = manhattan(x, y, target_x, target_y);
            d >= 2 && d <= 3
        })
        .copied()
        .collect();
    if candidates.is_empty() { return None; }
    candidates.iter().copied().min_by(|&(ax, ay), &(bx, by)| {
        let da = manhattan(ax, ay, target_x, target_y);
        let db = manhattan(bx, by, target_x, target_y);
        let sa = (if da == 2 { 0 } else { 1 }, -defense_bonus(terrain[ay as usize][ax as usize]));
        let sb = (if db == 2 { 0 } else { 1 }, -defense_bonus(terrain[by as usize][bx as usize]));
        sa.cmp(&sb)
    })
}

// ============================================================================
// Game actions (mutating)
// ============================================================================

fn do_move_internal(units: &mut [UnitData], buildings: &mut [BuildingData],
                    current_player: i32, unit_idx: usize, tx: i32, ty: i32) {
    let unit = &units[unit_idx];
    if unit.unit_type.can_capture() {
        let ux = unit.x;
        let uy = unit.y;
        for b in buildings.iter_mut() {
            if b.x == ux && b.y == uy && b.capture_player == current_player && b.capture_progress > 0 {
                b.capture_player = 0;
                b.capture_progress = 0;
            }
        }
    }
    units[unit_idx].x = tx;
    units[unit_idx].y = ty;
    units[unit_idx].has_moved = true;
}

fn do_attack_internal(
    rng: &mut Pcg64Mcg,
    units: &mut [UnitData],
    terrain: &[Vec<TileType>],
    atk_idx: usize,
    def_idx: usize,
) -> (i32, i32) {
    let atk = &units[atk_idx];
    let def = &units[def_idx];
    let dist = manhattan(atk.x, atk.y, def.x, def.y);
    let atk_tile = terrain[atk.y as usize][atk.x as usize];
    let def_tile = terrain[def.y as usize][def.x as usize];
    let atk_type = atk.unit_type;
    let def_type = def.unit_type;
    let atk_moved = atk.has_moved;
    let def_hp = def.hp;

    let (dmg_d, dmg_a) = resolve_combat(rng, atk_type, def_type, atk_tile, def_tile, dist, atk_moved, def_hp);
    units[def_idx].hp -= dmg_d;
    units[atk_idx].hp -= dmg_a;
    units[atk_idx].has_acted = true;
    (dmg_d, dmg_a)
}

fn check_elimination(units: &[UnitData], attacker_player: i32) -> Option<i32> {
    let enemy = if attacker_player == 1 { 2 } else { 1 };
    let enemy_alive = units.iter().any(|u| u.alive() && u.player == enemy);
    if !enemy_alive { return Some(attacker_player); }
    let self_alive = units.iter().any(|u| u.alive() && u.player == attacker_player);
    if !self_alive { return Some(enemy); }
    None
}

fn do_capture_internal(units: &[UnitData], buildings: &mut [BuildingData],
                       unit_idx: usize) -> Option<i32> {
    let unit = &units[unit_idx];
    if !unit.unit_type.can_capture() { return None; }
    for b in buildings.iter_mut() {
        if b.x == unit.x && b.y == unit.y && b.owner != unit.player {
            if b.capture_player != unit.player {
                b.capture_player = unit.player;
                b.capture_progress = 1;
            } else {
                b.capture_progress += 1;
            }
            if b.capture_progress >= CAPTURE_THRESHOLD {
                b.owner = unit.player;
                b.capture_player = 0;
                b.capture_progress = 0;
                if b.building_type == "hq" {
                    return Some(unit.player); // HQ captured, winner
                }
                return None;
            }
            return None;
        }
    }
    None
}

fn do_wait_internal(units: &mut [UnitData], unit_idx: usize) {
    units[unit_idx].has_moved = true;
    units[unit_idx].has_acted = true;
}

fn end_turn_internal(
    units: &mut [UnitData],
    current_player: &mut i32,
    round_num: &mut i32,
) -> Option<i32> {
    if *current_player == 1 {
        *current_player = 2;
    } else {
        *current_player = 1;
        *round_num += 1;
    }
    // Reset flags
    for u in units.iter_mut() {
        if u.alive() && u.player == *current_player {
            u.has_moved = false;
            u.has_acted = false;
        }
    }
    // Round limit
    if *round_num > MAX_ROUNDS {
        let hp1: i32 = units.iter().filter(|u| u.alive() && u.player == 1).map(|u| u.hp).sum();
        let hp2: i32 = units.iter().filter(|u| u.alive() && u.player == 2).map(|u| u.hp).sum();
        if hp1 > hp2 {
            return Some(1);
        } else if hp2 > hp1 {
            return Some(2);
        } else {
            let n1 = units.iter().filter(|u| u.alive() && u.player == 1).count();
            let n2 = units.iter().filter(|u| u.alive() && u.player == 2).count();
            return Some(if n1 >= n2 { 1 } else { 2 });
        }
    }
    None
}

// ============================================================================
// Strategies
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StrategyType {
    Aggressive,
    Defensive,
    Rush,
    Balanced,
}

impl StrategyType {
    fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "aggressive" => Some(StrategyType::Aggressive),
            "defensive" => Some(StrategyType::Defensive),
            "rush" => Some(StrategyType::Rush),
            "balanced" => Some(StrategyType::Balanced),
            _ => None,
        }
    }
}

fn player_hq_idx(buildings: &[BuildingData], player: i32) -> Option<usize> {
    buildings.iter().position(|b| b.owner == player && b.building_type == "hq")
}

fn player_unit_indices(units: &[UnitData], player: i32) -> Vec<usize> {
    units.iter().enumerate()
        .filter(|(_, u)| u.alive() && u.player == player)
        .map(|(i, _)| i)
        .collect()
}

fn enemy_unit_indices(units: &[UnitData], player: i32) -> Vec<usize> {
    units.iter().enumerate()
        .filter(|(_, u)| u.alive() && u.player != player)
        .map(|(i, _)| i)
        .collect()
}

fn play_aggressive(
    rng: &mut Pcg64Mcg,
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &mut [UnitData],
    buildings: &mut [BuildingData],
    player: i32,
    winner: &mut Option<i32>,
) {
    let other = if player == 1 { 2 } else { 1 };
    let enemy_hq = player_hq_idx(buildings, other).map(|i| (buildings[i].x, buildings[i].y));

    let mut order = player_unit_indices(units, player);
    if let Some((hx, hy)) = enemy_hq {
        order.sort_by_key(|&i| manhattan(units[i].x, units[i].y, hx, hy));
    }

    let mut occupied: Vec<(i32, i32)> = vec![];

    for &ui in &order {
        if !units[ui].alive() || units[ui].has_acted { continue; }

        // Attack without moving
        let targets = get_attack_targets(units, ui);
        if !targets.is_empty() {
            if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                do_attack_internal(rng, units, terrain, ui, ti);
                occupied.push((units[ui].x, units[ui].y));
                if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                continue;
            }
        }

        // Artillery: find attack position
        if units[ui].unit_type == UnitType::Artillery {
            let enemies = enemy_unit_indices(units, player);
            if !enemies.is_empty() {
                let nearest = *enemies.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
                let pos = find_artillery_position(terrain, width, height, units, ui, &occupied, units[nearest].x, units[nearest].y);
                if let Some((px, py)) = pos {
                    do_move_internal(units, buildings, player, ui, px, py);
                    do_wait_internal(units, ui);
                    occupied.push((units[ui].x, units[ui].y));
                    continue;
                }
                let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, units[nearest].x, units[nearest].y);
                if let Some((dx, dy)) = dest {
                    do_move_internal(units, buildings, player, ui, dx, dy);
                }
                do_wait_internal(units, ui);
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }
        }

        // Capture HQ if on it
        if units[ui].unit_type.can_capture() {
            if let Some((hx, hy)) = enemy_hq {
                if units[ui].x == hx && units[ui].y == hy {
                    if let Some(w) = do_capture_internal(units, buildings, ui) {
                        *winner = Some(w); return;
                    }
                    occupied.push((units[ui].x, units[ui].y));
                    continue;
                }
            }
        }

        // Move toward target
        let (target_x, target_y) = if units[ui].unit_type.can_capture() {
            if let Some((hx, hy)) = enemy_hq { (hx, hy) } else {
                let enemies = enemy_unit_indices(units, player);
                if enemies.is_empty() { do_wait_internal(units, ui); occupied.push((units[ui].x, units[ui].y)); continue; }
                let nearest = *enemies.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
                (units[nearest].x, units[nearest].y)
            }
        } else {
            let enemies = enemy_unit_indices(units, player);
            if enemies.is_empty() { do_wait_internal(units, ui); occupied.push((units[ui].x, units[ui].y)); continue; }
            let nearest = *enemies.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
            (units[nearest].x, units[nearest].y)
        };

        let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, target_x, target_y);
        if let Some((dx, dy)) = dest {
            do_move_internal(units, buildings, player, ui, dx, dy);
        }

        // Capture after moving
        if units[ui].unit_type.can_capture() {
            if let Some((hx, hy)) = enemy_hq {
                if units[ui].x == hx && units[ui].y == hy {
                    if let Some(w) = do_capture_internal(units, buildings, ui) {
                        *winner = Some(w); return;
                    }
                    occupied.push((units[ui].x, units[ui].y));
                    continue;
                }
            }
        }

        // Attack after moving
        let targets = get_attack_targets(units, ui);
        if !targets.is_empty() {
            if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                do_attack_internal(rng, units, terrain, ui, ti);
                if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
            }
        } else {
            do_wait_internal(units, ui);
        }
        occupied.push((units[ui].x, units[ui].y));
    }
}

fn play_defensive(
    rng: &mut Pcg64Mcg,
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &mut [UnitData],
    buildings: &mut [BuildingData],
    player: i32,
    winner: &mut Option<i32>,
) {
    let own_hq = player_hq_idx(buildings, player).map(|i| (buildings[i].x, buildings[i].y));
    let other = if player == 1 { 2 } else { 1 };
    let _enemy_hq = player_hq_idx(buildings, other).map(|i| (buildings[i].x, buildings[i].y));

    let mut order = player_unit_indices(units, player);
    if let Some((hx, hy)) = own_hq {
        order.sort_by_key(|&i| manhattan(units[i].x, units[i].y, hx, hy));
    }

    let enemies_count = enemy_unit_indices(units, player).len();
    let pushing = order.len() > enemies_count + 2;

    let mut occupied: Vec<(i32, i32)> = vec![];

    for &ui in &order {
        if !units[ui].alive() || units[ui].has_acted { continue; }

        // Attack without moving
        let targets = get_attack_targets(units, ui);
        if !targets.is_empty() {
            if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                do_attack_internal(rng, units, terrain, ui, ti);
                occupied.push((units[ui].x, units[ui].y));
                if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                continue;
            }
        }

        // Retreat at 1 HP
        if units[ui].hp == 1 {
            if let Some((hx, hy)) = own_hq {
                let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, hx, hy);
                if let Some((dx, dy)) = dest {
                    if manhattan(dx, dy, hx, hy) < manhattan(units[ui].x, units[ui].y, hx, hy) {
                        do_move_internal(units, buildings, player, ui, dx, dy);
                        do_wait_internal(units, ui);
                        occupied.push((units[ui].x, units[ui].y));
                        continue;
                    }
                }
            }
        }

        // Artillery kiting
        if units[ui].unit_type == UnitType::Artillery {
            let enemies = enemy_unit_indices(units, player);
            let close: Vec<usize> = enemies.iter().copied()
                .filter(|&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y) <= 1)
                .collect();
            if !close.is_empty() {
                let tiles = reachable_tiles_internal(terrain, width, height, units, ui, &occupied);
                let safe: Vec<(i32, i32)> = tiles.keys().copied()
                    .filter(|&(x, y)| close.iter().all(|&ci| manhattan(x, y, units[ci].x, units[ci].y) >= 2))
                    .collect();
                if !safe.is_empty() {
                    let best = *safe.iter().max_by_key(|&&(x, y)| defense_bonus(terrain[y as usize][x as usize])).unwrap();
                    do_move_internal(units, buildings, player, ui, best.0, best.1);
                }
                do_wait_internal(units, ui);
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }

            if let Some((hx, hy)) = own_hq {
                let threats: Vec<usize> = enemies.iter().copied()
                    .filter(|&ei| manhattan(units[ei].x, units[ei].y, hx, hy) <= 6)
                    .collect();
                if !threats.is_empty() {
                    let nearest = *threats.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
                    let pos = find_artillery_position(terrain, width, height, units, ui, &occupied, units[nearest].x, units[nearest].y);
                    if let Some((px, py)) = pos {
                        do_move_internal(units, buildings, player, ui, px, py);
                    }
                    do_wait_internal(units, ui);
                    occupied.push((units[ui].x, units[ui].y));
                    continue;
                }
            }

            if pushing && !enemies.is_empty() {
                let nearest = *enemies.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
                let pos = find_artillery_position(terrain, width, height, units, ui, &occupied, units[nearest].x, units[nearest].y);
                if let Some((px, py)) = pos {
                    do_move_internal(units, buildings, player, ui, px, py);
                }
                do_wait_internal(units, ui);
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }

            do_wait_internal(units, ui);
            occupied.push((units[ui].x, units[ui].y));
            continue;
        }

        // Intercept threats near HQ
        if let Some((hx, hy)) = own_hq {
            let enemies = enemy_unit_indices(units, player);
            let threats: Vec<usize> = enemies.iter().copied()
                .filter(|&ei| manhattan(units[ei].x, units[ei].y, hx, hy) <= 5)
                .collect();
            if !threats.is_empty() {
                let nearest = *threats.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
                let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, units[nearest].x, units[nearest].y);
                if let Some((dx, dy)) = dest {
                    do_move_internal(units, buildings, player, ui, dx, dy);
                }
                let targets = get_attack_targets(units, ui);
                if !targets.is_empty() {
                    if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                        do_attack_internal(rng, units, terrain, ui, ti);
                        if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                    }
                } else {
                    do_wait_internal(units, ui);
                }
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }
        }

        // Push if winning
        if pushing {
            let enemies = enemy_unit_indices(units, player);
            if !enemies.is_empty() {
                let nearest = *enemies.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
                let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, units[nearest].x, units[nearest].y);
                if let Some((dx, dy)) = dest {
                    do_move_internal(units, buildings, player, ui, dx, dy);
                }
                let targets = get_attack_targets(units, ui);
                if !targets.is_empty() {
                    if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                        do_attack_internal(rng, units, terrain, ui, ti);
                        if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                    }
                } else {
                    do_wait_internal(units, ui);
                }
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }
        }

        // Hold near HQ
        if let Some((hx, hy)) = own_hq {
            if manhattan(units[ui].x, units[ui].y, hx, hy) > 4 {
                let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, hx, hy);
                if let Some((dx, dy)) = dest {
                    do_move_internal(units, buildings, player, ui, dx, dy);
                }
            }
        }
        do_wait_internal(units, ui);
        occupied.push((units[ui].x, units[ui].y));
    }
}

fn play_rush(
    rng: &mut Pcg64Mcg,
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &mut [UnitData],
    buildings: &mut [BuildingData],
    player: i32,
    winner: &mut Option<i32>,
) {
    let other = if player == 1 { 2 } else { 1 };
    let enemy_hq = player_hq_idx(buildings, other).map(|i| (buildings[i].x, buildings[i].y));

    let mut order = player_unit_indices(units, player);
    if let Some((hx, hy)) = enemy_hq {
        order.sort_by_key(|&i| manhattan(units[i].x, units[i].y, hx, hy));
    }

    let mut occupied: Vec<(i32, i32)> = vec![];

    for &ui in &order {
        if !units[ui].alive() || units[ui].has_acted { continue; }

        // Attack without moving
        let targets = get_attack_targets(units, ui);
        if !targets.is_empty() {
            // Priority: killable, HQ blockers, then all
            let killable: Vec<usize> = targets.iter().copied().filter(|&ti| {
                let t = &units[ti];
                let dt = terrain[t.y as usize][t.x as usize];
                let dist = manhattan(units[ui].x, units[ui].y, t.x, t.y);
                expected_damage(units[ui].unit_type, t.unit_type, dt, units[ui].has_moved, dist) >= t.hp as f64
            }).collect();
            let hq_blockers: Vec<usize> = if let Some((hx, hy)) = enemy_hq {
                targets.iter().copied().filter(|&ti| manhattan(units[ti].x, units[ti].y, hx, hy) <= 1).collect()
            } else { vec![] };
            let priority = if !killable.is_empty() { &killable } else if !hq_blockers.is_empty() { &hq_blockers } else { &targets };
            if let Some(ti) = pick_target(units, terrain, ui, priority) {
                do_attack_internal(rng, units, terrain, ui, ti);
                occupied.push((units[ui].x, units[ui].y));
                if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                continue;
            }
        }

        // Capture if on HQ
        if units[ui].unit_type.can_capture() {
            if let Some((hx, hy)) = enemy_hq {
                if units[ui].x == hx && units[ui].y == hy {
                    if let Some(w) = do_capture_internal(units, buildings, ui) {
                        *winner = Some(w); return;
                    }
                    occupied.push((units[ui].x, units[ui].y));
                    continue;
                }
            }
        }

        // Rush toward HQ
        if units[ui].unit_type.can_capture() {
            if let Some((hx, hy)) = enemy_hq {
                let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, hx, hy);
                if let Some((dx, dy)) = dest {
                    do_move_internal(units, buildings, player, ui, dx, dy);
                }
                if units[ui].x == hx && units[ui].y == hy {
                    if let Some(w) = do_capture_internal(units, buildings, ui) {
                        *winner = Some(w); return;
                    }
                    occupied.push((units[ui].x, units[ui].y));
                    continue;
                }
                let targets = get_attack_targets(units, ui);
                if !targets.is_empty() {
                    if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                        do_attack_internal(rng, units, terrain, ui, ti);
                        if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                    }
                } else {
                    do_wait_internal(units, ui);
                }
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }
        }

        // Tanks: fight nearest
        let enemies = enemy_unit_indices(units, player);
        if !enemies.is_empty() {
            let nearest = *enemies.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
            let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, units[nearest].x, units[nearest].y);
            if let Some((dx, dy)) = dest {
                do_move_internal(units, buildings, player, ui, dx, dy);
            }
            let targets = get_attack_targets(units, ui);
            if !targets.is_empty() {
                if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                    do_attack_internal(rng, units, terrain, ui, ti);
                    if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                }
            } else {
                do_wait_internal(units, ui);
            }
        } else {
            do_wait_internal(units, ui);
        }
        occupied.push((units[ui].x, units[ui].y));
    }
}

fn play_balanced(
    rng: &mut Pcg64Mcg,
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &mut [UnitData],
    buildings: &mut [BuildingData],
    player: i32,
    winner: &mut Option<i32>,
) {
    let own_hq = player_hq_idx(buildings, player).map(|i| (buildings[i].x, buildings[i].y));
    let other = if player == 1 { 2 } else { 1 };
    let enemy_hq = player_hq_idx(buildings, other).map(|i| (buildings[i].x, buildings[i].y));

    let mut order = player_unit_indices(units, player);

    // Designate rusher
    let mut rusher_uid: Option<i32> = None;
    if let Some((hx, hy)) = enemy_hq {
        let capturers: Vec<usize> = order.iter().copied()
            .filter(|&i| units[i].unit_type.can_capture())
            .collect();
        if !capturers.is_empty() {
            let closest = *capturers.iter().min_by_key(|&&i| manhattan(units[i].x, units[i].y, hx, hy)).unwrap();
            if manhattan(units[closest].x, units[closest].y, hx, hy) <= 8 {
                rusher_uid = Some(units[closest].uid);
            }
        }
    }

    // Sort by distance to nearest enemy
    let enemies = enemy_unit_indices(units, player);
    if !enemies.is_empty() {
        order.sort_by_key(|&i| {
            enemies.iter().map(|&ei| manhattan(units[i].x, units[i].y, units[ei].x, units[ei].y)).min().unwrap_or(999)
        });
    }

    let mut occupied: Vec<(i32, i32)> = vec![];

    for &ui in &order {
        if !units[ui].alive() || units[ui].has_acted { continue; }
        let is_rusher = rusher_uid == Some(units[ui].uid);

        // Attack without moving
        let targets = get_attack_targets(units, ui);
        if !targets.is_empty() {
            if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                do_attack_internal(rng, units, terrain, ui, ti);
                occupied.push((units[ui].x, units[ui].y));
                if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                continue;
            }
        }

        // Retreat at 1 HP
        if units[ui].hp == 1 && !is_rusher {
            if let Some((hx, hy)) = own_hq {
                let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, hx, hy);
                if let Some((dx, dy)) = dest {
                    do_move_internal(units, buildings, player, ui, dx, dy);
                }
                do_wait_internal(units, ui);
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }
        }

        // Rusher: beeline HQ
        if is_rusher {
            if let Some((hx, hy)) = enemy_hq {
                if units[ui].x == hx && units[ui].y == hy {
                    if let Some(w) = do_capture_internal(units, buildings, ui) {
                        *winner = Some(w); return;
                    }
                    occupied.push((units[ui].x, units[ui].y));
                    continue;
                }
                let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, hx, hy);
                if let Some((dx, dy)) = dest {
                    do_move_internal(units, buildings, player, ui, dx, dy);
                }
                if units[ui].x == hx && units[ui].y == hy {
                    if let Some(w) = do_capture_internal(units, buildings, ui) {
                        *winner = Some(w); return;
                    }
                    occupied.push((units[ui].x, units[ui].y));
                    continue;
                }
                let targets = get_attack_targets(units, ui);
                if !targets.is_empty() {
                    if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                        do_attack_internal(rng, units, terrain, ui, ti);
                        if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                    }
                } else {
                    do_wait_internal(units, ui);
                }
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }
        }

        // Artillery: kite
        if units[ui].unit_type == UnitType::Artillery {
            let enemies = enemy_unit_indices(units, player);
            let close: Vec<usize> = enemies.iter().copied()
                .filter(|&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y) <= 1)
                .collect();
            if !close.is_empty() {
                let tiles = reachable_tiles_internal(terrain, width, height, units, ui, &occupied);
                let safe: Vec<(i32, i32)> = tiles.keys().copied()
                    .filter(|&(x, y)| close.iter().all(|&ci| manhattan(x, y, units[ci].x, units[ci].y) >= 2))
                    .collect();
                if !safe.is_empty() {
                    let best = *safe.iter().max_by_key(|&&(x, y)| defense_bonus(terrain[y as usize][x as usize])).unwrap();
                    do_move_internal(units, buildings, player, ui, best.0, best.1);
                }
                do_wait_internal(units, ui);
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }
            if !enemies.is_empty() {
                let nearest = *enemies.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
                let pos = find_artillery_position(terrain, width, height, units, ui, &occupied, units[nearest].x, units[nearest].y);
                if let Some((px, py)) = pos {
                    do_move_internal(units, buildings, player, ui, px, py);
                }
                do_wait_internal(units, ui);
                occupied.push((units[ui].x, units[ui].y));
                continue;
            }
            do_wait_internal(units, ui);
            occupied.push((units[ui].x, units[ui].y));
            continue;
        }

        // Infantry/Tank: engage nearest enemy
        let enemies = enemy_unit_indices(units, player);
        if !enemies.is_empty() {
            let nearest = *enemies.iter().min_by_key(|&&ei| manhattan(units[ui].x, units[ui].y, units[ei].x, units[ei].y)).unwrap();
            let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, units[nearest].x, units[nearest].y);
            if let Some((dx, dy)) = dest {
                do_move_internal(units, buildings, player, ui, dx, dy);
            }
            // Capture if on enemy HQ
            if units[ui].unit_type.can_capture() {
                if let Some((hx, hy)) = enemy_hq {
                    if units[ui].x == hx && units[ui].y == hy {
                        if let Some(w) = do_capture_internal(units, buildings, ui) {
                            *winner = Some(w); return;
                        }
                        occupied.push((units[ui].x, units[ui].y));
                        continue;
                    }
                }
            }
            let targets = get_attack_targets(units, ui);
            if !targets.is_empty() {
                if let Some(ti) = pick_target(units, terrain, ui, &targets) {
                    do_attack_internal(rng, units, terrain, ui, ti);
                    if let Some(w) = check_elimination(units, player) { *winner = Some(w); return; }
                }
            } else {
                do_wait_internal(units, ui);
            }
        } else {
            // No enemies, push to HQ
            if units[ui].unit_type.can_capture() {
                if let Some((hx, hy)) = enemy_hq {
                    let dest = best_move_toward_internal(terrain, width, height, units, ui, &occupied, hx, hy);
                    if let Some((dx, dy)) = dest {
                        do_move_internal(units, buildings, player, ui, dx, dy);
                    }
                    if units[ui].x == hx && units[ui].y == hy {
                        if let Some(w) = do_capture_internal(units, buildings, ui) {
                            *winner = Some(w); return;
                        }
                    }
                }
            }
            do_wait_internal(units, ui);
        }
        occupied.push((units[ui].x, units[ui].y));
    }
}

fn play_strategy(
    strategy: StrategyType,
    rng: &mut Pcg64Mcg,
    terrain: &[Vec<TileType>],
    width: i32, height: i32,
    units: &mut [UnitData],
    buildings: &mut [BuildingData],
    player: i32,
    winner: &mut Option<i32>,
) {
    match strategy {
        StrategyType::Aggressive => play_aggressive(rng, terrain, width, height, units, buildings, player, winner),
        StrategyType::Defensive => play_defensive(rng, terrain, width, height, units, buildings, player, winner),
        StrategyType::Rush => play_rush(rng, terrain, width, height, units, buildings, player, winner),
        StrategyType::Balanced => play_balanced(rng, terrain, width, height, units, buildings, player, winner),
    }
}

// ============================================================================
// Map loading
// ============================================================================

fn load_map_internal(name: &str, maps_dir: &str) -> Result<(i32, i32, Vec<Vec<TileType>>, Vec<UnitData>, Vec<BuildingData>), String> {
    let base = PathBuf::from(maps_dir).join(name);
    let terrain_path = base.join("terrain.txt");
    let content = std::fs::read_to_string(&terrain_path)
        .map_err(|e| format!("Failed to read terrain: {}", e))?;

    let mut rows: Vec<Vec<TileType>> = vec![];
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') { continue; }
        let cells: Vec<TileType> = line.split_whitespace()
            .map(|c| TileType::from_char(c.chars().next().unwrap_or('.')))
            .collect();
        rows.push(cells);
    }
    let height = rows.len() as i32;
    let width = if rows.is_empty() { 0 } else { rows[0].len() as i32 };

    // Buildings
    let mut buildings: Vec<BuildingData> = vec![];
    let bpath = base.join("buildings.txt");
    if bpath.is_file() {
        let content = std::fs::read_to_string(&bpath)
            .map_err(|e| format!("Failed to read buildings: {}", e))?;
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') { continue; }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 4 { continue; }
            let btype = parts[0].to_lowercase();
            let owner: i32 = parts[1].parse().unwrap_or(0);
            let bx: i32 = parts[2].parse().unwrap_or(0);
            let by: i32 = parts[3].parse().unwrap_or(0);
            buildings.push(BuildingData { x: bx, y: by, owner, building_type: btype.clone(), capture_player: 0, capture_progress: 0 });
            if btype == "hq" && by >= 0 && by < height && bx >= 0 && bx < width {
                rows[by as usize][bx as usize] = TileType::Hq;
            }
        }
    }

    // Units
    let mut units: Vec<UnitData> = vec![];
    let mut uid = 0i32;
    let upath = base.join("units.txt");
    if upath.is_file() {
        let content = std::fs::read_to_string(&upath)
            .map_err(|e| format!("Failed to read units: {}", e))?;
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') { continue; }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 4 { continue; }
            let ut = UnitType::from_str(parts[0]).ok_or_else(|| format!("Unknown unit type: {}", parts[0]))?;
            let player: i32 = parts[1].parse().unwrap_or(0);
            let ux: i32 = parts[2].parse().unwrap_or(0);
            let uy: i32 = parts[3].parse().unwrap_or(0);
            uid += 1;
            units.push(UnitData { uid, unit_type: ut, player, x: ux, y: uy, hp: ut.hp(), has_moved: false, has_acted: false });
        }
    }

    Ok((width, height, rows, units, buildings))
}

fn list_maps_internal(maps_dir: &str) -> Vec<String> {
    let dir = PathBuf::from(maps_dir);
    let mut maps = vec![];
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let mut names: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with('_') { return None; }
                let terrain = dir.join(&name).join("terrain.txt");
                if terrain.is_file() { Some(name) } else { None }
            })
            .collect();
        names.sort();
        maps = names;
    }
    maps
}

// ============================================================================
// Seed helper
// ============================================================================


// ============================================================================
// PyO3 wrappers
// ============================================================================

#[pyclass]
#[derive(Clone)]
struct Unit {
    #[pyo3(get, set)]
    uid: i32,
    #[pyo3(get, set)]
    x: i32,
    #[pyo3(get, set)]
    y: i32,
    #[pyo3(get, set)]
    hp: i32,
    #[pyo3(get, set)]
    player: i32,
    #[pyo3(get, set)]
    has_moved: bool,
    #[pyo3(get, set)]
    has_acted: bool,
    unit_type_inner: UnitType,
}

#[pymethods]
impl Unit {
    #[getter]
    fn unit_type(&self) -> i32 {
        self.unit_type_inner.to_int()
    }

    #[getter]
    fn unit_type_name(&self) -> &'static str {
        match self.unit_type_inner {
            UnitType::Infantry => "INFANTRY",
            UnitType::Tank => "TANK",
            UnitType::Artillery => "ARTILLERY",
        }
    }

    #[getter]
    fn alive(&self) -> bool { self.hp > 0 }
}

#[pyclass]
#[derive(Clone)]
struct Building {
    #[pyo3(get, set)]
    x: i32,
    #[pyo3(get, set)]
    y: i32,
    #[pyo3(get, set)]
    owner: i32,
    #[pyo3(get, set)]
    building_type: String,
    #[pyo3(get, set)]
    capture_player: i32,
    #[pyo3(get, set)]
    capture_progress: i32,
}

#[pyclass]
struct GameRng {
    inner: Pcg64Mcg,
}

#[pymethods]
impl GameRng {
    #[new]
    fn new(seed: u64) -> Self {
        GameRng { inner: Pcg64Mcg::seed_from_u64(seed) }
    }

    fn randint(&mut self, a: i32, b: i32) -> i32 {
        self.inner.random_range(a..=b)
    }
}

#[pyclass]
struct GameState {
    #[pyo3(get)]
    width: i32,
    #[pyo3(get)]
    height: i32,
    #[pyo3(get, set)]
    current_player: i32,
    #[pyo3(get, set)]
    round_num: i32,
    #[pyo3(get, set)]
    winner: Option<i32>,
    #[pyo3(get, set)]
    map_name: String,
    // Internal data
    terrain: Vec<Vec<TileType>>,
    units: Vec<UnitData>,
    buildings: Vec<BuildingData>,
    next_uid: i32,
}

#[pymethods]
impl GameState {
    fn tile_at(&self, x: i32, y: i32) -> Option<String> {
        if x >= 0 && x < self.width && y >= 0 && y < self.height {
            Some(self.terrain[y as usize][x as usize].to_str().to_string())
        } else {
            None
        }
    }

    fn unit_at(&self, x: i32, y: i32) -> Option<Unit> {
        for u in &self.units {
            if u.alive() && u.x == x && u.y == y {
                return Some(Unit {
                    uid: u.uid, x: u.x, y: u.y, hp: u.hp, player: u.player,
                    has_moved: u.has_moved, has_acted: u.has_acted, unit_type_inner: u.unit_type,
                });
            }
        }
        None
    }

    fn player_units(&self, player: i32) -> Vec<Unit> {
        self.units.iter()
            .filter(|u| u.alive() && u.player == player)
            .map(|u| Unit { uid: u.uid, x: u.x, y: u.y, hp: u.hp, player: u.player,
                            has_moved: u.has_moved, has_acted: u.has_acted, unit_type_inner: u.unit_type })
            .collect()
    }

    fn enemy_units(&self, player: i32) -> Vec<Unit> {
        self.units.iter()
            .filter(|u| u.alive() && u.player != player)
            .map(|u| Unit { uid: u.uid, x: u.x, y: u.y, hp: u.hp, player: u.player,
                            has_moved: u.has_moved, has_acted: u.has_acted, unit_type_inner: u.unit_type })
            .collect()
    }

    fn player_hq(&self, player: i32) -> Option<Building> {
        for b in &self.buildings {
            if b.owner == player && b.building_type == "hq" {
                return Some(Building {
                    x: b.x, y: b.y, owner: b.owner, building_type: b.building_type.clone(),
                    capture_player: b.capture_player, capture_progress: b.capture_progress,
                });
            }
        }
        None
    }

    fn other_player(&self, p: i32) -> i32 {
        if p == 1 { 2 } else { 1 }
    }

    fn next_uid(&mut self) -> i32 {
        self.next_uid += 1;
        self.next_uid
    }

    // Terrain grid access for train.py observation building
    fn terrain_grid(&self) -> Vec<Vec<String>> {
        self.terrain.iter().map(|row| row.iter().map(|t| t.to_str().to_string()).collect()).collect()
    }

    // Access units list (returns snapshots)
    #[getter]
    fn units(&self) -> Vec<Unit> {
        self.units.iter()
            .map(|u| Unit { uid: u.uid, x: u.x, y: u.y, hp: u.hp, player: u.player,
                            has_moved: u.has_moved, has_acted: u.has_acted, unit_type_inner: u.unit_type })
            .collect()
    }

    #[getter]
    fn buildings(&self) -> Vec<Building> {
        self.buildings.iter()
            .map(|b| Building { x: b.x, y: b.y, owner: b.owner, building_type: b.building_type.clone(),
                                capture_player: b.capture_player, capture_progress: b.capture_progress })
            .collect()
    }
}

// ============================================================================
// Free functions exposed to Python
// ============================================================================

#[pyfunction]
#[pyo3(signature = (name, maps_dir=None))]
fn load_map(name: &str, maps_dir: Option<&str>) -> PyResult<GameState> {
    let default_dir = default_maps_dir();
    let dir = maps_dir.unwrap_or(&default_dir);
    let (width, height, terrain, units, buildings) = load_map_internal(name, dir)
        .map_err(|e| PyValueError::new_err(e))?;
    let next_uid = units.iter().map(|u| u.uid).max().unwrap_or(0);
    Ok(GameState {
        width, height, terrain, units, buildings,
        current_player: 1, round_num: 1, winner: None,
        map_name: name.to_string(), next_uid,
    })
}

#[pyfunction]
#[pyo3(signature = (maps_dir=None))]
fn list_maps(maps_dir: Option<&str>) -> Vec<String> {
    let default_dir = default_maps_dir();
    let dir = maps_dir.unwrap_or(&default_dir);
    list_maps_internal(dir)
}

fn default_maps_dir() -> String {
    // Relative to tools/ directory
    std::env::var("HASHFRONT_MAPS_DIR").unwrap_or_else(|_| {
        String::from("contracts/scripts/maps")
    })
}

#[pyfunction]
fn do_move(state: &mut GameState, uid: i32, tx: i32, ty: i32) -> PyResult<()> {
    let idx = state.units.iter().position(|u| u.uid == uid)
        .ok_or_else(|| PyValueError::new_err(format!("No unit with uid {}", uid)))?;
    do_move_internal(&mut state.units, &mut state.buildings, state.current_player, idx, tx, ty);
    Ok(())
}

#[pyfunction]
fn do_attack(state: &mut GameState, rng: &mut GameRng, attacker_uid: i32, defender_uid: i32) -> PyResult<(i32, i32)> {
    let atk_idx = state.units.iter().position(|u| u.uid == attacker_uid)
        .ok_or_else(|| PyValueError::new_err("Attacker not found"))?;
    let def_idx = state.units.iter().position(|u| u.uid == defender_uid)
        .ok_or_else(|| PyValueError::new_err("Defender not found"))?;
    let (dmg_d, dmg_a) = do_attack_internal(&mut rng.inner, &mut state.units, &state.terrain, atk_idx, def_idx);
    // Check elimination
    let atk_player = state.units[atk_idx].player;
    if let Some(w) = check_elimination(&state.units, atk_player) {
        state.winner = Some(w);
    }
    Ok((dmg_d, dmg_a))
}

#[pyfunction]
fn do_capture(state: &mut GameState, uid: i32) -> PyResult<bool> {
    let idx = state.units.iter().position(|u| u.uid == uid)
        .ok_or_else(|| PyValueError::new_err("Unit not found"))?;
    if let Some(w) = do_capture_internal(&state.units, &mut state.buildings, idx) {
        state.winner = Some(w);
        Ok(true)
    } else {
        Ok(false)
    }
}

#[pyfunction]
fn do_wait(state: &mut GameState, uid: i32) -> PyResult<()> {
    let idx = state.units.iter().position(|u| u.uid == uid)
        .ok_or_else(|| PyValueError::new_err("Unit not found"))?;
    do_wait_internal(&mut state.units, idx);
    Ok(())
}

#[pyfunction]
fn end_turn(state: &mut GameState) {
    if let Some(w) = end_turn_internal(&mut state.units, &mut state.current_player, &mut state.round_num) {
        state.winner = Some(w);
    }
}

#[pyfunction]
#[pyo3(signature = (state, uid, occupied=None))]
fn reachable_tiles(state: &GameState, uid: i32, occupied: Option<Vec<(i32, i32)>>) -> PyResult<HashMap<(i32, i32), i32>> {
    let idx = state.units.iter().position(|u| u.uid == uid)
        .ok_or_else(|| PyValueError::new_err("Unit not found"))?;
    let occ = occupied.unwrap_or_default();
    Ok(reachable_tiles_internal(&state.terrain, state.width, state.height, &state.units, idx, &occ))
}

#[pyfunction]
#[pyo3(signature = (state, uid, tx, ty, occupied=None))]
fn best_move_toward(state: &GameState, uid: i32, tx: i32, ty: i32, occupied: Option<Vec<(i32, i32)>>) -> PyResult<Option<(i32, i32)>> {
    let idx = state.units.iter().position(|u| u.uid == uid)
        .ok_or_else(|| PyValueError::new_err("Unit not found"))?;
    let occ = occupied.unwrap_or_default();
    Ok(best_move_toward_internal(&state.terrain, state.width, state.height, &state.units, idx, &occ, tx, ty))
}

#[pyfunction]
fn get_attack_targets_py(state: &GameState, uid: i32) -> PyResult<Vec<Unit>> {
    let idx = state.units.iter().position(|u| u.uid == uid)
        .ok_or_else(|| PyValueError::new_err("Unit not found"))?;
    let targets = get_attack_targets(&state.units, idx);
    Ok(targets.iter().map(|&ti| {
        let u = &state.units[ti];
        Unit { uid: u.uid, x: u.x, y: u.y, hp: u.hp, player: u.player,
               has_moved: u.has_moved, has_acted: u.has_acted, unit_type_inner: u.unit_type }
    }).collect())
}

#[pyfunction]
#[pyo3(signature = (p1_strategy, p2_strategy, map_name, seed, maps_dir=None))]
fn run_game(
    p1_strategy: &str,
    p2_strategy: &str,
    map_name: &str,
    seed: u64,
    maps_dir: Option<&str>,
) -> PyResult<(i32, i32, String)> {
    let s1 = StrategyType::from_str(p1_strategy)
        .ok_or_else(|| PyValueError::new_err(format!("Unknown strategy: {}", p1_strategy)))?;
    let s2 = StrategyType::from_str(p2_strategy)
        .ok_or_else(|| PyValueError::new_err(format!("Unknown strategy: {}", p2_strategy)))?;

    let default_dir = default_maps_dir();
    let dir = maps_dir.unwrap_or(&default_dir);
    let (width, height, terrain, mut units, mut buildings) = load_map_internal(map_name, dir)
        .map_err(|e| PyValueError::new_err(e))?;

    let mut rng = Pcg64Mcg::seed_from_u64(seed);
    let mut winner: Option<i32> = None;
    let mut current_player = 1i32;
    let mut round_num = 1i32;
    let strategies = [s1, s2];

    while winner.is_none() && round_num <= MAX_ROUNDS {
        let strat = strategies[(current_player - 1) as usize];
        play_strategy(strat, &mut rng, &terrain, width, height, &mut units, &mut buildings, current_player, &mut winner);
        if winner.is_none() {
            if let Some(w) = end_turn_internal(&mut units, &mut current_player, &mut round_num) {
                winner = Some(w);
            }
        }
    }

    let final_winner = winner.unwrap_or_else(|| {
        let hp1: i32 = units.iter().filter(|u| u.alive() && u.player == 1).map(|u| u.hp).sum();
        let hp2: i32 = units.iter().filter(|u| u.alive() && u.player == 2).map(|u| u.hp).sum();
        if hp1 >= hp2 { 1 } else { 2 }
    });

    let loser = if final_winner == 1 { 2 } else { 1 };
    let loser_units_alive = units.iter().any(|u| u.alive() && u.player == loser);
    let win_type = if !loser_units_alive {
        "elimination"
    } else if round_num > MAX_ROUNDS {
        "timeout"
    } else {
        "hq_capture"
    };

    Ok((final_winner, round_num, win_type.to_string()))
}

/// Run a game where one side uses a Python callback strategy.
/// The callback receives (GameState, player, GameRng) and should call game actions on the state.
#[pyfunction]
#[pyo3(signature = (p1_strategy, p2_strategy, map_name, seed, maps_dir=None))]
fn run_game_with_callback(
    py: Python<'_>,
    p1_strategy: PyObject,
    p2_strategy: PyObject,
    map_name: &str,
    seed: u64,
    maps_dir: Option<&str>,
) -> PyResult<(i32, i32, String)> {
    // This is for mixed native/Python strategies
    // If the strategy is a string, use native; if callable, use Python callback
    let default_dir = default_maps_dir();
    let dir = maps_dir.unwrap_or(&default_dir);
    let (width, height, terrain, mut units, mut buildings) = load_map_internal(map_name, dir)
        .map_err(|e| PyValueError::new_err(e))?;

    let mut rng = Pcg64Mcg::seed_from_u64(seed);
    let mut winner: Option<i32> = None;
    let mut current_player = 1i32;
    let mut round_num = 1i32;

    let s1_native = p1_strategy.extract::<String>(py).ok().and_then(|s| StrategyType::from_str(&s));
    let s2_native = p2_strategy.extract::<String>(py).ok().and_then(|s| StrategyType::from_str(&s));

    while winner.is_none() && round_num <= MAX_ROUNDS {
        let is_p1 = current_player == 1;
        let native = if is_p1 { s1_native } else { s2_native };

        if let Some(strat) = native {
            play_strategy(strat, &mut rng, &terrain, width, height, &mut units, &mut buildings, current_player, &mut winner);
        } else {
            // Python callback — need to create a temporary GameState, call the callback, and sync back
            let callback = if is_p1 { &p1_strategy } else { &p2_strategy };
            // We need to pass a mutable GameState to Python — use Py<GameState>
            let py_gs = Py::new(py, GameState {
                width, height, terrain: terrain.clone(), units: units.clone(), buildings: buildings.clone(),
                current_player, round_num, winner: None, map_name: map_name.to_string(),
                next_uid: units.iter().map(|u| u.uid).max().unwrap_or(0),
            })?;
            let py_rng = Py::new(py, GameRng { inner: Pcg64Mcg::seed_from_u64(rng.random::<u64>()) })?;

            callback.call1(py, (py_gs.clone_ref(py), current_player, py_rng))?;

            // Sync state back
            let borrowed = py_gs.borrow(py);
            units = borrowed.units.clone();
            buildings = borrowed.buildings.clone();
            winner = borrowed.winner;
            // Don't sync round_num/current_player — that's done by end_turn
        }

        if winner.is_none() {
            if let Some(w) = end_turn_internal(&mut units, &mut current_player, &mut round_num) {
                winner = Some(w);
            }
        }
    }

    let final_winner = winner.unwrap_or_else(|| {
        let hp1: i32 = units.iter().filter(|u| u.alive() && u.player == 1).map(|u| u.hp).sum();
        let hp2: i32 = units.iter().filter(|u| u.alive() && u.player == 2).map(|u| u.hp).sum();
        if hp1 >= hp2 { 1 } else { 2 }
    });

    let loser = if final_winner == 1 { 2 } else { 1 };
    let loser_units_alive = units.iter().any(|u| u.alive() && u.player == loser);
    let win_type = if !loser_units_alive {
        "elimination"
    } else if round_num > MAX_ROUNDS {
        "timeout"
    } else {
        "hq_capture"
    };

    Ok((final_winner, round_num, win_type.to_string()))
}

// Fast batch game runner for training
#[pyfunction]
#[pyo3(signature = (p1_strategy, p2_strategy, map_name, seed, maps_dir=None))]
fn run_native_game(
    p1_strategy: &str,
    p2_strategy: &str,
    map_name: &str,
    seed: u64,
    maps_dir: Option<&str>,
) -> PyResult<(i32, i32, String)> {
    run_game(p1_strategy, p2_strategy, map_name, seed, maps_dir)
}

// Expose constants as dicts
#[pyfunction]
fn get_constants(py: Python<'_>) -> PyResult<PyObject> {
    let dict = PyDict::new(py);

    let unit_hp = PyDict::new(py);
    unit_hp.set_item(1, 10)?;
    unit_hp.set_item(2, 10)?;
    unit_hp.set_item(3, 10)?;
    dict.set_item("UNIT_HP", unit_hp)?;

    let unit_move = PyDict::new(py);
    unit_move.set_item(1, 2)?;
    unit_move.set_item(2, 3)?;
    unit_move.set_item(3, 3)?;
    dict.set_item("UNIT_MOVE", unit_move)?;

    dict.set_item("CAPTURE_THRESHOLD", CAPTURE_THRESHOLD)?;
    dict.set_item("MAX_ROUNDS", MAX_ROUNDS)?;

    Ok(dict.into())
}

#[pyfunction]
fn compute_hit_chance_py(atk_type: i32, def_tile: &str, moved: bool, distance: i32) -> PyResult<i32> {
    let ut = match atk_type {
        1 => UnitType::Infantry,
        2 => UnitType::Tank,
        3 => UnitType::Artillery,
        _ => return Err(PyValueError::new_err("Invalid unit type")),
    };
    let tile = TileType::from_str(def_tile).ok_or_else(|| PyValueError::new_err("Invalid tile type"))?;
    Ok(compute_hit_chance(ut, tile, moved, distance))
}

#[pyfunction]
fn expected_damage_py(atk_type: i32, def_type: i32, def_tile: &str, moved: bool, distance: i32) -> PyResult<f64> {
    let at = match atk_type { 1 => UnitType::Infantry, 2 => UnitType::Tank, 3 => UnitType::Artillery, _ => return Err(PyValueError::new_err("Invalid")) };
    let dt = match def_type { 1 => UnitType::Infantry, 2 => UnitType::Tank, 3 => UnitType::Artillery, _ => return Err(PyValueError::new_err("Invalid")) };
    let tile = TileType::from_str(def_tile).ok_or_else(|| PyValueError::new_err("Invalid tile"))?;
    Ok(expected_damage(at, dt, tile, moved, distance))
}

#[pyfunction]
fn manhattan_py(x1: i32, y1: i32, x2: i32, y2: i32) -> i32 {
    manhattan(x1, y1, x2, y2)
}

#[pyfunction]
fn can_capture_py(unit_type: i32) -> bool {
    match unit_type {
        1 => true, // Infantry
        _ => false,
    }
}

#[pyfunction]
fn defense_bonus_py(tile: &str) -> PyResult<i32> {
    let t = TileType::from_str(tile).ok_or_else(|| PyValueError::new_err("Invalid tile type"))?;
    Ok(defense_bonus(t))
}

#[pyfunction]
fn play_heuristic_turn(state: &mut GameState, player: i32, strategy_name: &str, rng: &mut GameRng) -> PyResult<()> {
    let strat = StrategyType::from_str(strategy_name)
        .ok_or_else(|| PyValueError::new_err(format!("Unknown strategy: {}", strategy_name)))?;
    let mut winner = state.winner;
    play_strategy(strat, &mut rng.inner, &state.terrain, state.width, state.height,
                  &mut state.units, &mut state.buildings, player, &mut winner);
    state.winner = winner;
    Ok(())
}

// ============================================================================
// Module
// ============================================================================

#[pymodule]
fn hashfront_sim(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<GameState>()?;
    m.add_class::<Unit>()?;
    m.add_class::<Building>()?;
    m.add_class::<GameRng>()?;
    m.add_function(wrap_pyfunction!(load_map, m)?)?;
    m.add_function(wrap_pyfunction!(list_maps, m)?)?;
    m.add_function(wrap_pyfunction!(do_move, m)?)?;
    m.add_function(wrap_pyfunction!(do_attack, m)?)?;
    m.add_function(wrap_pyfunction!(do_capture, m)?)?;
    m.add_function(wrap_pyfunction!(do_wait, m)?)?;
    m.add_function(wrap_pyfunction!(end_turn, m)?)?;
    m.add_function(wrap_pyfunction!(reachable_tiles, m)?)?;
    m.add_function(wrap_pyfunction!(best_move_toward, m)?)?;
    m.add_function(wrap_pyfunction!(get_attack_targets_py, m)?)?;
    m.add_function(wrap_pyfunction!(run_game, m)?)?;
    m.add_function(wrap_pyfunction!(run_native_game, m)?)?;
    m.add_function(wrap_pyfunction!(run_game_with_callback, m)?)?;
    m.add_function(wrap_pyfunction!(get_constants, m)?)?;
    m.add_function(wrap_pyfunction!(compute_hit_chance_py, m)?)?;
    m.add_function(wrap_pyfunction!(expected_damage_py, m)?)?;
    m.add_function(wrap_pyfunction!(manhattan_py, m)?)?;
    m.add_function(wrap_pyfunction!(can_capture_py, m)?)?;
    m.add_function(wrap_pyfunction!(defense_bonus_py, m)?)?;
    m.add_function(wrap_pyfunction!(play_heuristic_turn, m)?)?;

    // Unit type constants (integers matching UnitType enum values)
    m.add("INFANTRY", 1)?;
    m.add("TANK", 2)?;
    m.add("ARTILLERY", 3)?;

    // Constant dicts keyed by unit type int
    let py = m.py();
    let unit_hp = PyDict::new(py);
    unit_hp.set_item(1, 10)?; unit_hp.set_item(2, 10)?; unit_hp.set_item(3, 10)?;
    m.add("UNIT_HP", unit_hp)?;

    let unit_min_range = PyDict::new(py);
    unit_min_range.set_item(1, 1)?; unit_min_range.set_item(2, 1)?; unit_min_range.set_item(3, 2)?;
    m.add("UNIT_MIN_RANGE", unit_min_range)?;

    let unit_max_range = PyDict::new(py);
    unit_max_range.set_item(1, 1)?; unit_max_range.set_item(2, 1)?; unit_max_range.set_item(3, 3)?;
    m.add("UNIT_MAX_RANGE", unit_max_range)?;

    Ok(())
}
