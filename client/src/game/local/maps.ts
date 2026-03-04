import type { MapDef } from "./types";
import { TileType } from "../types";

const T = TileType;

// Legend: . = Grass, M = Mountain, T = Tree, R = Road, H = HQ
// Buildings (City, Factory, HQ) are separate — terrain underneath is Grass

function parseTerrain(rows: string[], width: number, height: number): number[] {
  const map: number[] = new Array(width * height).fill(T.Grass);
  const charMap: Record<string, number> = {
    ".": T.Grass,
    M: T.Mountain,
    T: T.Tree,
    R: T.Road,
    D: T.DirtRoad,
    O: T.Ocean,
    H: T.Grass, // HQ is a building overlay
    C: T.Grass, // City is a building overlay
    F: T.Grass, // Factory is a building overlay
  };
  for (let y = 0; y < height && y < rows.length; y++) {
    const cells = rows[y].trim().split(/\s+/);
    for (let x = 0; x < width && x < cells.length; x++) {
      map[y * width + x] = charMap[cells[x]] ?? T.Grass;
    }
  }
  return map;
}

// --- Bridgehead (20x20) ---

const bridgeheadTerrain = [
  "T T . . . . M M M M M M M M . . . . T T",
  "T . . . . . M M M M M M M M . . . . . T",
  ". . . . . . M M . . . . M M . . . . . .",
  ". . . T . . M . . . . . . M . . T . . .",
  ". . T T . . . . . T T . . . . . T T . .",
  ". . T . . . . . T T T T . . . . . T . .",
  ". . . . . . . . T . . T . . . . . . . .",
  ". . . . . R R R R . . R R R R . . . . .",
  ". . . . . R . . . . . . . . R . . . . .",
  "M M M . . R . . . . . . . . R . . M M M",
  "M M M . . R . . . . . . . . R . . M M M",
  ". . . . . R . . . . . . . . R . . . . .",
  ". . . . . R R R R . . R R R R . . . . .",
  ". . . . . . . . T . . T . . . . . . . .",
  ". . T . . . . . T T T T . . . . . T . .",
  ". . T T . . . . . T T . . . . . T T . .",
  ". . . T . . M . . . . . . M . . T . . .",
  ". . . . . . M M . . . . M M . . . . . .",
  "T . . . . . M M M M M M M M . . . . . T",
  "T T . . . . M M M M M M M M . . . . T T",
];

export const BRIDGEHEAD: MapDef = {
  name: "Bridgehead",
  width: 20,
  height: 20,
  tileMap: parseTerrain(bridgeheadTerrain, 20, 20),
  borderMap: new Array(400).fill(0),
  buildings: [
    { x: 2, y: 0, type: "HQ", playerId: 1 },
    { x: 17, y: 19, type: "HQ", playerId: 2 },
  ],
  startingUnits: [
    { type: "Infantry", playerId: 1, x: 3, y: 0 },
    { type: "Infantry", playerId: 1, x: 4, y: 0 },
    { type: "Infantry", playerId: 1, x: 2, y: 1 },
    { type: "Infantry", playerId: 1, x: 4, y: 2 },
    { type: "Ranger", playerId: 1, x: 3, y: 2 },
    { type: "Ranger", playerId: 1, x: 5, y: 1 },
    { type: "Tank", playerId: 1, x: 3, y: 1 },
    { type: "Infantry", playerId: 2, x: 16, y: 19 },
    { type: "Infantry", playerId: 2, x: 15, y: 19 },
    { type: "Infantry", playerId: 2, x: 17, y: 18 },
    { type: "Infantry", playerId: 2, x: 15, y: 17 },
    { type: "Ranger", playerId: 2, x: 16, y: 17 },
    { type: "Ranger", playerId: 2, x: 14, y: 18 },
    { type: "Tank", playerId: 2, x: 16, y: 18 },
  ],
};

// Overlay HQ tiles into the tileMap
BRIDGEHEAD.tileMap[0 * 20 + 2] = TileType.HQ;
BRIDGEHEAD.tileMap[19 * 20 + 17] = TileType.HQ;

// --- Crossroads (20x20) ---

const crossroadsTerrain = [
  "M M . . T T . . . . . . . . T T . . M M",
  "M . . . T . . . . . . . . . . T . . . M",
  ". . . . . . . . T T T T . . . . . . . .",
  ". . . T . . . T T . . T T . . . T . . .",
  "T T . . . . R R . . . . R R . . . . T T",
  "T . . . . R R . . . . . . R R . . . . T",
  ". . . . R R . . . M M . . . R R . . . .",
  ". . . R R . . . M M M M . . . R R . . .",
  ". . T R . . . . M . . M . . . . R T . .",
  ". . T R . . . . . . . . . . . . R T . .",
  ". . T R . . . . . . . . . . . . R T . .",
  ". . T R . . . . M . . M . . . . R T . .",
  ". . . R R . . . M M M M . . . R R . . .",
  ". . . . R R . . . M M . . . R R . . . .",
  "T . . . . R R . . . . . . R R . . . . T",
  "T T . . . . R R . . . . R R . . . . T T",
  ". . . T . . . T T . . T T . . . T . . .",
  ". . . . . . . . T T T T . . . . . . . .",
  "M . . . T . . . . . . . . . . T . . . M",
  "M M . . T T . . . . . . . . T T . . M M",
];

export const CROSSROADS: MapDef = {
  name: "Crossroads",
  width: 20,
  height: 20,
  tileMap: parseTerrain(crossroadsTerrain, 20, 20),
  borderMap: new Array(400).fill(0),
  buildings: [
    { x: 2, y: 0, type: "HQ", playerId: 1 },
    { x: 17, y: 19, type: "HQ", playerId: 2 },
  ],
  startingUnits: [
    { type: "Infantry", playerId: 1, x: 3, y: 0 },
    { type: "Infantry", playerId: 1, x: 2, y: 1 },
    { type: "Infantry", playerId: 1, x: 4, y: 1 },
    { type: "Infantry", playerId: 1, x: 3, y: 2 },
    { type: "Ranger", playerId: 1, x: 2, y: 2 },
    { type: "Ranger", playerId: 1, x: 4, y: 0 },
    { type: "Tank", playerId: 1, x: 3, y: 1 },
    { type: "Infantry", playerId: 2, x: 16, y: 19 },
    { type: "Infantry", playerId: 2, x: 17, y: 18 },
    { type: "Infantry", playerId: 2, x: 15, y: 18 },
    { type: "Infantry", playerId: 2, x: 16, y: 17 },
    { type: "Ranger", playerId: 2, x: 17, y: 17 },
    { type: "Ranger", playerId: 2, x: 15, y: 19 },
    { type: "Tank", playerId: 2, x: 16, y: 18 },
  ],
};

// Overlay HQ tiles
CROSSROADS.tileMap[0 * 20 + 2] = TileType.HQ;
CROSSROADS.tileMap[19 * 20 + 17] = TileType.HQ;

// --- Ambush (20x20) ---

const ambushTerrain = [
  "H . . . . . . . . . . . . . . . . . . .",
  ". . . . . . . . . . . . T T . T T . . .",
  ". . . . . . T T T T . . T T . T T . . .",
  ". . . . . . T T T T . . T T . T T . . .",
  ". . . . . M T T T T . . T T . T T . . .",
  ". . . . . M T T T T . . . . . . . . . .",
  ". . . . . . . . . . . . . . . . . . . .",
  "T T . . . . . . . . . . . . . . . . T T",
  ". . . . . . . T T T T T T . . . . . . .",
  ". . . . . . . T T T T T T . . . . . . .",
  ". . . . . . R R R M M R R R . . . . . .",
  ". . . . . . . T T T T T T . . . . . . .",
  "T T . . . . . . . . . . . . . . . . T T",
  ". . . . . . . . . . . . . . . . . . . .",
  ". . . . . . . . . . T T T T M . . . . .",
  ". . . T T . T T . . T T T T M . . . . .",
  ". . . T T . T T . . T T T T . . . . . .",
  ". . . T T . T T . . T T T T . . . . . .",
  ". . . T T . T T . . . . . . . . . . . .",
  ". . . . . . . . . . . . . . . . . . . H",
];

export const AMBUSH: MapDef = {
  name: "Ambush",
  width: 20,
  height: 20,
  tileMap: parseTerrain(ambushTerrain, 20, 20),
  borderMap: new Array(400).fill(0),
  buildings: [
    { x: 0, y: 0, type: "HQ", playerId: 1 },
    { x: 19, y: 19, type: "HQ", playerId: 2 },
  ],
  startingUnits: [
    { type: "Infantry", playerId: 1, x: 1, y: 0 },
    { type: "Infantry", playerId: 1, x: 0, y: 1 },
    { type: "Infantry", playerId: 1, x: 2, y: 1 },
    { type: "Infantry", playerId: 1, x: 1, y: 2 },
    { type: "Ranger", playerId: 1, x: 3, y: 0 },
    { type: "Ranger", playerId: 1, x: 0, y: 3 },
    { type: "Tank", playerId: 1, x: 1, y: 1 },
    { type: "Infantry", playerId: 2, x: 18, y: 19 },
    { type: "Infantry", playerId: 2, x: 19, y: 18 },
    { type: "Infantry", playerId: 2, x: 17, y: 18 },
    { type: "Infantry", playerId: 2, x: 18, y: 17 },
    { type: "Ranger", playerId: 2, x: 19, y: 17 },
    { type: "Ranger", playerId: 2, x: 17, y: 19 },
    { type: "Tank", playerId: 2, x: 18, y: 18 },
  ],
};

// Overlay HQ tiles
AMBUSH.tileMap[0 * 20 + 0] = TileType.HQ;
AMBUSH.tileMap[19 * 20 + 19] = TileType.HQ;

// --- All maps ---

export const ALL_MAPS: MapDef[] = [BRIDGEHEAD, CROSSROADS, AMBUSH];
