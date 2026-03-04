/**
 * AI turn planner — TypeScript port of tools/autoplay/planner.py + strategy.py
 * Strategy-driven 5-phase tactical planner with 6 strategy presets.
 */

import type { LocalGameState, LocalUnit, AIAction } from "./types";
import {
  UNIT_ATK,
  UNIT_MOVE,
  UNIT_ATTACK_RANGE,
  TERRAIN_DEFENSE,
  getAliveUnits,
  getEnemyUnits,
  getHQ,
  manhattan,
  inAttackRange,
} from "./engine";
import { TileType } from "../types";

// --- Strategy ---

interface Strategy {
  name: string;
  aggression: number;
  focusFire: number;
  retreatThreshold: number;
  terrainWeight: number;
  hqPressure: number;
  formation: number;
  flankRatio: number;
  screenRatio: number;
}

const DEATHBALL: Strategy = {
  name: "Deathball",
  aggression: 0.6,
  focusFire: 1.0,
  retreatThreshold: 0.4,
  terrainWeight: 1.5,
  hqPressure: 0.3,
  formation: 1.0,
  flankRatio: 0.0,
  screenRatio: 0.0,
};

const TURTLE: Strategy = {
  name: "Turtle",
  aggression: 0.15,
  focusFire: 0.8,
  retreatThreshold: 0.7,
  terrainWeight: 2.5,
  hqPressure: 0.1,
  formation: 0.8,
  flankRatio: 0.0,
  screenRatio: 0.0,
};

const GUERRILLA: Strategy = {
  name: "Guerrilla",
  aggression: 0.5,
  focusFire: 0.6,
  retreatThreshold: 0.5,
  terrainWeight: 1.0,
  hqPressure: 0.8,
  formation: 0.2,
  flankRatio: 0.4,
  screenRatio: 0.0,
};

const RUSH: Strategy = {
  name: "Rush",
  aggression: 1.0,
  focusFire: 0.3,
  retreatThreshold: 0.1,
  terrainWeight: 0.0,
  hqPressure: 1.0,
  formation: 0.3,
  flankRatio: 0.6,
  screenRatio: 0.0,
};

const RANGER_FORTRESS: Strategy = {
  name: "Ranger Fortress",
  aggression: 0.3,
  focusFire: 0.9,
  retreatThreshold: 0.6,
  terrainWeight: 2.0,
  hqPressure: 0.2,
  formation: 0.9,
  flankRatio: 0.0,
  screenRatio: 0.3,
};

const ASSASSIN: Strategy = {
  name: "Assassin",
  aggression: 0.9,
  focusFire: 1.0,
  retreatThreshold: 0.2,
  terrainWeight: 0.5,
  hqPressure: 0.2,
  formation: 0.6,
  flankRatio: 0.0,
  screenRatio: 0.0,
};

const ALL_STRATEGIES = [
  DEATHBALL,
  TURTLE,
  GUERRILLA,
  RUSH,
  RANGER_FORTRESS,
  ASSASSIN,
];
const STRATEGY_WEIGHTS: Record<string, number> = {
  Deathball: 3,
  Turtle: 2,
  Guerrilla: 3,
  Rush: 1,
  "Ranger Fortress": 2,
  Assassin: 1,
};

// --- Pathfinding helpers (local, using 2D grid like Python bot) ---

const DIRS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;

function moveCost(
  tileMap: Uint8Array,
  width: number,
  x: number,
  y: number,
  unitType: string,
): number | null {
  const tile = tileMap[y * width + x];
  if (tile === TileType.Ocean) return null;
  if (tile === TileType.Mountain) {
    if (unitType !== "Infantry") return null;
    return 2;
  }
  return 1;
}

interface ReachableEntry {
  cost: number;
  path: { x: number; y: number }[];
}

function findReachableAI(
  state: LocalGameState,
  startX: number,
  startY: number,
  unitType: string,
  occupied: Set<number>,
  maxRange?: number,
): Map<number, ReachableEntry> {
  const range = maxRange ?? UNIT_MOVE[unitType];
  const { tileMap, width, height } = state;
  const result = new Map<number, ReachableEntry>();
  const startKey = startY * width + startX;
  result.set(startKey, { cost: 0, path: [] });

  const queue: {
    x: number;
    y: number;
    cost: number;
    path: { x: number; y: number }[];
  }[] = [{ x: startX, y: startY, cost: 0, path: [] }];

  while (queue.length > 0) {
    // Pick lowest cost
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].cost < queue[bestIdx].cost) bestIdx = i;
    }
    const current = queue[bestIdx];
    queue.splice(bestIdx, 1);

    if (current.cost >= range) continue;

    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const step = moveCost(tileMap, width, nx, ny, unitType);
      if (step === null) continue;

      const newCost = current.cost + step;
      if (newCost > range) continue;

      const nKey = ny * width + nx;
      if (occupied.has(nKey)) continue;

      const existing = result.get(nKey);
      if (existing && existing.cost <= newCost) continue;

      const newPath = [...current.path, { x: nx, y: ny }];
      result.set(nKey, { cost: newCost, path: newPath });
      queue.push({ x: nx, y: ny, cost: newCost, path: newPath });
    }
  }

  return result;
}

function fullPathDistance(
  state: LocalGameState,
  goal: { x: number; y: number },
  unitType: string,
): Map<number, number> {
  const { tileMap, width, height } = state;
  const dist = new Map<number, number>();
  const goalKey = goal.y * width + goal.x;
  dist.set(goalKey, 0);

  const queue: { x: number; y: number; cost: number }[] = [
    { x: goal.x, y: goal.y, cost: 0 },
  ];

  while (queue.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].cost < queue[bestIdx].cost) bestIdx = i;
    }
    const current = queue[bestIdx];
    queue.splice(bestIdx, 1);

    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const step = moveCost(tileMap, width, nx, ny, unitType);
      if (step === null) continue;

      const nKey = ny * width + nx;
      const newCost = current.cost + step;
      const existing = dist.get(nKey);
      if (existing !== undefined && existing <= newCost) continue;
      dist.set(nKey, newCost);
      queue.push({ x: nx, y: ny, cost: newCost });
    }
  }

  return dist;
}

function bestMoveToward(
  state: LocalGameState,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  unitType: string,
  occupied: Set<number>,
): { x: number; y: number }[] | null {
  const reachable = findReachableAI(state, startX, startY, unitType, occupied);
  const goalKey = goalY * state.width + goalX;

  if (reachable.has(goalKey)) {
    const entry = reachable.get(goalKey)!;
    return entry.path.length > 0 ? entry.path : null;
  }

  const trueDist = fullPathDistance(state, { x: goalX, y: goalY }, unitType);
  const startKey = startY * state.width + startX;
  const startDist = trueDist.get(startKey);
  if (startDist === undefined) return null;

  let bestTile: { x: number; y: number }[] | null = null;
  let bestDist = startDist;

  for (const [key, entry] of reachable) {
    if (key === startKey || entry.path.length === 0) continue;
    const d = trueDist.get(key);
    if (d !== undefined && d < bestDist) {
      bestDist = d;
      bestTile = entry.path;
    }
  }

  return bestTile;
}

// --- Danger map ---

function buildDangerMap(
  state: LocalGameState,
  enemies: LocalUnit[],
): Map<number, number> {
  const danger = new Map<number, number>();
  const { width, height, tileMap } = state;

  for (const enemy of enemies) {
    const atk = UNIT_ATK[enemy.type];
    const [minR, maxR] = UNIT_ATTACK_RANGE[enemy.type];
    const occupied = new Set<number>();
    const reachable = findReachableAI(
      state,
      enemy.x,
      enemy.y,
      enemy.type,
      occupied,
    );

    for (const [tileKey] of reachable) {
      const tx = tileKey % width;
      const ty = Math.floor(tileKey / width);

      for (let ddx = -maxR; ddx <= maxR; ddx++) {
        for (let ddy = -maxR; ddy <= maxR; ddy++) {
          const d = Math.abs(ddx) + Math.abs(ddy);
          if (d < minR || d > maxR) continue;
          const nx = tx + ddx;
          const ny = ty + ddy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const targetKey = ny * width + nx;
          const terrain = tileMap[targetKey];
          const defense = TERRAIN_DEFENSE[terrain] ?? 0;
          const dmg = Math.max(atk - defense, 1);
          danger.set(targetKey, (danger.get(targetKey) ?? 0) + dmg);
        }
      }
    }
  }

  return danger;
}

// --- Focus targets ---

function assignFocusTargets(
  myUnits: LocalUnit[],
  enemies: LocalUnit[],
  strat: Strategy,
): LocalUnit[] {
  if (enemies.length === 0) return [];

  if (strat.name === "Assassin") {
    const value: Record<string, number> = {
      Tank: 30,
      Ranger: 20,
      Infantry: 10,
    };
    return [...enemies].sort((a, b) => {
      const va = value[a.type] ?? 10;
      const vb = value[b.type] ?? 10;
      if (vb !== va) return vb - va;
      return a.hp - b.hp;
    });
  }

  const cx = myUnits.reduce((s, u) => s + u.x, 0) / myUnits.length;
  const cy = myUnits.reduce((s, u) => s + u.y, 0) / myUnits.length;

  return [...enemies].sort((a, b) => {
    const hpWeight = 10 * strat.focusFire;
    const distWeight = 5 * (1 - strat.focusFire);
    const scoreA =
      a.hp * hpWeight +
      manhattan(a.x, a.y, Math.round(cx), Math.round(cy)) * distWeight -
      UNIT_ATK[a.type] * 2;
    const scoreB =
      b.hp * hpWeight +
      manhattan(b.x, b.y, Math.round(cx), Math.round(cy)) * distWeight -
      UNIT_ATK[b.type] * 2;
    return scoreA - scoreB;
  });
}

// --- Attack helpers ---

function pickFocusTargetInRange(
  unit: LocalUnit,
  ux: number,
  uy: number,
  targets: LocalUnit[],
  alreadyTargeted: Map<number, number>,
): LocalUnit | null {
  for (const target of targets) {
    const priorDmg = alreadyTargeted.get(target.unitId) ?? 0;
    if (target.hp <= priorDmg) continue;
    if (inAttackRange(unit.type, ux, uy, target.x, target.y)) {
      return target;
    }
  }
  return null;
}

function recordAttack(
  unit: LocalUnit,
  target: LocalUnit,
  state: LocalGameState,
  alreadyTargeted: Map<number, number>,
) {
  const terrain = state.tileMap[target.y * state.width + target.x];
  const defense = TERRAIN_DEFENSE[terrain] ?? 0;
  const dmg = Math.max(UNIT_ATK[unit.type] - defense, 1);
  alreadyTargeted.set(
    target.unitId,
    (alreadyTargeted.get(target.unitId) ?? 0) + dmg,
  );
}

// --- Strategy selection ---

function pickStrategyAdaptive(
  state: LocalGameState,
  playerId: number,
): Strategy {
  const myUnits = getAliveUnits(state, playerId);
  const enemies = getEnemyUnits(state, playerId);

  if (enemies.length === 0) return RUSH;

  const myCount = myUnits.length;
  const enemyCount = enemies.length;
  const myRangers = myUnits.filter((u) => u.type === "Ranger").length;
  const myTanks = myUnits.filter((u) => u.type === "Tank").length;
  const enemyRangers = enemies.filter((u) => u.type === "Ranger").length;
  const rnd = state.round;

  if (myCount >= enemyCount + 3 && Math.random() < 0.5) return TURTLE;
  if (enemyCount >= myCount + 3) return Math.random() < 0.5 ? GUERRILLA : RUSH;
  if (myRangers >= 2 && myTanks >= 1 && Math.random() < 0.4)
    return RANGER_FORTRESS;
  if (enemyRangers === 0 && Math.random() < 0.4) return DEATHBALL;
  if (rnd >= 12 && Math.abs(myCount - enemyCount) <= 1 && Math.random() < 0.3)
    return ASSASSIN;

  // Weighted random
  const pool: Strategy[] = [];
  for (const s of ALL_STRATEGIES) {
    const weight = STRATEGY_WEIGHTS[s.name] ?? 1;
    for (let i = 0; i < weight; i++) pool.push(s);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- Role planners ---

function planFlanker(
  unit: LocalUnit,
  enemyHQ: { x: number; y: number },
  _enemies: LocalUnit[],
  state: LocalGameState,
  occupied: Set<number>,
  dangerMap: Map<number, number>,
  _strat: Strategy,
): { actions: AIAction[]; newPos: { x: number; y: number } } {
  const actions: AIAction[] = [];
  const unitPos = { x: unit.x, y: unit.y };

  // On HQ? Capture!
  if (
    unit.x === enemyHQ.x &&
    unit.y === enemyHQ.y &&
    unit.type === "Infantry"
  ) {
    actions.push({ type: "capture", unitId: unit.unitId });
    return { actions, newPos: unitPos };
  }

  const occ = new Set(occupied);
  occ.delete(unit.y * state.width + unit.x);

  const reachable = findReachableAI(state, unit.x, unit.y, unit.type, occ);
  const trueDist = fullPathDistance(state, enemyHQ, unit.type);

  let bestTile: { key: number; path: { x: number; y: number }[] } | null = null;
  let bestScore = Infinity;

  for (const [key, entry] of reachable) {
    if (entry.path.length === 0) continue;
    const d = trueDist.get(key) ?? Infinity;
    const tileDanger = dangerMap.get(key) ?? 0;
    const terrain = state.tileMap[key];
    const defense = TERRAIN_DEFENSE[terrain] ?? 0;
    const score = d * 2.0 + (tileDanger - defense) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      bestTile = { key, path: entry.path };
    }
  }

  if (bestTile) {
    const dest = bestTile.path[bestTile.path.length - 1];
    actions.push({ type: "move", unitId: unit.unitId, path: bestTile.path });
    if (
      dest.x === enemyHQ.x &&
      dest.y === enemyHQ.y &&
      unit.type === "Infantry"
    ) {
      actions.push({ type: "capture", unitId: unit.unitId });
    }
    return { actions, newPos: dest };
  }

  return { actions, newPos: unitPos };
}

function retreatScore(
  key: number,
  dangerMap: Map<number, number>,
  state: LocalGameState,
  enemyCenterX: number,
  enemyCenterY: number,
  myHQ: { x: number; y: number } | null,
  strat: Strategy,
): number {
  const x = key % state.width;
  const y = Math.floor(key / state.width);
  const d = dangerMap.get(key) ?? 0;
  const terrain = state.tileMap[key];
  const defense = TERRAIN_DEFENSE[terrain] ?? 0;
  const distEnemy = manhattan(
    x,
    y,
    Math.round(enemyCenterX),
    Math.round(enemyCenterY),
  );

  let score = d - defense * strat.terrainWeight;
  if (myHQ && strat.aggression < 0.3) {
    score += manhattan(x, y, myHQ.x, myHQ.y) * 0.5;
  } else {
    score -= distEnemy * 0.3;
  }
  return score;
}

function planRetreat(
  unit: LocalUnit,
  enemies: LocalUnit[],
  dangerMap: Map<number, number>,
  state: LocalGameState,
  occupied: Set<number>,
  myHQ: { x: number; y: number } | null,
  strat: Strategy,
): { actions: AIAction[]; newPos: { x: number; y: number } } {
  const actions: AIAction[] = [];
  const occ = new Set(occupied);
  occ.delete(unit.y * state.width + unit.x);

  const reachable = findReachableAI(state, unit.x, unit.y, unit.type, occ);
  const enemyCenterX = enemies.reduce((s, e) => s + e.x, 0) / enemies.length;
  const enemyCenterY = enemies.reduce((s, e) => s + e.y, 0) / enemies.length;

  const startKey = unit.y * state.width + unit.x;
  let bestKey = startKey;
  let bestScoreVal = retreatScore(
    startKey,
    dangerMap,
    state,
    enemyCenterX,
    enemyCenterY,
    myHQ,
    strat,
  );

  for (const [key, entry] of reachable) {
    if (entry.path.length === 0) continue;
    const score = retreatScore(
      key,
      dangerMap,
      state,
      enemyCenterX,
      enemyCenterY,
      myHQ,
      strat,
    );
    if (score < bestScoreVal) {
      bestScoreVal = score;
      bestKey = key;
    }
  }

  if (bestKey !== startKey) {
    const entry = reachable.get(bestKey)!;
    actions.push({ type: "move", unitId: unit.unitId, path: entry.path });
    const dest = entry.path[entry.path.length - 1];
    return { actions, newPos: dest };
  }

  return { actions, newPos: { x: unit.x, y: unit.y } };
}

function planScreener(
  unit: LocalUnit,
  enemies: LocalUnit[],
  myUnits: LocalUnit[],
  state: LocalGameState,
  occupied: Set<number>,
  alreadyTargeted: Map<number, number>,
  dangerMap: Map<number, number>,
  strat: Strategy,
  focusOrder: LocalUnit[],
): { actions: AIAction[]; newPos: { x: number; y: number } } {
  const actions: AIAction[] = [];
  const unitPos = { x: unit.x, y: unit.y };

  // Attack if in range
  const target = pickFocusTargetInRange(
    unit,
    unit.x,
    unit.y,
    focusOrder,
    alreadyTargeted,
  );
  if (target) {
    actions.push({
      type: "attack",
      unitId: unit.unitId,
      targetId: target.unitId,
    });
    recordAttack(unit, target, state, alreadyTargeted);
    return { actions, newPos: unitPos };
  }

  // Find rangers to protect
  const rangers = myUnits.filter((u) => u.type === "Ranger");
  if (rangers.length === 0) {
    return planMelee(
      unit,
      enemies,
      focusOrder,
      state,
      occupied,
      alreadyTargeted,
      dangerMap,
      strat,
    );
  }

  const nearestEnemy = enemies.reduce((best, e) =>
    manhattan(unit.x, unit.y, e.x, e.y) <
    manhattan(unit.x, unit.y, best.x, best.y)
      ? e
      : best,
  );
  const nearestRanger = rangers.reduce((best, r) =>
    manhattan(unit.x, unit.y, r.x, r.y) <
    manhattan(unit.x, unit.y, best.x, best.y)
      ? r
      : best,
  );

  const interceptX = Math.round(nearestEnemy.x * 0.6 + nearestRanger.x * 0.4);
  const interceptY = Math.round(nearestEnemy.y * 0.6 + nearestRanger.y * 0.4);

  const occ = new Set(occupied);
  occ.delete(unit.y * state.width + unit.x);

  const path = bestMoveToward(
    state,
    unit.x,
    unit.y,
    interceptX,
    interceptY,
    unit.type,
    occ,
  );
  if (path) {
    const dest = path[path.length - 1];
    actions.push({ type: "move", unitId: unit.unitId, path });
    const t = pickFocusTargetInRange(
      unit,
      dest.x,
      dest.y,
      focusOrder,
      alreadyTargeted,
    );
    if (t) {
      actions.push({ type: "attack", unitId: unit.unitId, targetId: t.unitId });
      recordAttack(unit, t, state, alreadyTargeted);
    }
    return { actions, newPos: dest };
  }

  return { actions, newPos: unitPos };
}

function planRanger(
  unit: LocalUnit,
  enemies: LocalUnit[],
  focusOrder: LocalUnit[],
  state: LocalGameState,
  occupied: Set<number>,
  alreadyTargeted: Map<number, number>,
  dangerMap: Map<number, number>,
  strat: Strategy,
): { actions: AIAction[]; newPos: { x: number; y: number } } {
  const actions: AIAction[] = [];
  const unitPos = { x: unit.x, y: unit.y };

  // Snipe from current position
  const target = pickFocusTargetInRange(
    unit,
    unit.x,
    unit.y,
    focusOrder,
    alreadyTargeted,
  );
  if (target) {
    actions.push({
      type: "attack",
      unitId: unit.unitId,
      targetId: target.unitId,
    });
    recordAttack(unit, target, state, alreadyTargeted);
    return { actions, newPos: unitPos };
  }

  // Reposition
  const primary = focusOrder[0] ?? enemies[0];
  const occ = new Set(occupied);
  occ.delete(unit.y * state.width + unit.x);

  const reachable = findReachableAI(state, unit.x, unit.y, unit.type, occ);
  const [minR, maxR] = UNIT_ATTACK_RANGE.Ranger;

  let bestTile: { key: number; path: { x: number; y: number }[] } | null = null;
  let bestScore: [number, number, number] = [Infinity, Infinity, Infinity];

  for (const [key, entry] of reachable) {
    if (entry.path.length === 0) continue;
    const tx = key % state.width;
    const ty = Math.floor(key / state.width);
    const d = manhattan(tx, ty, primary.x, primary.y);
    const isInRange = d >= minR && d <= maxR;
    const terrain = state.tileMap[key];
    const defense = TERRAIN_DEFENSE[terrain] ?? 0;
    const tileDanger =
      (dangerMap.get(key) ?? 0) - defense * strat.terrainWeight;

    const score: [number, number, number] = [isInRange ? 0 : 1, tileDanger, d];
    if (
      score[0] < bestScore[0] ||
      (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
      (score[0] === bestScore[0] &&
        score[1] === bestScore[1] &&
        score[2] < bestScore[2])
    ) {
      bestScore = score;
      bestTile = { key, path: entry.path };
    }
  }

  if (bestTile) {
    const dest = bestTile.path[bestTile.path.length - 1];
    actions.push({ type: "move", unitId: unit.unitId, path: bestTile.path });
    // Rangers can NOT attack after moving
    return { actions, newPos: dest };
  }

  // Fallback: advance toward primary
  const path = bestMoveToward(
    state,
    unit.x,
    unit.y,
    primary.x,
    primary.y,
    unit.type,
    occ,
  );
  if (path) {
    const dest = path[path.length - 1];
    actions.push({ type: "move", unitId: unit.unitId, path });
    return { actions, newPos: dest };
  }

  return { actions, newPos: unitPos };
}

function planMelee(
  unit: LocalUnit,
  enemies: LocalUnit[],
  focusOrder: LocalUnit[],
  state: LocalGameState,
  occupied: Set<number>,
  alreadyTargeted: Map<number, number>,
  dangerMap: Map<number, number>,
  strat: Strategy,
): { actions: AIAction[]; newPos: { x: number; y: number } } {
  const actions: AIAction[] = [];
  const unitPos = { x: unit.x, y: unit.y };

  // Already adjacent to focus target?
  const target = pickFocusTargetInRange(
    unit,
    unit.x,
    unit.y,
    focusOrder,
    alreadyTargeted,
  );
  if (target) {
    actions.push({
      type: "attack",
      unitId: unit.unitId,
      targetId: target.unitId,
    });
    recordAttack(unit, target, state, alreadyTargeted);
    return { actions, newPos: unitPos };
  }

  // Turtle: hold defensive terrain
  if (strat.aggression < 0.3) {
    const terrain = state.tileMap[unit.y * state.width + unit.x];
    const defense = TERRAIN_DEFENSE[terrain] ?? 0;
    if (defense >= 1) {
      return { actions, newPos: unitPos };
    }
  }

  // Advance toward focus target
  const primary = focusOrder[0] ?? enemies[0];
  const occ = new Set(occupied);
  occ.delete(unit.y * state.width + unit.x);

  // Try to reach adjacent to target
  const reachable = findReachableAI(state, unit.x, unit.y, unit.type, occ);

  // Check if any reachable tile is adjacent to primary
  let adjacentPath: { x: number; y: number }[] | null = null;
  let adjacentCost = Infinity;
  for (const [dx, dy] of DIRS) {
    const ax = primary.x + dx;
    const ay = primary.y + dy;
    if (ax < 0 || ax >= state.width || ay < 0 || ay >= state.height) continue;
    const adjKey = ay * state.width + ax;
    const entry = reachable.get(adjKey);
    if (entry && entry.path.length > 0 && entry.cost < adjacentCost) {
      adjacentCost = entry.cost;
      adjacentPath = entry.path;
    }
  }

  if (adjacentPath) {
    const dest = adjacentPath[adjacentPath.length - 1];
    actions.push({ type: "move", unitId: unit.unitId, path: adjacentPath });
    const t = pickFocusTargetInRange(
      unit,
      dest.x,
      dest.y,
      focusOrder,
      alreadyTargeted,
    );
    if (t) {
      actions.push({ type: "attack", unitId: unit.unitId, targetId: t.unitId });
      recordAttack(unit, t, state, alreadyTargeted);
    }
    return { actions, newPos: dest };
  }

  // Can't reach adjacent — pick best advance tile
  const trueDist = fullPathDistance(
    state,
    { x: primary.x, y: primary.y },
    unit.type,
  );

  let bestAdvance: { key: number; path: { x: number; y: number }[] } | null =
    null;
  let bestAdvScore = Infinity;

  for (const [key, entry] of reachable) {
    if (entry.path.length === 0) continue;
    const d = trueDist.get(key);
    if (d === undefined) continue;
    const terrain = state.tileMap[key];
    const defense = TERRAIN_DEFENSE[terrain] ?? 0;
    const tileDanger = dangerMap.get(key) ?? 0;
    const score =
      d * (2.0 - strat.aggression) -
      defense * strat.terrainWeight +
      tileDanger * (0.5 - strat.aggression * 0.3);
    if (score < bestAdvScore) {
      bestAdvScore = score;
      bestAdvance = { key, path: entry.path };
    }
  }

  if (bestAdvance) {
    const dest = bestAdvance.path[bestAdvance.path.length - 1];
    actions.push({ type: "move", unitId: unit.unitId, path: bestAdvance.path });
    return { actions, newPos: dest };
  }

  return { actions, newPos: unitPos };
}

function planCaptureMarch(
  unit: LocalUnit,
  enemyHQ: { x: number; y: number },
  state: LocalGameState,
  occupied: Set<number>,
): { actions: AIAction[]; newPos: { x: number; y: number } } {
  const actions: AIAction[] = [];
  const unitPos = { x: unit.x, y: unit.y };

  if (unit.x === enemyHQ.x && unit.y === enemyHQ.y) {
    if (unit.type === "Infantry") {
      actions.push({ type: "capture", unitId: unit.unitId });
    }
    return { actions, newPos: unitPos };
  }

  const occ = new Set(occupied);
  occ.delete(unit.y * state.width + unit.x);

  const path = bestMoveToward(
    state,
    unit.x,
    unit.y,
    enemyHQ.x,
    enemyHQ.y,
    unit.type,
    occ,
  );
  if (path) {
    const dest = path[path.length - 1];
    actions.push({ type: "move", unitId: unit.unitId, path });
    if (
      dest.x === enemyHQ.x &&
      dest.y === enemyHQ.y &&
      unit.type === "Infantry"
    ) {
      actions.push({ type: "capture", unitId: unit.unitId });
    }
    return { actions, newPos: dest };
  }

  return { actions, newPos: unitPos };
}

// --- Main planner ---

export function planAITurn(
  state: LocalGameState,
  aiPlayerId: number,
  difficulty: string = "normal",
): AIAction[] {
  const actions: AIAction[] = [];
  const myUnits = getAliveUnits(state, aiPlayerId);
  const enemies = getEnemyUnits(state, aiPlayerId);
  const opponentId = aiPlayerId === 1 ? 2 : 1;
  const enemyHQ = getHQ(state, opponentId);
  const myHQ = getHQ(state, aiPlayerId);

  if (myUnits.length === 0) {
    actions.push({ type: "end_turn" });
    return actions;
  }

  const occupiedSet = new Set(state.units.map((u) => u.y * state.width + u.x));

  const actionable = myUnits.filter(
    (u) => u.lastActedRound < state.round && u.lastMovedRound < state.round,
  );

  if (actionable.length === 0) {
    actions.push({ type: "end_turn" });
    return actions;
  }

  let strat = pickStrategyAdaptive(state, aiPlayerId);

  // Difficulty modifiers
  if (difficulty === "easy") {
    strat = { ...strat, aggression: strat.aggression * 0.5 };
  } else if (difficulty === "hard") {
    strat = { ...strat, aggression: Math.min(strat.aggression * 1.1, 1.0) };
  }

  // No enemies — capture march
  if (enemies.length === 0) {
    if (enemyHQ) {
      const sorted = [...actionable].sort(
        (a, b) =>
          manhattan(a.x, a.y, enemyHQ.x, enemyHQ.y) -
          manhattan(b.x, b.y, enemyHQ.x, enemyHQ.y),
      );
      for (const unit of sorted) {
        const { actions: a, newPos } = planCaptureMarch(
          unit,
          enemyHQ,
          state,
          occupiedSet,
        );
        actions.push(...a);
        occupiedSet.delete(unit.y * state.width + unit.x);
        occupiedSet.add(newPos.y * state.width + newPos.x);
      }
    }
    actions.push({ type: "end_turn" });
    return actions;
  }

  // Build tactical context
  const dangerMap = buildDangerMap(state, enemies);
  const focusOrder = assignFocusTargets(myUnits, enemies, strat);
  const alreadyTargeted = new Map<number, number>();

  // Classify units into roles
  const infantry = actionable.filter((u) => u.type === "Infantry");
  const others = actionable.filter((u) => u.type !== "Infantry");

  const nFlankers = Math.floor(infantry.length * strat.flankRatio);
  let flankers: LocalUnit[] = [];
  let remainingInfantry = infantry;

  if (nFlankers > 0 && enemyHQ) {
    const ecx = enemies.reduce((s, e) => s + e.x, 0) / enemies.length;
    const ecy = enemies.reduce((s, e) => s + e.y, 0) / enemies.length;
    const sorted = [...infantry].sort(
      (a, b) =>
        manhattan(b.x, b.y, Math.round(ecx), Math.round(ecy)) -
        manhattan(a.x, a.y, Math.round(ecx), Math.round(ecy)),
    );
    flankers = sorted.slice(0, nFlankers);
    remainingInfantry = sorted.slice(nFlankers);
  }

  const nScreeners = Math.floor(remainingInfantry.length * strat.screenRatio);
  let screeners: LocalUnit[] = [];
  if (nScreeners > 0) {
    const sorted = [...remainingInfantry].sort((a, b) => a.hp - b.hp);
    screeners = sorted.slice(0, nScreeners);
    remainingInfantry = sorted.slice(nScreeners);
  }

  const remaining = [...remainingInfantry, ...others];
  const retreaters: LocalUnit[] = [];
  const attackers: LocalUnit[] = [];

  const UNIT_HP: Record<string, number> = { Infantry: 3, Tank: 5, Ranger: 3 };
  for (const unit of remaining) {
    const uKey = unit.y * state.width + unit.x;
    const incoming = dangerMap.get(uKey) ?? 0;
    const maxHp = UNIT_HP[unit.type];
    const hpRatio = unit.hp / maxHp;
    const shouldRetreat =
      hpRatio <= strat.retreatThreshold &&
      incoming > 0 &&
      unit.hp <= incoming &&
      unit.hp < maxHp;
    if (shouldRetreat) {
      retreaters.push(unit);
    } else {
      attackers.push(unit);
    }
  }

  // Phase 1: Flankers sprint toward enemy HQ
  for (const unit of flankers) {
    if (!enemyHQ) continue;
    const { actions: a, newPos } = planFlanker(
      unit,
      enemyHQ,
      enemies,
      state,
      occupiedSet,
      dangerMap,
      strat,
    );

    // Easy: skip attacks 30% of the time
    if (difficulty === "easy") {
      const filtered = a.filter(
        (act) => act.type !== "attack" || Math.random() > 0.3,
      );
      actions.push(...filtered);
    } else {
      actions.push(...a);
    }

    occupiedSet.delete(unit.y * state.width + unit.x);
    occupiedSet.add(newPos.y * state.width + newPos.x);
  }

  // Phase 2: Retreat damaged units
  for (const unit of retreaters) {
    const { actions: a, newPos } = planRetreat(
      unit,
      enemies,
      dangerMap,
      state,
      occupiedSet,
      myHQ,
      strat,
    );
    actions.push(...a);
    occupiedSet.delete(unit.y * state.width + unit.x);
    occupiedSet.add(newPos.y * state.width + newPos.x);
  }

  // Phase 3: Screeners
  for (const unit of screeners) {
    const { actions: a, newPos } = planScreener(
      unit,
      enemies,
      myUnits,
      state,
      occupiedSet,
      alreadyTargeted,
      dangerMap,
      strat,
      focusOrder,
    );

    if (difficulty === "easy") {
      const filtered = a.filter(
        (act) => act.type !== "attack" || Math.random() > 0.3,
      );
      actions.push(...filtered);
    } else {
      actions.push(...a);
    }

    occupiedSet.delete(unit.y * state.width + unit.x);
    occupiedSet.add(newPos.y * state.width + newPos.x);
  }

  // Phase 4: Main combat force — sort by distance to focus target
  if (focusOrder.length > 0) {
    const ft = focusOrder[0];
    attackers.sort(
      (a, b) =>
        manhattan(a.x, a.y, ft.x, ft.y) - manhattan(b.x, b.y, ft.x, ft.y),
    );
  }

  for (const unit of attackers) {
    let result: { actions: AIAction[]; newPos: { x: number; y: number } };

    if (unit.type === "Ranger") {
      result = planRanger(
        unit,
        enemies,
        focusOrder,
        state,
        occupiedSet,
        alreadyTargeted,
        dangerMap,
        strat,
      );
    } else {
      result = planMelee(
        unit,
        enemies,
        focusOrder,
        state,
        occupiedSet,
        alreadyTargeted,
        dangerMap,
        strat,
      );
    }

    if (difficulty === "easy") {
      const filtered = result.actions.filter(
        (act) => act.type !== "attack" || Math.random() > 0.3,
      );
      actions.push(...filtered);
    } else {
      actions.push(...result.actions);
    }

    occupiedSet.delete(unit.y * state.width + unit.x);
    occupiedSet.add(result.newPos.y * state.width + result.newPos.x);
  }

  actions.push({ type: "end_turn" });
  return actions;
}
