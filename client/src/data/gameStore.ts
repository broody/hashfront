import { parseMap } from "../game/mapgen";
import { maps } from "../game/maps";

// --- Terrain ---
export const tileMap = parseMap(maps[0].data);

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
export const units: Unit[] = [];

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
