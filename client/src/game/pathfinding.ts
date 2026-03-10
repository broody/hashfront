import { TileType } from "./types";
import { UNIT_ROAD_BONUS } from "./balance";

type UnitMoveType = "rifle" | "tank" | "artillery";

/** Movement cost per tile type. -1 = impassable. */
const TILE_COST: Record<TileType, number> = {
  [TileType.Grass]: 1,
  [TileType.Road]: 1,
  [TileType.DirtRoad]: 1,
  [TileType.City]: 1,
  [TileType.Factory]: 1,
  [TileType.HQ]: 1,
  [TileType.Mountain]: 1,
  [TileType.Tree]: 1,
  [TileType.Barracks]: 1,
  [TileType.Ocean]: -1,
};

const ROAD_BONUS_STATE_COUNT = 2;

interface Node {
  x: number;
  y: number;
  g: number; // cost from start
  f: number; // g + heuristic
  roadBonusRemaining: number;
  parent: Node | null;
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function normalizeUnitType(unitType: string): UnitMoveType {
  if (unitType === "tank" || unitType === "artillery") return unitType;
  return "rifle";
}

function isRoadTile(tileType: TileType): boolean {
  return tileType === TileType.Road || tileType === TileType.DirtRoad;
}

function canTraverseTile(unitType: UnitMoveType, tileType: TileType): boolean {
  if (tileType === TileType.Ocean) return false;
  if (tileType === TileType.Mountain) return unitType === "rifle";
  return true;
}

function initialRoadBonus(
  tileMap: Uint8Array,
  fromX: number,
  fromY: number,
  gridWidth: number,
  unitType: UnitMoveType,
): number {
  if (unitType !== "tank" && unitType !== "artillery") return 0;
  const startTile = tileMap[fromY * gridWidth + fromX] as TileType;
  return isRoadTile(startTile) ? (UNIT_ROAD_BONUS[unitType] ?? 0) : 0;
}

function resolveStepCost(
  tileType: TileType,
  unitType: UnitMoveType,
  roadBonusRemaining: number,
): { stepCost: number; nextRoadBonus: number } {
  const baseCost = TILE_COST[tileType];
  if (unitType !== "tank" && unitType !== "artillery") {
    return { stepCost: baseCost, nextRoadBonus: 0 };
  }

  let stepCost = baseCost;
  let nextRoadBonus = roadBonusRemaining;

  if (nextRoadBonus > 0) {
    if (isRoadTile(tileType)) {
      const spend = Math.min(stepCost, nextRoadBonus);
      stepCost -= spend;
      nextRoadBonus -= spend;
    } else {
      // Road bonus can only be spent on a contiguous road segment.
      nextRoadBonus = 0;
    }
  }

  return { stepCost, nextRoadBonus };
}

function stateKey(
  x: number,
  y: number,
  gridWidth: number,
  roadBonusRemaining: number,
): number {
  return (y * gridWidth + x) * ROAD_BONUS_STATE_COUNT + roadBonusRemaining;
}

function coordKey(x: number, y: number, gridWidth: number): number {
  return y * gridWidth + x;
}

/**
 * A* pathfinding on the tile map.
 * Returns array of {x,y} positions from start (exclusive) to goal (inclusive).
 * Returns empty array if no valid path within maxSteps movement cost.
 */
export function findPath(
  tileMap: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  maxSteps: number,
  unitType: string,
  blocked?: Set<number>,
  destinationBlocked?: Set<number>,
): { x: number; y: number }[] {
  if (fromX === toX && fromY === toY) return [];
  const moveType = normalizeUnitType(unitType);
  const transitBlocked = blocked;
  const finalBlocked = destinationBlocked ?? blocked;

  // Check destination is in bounds and passable
  if (toX < 0 || toX >= gridWidth || toY < 0 || toY >= gridHeight) return [];
  const destTile = tileMap[toY * gridWidth + toX] as TileType;
  if (!canTraverseTile(moveType, destTile)) return [];
  const destCost = TILE_COST[destTile];
  if (destCost < 0) return [];
  if (finalBlocked?.has(coordKey(toX, toY, gridWidth))) return [];

  const open: Node[] = [];
  const closed = new Set<number>();
  const bestG = new Map<number, number>();
  const startRoadBonus = initialRoadBonus(
    tileMap,
    fromX,
    fromY,
    gridWidth,
    moveType,
  );
  const startStateKey = stateKey(fromX, fromY, gridWidth, startRoadBonus);

  const start: Node = {
    x: fromX,
    y: fromY,
    g: 0,
    f: heuristic(fromX, fromY, toX, toY),
    roadBonusRemaining: startRoadBonus,
    parent: null,
  };
  open.push(start);
  bestG.set(startStateKey, 0);

  while (open.length > 0) {
    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    if (current.x === toX && current.y === toY) {
      // Reconstruct path (excluding start)
      const path: { x: number; y: number }[] = [];
      let node: Node | null = current;
      while (node && node.parent) {
        path.push({ x: node.x, y: node.y });
        node = node.parent;
      }
      path.reverse();
      return path;
    }

    const ck = stateKey(
      current.x,
      current.y,
      gridWidth,
      current.roadBonusRemaining,
    );
    if (closed.has(ck)) continue;
    closed.add(ck);

    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

      const tileType = tileMap[ny * gridWidth + nx] as TileType;
      if (!canTraverseTile(moveType, tileType)) continue;

      const { stepCost, nextRoadBonus } = resolveStepCost(
        tileType,
        moveType,
        current.roadBonusRemaining,
      );
      const nk = stateKey(nx, ny, gridWidth, nextRoadBonus);
      if (closed.has(nk)) continue;

      if (stepCost < 0) continue; // impassable
      if (transitBlocked?.has(coordKey(nx, ny, gridWidth))) continue;

      const ng = current.g + stepCost;
      if (ng > maxSteps) continue; // exceeds movement budget

      const prev = bestG.get(nk);
      if (prev !== undefined && ng >= prev) continue;
      bestG.set(nk, ng);

      open.push({
        x: nx,
        y: ny,
        g: ng,
        f: ng + heuristic(nx, ny, toX, toY),
        roadBonusRemaining: nextRoadBonus,
        parent: current,
      });
    }
  }

  return []; // no path found
}

/**
 * Returns all tiles reachable from (fromX, fromY) within maxSteps movement cost.
 * Excludes the starting tile.
 */
export function findReachable(
  tileMap: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  fromX: number,
  fromY: number,
  maxSteps: number,
  unitType: string,
  blocked?: Set<number>,
  destinationBlocked?: Set<number>,
): { x: number; y: number }[] {
  const moveType = normalizeUnitType(unitType);
  const transitBlocked = blocked;
  const finalBlocked = destinationBlocked ?? blocked;
  const bestG = new Map<number, number>();
  const startRoadBonus = initialRoadBonus(
    tileMap,
    fromX,
    fromY,
    gridWidth,
    moveType,
  );
  const queue: {
    x: number;
    y: number;
    g: number;
    roadBonusRemaining: number;
  }[] = [{ x: fromX, y: fromY, g: 0, roadBonusRemaining: startRoadBonus }];
  bestG.set(stateKey(fromX, fromY, gridWidth, startRoadBonus), 0);

  const result: { x: number; y: number }[] = [];
  const seenCoords = new Set<number>();

  while (queue.length > 0) {
    // Pick lowest cost node
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].g < queue[bestIdx].g) bestIdx = i;
    }
    const current = queue[bestIdx];
    queue.splice(bestIdx, 1);

    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

      const tileType = tileMap[ny * gridWidth + nx] as TileType;
      if (!canTraverseTile(moveType, tileType)) continue;

      const { stepCost, nextRoadBonus } = resolveStepCost(
        tileType,
        moveType,
        current.roadBonusRemaining,
      );
      if (stepCost < 0) continue;
      const coord = coordKey(nx, ny, gridWidth);
      if (transitBlocked?.has(coord)) continue;

      const ng = current.g + stepCost;
      if (ng > maxSteps) continue;

      const nk = stateKey(nx, ny, gridWidth, nextRoadBonus);
      const prev = bestG.get(nk);
      if (prev !== undefined && ng >= prev) continue;

      bestG.set(nk, ng);
      queue.push({ x: nx, y: ny, g: ng, roadBonusRemaining: nextRoadBonus });

      if (!seenCoords.has(coord)) {
        seenCoords.add(coord);
        if (!finalBlocked?.has(coord)) {
          result.push({ x: nx, y: ny });
        }
      }
    }
  }

  return result;
}
