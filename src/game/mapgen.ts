import { GRID_SIZE, TileType } from "./types";

/**
 * ASCII map format:
 *   .  = Grass
 *   M  = Mountain
 *   C  = City
 *   F  = Factory
 *   H  = HQ
 *   R  = Road
 *
 * Each row is one line, characters map 1:1 to grid columns.
 * Must be exactly GRID_SIZE x GRID_SIZE.
 */

const CHAR_TO_TILE: Record<string, TileType> = {
  ".": TileType.Grass,
  M: TileType.Mountain,
  C: TileType.City,
  F: TileType.Factory,
  H: TileType.HQ,
  R: TileType.Road,
};

export function parseMap(ascii: string): Uint8Array {
  const rows = ascii
    .trim()
    .split("\n")
    .map((r) => r.trim());

  if (rows.length !== GRID_SIZE) {
    throw new Error(`Map must have ${GRID_SIZE} rows, got ${rows.length}`);
  }

  const map = new Uint8Array(GRID_SIZE * GRID_SIZE);

  for (let y = 0; y < GRID_SIZE; y++) {
    if (rows[y].length !== GRID_SIZE) {
      throw new Error(
        `Row ${y} must have ${GRID_SIZE} chars, got ${rows[y].length}`,
      );
    }
    for (let x = 0; x < GRID_SIZE; x++) {
      const ch = rows[y][x];
      const tile = CHAR_TO_TILE[ch];
      if (tile === undefined) {
        throw new Error(`Unknown tile char '${ch}' at (${x},${y})`);
      }
      map[y * GRID_SIZE + x] = tile;
    }
  }

  return map;
}

/** Get tile at (x,y) */
export function getTile(map: Uint8Array, x: number, y: number): TileType {
  return map[y * GRID_SIZE + x] as TileType;
}
