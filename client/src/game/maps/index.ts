import * as defaultMap from "./default";
import * as testMap from "./test";

export interface MapDef {
  name: string;
  data: string;
}

export const maps: MapDef[] = [defaultMap, testMap];
