import { GRID_SIZE, TileType } from "./types";

/** Movement cost per tile type. -1 = impassable. */
const TILE_COST: Record<TileType, number> = {
  [TileType.Grass]: 1,
  [TileType.Road]: 1,
  [TileType.DirtRoad]: 1,
  [TileType.City]: 1,
  [TileType.Factory]: 1,
  [TileType.HQ]: 1,
  [TileType.Mountain]: 2,
  [TileType.Tree]: 1,
  [TileType.Barracks]: 1,
};

interface Node {
  x: number;
  y: number;
  g: number; // cost from start
  f: number; // g + heuristic
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

/**
 * A* pathfinding on the tile map.
 * Returns array of {x,y} positions from start (exclusive) to goal (inclusive).
 * Returns empty array if no valid path within maxSteps movement cost.
 */
export function findPath(
  tileMap: Uint8Array,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  maxSteps: number,
  blocked?: Set<number>,
): { x: number; y: number }[] {
  if (fromX === toX && fromY === toY) return [];

  // Check destination is in bounds and passable
  if (toX < 0 || toX >= GRID_SIZE || toY < 0 || toY >= GRID_SIZE) return [];
  const destCost = TILE_COST[tileMap[toY * GRID_SIZE + toX] as TileType];
  if (destCost < 0) return [];
  if (blocked?.has(toY * GRID_SIZE + toX)) return [];

  const open: Node[] = [];
  const closed = new Set<number>();
  const key = (x: number, y: number) => y * GRID_SIZE + x;

  const bestG = new Map<number, number>();

  const start: Node = {
    x: fromX,
    y: fromY,
    g: 0,
    f: heuristic(fromX, fromY, toX, toY),
    parent: null,
  };
  open.push(start);
  bestG.set(key(fromX, fromY), 0);

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

    const ck = key(current.x, current.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

      const nk = key(nx, ny);
      if (closed.has(nk)) continue;

      const tileCost = TILE_COST[tileMap[ny * GRID_SIZE + nx] as TileType];
      if (tileCost < 0) continue; // impassable
      if (blocked?.has(nk)) continue; // occupied by unit

      const ng = current.g + tileCost;
      if (ng > maxSteps) continue; // exceeds movement budget

      const prev = bestG.get(nk);
      if (prev !== undefined && ng >= prev) continue;
      bestG.set(nk, ng);

      open.push({
        x: nx,
        y: ny,
        g: ng,
        f: ng + heuristic(nx, ny, toX, toY),
        parent: current,
      });
    }
  }

  return []; // no path found
}
