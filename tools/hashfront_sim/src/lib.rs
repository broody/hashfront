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
#[derive(Clone)]
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
    fn clone_state(&self) -> GameState {
        self.clone()
    }

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
// Training helper internals
// ============================================================================

const MAX_TILE_CANDIDATES: usize = 12;
const BOARD_CHANNELS: usize = 18;

const ACTION_TYPES: [&str; 6] = [
    "wait",
    "move_wait",
    "attack",
    "move_attack",
    "capture",
    "move_capture",
];

fn find_building_internal(buildings: &[BuildingData], x: i32, y: i32) -> Option<&BuildingData> {
    buildings.iter().find(|b| b.x == x && b.y == y)
}

/// current_metrics: (own_hp, enemy_hp, own_count, enemy_count)
fn current_metrics(units: &[UnitData], player: i32) -> (i32, i32, i32, i32) {
    let mut own_hp = 0i32;
    let mut enemy_hp = 0i32;
    let mut own_count = 0i32;
    let mut enemy_count = 0i32;
    for u in units {
        if !u.alive() { continue; }
        if u.player == player {
            own_hp += u.hp;
            own_count += 1;
        } else {
            enemy_hp += u.hp;
            enemy_count += 1;
        }
    }
    (own_hp, enemy_hp, own_count, enemy_count)
}

fn one_hot(index: usize, size: usize) -> Vec<f32> {
    let mut v = vec![0.0f32; size];
    if index < size {
        v[index] = 1.0;
    }
    v
}

/// Build danger maps for each of the three unit types.
/// Returns HashMap<UnitType, Vec<Vec<f32>>> where each value is height x width.
fn build_danger_maps_internal(
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &[UnitData],
    _buildings: &[BuildingData],
    player: i32,
) -> HashMap<UnitType, Vec<Vec<f32>>> {
    let mut danger_by_type: HashMap<UnitType, Vec<Vec<f32>>> = HashMap::new();
    for &ut in &[UnitType::Infantry, UnitType::Tank, UnitType::Artillery] {
        danger_by_type.insert(ut, vec![vec![0.0f32; width as usize]; height as usize]);
    }

    // Iterate over enemy units
    for (ei, enemy) in units.iter().enumerate() {
        if !enemy.alive() || enemy.player == player { continue; }

        // Candidate tiles: enemy's current position + reachable tiles (if not artillery)
        let mut candidate_tiles: Vec<(i32, i32)> = vec![(enemy.x, enemy.y)];
        if enemy.unit_type != UnitType::Artillery {
            // Use empty occupied to compute reachable from enemy perspective
            let reached = reachable_tiles_internal(terrain, width, height, units, ei, &[]);
            for &(rx, ry) in reached.keys() {
                candidate_tiles.push((rx, ry));
            }
        }

        let min_range = enemy.unit_type.min_range();
        let max_range = enemy.unit_type.max_range();

        for &(ex, ey) in &candidate_tiles {
            let moved = (ex, ey) != (enemy.x, enemy.y);
            for tx in (ex - max_range).max(0)..=(ex + max_range).min(width - 1) {
                for ty in (ey - max_range).max(0)..=(ey + max_range).min(height - 1) {
                    let distance = manhattan(ex, ey, tx, ty);
                    if distance < min_range || distance > max_range { continue; }
                    let tile = terrain[ty as usize][tx as usize];
                    for (&defender_type, danger_grid) in danger_by_type.iter_mut() {
                        let dmg = expected_damage(
                            enemy.unit_type,
                            defender_type,
                            tile,
                            moved,
                            distance,
                        );
                        danger_grid[ty as usize][tx as usize] += dmg as f32;
                    }
                }
            }
        }
    }

    danger_by_type
}

/// Encode the board into a flat f32 buffer of size BOARD_CHANNELS * max_height * max_width (CHW layout).
fn encode_board_internal(
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &[UnitData],
    buildings: &[BuildingData],
    player: i32,
    focus_uid: i32,
    max_width: usize,
    max_height: usize,
    _round_num: i32,
) -> Vec<f32> {
    let total = BOARD_CHANNELS * max_height * max_width;
    let mut board = vec![0.0f32; total];

    // Helper to index into CHW flat buffer
    let idx = |c: usize, y: usize, x: usize| -> usize {
        c * max_height * max_width + y * max_width + x
    };

    // Channels 0-3: terrain
    for y in 0..height.min(max_height as i32) as usize {
        for x in 0..width.min(max_width as i32) as usize {
            let tile = terrain[y][x];
            // Channel 0: defense_bonus / 2.0
            board[idx(0, y, x)] = defense_bonus(tile) as f32 / 2.0;
            // Channel 1: road
            board[idx(1, y, x)] = if matches!(tile, TileType::Road | TileType::DirtRoad) { 1.0 } else { 0.0 };
            // Channel 2: mountain
            board[idx(2, y, x)] = if tile == TileType::Mountain { 1.0 } else { 0.0 };
            // Channel 3: tree
            board[idx(3, y, x)] = if tile == TileType::Tree { 1.0 } else { 0.0 };
        }
    }

    // Channel 13/14: buildings (friendly / enemy)
    for b in buildings {
        let bx = b.x as usize;
        let by = b.y as usize;
        if bx < max_width && by < max_height {
            if b.owner == player {
                board[idx(13, by, bx)] = 1.0;
            } else {
                board[idx(14, by, bx)] = 1.0;
            }
        }
    }

    // Unit channels
    // Friendly: base channel by type (Infantry=4, Tank=5, Artillery=6), hp channel=7, actionable channel=8
    // Enemy: base channel by type (Infantry=9, Tank=10, Artillery=11), hp channel=12
    // Channel 15: focus unit
    let friendly_base = |ut: UnitType| -> usize {
        match ut { UnitType::Infantry => 4, UnitType::Tank => 5, UnitType::Artillery => 6 }
    };
    let enemy_base = |ut: UnitType| -> usize {
        match ut { UnitType::Infantry => 9, UnitType::Tank => 10, UnitType::Artillery => 11 }
    };

    for u in units {
        if !u.alive() { continue; }
        let ux = u.x as usize;
        let uy = u.y as usize;
        if ux >= max_width || uy >= max_height { continue; }

        if u.player == player {
            let base = friendly_base(u.unit_type);
            board[idx(base, uy, ux)] = 1.0;
            board[idx(7, uy, ux)] = u.hp as f32 / u.unit_type.hp() as f32;
            board[idx(8, uy, ux)] = if u.has_acted { 0.0 } else { 1.0 };
        } else {
            let base = enemy_base(u.unit_type);
            board[idx(base, uy, ux)] = 1.0;
            board[idx(12, uy, ux)] = u.hp as f32 / u.unit_type.hp() as f32;
        }

        if u.uid == focus_uid {
            board[idx(15, uy, ux)] = 1.0;
        }
    }


    // Threat Maps (Channels 16 & 17)
    // 16: Friendly Threat (tiles reachable/attackable by player)
    // 17: Enemy Threat (tiles reachable/attackable by other player)
    let other = if player == 1 { 2 } else { 1 };

    for (p, chan) in [(player, 16), (other, 17)] {
        for (ui, u) in units.iter().enumerate() {
            if !u.alive() || u.player != p { continue; }

            let mut reached = if u.unit_type != UnitType::Artillery {
                reachable_tiles_internal(terrain, width, height, units, ui, &[])
            } else {
                HashMap::new()
            };
            reached.insert((u.x, u.y), 0);

            for (&(rx, ry), _) in reached.iter() {
                if rx >= 0 && rx < width && ry >= 0 && ry < height {
                    board[idx(chan, ry as usize, rx as usize)] = 1.0;
                }

                let mn = u.unit_type.min_range();
                let mx = u.unit_type.max_range();
                for tx in (rx - mx).max(0)..=(rx + mx).min(width - 1) {
                    for ty in (ry - mx).max(0)..=(ry + mx).min(height - 1) {
                        let d = (rx - tx).abs() + (ry - ty).abs();
                        if mn <= d && d <= mx {
                            board[idx(chan, ty as usize, tx as usize)] = 1.0;
                        }
                    }
                }
            }
        }
    }

    board
}

/// Choose the rusher: closest capturable unit to enemy HQ.
fn choose_rusher_internal(
    units: &[UnitData],
    buildings: &[BuildingData],
    player: i32,
) -> Option<i32> {
    let other = if player == 1 { 2 } else { 1 };
    let enemy_hq = buildings.iter().find(|b| b.owner == other && b.building_type == "hq")?;

    let mut best_uid: Option<i32> = None;
    let mut best_dist = i32::MAX;
    for u in units {
        if !u.alive() || u.player != player { continue; }
        if !u.unit_type.can_capture() { continue; }
        let d = manhattan(u.x, u.y, enemy_hq.x, enemy_hq.y);
        if d < best_dist {
            best_dist = d;
            best_uid = Some(u.uid);
        }
    }
    best_uid
}

/// Unit ordering for the turn.
fn unit_order_internal(
    units: &[UnitData],
    _buildings: &[BuildingData],
    width: i32,
    height: i32,
    player: i32,
    rusher_uid: Option<i32>,
) -> Vec<usize> {
    // Collect enemy positions for nearest-enemy computation
    let enemies: Vec<(i32, i32)> = units.iter()
        .filter(|u| u.alive() && u.player != player)
        .map(|u| (u.x, u.y))
        .collect();

    let max_dist = width + height;

    let mut own_indices: Vec<usize> = units.iter().enumerate()
        .filter(|(_, u)| u.alive() && u.player == player)
        .map(|(i, _)| i)
        .collect();

    own_indices.sort_by(|&a, &b| {
        let ua = &units[a];
        let ub = &units[b];

        let rusher_a = if rusher_uid == Some(ua.uid) { 0 } else { 1 };
        let rusher_b = if rusher_uid == Some(ub.uid) { 0 } else { 1 };

        let ne_a = enemies.iter().map(|&(ex, ey)| manhattan(ua.x, ua.y, ex, ey)).min().unwrap_or(max_dist);
        let ne_b = enemies.iter().map(|&(ex, ey)| manhattan(ub.x, ub.y, ex, ey)).min().unwrap_or(max_dist);

        let type_pri = |ut: UnitType| -> i32 {
            match ut { UnitType::Artillery => 0, UnitType::Tank => 1, UnitType::Infantry => 2 }
        };

        let key_a = (rusher_a, ne_a, type_pri(ua.unit_type), -ua.hp);
        let key_b = (rusher_b, ne_b, type_pri(ub.unit_type), -ub.hp);
        key_a.cmp(&key_b)
    });

    own_indices
}

/// Action priority key for a tile (used to rank which tiles to consider).
fn action_priority_key_internal(
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &[UnitData],
    buildings: &[BuildingData],
    player: i32,
    unit_idx: usize,
    tile: (i32, i32),
    danger_map: &[Vec<f32>],
    rusher_uid: Option<i32>,
) -> f64 {
    let unit = &units[unit_idx];
    let (x, y) = tile;
    let tile_defense = defense_bonus(terrain[y as usize][x as usize]) as f64;
    let danger = danger_map[y as usize][x as usize] as f64;

    let other = if player == 1 { 2 } else { 1 };
    let enemies: Vec<(i32, i32)> = units.iter()
        .filter(|u| u.alive() && u.player != player)
        .map(|u| (u.x, u.y))
        .collect();

    let nearest_enemy = enemies.iter()
        .map(|&(ex, ey)| manhattan(x, y, ex, ey))
        .min()
        .unwrap_or(width + height) as f64;

    let enemy_hq = buildings.iter().find(|b| b.owner == other && b.building_type == "hq");
    let enemy_hq_dist = enemy_hq.map(|h| manhattan(x, y, h.x, h.y) as f64)
        .unwrap_or((width + height) as f64);

    let own_hq = buildings.iter().find(|b| b.owner == player && b.building_type == "hq");
    let own_hq_dist = own_hq.map(|h| manhattan(x, y, h.x, h.y) as f64).unwrap_or(0.0);

    let hp_bias = if unit.hp <= 1 {
        0.7 * nearest_enemy
    } else {
        -0.4 * nearest_enemy
    };

    let rusher_bias = if rusher_uid == Some(unit.uid) {
        -enemy_hq_dist
    } else {
        0.0
    };

    tile_defense * 1.4 - danger * 0.8 + hp_bias + rusher_bias - own_hq_dist * 0.15
}

/// Get candidate attack targets from position (move_to) for a unit.
fn candidate_targets_internal(
    units: &[UnitData],
    unit_idx: usize,
    move_to: (i32, i32),
) -> Vec<usize> {
    let unit = &units[unit_idx];
    let (x, y) = move_to;
    let moved = (x, y) != (unit.x, unit.y);
    if unit.unit_type == UnitType::Artillery && moved {
        return vec![];
    }

    let min_range = unit.unit_type.min_range();
    let max_range = unit.unit_type.max_range();
    let mut targets = vec![];
    for (i, enemy) in units.iter().enumerate() {
        if !enemy.alive() || enemy.player == unit.player { continue; }
        let distance = manhattan(x, y, enemy.x, enemy.y);
        if min_range <= distance && distance <= max_range {
            targets.push(i);
        }
    }
    targets
}

/// Score a candidate action (heuristic).
fn score_candidate_internal(
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &[UnitData],
    buildings: &[BuildingData],
    player: i32,
    unit_idx: usize,
    move_to: (i32, i32),
    target_idx: Option<usize>,
    kind: &str,
    danger_map: &[Vec<f32>],
    rusher_uid: Option<i32>,
) -> f64 {
    let unit = &units[unit_idx];
    let other = if player == 1 { 2 } else { 1 };
    let (x, y) = move_to;
    let moved = (x, y) != (unit.x, unit.y);
    let defense = defense_bonus(terrain[y as usize][x as usize]) as f64;
    let danger = danger_map[y as usize][x as usize] as f64;

    let enemies: Vec<(i32, i32)> = units.iter()
        .filter(|u| u.alive() && u.player != player)
        .map(|u| (u.x, u.y))
        .collect();

    let nearest_enemy = enemies.iter()
        .map(|&(ex, ey)| manhattan(x, y, ex, ey))
        .min()
        .unwrap_or(width + height) as f64;

    let own_hq = buildings.iter().find(|b| b.owner == player && b.building_type == "hq");
    let enemy_hq = buildings.iter().find(|b| b.owner == other && b.building_type == "hq");

    let own_hq_dist = own_hq.map(|h| manhattan(x, y, h.x, h.y) as f64).unwrap_or(0.0);
    let enemy_hq_dist = enemy_hq.map(|h| manhattan(x, y, h.x, h.y) as f64)
        .unwrap_or((width + height) as f64);

    let mut score = defense * 1.2 - danger * 1.0;

    if let Some(ti) = target_idx {
        let target = &units[ti];
        let distance = manhattan(x, y, target.x, target.y);
        let damage = expected_damage(
            unit.unit_type,
            target.unit_type,
            terrain[target.y as usize][target.x as usize],
            moved,
            distance,
        );
        let mut counter = 0.0f64;
        if damage < target.hp as f64 {
            let target_min = target.unit_type.min_range();
            let target_max = target.unit_type.max_range();
            if target_min <= distance && distance <= target_max {
                counter = expected_damage(
                    target.unit_type,
                    unit.unit_type,
                    terrain[y as usize][x as usize],
                    false,
                    distance,
                );
            }
        }
        score += damage * 4.3 - counter * 2.6;
        if damage >= target.hp as f64 {
            score += 7.5;
        }
        if target.unit_type == UnitType::Tank {
            score += 2.5;
        } else if target.unit_type == UnitType::Artillery {
            score += 1.3;
        }
    }

    if kind.contains("capture") {
        score += 13.0;
        if let Some(ehq) = enemy_hq {
            if x == ehq.x && y == ehq.y {
                score += 22.0;
            }
        }
    }

    if unit.hp <= 1 {
        score += nearest_enemy * 0.8 - own_hq_dist * 0.5;
    } else if unit.unit_type == UnitType::Artillery {
        score += 2.5 - 1.3 * (nearest_enemy - 2.5).abs();
    } else if unit.unit_type == UnitType::Tank {
        score -= nearest_enemy * 0.45;
    } else {
        score -= nearest_enemy * 0.28;
    }

    if unit.unit_type.can_capture() {
        if let Some(ehq) = enemy_hq {
            if rusher_uid == Some(unit.uid) {
                score -= enemy_hq_dist * 0.95;
            } else {
                score -= enemy_hq_dist * 0.25;
            }
            if x == ehq.x && y == ehq.y {
                score += 6.0;
            }
        }
    }

    if let Some(ohq) = own_hq {
        let closest_enemy_to_hq = enemies.iter()
            .map(|&(ex, ey)| manhattan(ex, ey, ohq.x, ohq.y))
            .min()
            .unwrap_or(99);
        if closest_enemy_to_hq <= 5 {
            score -= own_hq_dist * 0.35;
        }
    }

    if kind.ends_with("wait") {
        score -= 0.4;
    }

    score
}

/// Build the candidate feature vector.
fn candidate_feature_vector_internal(
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &[UnitData],
    buildings: &[BuildingData],
    player: i32,
    unit_idx: usize,
    move_to: (i32, i32),
    target_idx: Option<usize>,
    kind: &str,
    danger_map: &[Vec<f32>],
    heuristic_score: f64,
    rusher_uid: Option<i32>,
    round_num: i32,
) -> Vec<f32> {
    let unit = &units[unit_idx];
    let other = if player == 1 { 2 } else { 1 };
    let (x, y) = move_to;
    let moved_f = if (x, y) != (unit.x, unit.y) { 1.0f32 } else { 0.0f32 };
    let moved_bool = moved_f != 0.0;

    // Action one-hot (6 elements)
    let action_idx = ACTION_TYPES.iter().position(|&a| a == kind).unwrap_or(0);
    let action_one_hot = one_hot(action_idx, 6);

    // Unit type one-hot (3 elements)
    let unit_type_idx = match unit.unit_type {
        UnitType::Infantry => 0,
        UnitType::Tank => 1,
        UnitType::Artillery => 2,
    };
    let unit_one_hot = one_hot(unit_type_idx, 3);

    // Target info
    let (target_one_hot, target_hp, damage, counter, kill_flag);
    if let Some(ti) = target_idx {
        let target = &units[ti];
        let t_idx = match target.unit_type {
            UnitType::Infantry => 0,
            UnitType::Tank => 1,
            UnitType::Artillery => 2,
        };
        target_one_hot = one_hot(t_idx, 4);
        let distance = manhattan(x, y, target.x, target.y);
        let dmg = expected_damage(
            unit.unit_type,
            target.unit_type,
            terrain[target.y as usize][target.x as usize],
            moved_bool,
            distance,
        );
        let mut cnt = 0.0f64;
        if dmg < target.hp as f64 {
            let t_min = target.unit_type.min_range();
            let t_max = target.unit_type.max_range();
            if t_min <= distance && distance <= t_max {
                cnt = expected_damage(
                    target.unit_type,
                    unit.unit_type,
                    terrain[y as usize][x as usize],
                    false,
                    distance,
                );
            }
        }
        target_hp = target.hp as f32 / target.unit_type.hp() as f32;
        damage = dmg as f32;
        counter = cnt as f32;
        kill_flag = if dmg >= target.hp as f64 { 1.0f32 } else { 0.0f32 };
    } else {
        target_one_hot = one_hot(3, 4); // no-target slot
        target_hp = 0.0;
        damage = 0.0;
        counter = 0.0;
        kill_flag = 0.0;
    }

    // Collect enemy / ally positions
    let own_units: Vec<(i32, i32, i32)> = units.iter()
        .filter(|u| u.alive() && u.player == player)
        .map(|u| (u.x, u.y, u.uid))
        .collect();
    let enemy_units: Vec<(i32, i32)> = units.iter()
        .filter(|u| u.alive() && u.player != player)
        .map(|u| (u.x, u.y))
        .collect();

    let max_dist = (width + height) as f32;

    let nearest_enemy = enemy_units.iter()
        .map(|&(ex, ey)| manhattan(x, y, ex, ey))
        .min()
        .unwrap_or(width + height) as f32;

    let own_support = own_units.iter()
        .filter(|&&(ax, ay, aid)| aid != unit.uid && manhattan(x, y, ax, ay) <= 2)
        .count() as f32;

    let enemy_support = enemy_units.iter()
        .filter(|&&(ex, ey)| manhattan(x, y, ex, ey) <= 2)
        .count() as f32;

    let defense = defense_bonus(terrain[y as usize][x as usize]) as f32 / 2.0;
    let danger = danger_map[y as usize][x as usize] / 8.0;

    let own_hq = buildings.iter().find(|b| b.owner == player && b.building_type == "hq");
    let enemy_hq = buildings.iter().find(|b| b.owner == other && b.building_type == "hq");

    let mut enemy_hq_dist = 0.0f32;
    let mut own_hq_dist = 0.0f32;
    let mut delta_enemy_hq = 0.0f32;

    if let Some(ehq) = enemy_hq {
        enemy_hq_dist = manhattan(x, y, ehq.x, ehq.y) as f32 / max_dist;
        delta_enemy_hq = (manhattan(unit.x, unit.y, ehq.x, ehq.y) - manhattan(x, y, ehq.x, ehq.y)) as f32 / max_dist;
    }
    if let Some(ohq) = own_hq {
        own_hq_dist = manhattan(x, y, ohq.x, ohq.y) as f32 / max_dist;
    }

    // delta_enemy: change in nearest enemy distance
    let orig_nearest_enemy = enemy_units.iter()
        .map(|&(ex, ey)| manhattan(unit.x, unit.y, ex, ey))
        .min()
        .unwrap_or(width + height) as f32;
    let delta_enemy = (orig_nearest_enemy - nearest_enemy) / max_dist;

    let (own_hp, enemy_hp, own_count, enemy_count) = current_metrics(units, player);

    let on_enemy_hq = if let Some(ehq) = enemy_hq { if x == ehq.x && y == ehq.y { 1.0f32 } else { 0.0 } } else { 0.0 };
    let on_own_hq = if let Some(ohq) = own_hq { if x == ohq.x && y == ohq.y { 1.0f32 } else { 0.0 } } else { 0.0 };
    let capture_flag = if kind.contains("capture") { 1.0f32 } else { 0.0 };
    let is_rusher = if rusher_uid == Some(unit.uid) { 1.0f32 } else { 0.0 };

    let mut features = Vec::with_capacity(36);
    features.extend_from_slice(&action_one_hot);      // 6
    features.extend_from_slice(&unit_one_hot);         // 3
    features.extend_from_slice(&target_one_hot);       // 4
    features.push(unit.hp as f32 / unit.unit_type.hp() as f32);
    features.push(target_hp);
    features.push(moved_f);
    features.push(defense);
    features.push(danger);
    features.push(own_support / 4.0);
    features.push(enemy_support / 4.0);
    features.push(nearest_enemy / max_dist);
    features.push(enemy_hq_dist);
    features.push(own_hq_dist);
    features.push(delta_enemy_hq);
    features.push(delta_enemy);
    features.push(damage / 5.0);
    features.push(counter / 5.0);
    features.push(kill_flag);
    features.push(capture_flag);
    features.push(on_enemy_hq);
    features.push(on_own_hq);
    features.push(is_rusher);
    features.push(round_num as f32 / 30.0);
    features.push(((own_count - enemy_count) as f32 / 6.0).clamp(-1.0, 1.0));
    features.push(((own_hp - enemy_hp) as f32 / 15.0).clamp(-1.0, 1.0));
    features.push(heuristic_score as f32 / 20.0);

    features
}

/// Enumerate all candidate actions for a unit, returning (kind, move_to, target_uid, features, heuristic_score).
fn enumerate_candidates_internal(
    terrain: &[Vec<TileType>],
    width: i32,
    height: i32,
    units: &[UnitData],
    buildings: &[BuildingData],
    player: i32,
    unit_idx: usize,
    danger_map: &[Vec<f32>],
    rusher_uid: Option<i32>,
    round_num: i32,
) -> Vec<(String, (i32, i32), Option<i32>, Vec<f32>, f64)> {
    let unit = &units[unit_idx];

    // Score the unit's current tile and all reachable tiles
    let mut tile_scores: Vec<((i32, i32), f64)> = Vec::new();

    let current_tile = (unit.x, unit.y);
    let current_score = action_priority_key_internal(
        terrain, width, height, units, buildings, player,
        unit_idx, current_tile, danger_map, rusher_uid,
    );
    tile_scores.push((current_tile, current_score));

    let reached = reachable_tiles_internal(terrain, width, height, units, unit_idx, &[]);
    for &tile in reached.keys() {
        let score = action_priority_key_internal(
            terrain, width, height, units, buildings, player,
            unit_idx, tile, danger_map, rusher_uid,
        );
        tile_scores.push((tile, score));
    }

    // Sort by score descending, take top MAX_TILE_CANDIDATES
    tile_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let mut ranked_tiles: Vec<(i32, i32)> = tile_scores.iter()
        .take(MAX_TILE_CANDIDATES)
        .map(|&(t, _)| t)
        .collect();

    // Ensure current tile is included
    if !ranked_tiles.contains(&current_tile) {
        ranked_tiles.push(current_tile);
    }

    let mut candidates: Vec<(String, (i32, i32), Option<i32>, Vec<f32>, f64)> = Vec::new();
    let mut seen: std::collections::HashSet<(String, (i32, i32), Option<i32>)> = std::collections::HashSet::new();

    for &tile in &ranked_tiles {
        let moved = tile != current_tile;

        // Check for capture
        if let Some(building) = find_building_internal(buildings, tile.0, tile.1) {
            if building.owner != player && unit.unit_type.can_capture() {
                let kind = if moved { "move_capture" } else { "capture" };
                let heuristic = score_candidate_internal(
                    terrain, width, height, units, buildings, player,
                    unit_idx, tile, None, kind, danger_map, rusher_uid,
                );
                let key = (kind.to_string(), tile, None);
                if !seen.contains(&key) {
                    let features = candidate_feature_vector_internal(
                        terrain, width, height, units, buildings, player,
                        unit_idx, tile, None, kind, danger_map, heuristic,
                        rusher_uid, round_num,
                    );
                    seen.insert(key);
                    candidates.push((kind.to_string(), tile, None, features, heuristic));
                }
            }
        }

        // Attack targets from this tile
        let mut targets = candidate_targets_internal(units, unit_idx, tile);

        // Sort targets by score descending
        targets.sort_by(|&a, &b| {
            let kind_str = if moved { "move_attack" } else { "attack" };
            let sa = score_candidate_internal(
                terrain, width, height, units, buildings, player,
                unit_idx, tile, Some(a), kind_str, danger_map, rusher_uid,
            );
            let sb = score_candidate_internal(
                terrain, width, height, units, buildings, player,
                unit_idx, tile, Some(b), kind_str, danger_map, rusher_uid,
            );
            sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
        });

        // Take top 3 targets
        for &ti in targets.iter().take(3) {
            let kind = if moved { "move_attack" } else { "attack" };
            let heuristic = score_candidate_internal(
                terrain, width, height, units, buildings, player,
                unit_idx, tile, Some(ti), kind, danger_map, rusher_uid,
            );
            let target_uid = units[ti].uid;
            let key = (kind.to_string(), tile, Some(target_uid));
            if !seen.contains(&key) {
                let features = candidate_feature_vector_internal(
                    terrain, width, height, units, buildings, player,
                    unit_idx, tile, Some(ti), kind, danger_map, heuristic,
                    rusher_uid, round_num,
                );
                seen.insert(key);
                candidates.push((kind.to_string(), tile, Some(target_uid), features, heuristic));
            }
        }

        // Wait/move_wait
        let kind = if moved { "move_wait" } else { "wait" };
        let heuristic = score_candidate_internal(
            terrain, width, height, units, buildings, player,
            unit_idx, tile, None, kind, danger_map, rusher_uid,
        );
        let key = (kind.to_string(), tile, None);
        if !seen.contains(&key) {
            let features = candidate_feature_vector_internal(
                terrain, width, height, units, buildings, player,
                unit_idx, tile, None, kind, danger_map, heuristic,
                rusher_uid, round_num,
            );
            seen.insert(key);
            candidates.push((kind.to_string(), tile, None, features, heuristic));
        }
    }

    // Fallback: if no candidates, emit a plain "wait" at current position
    if candidates.is_empty() {
        let heuristic = 0.0;
        let features = candidate_feature_vector_internal(
            terrain, width, height, units, buildings, player,
            unit_idx, current_tile, None, "wait", danger_map, heuristic,
            rusher_uid, round_num,
        );
        candidates.push(("wait".to_string(), current_tile, None, features, heuristic));
    }

    candidates
}

// ============================================================================
// Training helper PyO3 wrappers
// ============================================================================

#[pyfunction]
#[pyo3(signature = (state, player, focus_uid, max_width, max_height))]
fn encode_board_py(state: &GameState, player: i32, focus_uid: i32, max_width: usize, max_height: usize) -> Vec<f32> {
    encode_board_internal(
        &state.terrain,
        state.width,
        state.height,
        &state.units,
        &state.buildings,
        player,
        focus_uid,
        max_width,
        max_height,
        state.round_num,
    )
}

#[pyfunction]
#[pyo3(signature = (state, player))]
fn build_danger_maps_py(state: &GameState, player: i32) -> HashMap<i32, Vec<Vec<f32>>> {
    let maps = build_danger_maps_internal(
        &state.terrain,
        state.width,
        state.height,
        &state.units,
        &state.buildings,
        player,
    );
    let mut result: HashMap<i32, Vec<Vec<f32>>> = HashMap::new();
    for (ut, grid) in maps {
        result.insert(ut.to_int(), grid);
    }
    result
}

#[pyfunction]
#[pyo3(signature = (state, player))]
fn choose_rusher_py(state: &GameState, player: i32) -> Option<i32> {
    choose_rusher_internal(&state.units, &state.buildings, player)
}

#[pyfunction]
#[pyo3(signature = (state, player, rusher_uid=None))]
fn unit_order_py(state: &GameState, player: i32, rusher_uid: Option<i32>) -> Vec<Unit> {
    let indices = unit_order_internal(
        &state.units,
        &state.buildings,
        state.width,
        state.height,
        player,
        rusher_uid,
    );
    indices.iter().map(|&i| {
        let u = &state.units[i];
        Unit {
            uid: u.uid, x: u.x, y: u.y, hp: u.hp, player: u.player,
            has_moved: u.has_moved, has_acted: u.has_acted, unit_type_inner: u.unit_type,
        }
    }).collect()
}

#[pyfunction]
#[pyo3(signature = (state, player, unit_uid, danger_map, rusher_uid=None))]
fn enumerate_candidates_py(
    state: &GameState,
    player: i32,
    unit_uid: i32,
    danger_map: Vec<Vec<f32>>,
    rusher_uid: Option<i32>,
) -> PyResult<Vec<(String, (i32, i32), Option<i32>, Vec<f32>, f64)>> {
    let unit_idx = state.units.iter().position(|u| u.uid == unit_uid)
        .ok_or_else(|| PyValueError::new_err(format!("No unit with uid {}", unit_uid)))?;

    Ok(enumerate_candidates_internal(
        &state.terrain,
        state.width,
        state.height,
        &state.units,
        &state.buildings,
        player,
        unit_idx,
        &danger_map,
        rusher_uid,
        state.round_num,
    ))
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
    m.add_function(wrap_pyfunction!(encode_board_py, m)?)?;
    m.add_function(wrap_pyfunction!(build_danger_maps_py, m)?)?;
    m.add_function(wrap_pyfunction!(choose_rusher_py, m)?)?;
    m.add_function(wrap_pyfunction!(unit_order_py, m)?)?;
    m.add_function(wrap_pyfunction!(enumerate_candidates_py, m)?)?;

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
