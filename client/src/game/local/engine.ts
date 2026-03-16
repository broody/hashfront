import type {
  LocalBuilding,
  LocalGameState,
  LocalUnit,
  LocalUnitType,
  MapDef,
} from "./types";
import {
  ARTILLERY_RANGE_PENALTY,
  DEFAULT_UNIT_HP,
  MOVE_PENALTY,
  TERRAIN_DEFENSE,
  TERRAIN_EVASION,
  UNIT_ATTACK_RANGE as STORE_UNIT_ATTACK_RANGE,
  UNIT_BASE_ACCURACY,
  UNIT_DAMAGE_MATRIX,
  UNIT_MOVE_RANGE as STORE_UNIT_MOVE_RANGE,
  type StoreUnitType,
} from "../balance";
import { TileType } from "../types";
import { findPath } from "../pathfinding";

// --- Constants ---

const MIN_HIT_CHANCE = 75;
const MAX_HIT_CHANCE = 95;

const UNIT_HP: Record<LocalUnitType, number> = {
  Infantry: DEFAULT_UNIT_HP,
  Tank: DEFAULT_UNIT_HP,
  Artillery: DEFAULT_UNIT_HP,
  APC: DEFAULT_UNIT_HP,
};

const UNIT_MOVE: Record<LocalUnitType, number> = {
  Infantry: STORE_UNIT_MOVE_RANGE.rifle,
  Tank: STORE_UNIT_MOVE_RANGE.tank,
  Artillery: STORE_UNIT_MOVE_RANGE.artillery,
  APC: STORE_UNIT_MOVE_RANGE.apc,
};

const UNIT_ATTACK_RANGE: Record<LocalUnitType, [number, number]> = {
  Infantry: STORE_UNIT_ATTACK_RANGE.rifle,
  Tank: STORE_UNIT_ATTACK_RANGE.tank,
  Artillery: STORE_UNIT_ATTACK_RANGE.artillery,
  APC: STORE_UNIT_ATTACK_RANGE.apc,
};

const UNIT_TYPE_TO_MOVE: Record<LocalUnitType, StoreUnitType> = {
  Infantry: "rifle",
  Tank: "tank",
  Artillery: "artillery",
  APC: "apc",
};

export {
  TERRAIN_DEFENSE,
  UNIT_ATTACK_RANGE,
  UNIT_HP,
  UNIT_MOVE,
  UNIT_TYPE_TO_MOVE,
};

function getStoreUnitType(unitType: LocalUnitType): StoreUnitType {
  return UNIT_TYPE_TO_MOVE[unitType];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getHitChance(
  attackerType: LocalUnitType,
  defenderTile: TileType,
  distance: number,
  movedThisTurn: boolean,
): number {
  const attackerStoreType = getStoreUnitType(attackerType);
  const baseAccuracy = UNIT_BASE_ACCURACY[attackerStoreType] ?? 0;
  const terrainPenalty = TERRAIN_EVASION[defenderTile] ?? 0;
  const movePenalty = movedThisTurn ? MOVE_PENALTY : 0;
  const rangePenalty =
    attackerType === "Artillery" && distance === 3
      ? ARTILLERY_RANGE_PENALTY
      : 0;

  return clamp(
    baseAccuracy - terrainPenalty - movePenalty - rangePenalty,
    MIN_HIT_CHANCE,
    MAX_HIT_CHANCE,
  );
}

export function getHitDamage(
  attackerType: LocalUnitType,
  defenderType: LocalUnitType,
  defenderTile: TileType,
): number {
  const attackerStoreType = getStoreUnitType(attackerType);
  const defenderStoreType = getStoreUnitType(defenderType);
  const baseDamage =
    UNIT_DAMAGE_MATRIX[attackerStoreType]?.[defenderStoreType] ?? 0;
  const terrainDefense = TERRAIN_DEFENSE[defenderTile] ?? 0;
  return Math.max(baseDamage - terrainDefense, 1);
}

export function getProjectedDamage(
  attackerType: LocalUnitType,
  defenderType: LocalUnitType,
  defenderTile: TileType,
  distance: number,
  movedThisTurn: boolean,
): {
  expectedDamage: number;
  grazeDamage: number;
  hitChance: number;
  hitDamage: number;
} {
  const hitDamage = getHitDamage(attackerType, defenderType, defenderTile);
  const hitChance = getHitChance(
    attackerType,
    defenderTile,
    distance,
    movedThisTurn,
  );
  const grazeDamage = hitDamage >= 2 ? 1 : 0;
  const hitRate = hitChance / 100;
  const expectedDamage = hitDamage * hitRate + grazeDamage * (1 - hitRate);

  return { expectedDamage, grazeDamage, hitChance, hitDamage };
}

// --- Init ---

export function initGame(map: MapDef): LocalGameState {
  const tileMap = new Uint8Array(map.tileMap);
  const borderMap = new Uint8Array(map.borderMap);

  const units: LocalUnit[] = map.startingUnits.map((u, i) => ({
    unitId: i + 1,
    playerId: u.playerId,
    type: u.type,
    x: u.x,
    y: u.y,
    hp: UNIT_HP[u.type],
    lastMovedRound: 0,
    lastActedRound: 0,
  }));

  const buildings: LocalBuilding[] = map.buildings.map((b) => ({
    x: b.x,
    y: b.y,
    type: b.type,
    playerId: b.playerId,
    captureProgress: 0,
    capturingPlayerId: null,
    queuedUnit: null,
  }));

  const players: LocalGameState["players"] = [
    { playerId: 1, gold: 5, isAlive: true },
    { playerId: 2, gold: 7, isAlive: true },
  ];

  return {
    round: 1,
    currentPlayer: 1,
    state: "Playing",
    winner: 0,
    width: map.width,
    height: map.height,
    tileMap,
    borderMap,
    units,
    buildings,
    players,
    nextUnitId: units.length + 1,
  };
}

// --- Move ---

export function applyMove(
  state: LocalGameState,
  unitId: number,
  path: { x: number; y: number }[],
): LocalGameState | null {
  const unit = state.units.find((u) => u.unitId === unitId);
  if (!unit || unit.playerId !== state.currentPlayer) return null;
  if (unit.lastMovedRound >= state.round) return null;
  if (path.length === 0) return null;

  const dest = path[path.length - 1];

  // Verify path is valid using findPath
  const moveType = UNIT_TYPE_TO_MOVE[unit.type];
  const enemyPositions = new Set(
    state.units
      .filter((u) => u.playerId !== unit.playerId)
      .map((u) => u.y * state.width + u.x),
  );
  const allOtherPositions = new Set(
    state.units
      .filter((u) => u.unitId !== unitId)
      .map((u) => u.y * state.width + u.x),
  );

  const validPath = findPath(
    state.tileMap,
    state.width,
    state.height,
    unit.x,
    unit.y,
    dest.x,
    dest.y,
    UNIT_MOVE[unit.type],
    moveType,
    enemyPositions,
    allOtherPositions,
  );

  if (validPath.length === 0) return null;

  const newUnits = state.units.map((u) =>
    u.unitId === unitId
      ? { ...u, x: dest.x, y: dest.y, lastMovedRound: state.round }
      : u,
  );

  return { ...state, units: newUnits };
}

// --- Attack ---

export interface AttackResult {
  state: LocalGameState;
  dmgToDefender: number;
  dmgToAttacker: number;
  attackOutcome: "hit" | "graze" | "miss";
  counterOutcome: "hit" | "graze" | "miss" | "none";
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function inAttackRange(
  unitType: LocalUnitType,
  ax: number,
  ay: number,
  tx: number,
  ty: number,
): boolean {
  const dist = manhattan(ax, ay, tx, ty);
  const [min, max] = UNIT_ATTACK_RANGE[unitType];
  return dist >= min && dist <= max;
}

function rollHit(
  attacker: LocalUnit,
  defender: LocalUnit,
  state: LocalGameState,
  hasMoved: boolean,
  distance: number,
): { dmg: number; outcome: "hit" | "graze" | "miss" } {
  const terrainTile = state.tileMap[
    defender.y * state.width + defender.x
  ] as TileType;
  const strike = getProjectedDamage(
    attacker.type,
    defender.type,
    terrainTile,
    distance,
    hasMoved,
  );
  const roll = Math.floor(Math.random() * 100) + 1;

  if (roll <= strike.hitChance) {
    return { dmg: strike.hitDamage, outcome: "hit" };
  }

  if (strike.grazeDamage > 0) {
    return { dmg: strike.grazeDamage, outcome: "graze" };
  }

  return { dmg: 0, outcome: "miss" };
}

export function applyAttack(
  state: LocalGameState,
  attackerId: number,
  defenderId: number,
): AttackResult | null {
  const attacker = state.units.find((u) => u.unitId === attackerId);
  const defender = state.units.find((u) => u.unitId === defenderId);
  if (!attacker || !defender) return null;
  if (attacker.playerId !== state.currentPlayer) return null;
  if (attacker.lastActedRound >= state.round) return null;
  if (attacker.playerId === defender.playerId) return null;

  if (attacker.type === "Artillery" && attacker.lastMovedRound >= state.round)
    return null;

  const distance = manhattan(attacker.x, attacker.y, defender.x, defender.y);
  if (
    !inAttackRange(
      attacker.type,
      attacker.x,
      attacker.y,
      defender.x,
      defender.y,
    )
  ) {
    return null;
  }

  const hasMoved = attacker.lastMovedRound >= state.round;
  const { dmg: dmgToDefender, outcome: attackOutcome } = rollHit(
    attacker,
    defender,
    state,
    hasMoved,
    distance,
  );

  let dmgToAttacker = 0;
  let counterOutcome: "hit" | "graze" | "miss" | "none" = "none";

  const defenderHpAfter = defender.hp - dmgToDefender;

  if (
    defenderHpAfter > 0 &&
    inAttackRange(defender.type, defender.x, defender.y, attacker.x, attacker.y)
  ) {
    const counterResult = rollHit(
      { ...defender, hp: defenderHpAfter },
      attacker,
      state,
      false,
      distance,
    );
    dmgToAttacker = counterResult.dmg;
    counterOutcome = counterResult.outcome;
  }

  let newUnits = state.units.map((u) => {
    if (u.unitId === attackerId) {
      return {
        ...u,
        hp: u.hp - dmgToAttacker,
        lastActedRound: state.round,
      };
    }
    if (u.unitId === defenderId) {
      return { ...u, hp: u.hp - dmgToDefender };
    }
    return u;
  });

  // Remove dead units
  newUnits = newUnits.filter((u) => u.hp > 0);

  let newState = { ...state, units: newUnits };

  // Check elimination for both sides
  newState = checkElimination(newState, attacker.playerId);
  newState = checkElimination(newState, defender.playerId);

  return {
    state: newState,
    dmgToDefender,
    dmgToAttacker,
    attackOutcome,
    counterOutcome,
  };
}

// --- Capture ---

export function applyCapture(
  state: LocalGameState,
  unitId: number,
): LocalGameState | null {
  const unit = state.units.find((u) => u.unitId === unitId);
  if (!unit || unit.playerId !== state.currentPlayer) return null;
  if (unit.lastActedRound >= state.round) return null;
  // Only infantry can capture
  if (unit.type !== "Infantry") return null;

  const building = state.buildings.find(
    (b) => b.x === unit.x && b.y === unit.y,
  );
  if (!building) return null;
  if (building.playerId === unit.playerId) return null;

  const newBuildings = state.buildings.map((b) => {
    if (b.x !== unit.x || b.y !== unit.y) return b;

    if (b.capturingPlayerId === unit.playerId) {
      // Continue capture — second turn
      const newProgress = b.captureProgress + 1;
      if (newProgress >= 2) {
        // Captured!
        return {
          ...b,
          playerId: unit.playerId,
          captureProgress: 0,
          capturingPlayerId: null,
        };
      }
      return { ...b, captureProgress: newProgress };
    }
    // Start new capture
    return { ...b, captureProgress: 1, capturingPlayerId: unit.playerId };
  });

  const newUnits = state.units.map((u) =>
    u.unitId === unitId ? { ...u, lastActedRound: state.round } : u,
  );

  let newState = { ...state, buildings: newBuildings, units: newUnits };

  // HQ capture = instant win
  const capturedBuilding = newState.buildings.find(
    (b) => b.x === unit.x && b.y === unit.y,
  );
  if (
    capturedBuilding &&
    capturedBuilding.type === "HQ" &&
    capturedBuilding.playerId === unit.playerId
  ) {
    newState = {
      ...newState,
      state: "Finished",
      winner: unit.playerId,
    };
  }

  return newState;
}

// --- Build ---

export function applyBuild(
  state: LocalGameState,
  factoryX: number,
  factoryY: number,
  unitType: "Infantry",
): LocalGameState | null {
  const building = state.buildings.find(
    (b) => b.x === factoryX && b.y === factoryY && b.type === "Factory",
  );
  if (!building || building.playerId !== state.currentPlayer) return null;

  const cost = 1; // Infantry costs 1 gold
  const player = state.players.find((p) => p.playerId === state.currentPlayer);
  if (!player || player.gold < cost) return null;

  // Check tile is unoccupied
  const occupied = state.units.some(
    (u) => u.x === factoryX && u.y === factoryY,
  );
  if (occupied) return null;

  const newUnit: LocalUnit = {
    unitId: state.nextUnitId,
    playerId: state.currentPlayer,
    type: unitType,
    x: factoryX,
    y: factoryY,
    hp: UNIT_HP[unitType],
    lastMovedRound: state.round,
    lastActedRound: state.round,
  };

  const newPlayers = state.players.map((p) =>
    p.playerId === state.currentPlayer ? { ...p, gold: p.gold - cost } : p,
  );

  return {
    ...state,
    units: [...state.units, newUnit],
    players: newPlayers,
    nextUnitId: state.nextUnitId + 1,
  };
}

// --- End Turn ---

export function applyEndTurn(state: LocalGameState): LocalGameState {
  if (state.state !== "Playing") return state;

  // Reset stale captures: if a building is being captured but the capturing unit left
  const newBuildings = state.buildings.map((b) => {
    if (b.capturingPlayerId === null) return b;
    const capturer = state.units.find(
      (u) => u.x === b.x && u.y === b.y && u.playerId === b.capturingPlayerId,
    );
    if (!capturer) {
      return { ...b, captureProgress: 0, capturingPlayerId: null };
    }
    return b;
  });

  // Advance to next player
  const nextPlayer = state.currentPlayer === 1 ? 2 : 1;
  const isNewRound = nextPlayer === 1;
  const newRound = isNewRound ? state.round + 1 : state.round;

  // Income: 1 base + 1 per city owned
  const citiesOwned = newBuildings.filter(
    (b) => b.type === "City" && b.playerId === nextPlayer,
  ).length;
  const income = 1 + citiesOwned;

  const newPlayers = state.players.map((p) =>
    p.playerId === nextPlayer ? { ...p, gold: p.gold + income } : p,
  );

  // Auto-produce at factories
  let newUnits = [...state.units];
  let nextUnitId = state.nextUnitId;
  const updatedPlayers = [...newPlayers];

  for (const factory of newBuildings) {
    if (factory.type !== "Factory" || factory.playerId !== nextPlayer) continue;
    const playerIdx = updatedPlayers.findIndex(
      (p) => p.playerId === nextPlayer,
    );
    if (playerIdx < 0 || updatedPlayers[playerIdx].gold < 1) continue;
    const occupied = newUnits.some(
      (u) => u.x === factory.x && u.y === factory.y,
    );
    if (occupied) continue;

    newUnits.push({
      unitId: nextUnitId++,
      playerId: nextPlayer,
      type: "Infantry",
      x: factory.x,
      y: factory.y,
      hp: UNIT_HP.Infantry,
      lastMovedRound: newRound,
      lastActedRound: newRound,
    });
    updatedPlayers[playerIdx] = {
      ...updatedPlayers[playerIdx],
      gold: updatedPlayers[playerIdx].gold - 1,
    };
  }

  let newState: LocalGameState = {
    ...state,
    round: newRound,
    currentPlayer: nextPlayer,
    buildings: newBuildings,
    units: newUnits,
    players: updatedPlayers,
    nextUnitId,
  };

  // Timeout at round 100
  if (newRound > 100) {
    const p1Score = scorePlayer(newState, 1);
    const p2Score = scorePlayer(newState, 2);
    newState = {
      ...newState,
      state: "Finished",
      winner: p1Score >= p2Score ? 1 : 2,
    };
    return newState;
  }

  // Check elimination
  newState = checkElimination(newState, 1);
  newState = checkElimination(newState, 2);

  return newState;
}

// --- Helpers ---

function scorePlayer(state: LocalGameState, playerId: number): number {
  const unitHp = state.units
    .filter((u) => u.playerId === playerId)
    .reduce((sum, u) => sum + u.hp, 0);
  const gold = state.players.find((p) => p.playerId === playerId)?.gold ?? 0;
  return unitHp + gold;
}

export function checkElimination(
  state: LocalGameState,
  playerId: number,
): LocalGameState {
  if (state.state !== "Playing") return state;

  const player = state.players.find((p) => p.playerId === playerId);
  if (!player || !player.isAlive) return state;

  const hasHQ = state.buildings.some(
    (b) => b.type === "HQ" && b.playerId === playerId,
  );
  const unitCount = state.units.filter((u) => u.playerId === playerId).length;
  const factoryCount = state.buildings.filter(
    (b) => b.type === "Factory" && b.playerId === playerId,
  ).length;
  const gold = player.gold;

  // Eliminated: lost HQ OR (0 units + 0 factories + 0 gold)
  const eliminated =
    !hasHQ || (unitCount === 0 && factoryCount === 0 && gold === 0);

  if (!eliminated) return state;

  const opponent = playerId === 1 ? 2 : 1;
  const newPlayers = state.players.map((p) =>
    p.playerId === playerId ? { ...p, isAlive: false } : p,
  );

  return {
    ...state,
    players: newPlayers,
    state: "Finished",
    winner: opponent,
  };
}

// --- Utility exports for AI ---

export function getAliveUnits(
  state: LocalGameState,
  playerId: number,
): LocalUnit[] {
  return state.units.filter((u) => u.playerId === playerId);
}

export function getEnemyUnits(
  state: LocalGameState,
  playerId: number,
): LocalUnit[] {
  return state.units.filter((u) => u.playerId !== playerId);
}

export function getHQ(
  state: LocalGameState,
  playerId: number,
): { x: number; y: number } | null {
  const hq = state.buildings.find(
    (b) => b.type === "HQ" && b.playerId === playerId,
  );
  return hq ? { x: hq.x, y: hq.y } : null;
}

export function getOccupiedPositions(state: LocalGameState): Set<number> {
  return new Set(state.units.map((u) => u.y * state.width + u.x));
}

export { inAttackRange, manhattan };
