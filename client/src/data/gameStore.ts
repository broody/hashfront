import { parseMap } from "../game/mapgen";
import { maps } from "../game/maps";

// --- Terrain ---
export let tileMap = parseMap(maps[0].data);

export function setTileMap(newTileMap: Uint8Array | number[]) {
  tileMap = new Uint8Array(newTileMap);
}

// --- Teams ---
export type TeamId = "blue" | "red" | "green" | "yellow";

// --- Units ---
export interface Unit {
  id: number;
  type: string;
  team: TeamId;
  x: number;
  y: number;
  facing: "left" | "right" | "up" | "down";
  animation:
    | "idle"
    | "walk_side"
    | "walk_down"
    | "walk_up"
    | "attack"
    | "hit"
    | "death";
}

let nextId = 1;
export let units: Unit[] = [];

export function clearUnits() {
  units.length = 0;
  nextId = 1;
}

export function initTestGame() {
  tileMap = parseMap(maps[0].data);
  clearUnits();
  addUnit("rifle", "blue", 2, 6);
  addUnit("rifle", "blue", 2, 8);
  addUnit("tank", "blue", 3, 7);
  addUnit("artillery", "blue", 1, 5);

  const r1 = addUnit("rifle", "red", 17, 7);
  r1.facing = "left";
  const r2 = addUnit("rifle", "red", 17, 9);
  r2.facing = "left";
  const r3 = addUnit("tank", "red", 16, 8);
  r3.facing = "left";
  const r4 = addUnit("artillery", "red", 18, 10);
  r4.facing = "left";
}

export function addUnit(
  type: string,
  team: TeamId,
  x: number,
  y: number,
): Unit {
  const unit: Unit = {
    id: nextId++,
    type,
    team,
    x,
    y,
    facing: "right",
    animation: "idle",
  };
  units.push(unit);
  return unit;
}
