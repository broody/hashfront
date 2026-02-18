export const GRID_SIZE = 40;
export const TILE_PX = 32;

export const TileType = {
  Grass: 0,
  Mountain: 1,
  City: 2,
  Factory: 3,
  HQ: 4,
  Road: 5,
  Tree: 6,
  DirtRoad: 7,
} as const;

export type TileType = (typeof TileType)[keyof typeof TileType];

export const TILE_COLORS: Record<TileType, number> = {
  [TileType.Grass]: 0x4a7c59,
  [TileType.Mountain]: 0x8b7355,
  [TileType.City]: 0x708090,
  [TileType.Factory]: 0x696969,
  [TileType.HQ]: 0xdaa520,
  [TileType.Road]: 0x9e9e9e,
  [TileType.Tree]: 0x2d5a1e,
  [TileType.DirtRoad]: 0x8b7355,
};
