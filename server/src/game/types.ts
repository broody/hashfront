// Shared game types — mirrors client types for server-side logic

export const GRID_SIZE = 40;

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

export interface Position {
  x: number;
  y: number;
}

export interface Unit {
  id: string;
  type: "infantry" | "tank" | "ranger";
  owner: number;
  position: Position;
  hp: number;
  moved: boolean;
}

export interface Order {
  unitId: string;
  type: "move" | "attack" | "hold";
  target: Position;
}

export interface BoardState {
  map: number[];
  units: Unit[];
  turn: number;
  phase: "plan" | "commit" | "reveal" | "resolve";
  players: [string, string];
}
