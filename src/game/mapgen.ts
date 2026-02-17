import { GRID_SIZE, TileType } from "./types";

/**
 * Generate a fixed symmetrical 20x20 tactics map.
 * Layout is mirrored vertically so both sides are fair.
 */
export function generateMap(): Uint8Array {
  const map = new Uint8Array(GRID_SIZE * GRID_SIZE);

  // Fill with grass
  for (let i = 0; i < map.length; i++) {
    map[i] = TileType.Grass;
  }

  function set(x: number, y: number, tile: TileType) {
    map[y * GRID_SIZE + x] = tile;
  }

  // --- Player A (top) ---
  set(10, 0, TileType.HQ);
  set(6, 1, TileType.Factory);
  set(14, 1, TileType.Factory);

  // --- Player B (bottom) — mirrored ---
  set(9, 19, TileType.HQ);
  set(5, 18, TileType.Factory);
  set(13, 18, TileType.Factory);

  // --- Neutral cities (symmetrical) ---
  set(3, 4, TileType.City);
  set(16, 4, TileType.City);
  set(10, 6, TileType.City);
  set(3, 15, TileType.City);
  set(16, 15, TileType.City);
  set(9, 13, TileType.City);

  // --- Mountains (central chokepoints) ---
  // Horizontal ridge across center
  for (let x = 7; x <= 12; x++) {
    set(x, 9, TileType.Mountain);
    set(x, 10, TileType.Mountain);
  }
  // Gaps at x=9,10 for passage
  set(9, 9, TileType.Grass);
  set(10, 9, TileType.Grass);
  set(9, 10, TileType.Grass);
  set(10, 10, TileType.Grass);

  // Side mountains
  set(2, 8, TileType.Mountain);
  set(2, 9, TileType.Mountain);
  set(2, 10, TileType.Mountain);
  set(2, 11, TileType.Mountain);
  set(17, 8, TileType.Mountain);
  set(17, 9, TileType.Mountain);
  set(17, 10, TileType.Mountain);
  set(17, 11, TileType.Mountain);

  return map;
}

/** Get tile at (x,y) */
export function getTile(map: Uint8Array, x: number, y: number): TileType {
  return map[y * GRID_SIZE + x] as TileType;
}
