import { parseMap } from "../game/mapgen";
import { maps } from "../game/maps";

export const tileMap = parseMap(maps[0].data);
