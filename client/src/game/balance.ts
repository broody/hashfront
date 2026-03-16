import { TileType } from "./types";

export const DEFAULT_UNIT_HP = 10;
export const MOVE_PENALTY = 5;
export const ARTILLERY_RANGE_PENALTY = 5;

export type StoreUnitType = "rifle" | "tank" | "artillery" | "apc";

export const UNIT_TYPES: Record<string, string> = {
  Infantry: "rifle",
  Tank: "tank",
  Artillery: "artillery",
  Ranger: "artillery",
  APC: "apc",
};

export const UNIT_DISPLAY_NAMES: Record<string, string> = {
  rifle: "Infantry",
  tank: "Tank",
  artillery: "Artillery",
  apc: "APC",
};

export const UNIT_MAX_HP: Record<string, number> = {
  rifle: DEFAULT_UNIT_HP,
  tank: DEFAULT_UNIT_HP,
  artillery: DEFAULT_UNIT_HP,
  apc: DEFAULT_UNIT_HP,
};

export const UNIT_MOVE_RANGE: Record<string, number> = {
  rifle: 2,
  tank: 3,
  artillery: 3,
  apc: 6,
};

export const UNIT_ATTACK_RANGE: Record<string, [number, number]> = {
  rifle: [1, 1],
  tank: [1, 1],
  artillery: [2, 3],
  apc: [0, 0],
};

export const UNIT_BASE_ACCURACY: Record<string, number> = {
  rifle: 90,
  tank: 85,
  artillery: 88,
  apc: 0,
};

export const UNIT_ROAD_BONUS: Record<string, number> = {
  rifle: 0,
  tank: 1,
  artillery: 1,
  apc: 1,
};

export const UNIT_DAMAGE_MATRIX: Record<string, Record<string, number>> = {
  rifle: { rifle: 3, tank: 1, artillery: 4, apc: 3 },
  tank: { rifle: 5, tank: 4, artillery: 5, apc: 5 },
  artillery: { rifle: 3, tank: 5, artillery: 2, apc: 4 },
  apc: { rifle: 0, tank: 0, artillery: 0, apc: 0 },
};

export const UNIT_DAMAGE_PROFILE_TEXT: Record<string, string> = {
  rifle: "3 / 1 / 4 / 3",
  tank: "5 / 4 / 5 / 5",
  artillery: "3 / 5 / 2 / 4",
  apc: "0 / 0 / 0 / 0",
};

export const TERRAIN_DEFENSE: Record<number, number> = {
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

export const TERRAIN_EVASION: Record<number, number> = {
  [TileType.Grass]: 0,
  [TileType.Mountain]: 12,
  [TileType.City]: 8,
  [TileType.Factory]: 8,
  [TileType.HQ]: 10,
  [TileType.Road]: 0,
  [TileType.Tree]: 5,
  [TileType.DirtRoad]: 0,
  [TileType.Barracks]: 0,
  [TileType.Ocean]: 0,
};
