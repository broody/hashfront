export const LOCAL_UNIT_TYPES = ["Infantry", "Tank", "Artillery"] as const;

export type LocalUnitType = (typeof LOCAL_UNIT_TYPES)[number];

export interface LocalUnit {
  unitId: number;
  playerId: number;
  type: LocalUnitType;
  x: number;
  y: number;
  hp: number;
  lastMovedRound: number;
  lastActedRound: number;
}

export interface LocalBuilding {
  x: number;
  y: number;
  type: "City" | "Factory" | "HQ";
  playerId: number;
  captureProgress: number;
  capturingPlayerId: number | null;
  queuedUnit: "Infantry" | null;
}

export interface LocalPlayerState {
  playerId: number;
  gold: number;
  isAlive: boolean;
}

export interface LocalGameState {
  round: number;
  currentPlayer: number;
  state: "Playing" | "Finished";
  winner: number;
  width: number;
  height: number;
  tileMap: Uint8Array;
  borderMap: Uint8Array;
  units: LocalUnit[];
  buildings: LocalBuilding[];
  players: LocalPlayerState[];
  nextUnitId: number;
}

export interface MapDef {
  name: string;
  width: number;
  height: number;
  tileMap: number[];
  borderMap: number[];
  buildings: {
    x: number;
    y: number;
    type: "City" | "Factory" | "HQ";
    playerId: number;
  }[];
  startingUnits: {
    type: LocalUnitType;
    playerId: number;
    x: number;
    y: number;
  }[];
}

export type AIAction =
  | { type: "move"; unitId: number; path: { x: number; y: number }[] }
  | { type: "attack"; unitId: number; targetId: number }
  | { type: "capture"; unitId: number }
  | { type: "build"; factoryX: number; factoryY: number; unitType: "Infantry" }
  | { type: "end_turn" };
