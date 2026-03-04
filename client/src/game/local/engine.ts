import type { LocalGameState, LocalUnit, LocalBuilding, MapDef } from "./types";
import { TileType } from "../types";
import { findPath } from "../pathfinding";

// --- Constants ---

const UNIT_HP: Record<string, number> = { Infantry: 3, Tank: 5, Ranger: 3 };
const UNIT_ATK: Record<string, number> = { Infantry: 2, Tank: 4, Ranger: 3 };
const UNIT_MOVE: Record<string, number> = { Infantry: 4, Tank: 2, Ranger: 3 };
const UNIT_ATTACK_RANGE: Record<string, [number, number]> = {
  Infantry: [1, 1],
  Tank: [1, 1],
  Ranger: [2, 3],
};

const TERRAIN_DEFENSE: Record<number, number> = {
  [TileType.Grass]: 0,
  [TileType.Mountain]: 2,
  [TileType.City]: 1,
  [TileType.Factory]: 1,
  [TileType.HQ]: 2,
  [TileType.Road]: 0,
  [TileType.Tree]: 1,
  [TileType.DirtRoad]: 0,
  [TileType.Barracks]: 0,
  [TileType.Ocean]: 0,
};

// Map local unit types to store unit types (for pathfinding)
const UNIT_TYPE_TO_MOVE: Record<string, string> = {
  Infantry: "rifle",
  Tank: "tank",
  Ranger: "artillery",
};

export {
  UNIT_HP,
  UNIT_ATK,
  UNIT_MOVE,
  UNIT_ATTACK_RANGE,
  TERRAIN_DEFENSE,
  UNIT_TYPE_TO_MOVE,
};

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
  unitType: string,
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
  _hasMoved: boolean,
): { dmg: number; outcome: "hit" | "graze" | "miss" } {
  const terrainTile = state.tileMap[defender.y * state.width + defender.x];
  const terrainDef = TERRAIN_DEFENSE[terrainTile] ?? 0;

  // Simplified combat: deterministic damage = max(atk - terrainDef, 1)
  // The plan mentions hitChance but for MVP let's use deterministic like the Python bot
  const atk = UNIT_ATK[attacker.type];
  const dmg = Math.max(atk - terrainDef, 1);

  return { dmg, outcome: "hit" };
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

  // Ranger can't attack after moving
  if (attacker.type === "Ranger" && attacker.lastMovedRound >= state.round)
    return null;

  if (
    !inAttackRange(
      attacker.type,
      attacker.x,
      attacker.y,
      defender.x,
      defender.y,
    )
  )
    return null;

  const hasMoved = attacker.lastMovedRound >= state.round;
  const { dmg: dmgToDefender, outcome: attackOutcome } = rollHit(
    attacker,
    defender,
    state,
    hasMoved,
  );

  let dmgToAttacker = 0;
  let counterOutcome: "hit" | "graze" | "miss" | "none" = "none";

  const defenderHpAfter = defender.hp - dmgToDefender;

  // Counterattack: if defender survives AND attacker is in defender's range
  // Ranger can't counter melee
  if (defenderHpAfter > 0 && defender.type !== "Ranger") {
    if (
      inAttackRange(
        defender.type,
        defender.x,
        defender.y,
        attacker.x,
        attacker.y,
      )
    ) {
      const counterResult = rollHit(
        { ...defender, hp: defenderHpAfter },
        attacker,
        state,
        false,
      );
      dmgToAttacker = counterResult.dmg;
      counterOutcome = counterResult.outcome;
    }
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
