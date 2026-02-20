// --- Terrain ---
export let tileMap = new Uint8Array(0);

export function setTileMap(newTileMap: Uint8Array | number[]) {
  tileMap = new Uint8Array(newTileMap);
}

// --- Teams ---
export type TeamId = "blue" | "red" | "green" | "yellow";

// --- Units ---
export interface Unit {
  id: number;
  onchainId: number;
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

export function addUnit(
  type: string,
  team: TeamId,
  x: number,
  y: number,
  onchainId: number,
): Unit {
  const unit: Unit = {
    id: nextId++,
    onchainId,
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
