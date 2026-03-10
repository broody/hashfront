import React, { useState, useRef, useEffect, useCallback } from "react";
import { BlueprintContainer } from "../components/BlueprintContainer";
import { PixelPanel } from "../components/PixelPanel";
import { PixelButton } from "../components/PixelButton";
import { terrainAtlas } from "../game/spritesheets/terrain";
import {
  Application,
  Assets,
  Spritesheet,
  Sprite,
  Container,
  Graphics,
  Text,
  TextStyle,
} from "pixi.js";
import { Viewport } from "pixi-viewport";

const TERRAIN_TYPES = [
  { char: ".", name: "Grass", color: "#4a7c59" },
  { char: "M", name: "Mountain", color: "#8b7355" },
  { char: "R", name: "Road", color: "#9e9e9e" },
  { char: "T", name: "Tree", color: "#2d5a1e" },
  { char: "D", name: "DirtRoad", color: "#8b7355" },
  { char: "O", name: "Ocean", color: "#2389da" },
];

const BUILDING_TYPES = ["City", "Factory", "HQ"];
const UNIT_TYPES = [
  "Infantry",
  "Tank",
  "HeavyTank",
  "Artillery",
  "Jeep",
  "Buggy",
];

interface Building {
  type: string;
  player: number;
  x: number;
  y: number;
}
interface Unit {
  type: string;
  player: number;
  x: number;
  y: number;
}
interface EditorState {
  terrain: string[][];
  buildings: Building[];
  units: Unit[];
  width: number;
  height: number;
}

const loadSavedState = (): EditorState | null => {
  try {
    const saved = localStorage.getItem("hashfront_map_editor");
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to load map editor state", e);
  }
  return null;
};

export default function MapEditor() {
  const [savedState] = useState(() => loadSavedState());

  const [mapData, setMapData] = useState<EditorState>(() => ({
    width: savedState?.width || 20,
    height: savedState?.height || 20,
    terrain:
      savedState?.terrain ||
      Array(20)
        .fill(null)
        .map(() => Array(20).fill("O")),
    buildings: savedState?.buildings || [],
    units: savedState?.units || [],
  }));

  const { width, height, terrain, buildings, units } = mapData;

  const [past, setPast] = useState<EditorState[]>([]);
  const [future, setFuture] = useState<EditorState[]>([]);

  const [toolCategory, setToolCategory] = useState<
    "terrain" | "building" | "unit" | "erase"
  >("terrain");
  const [selectedTerrain, setSelectedTerrain] = useState(".");
  const [selectedBuilding, setSelectedBuilding] = useState("City");
  const [selectedUnit, setSelectedUnit] = useState("Infantry");
  const [selectedPlayer, setSelectedPlayer] = useState(1);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false);
  const mapMenuRef = useRef<HTMLDivElement>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("hashfront_map_editor", JSON.stringify(mapData));
  }, [mapData]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        mapMenuRef.current &&
        !mapMenuRef.current.contains(e.target as Node)
      ) {
        setIsMapMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const saveState = useCallback(() => {
    setPast((prev) => [...prev, JSON.parse(JSON.stringify(mapData))]);
    setFuture([]);
  }, [mapData]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, prev.length - 1));
    setFuture((prev) => [JSON.parse(JSON.stringify(mapData)), ...prev]);
    setMapData(previous);
  }, [past, mapData]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, JSON.parse(JSON.stringify(mapData))]);
    setMapData(next);
  }, [future, mapData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const handleResize = (newW: number, newH: number) => {
    saveState();
    const finalW = Math.min(40, Math.max(10, newW));
    const finalH = Math.min(40, Math.max(10, newH));

    setMapData((prev) => {
      // Grow terrain array if needed, never shrink
      const newTerrain = prev.terrain.map((row) => [...row]);
      while (newTerrain.length < finalH) {
        newTerrain.push(
          Array(Math.max(prev.terrain[0]?.length || 0, finalW)).fill("O"),
        );
      }
      for (let y = 0; y < newTerrain.length; y++) {
        while (newTerrain[y].length < finalW) {
          newTerrain[y].push("O");
        }
      }
      return {
        ...prev,
        width: finalW,
        height: finalH,
        terrain: newTerrain,
      };
    });
  };

  const applyTool = useCallback(
    (x: number, y: number) => {
      setMapData((prev) => {
        if (x < 0 || x >= prev.width || y < 0 || y >= prev.height) return prev;
        const isEdge =
          x === 0 || y === 0 || x === prev.width - 1 || y === prev.height - 1;
        if (toolCategory === "terrain") {
          if (isEdge && selectedTerrain !== "O") return prev;
          if (prev.terrain[y][x] === selectedTerrain) return prev;
          const nextTerrain = [...prev.terrain.map((row) => [...row])];
          nextTerrain[y][x] = selectedTerrain;
          return { ...prev, terrain: nextTerrain };
        } else if (toolCategory === "building") {
          if (isEdge) return prev;
          const nextBuildings = prev.buildings.filter(
            (b) => b.x !== x || b.y !== y,
          );
          nextBuildings.push({
            type: selectedBuilding,
            player: selectedPlayer,
            x,
            y,
          });
          return { ...prev, buildings: nextBuildings };
        } else if (toolCategory === "unit") {
          if (isEdge) return prev;
          const nextUnits = prev.units.filter((u) => u.x !== x || u.y !== y);
          nextUnits.push({ type: selectedUnit, player: selectedPlayer, x, y });
          return { ...prev, units: nextUnits };
        } else if (toolCategory === "erase") {
          const nextTerrain = [...prev.terrain.map((row) => [...row])];
          nextTerrain[y][x] = "O";
          return {
            ...prev,
            terrain: nextTerrain,
            buildings: prev.buildings.filter((b) => b.x !== x || b.y !== y),
            units: prev.units.filter((u) => u.x !== x || u.y !== y),
          };
        }
        return prev;
      });
    },
    [
      toolCategory,
      selectedTerrain,
      selectedBuilding,
      selectedUnit,
      selectedPlayer,
    ],
  );

  const handleReset = () => {
    saveState();
    setMapData((prev) => ({
      ...prev,
      terrain: Array(prev.height)
        .fill(null)
        .map(() => Array(prev.width).fill("O")),
      buildings: [],
      units: [],
    }));
    setIsResetModalOpen(false);
  };

  const handleRandomize = () => {
    saveState();
    const seed = Math.floor(Math.random() * 1000000);
    const newTerrain = generateRandomMap(width, height, seed);
    setMapData((prev) => ({
      ...prev,
      terrain: newTerrain,
      buildings: [],
      units: [],
    }));
  };

  const generateRandomMap = (w: number, h: number, seed: number) => {
    // Simple Seeded Random
    let s = seed;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    let newTerrain = Array(h)
      .fill(null)
      .map(() => Array(w).fill("O"));

    // 1. Initial random noise for land (only in middle)
    // Start with slightly higher chance because smoothing and edge-avoidance will reduce it
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        // ~55% land initially to target ~50% after smoothing
        if (rand() < 0.55) {
          newTerrain[y][x] = ".";
        }
      }
    }

    // 2. Cellular Automata passes to create islands and channels
    const smooth = (map: string[][]) => {
      const next = map.map((row) => [...row]);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let landNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (map[y + dy][x + dx] === ".") landNeighbors++;
            }
          }
          if (map[y][x] === ".") {
            next[y][x] = landNeighbors >= 4 ? "." : "O";
          } else {
            next[y][x] = landNeighbors >= 5 ? "." : "O";
          }
        }
      }
      return next;
    };

    // 4 passes of smoothing for more solid landmasses
    for (let i = 0; i < 4; i++) {
      newTerrain = smooth(newTerrain);
    }

    // 3. Ensure some connectivity / blobs
    const addBlobs = (char: string, count: number, size: number) => {
      for (let i = 0; i < count; i++) {
        // Only place on existing land
        let rx, ry;
        let attempts = 0;
        do {
          rx = Math.floor(rand() * (w - 2)) + 1;
          ry = Math.floor(rand() * (h - 2)) + 1;
          attempts++;
        } while (newTerrain[ry][rx] !== "." && attempts < 50);

        if (newTerrain[ry][rx] !== ".") continue;

        const blobSize = Math.floor(rand() * size) + 2;
        for (let j = 0; j < blobSize; j++) {
          if (rx > 0 && rx < w - 1 && ry > 0 && ry < h - 1) {
            if (newTerrain[ry][rx] === ".") {
              newTerrain[ry][rx] = char;
            }
          }
          const dir = Math.floor(rand() * 4);
          if (dir === 0) rx++;
          else if (dir === 1) rx--;
          else if (dir === 2) ry++;
          else ry--;
        }
      }
    };

    const drawPath = (char: string, steps: number) => {
      let rx = Math.floor(rand() * (w - 2)) + 1;
      let ry = Math.floor(rand() * (h - 2)) + 1;
      let dir = Math.floor(rand() * 4); // 0:R, 1:L, 2:D, 3:U

      for (let i = 0; i < steps; i++) {
        if (rx > 0 && rx < w - 1 && ry > 0 && ry < h - 1) {
          if (
            newTerrain[ry][rx] === "." ||
            newTerrain[ry][rx] === "D" ||
            newTerrain[ry][rx] === "R"
          ) {
            newTerrain[ry][rx] = char;
          }
        }

        // 80% chance to keep same direction
        if (rand() < 0.2) {
          dir = Math.floor(rand() * 4);
        }

        if (dir === 0) rx++;
        else if (dir === 1) rx--;
        else if (dir === 2) ry++;
        else ry--;

        // Bounce off edges
        if (rx <= 0 || rx >= w - 1 || ry <= 0 || ry >= h - 1) {
          rx = Math.max(1, Math.min(w - 2, rx));
          ry = Math.max(1, Math.min(h - 2, ry));
          dir = Math.floor(rand() * 4);
        }
      }
    };

    addBlobs("M", Math.floor((w * h) / 100), 4); // Mountains
    addBlobs("T", Math.floor((w * h) / 80), 6); // Trees

    // One main road of each type to keep it clean
    drawPath("R", Math.floor((w + h) * 1.5)); // Standard road
    drawPath("D", Math.floor((w + h) * 1.5)); // Dirt path

    return newTerrain;
  };

  const mapDataRef = useRef(mapData);
  useEffect(() => {
    mapDataRef.current = mapData;
  }, [mapData]);

  // Autotile logic - updated to use Refs and support preview overrides
  const isEdgeTile = useCallback((tx: number, ty: number) => {
    const { width: w, height: h } = mapDataRef.current;
    return tx === 0 || ty === 0 || tx === w - 1 || ty === h - 1;
  }, []);

  const isTileType = useCallback(
    (
      tx: number,
      ty: number,
      char: string,
      override?: { x: number; y: number; char: string },
    ) => {
      if (override && tx === override.x && ty === override.y)
        return override.char === char;
      const { width: w, height: h, terrain: t } = mapDataRef.current;
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) return false;
      if (isEdgeTile(tx, ty)) return char === "O";
      return t[ty][tx] === char;
    },
    [isEdgeTile],
  );

  const isOceanOrOOB = useCallback(
    (
      tx: number,
      ty: number,
      override?: { x: number; y: number; char: string },
    ) => {
      if (override && tx === override.x && ty === override.y) {
        const c = override.char;
        return c === "O" || c === "k" || c === "b" || c === "s";
      }
      const { width: w, height: h, terrain: t } = mapDataRef.current;
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) return true;
      if (isEdgeTile(tx, ty)) return true;
      const char = t[ty][tx];
      return char === "O" || char === "k" || char === "b" || char === "s";
    },
    [isEdgeTile],
  );

  const pickAutotile = useCallback(
    (
      tx: number,
      ty: number,
      char: string,
      prefix: string,
      override?: { x: number; y: number; char: string },
    ) => {
      const left = isTileType(tx - 1, ty, char, override);
      const right = isTileType(tx + 1, ty, char, override);
      const up = isTileType(tx, ty - 1, char, override);
      const down = isTileType(tx, ty + 1, char, override);
      const horizontal = left || right;
      const vertical = up || down;

      if (vertical && !horizontal) {
        if (up && down) return `${prefix}_vertical_mid`;
        if (!up && down) return `${prefix}_top`;
        if (up && !down) return `${prefix}_bottom`;
      }
      if (horizontal && !vertical) {
        if (left && right) return `${prefix}_horizontal_mid`;
        if (!left && right) return `${prefix}_left`;
        if (left && !right) return `${prefix}_right`;
      }
      if (right && down && !left && !up) return `${prefix}_top_left`;
      if (right && up && !left && !down) return `${prefix}_bottom_left`;
      if (left && right && down && !up) return `${prefix}_top_mid`;
      if (left && down && !right && !up) return `${prefix}_top_right`;
      if (left && right && up && !down) return `${prefix}_bottom_mid`;
      if (left && up && !right && !down) return `${prefix}_bottom_right`;
      if (right && up && down && !left) return `${prefix}_mid_left`;
      if (left && up && down && !right) return `${prefix}_mid_right`;
      if (left && right && up && down) return `${prefix}_mid_center`;

      return `${prefix}_single`;
    },
    [isTileType],
  );

  const pickOceanBorder = useCallback(
    (
      tx: number,
      ty: number,
      prefix: string,
      override?: { x: number; y: number; char: string },
    ) => {
      const landUp = !isOceanOrOOB(tx, ty - 1, override);
      const landDown = !isOceanOrOOB(tx, ty + 1, override);
      const landLeft = !isOceanOrOOB(tx - 1, ty, override);
      const landRight = !isOceanOrOOB(tx + 1, ty, override);

      if (landUp && landDown && landLeft && landRight)
        return `${prefix}_cove_enclosed`;

      if (landDown && landLeft && landRight) return `${prefix}_cove_top`;
      if (landUp && landLeft && landRight) return `${prefix}_cove_bottom`;
      if (landUp && landDown && landRight) return `${prefix}_cove_left`;
      if (landUp && landDown && landLeft) return `${prefix}_cove_right`;

      if (landUp && landDown) return `${prefix}_cove_parallel_vertical`;
      if (landLeft && landRight) return `${prefix}_cove_parallel_horizontal`;

      if (landUp && landLeft) return `${prefix}_inner_top_left`;
      if (landUp && landRight) return `${prefix}_inner_top_right`;
      if (landDown && landLeft) return `${prefix}_inner_bottom_left`;
      if (landDown && landRight) return `${prefix}_inner_bottom_right`;

      if (landUp) return `${prefix}_top_edge`;
      if (landDown) return `${prefix}_bottom_edge`;
      if (landLeft) return `${prefix}_left_edge`;
      if (landRight) return `${prefix}_right_edge`;

      return null;
    },
    [isOceanOrOOB],
  );

  const pickOceanOuterCorners = useCallback(
    (
      tx: number,
      ty: number,
      prefix: string,
      override?: { x: number; y: number; char: string },
    ) => {
      const corners = [];
      const landUp = !isOceanOrOOB(tx, ty - 1, override);
      const landDown = !isOceanOrOOB(tx, ty + 1, override);
      const landLeft = !isOceanOrOOB(tx - 1, ty, override);
      const landRight = !isOceanOrOOB(tx + 1, ty, override);

      if (!landUp && !landLeft && !isOceanOrOOB(tx - 1, ty - 1, override))
        corners.push(`${prefix}_bottom_right`);
      if (!landUp && !landRight && !isOceanOrOOB(tx + 1, ty - 1, override))
        corners.push(`${prefix}_bottom_left`);
      if (!landDown && !landLeft && !isOceanOrOOB(tx - 1, ty + 1, override))
        corners.push(`${prefix}_top_right`);
      if (!landDown && !landRight && !isOceanOrOOB(tx + 1, ty + 1, override))
        corners.push(`${prefix}_top_left`);

      return corners;
    },
    [isOceanOrOOB],
  );

  const pickGrass = useCallback((tx: number, ty: number) => {
    const grassVariants: [string, number][] = [
      ["grass", 80],
      ["grass_dirt_1", 2],
      ["grass_dirt_2", 2],
      ["grass_dirt_3", 2],
      ["grass_dirt_4", 2],
      ["grass_weed_1", 3],
      ["grass_weed_2", 3],
      ["grass_weed_3", 3],
      ["grass_weed_4", 3],
    ];
    const totalWeight = grassVariants.reduce(
      (sum, [, w]) => sum + (w as number),
      0,
    );
    const hash = ((tx * 2654435761) ^ (ty * 2246822519)) >>> 0;
    let roll = hash % totalWeight;
    for (const [name, weight] of grassVariants) {
      roll -= weight as number;
      if (roll < 0) return name as string;
    }
    return "grass";
  }, []);

  const getTileSprites = useCallback(
    (
      tx: number,
      ty: number,
      charOverride?: string,
      simpleGrass?: boolean,
      previewOverride?: { x: number; y: number; char: string },
    ) => {
      const { terrain: t, width: w, height: h } = mapDataRef.current;
      if (ty < 0 || ty >= h || tx < 0 || tx >= w) {
        return ["border_water"];
      }

      // Priority: charOverride > previewOverride (if at matching pos) > actual terrain
      let char = charOverride;
      if (
        !char &&
        previewOverride &&
        tx === previewOverride.x &&
        ty === previewOverride.y
      ) {
        char = previewOverride.char;
      }
      if (!char) {
        char = t[ty][tx];
      }

      const sprites: string[] = [];

      if (char === "O" || char === "k" || char === "b" || char === "s") {
        sprites.push("border_water");
        const prefix =
          char === "b" ? "bluff" : char === "s" ? "beach" : "cliff";
        const primary = pickOceanBorder(tx, ty, prefix, previewOverride);
        if (primary) sprites.push(primary);
        const corners = pickOceanOuterCorners(tx, ty, prefix, previewOverride);
        sprites.push(...corners);
      } else {
        sprites.push(simpleGrass ? "grass" : pickGrass(tx, ty));
        if (char === "M")
          sprites.push(pickAutotile(tx, ty, "M", "mountain", previewOverride));
        else if (char === "T")
          sprites.push(pickAutotile(tx, ty, "T", "tree", previewOverride));
        else if (char === "R")
          sprites.push(pickAutotile(tx, ty, "R", "road", previewOverride));
        else if (char === "D")
          sprites.push(pickAutotile(tx, ty, "D", "dirtroad", previewOverride));
      }
      return sprites;
    },
    [pickOceanBorder, pickOceanOuterCorners, pickAutotile, pickGrass],
  );

  const getExportChar = (x: number, y: number) => {
    // Edge tiles are always ocean visually
    const char = isEdgeTile(x, y) ? "O" : terrain[y][x];
    if (char === "O") {
      const landUp = !isOceanOrOOB(x, y - 1);
      const landDown = !isOceanOrOOB(x, y + 1);
      const landLeft = !isOceanOrOOB(x - 1, y);
      const landRight = !isOceanOrOOB(x + 1, y);
      const landUpLeft = !isOceanOrOOB(x - 1, y - 1);
      const landUpRight = !isOceanOrOOB(x + 1, y - 1);
      const landDownLeft = !isOceanOrOOB(x - 1, y + 1);
      const landDownRight = !isOceanOrOOB(x + 1, y + 1);
      if (
        landUp ||
        landDown ||
        landLeft ||
        landRight ||
        landUpLeft ||
        landUpRight ||
        landDownLeft ||
        landDownRight
      )
        return "k";
    }
    return char;
  };

  const handleExport = () => {
    const terrainText = terrain
      .slice(0, height)
      .map((row, y) =>
        row
          .slice(0, width)
          .map((_, x) => getExportChar(x, y))
          .join(" "),
      )
      .join("\n");
    const buildingsText = buildings
      .filter((b) => b.x > 0 && b.y > 0 && b.x < width - 1 && b.y < height - 1)
      .map((b) => `${b.type} ${b.player} ${b.x} ${b.y}`)
      .join("\n");
    const unitsText = units
      .filter((u) => u.x > 0 && u.y > 0 && u.x < width - 1 && u.y < height - 1)
      .map((u) => `${u.type} ${u.player} ${u.x} ${u.y}`)
      .join("\n");

    const download = (filename: string, content: string) => {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    download("terrain.txt", terrainText);
    if (buildingsText) download("buildings.txt", buildingsText);
    if (unitsText) download("units.txt", unitsText);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    saveState();

    let newW = mapData.width;
    let newH = mapData.height;
    let newTerrain = [...mapData.terrain.map((r) => [...r])];
    let newBuildings = [...mapData.buildings];
    let newUnits = [...mapData.units];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();
      const lines = text
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));

      if (file.name === "terrain.txt") {
        newTerrain = lines.map((line) => line.split(/\s+/));
        if (newTerrain.length > 0) {
          newH = newTerrain.length;
          newW = newTerrain[0].length;
        }
      } else if (file.name === "buildings.txt") {
        newBuildings = lines.map((line) => {
          const parts = line.split(/\s+/);
          return {
            type: parts[0],
            player: parseInt(parts[1], 10),
            x: parseInt(parts[2], 10),
            y: parseInt(parts[3], 10),
          };
        });
      } else if (file.name === "units.txt") {
        newUnits = lines.map((line) => {
          const parts = line.split(/\s+/);
          return {
            type: parts[0],
            player: parseInt(parts[1], 10),
            x: parseInt(parts[2], 10),
            y: parseInt(parts[3], 10),
          };
        });
      }
    }
    setMapData({
      width: newW,
      height: newH,
      terrain: newTerrain,
      buildings: newBuildings,
      units: newUnits,
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // PixiJS Integration
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const mapContainerRef = useRef<Container | null>(null);
  const sheetRef = useRef<Spritesheet | null>(null);

  // Use refs for callbacks inside Pixi events to avoid recreation
  const applyToolRef = useRef(applyTool);
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  const saveStateRef = useRef(saveState);
  const toolCategoryRef = useRef(toolCategory);
  const selectedTerrainRef = useRef(selectedTerrain);
  const selectedBuildingRef = useRef(selectedBuilding);
  const selectedUnitRef = useRef(selectedUnit);
  const selectedPlayerRef = useRef(selectedPlayer);

  useEffect(() => {
    applyToolRef.current = applyTool;
  }, [applyTool]);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);
  useEffect(() => {
    heightRef.current = height;
  }, [height]);
  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);
  useEffect(() => {
    toolCategoryRef.current = toolCategory;
  }, [toolCategory]);
  useEffect(() => {
    selectedTerrainRef.current = selectedTerrain;
  }, [selectedTerrain]);
  useEffect(() => {
    selectedBuildingRef.current = selectedBuilding;
  }, [selectedBuilding]);
  useEffect(() => {
    selectedUnitRef.current = selectedUnit;
  }, [selectedUnit]);
  useEffect(() => {
    selectedPlayerRef.current = selectedPlayer;
  }, [selectedPlayer]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (appRef.current) {
      // If already exists, just trigger a redraw
      setMapData((prev) => ({ ...prev }));
      return;
    }

    let destroyed = false;
    const app = new Application();
    app
      .init({
        resizeTo: containerRef.current,
        backgroundColor: 0x001a33,
        antialias: false,
        roundPixels: true,
      })
      .then(async () => {
        if (destroyed) {
          app.destroy(true, { children: true });
          return;
        }
        appRef.current = app;
        if (containerRef.current)
          containerRef.current.appendChild(app.canvas as HTMLCanvasElement);

        const texture = await Assets.load({
          src: "/tilesets/terrain.png",
          data: { scaleMode: "nearest" },
        });
        const sheet = new Spritesheet(texture, terrainAtlas);
        await sheet.parse();
        sheetRef.current = sheet;

        const vp = new Viewport({
          screenWidth: app.screen.width,
          screenHeight: app.screen.height,
          worldWidth: widthRef.current * 32,
          worldHeight: heightRef.current * 32,
          events: app.renderer.events,
        });
        app.stage.addChild(vp as any);

        // Panning with right click (button 2) or middle click (button 1)
        vp.drag({ mouseButtons: "right" })
          .pinch()
          .wheel()
          .clampZoom({ minScale: 0.25, maxScale: 4 });
        vp.scale.set(1.5);
        vp.moveCenter(
          (widthRef.current * 32) / 2,
          (heightRef.current * 32) / 2,
        );

        const mapContainer = new Container();
        vp.addChild(mapContainer);
        mapContainerRef.current = mapContainer;

        const overlayGrid = new Graphics();
        vp.addChild(overlayGrid);

        const drawGrid = () => {
          overlayGrid.clear();
          overlayGrid.setStrokeStyle({
            color: 0xffffff,
            alpha: 0.15,
            width: 1,
          });
          const w = widthRef.current * 32;
          const h = heightRef.current * 32;
          for (let x = 0; x <= w; x += 32)
            overlayGrid.moveTo(x, 0).lineTo(x, h);
          for (let y = 0; y <= h; y += 32)
            overlayGrid.moveTo(0, y).lineTo(w, y);
          overlayGrid.stroke();
        };
        drawGrid();

        // Listen for viewport resize to update grid bounds if width/height changed
        app.ticker.add(() => {
          if (
            vp.worldWidth !== widthRef.current * 32 ||
            vp.worldHeight !== heightRef.current * 32
          ) {
            vp.resize(
              app.screen.width,
              app.screen.height,
              widthRef.current * 32,
              heightRef.current * 32,
            );
            drawGrid();
          }
        });

        const highlight = new Container();
        const highlightBox = new Graphics();
        const highlightPreview = new Container();
        highlight.addChild(highlightPreview);
        highlight.addChild(highlightBox);
        highlightPreview.alpha = 0.7;
        highlight.visible = false;
        vp.addChild(highlight);

        // Handle Drawing events
        let isDrawing = false;
        let lastDrawnPos = { x: -1, y: -1 };

        vp.on("pointerdown", (e) => {
          if (e.button === 0) {
            // Left click
            const pos = vp.toLocal(e.global);
            const tx = Math.floor(pos.x / 32);
            const ty = Math.floor(pos.y / 32);

            if (
              tx >= 0 &&
              tx < widthRef.current &&
              ty >= 0 &&
              ty < heightRef.current
            ) {
              saveStateRef.current();
              isDrawing = true;
              lastDrawnPos = { x: tx, y: ty };
              applyToolRef.current(tx, ty);
            }
          }
        });

        vp.on("pointerup", (e) => {
          if (e.button === 0) isDrawing = false;
        });
        vp.on("pointerupoutside", (e) => {
          if (e.button === 0) isDrawing = false;
        });

        vp.on("pointermove", (e) => {
          const pos = vp.toLocal(e.global);
          const tx = Math.floor(pos.x / 32);
          const ty = Math.floor(pos.y / 32);

          if (
            tx >= 0 &&
            tx < widthRef.current &&
            ty >= 0 &&
            ty < heightRef.current
          ) {
            setHoveredPos({ x: tx, y: ty });
            highlight.visible = true;
            highlight.x = tx * 32;
            highlight.y = ty * 32;

            const isEdge =
              tx === 0 ||
              ty === 0 ||
              tx === widthRef.current - 1 ||
              ty === heightRef.current - 1;
            let isIllegal = false;
            const tool = toolCategoryRef.current;
            if (tool === "terrain") {
              if (isEdge && selectedTerrainRef.current !== "O")
                isIllegal = true;
            } else if (tool === "building" || tool === "unit") {
              if (isEdge) isIllegal = true;
            }

            highlightBox.clear();
            if (isIllegal) {
              highlightBox.setStrokeStyle({
                color: 0xff0000,
                alpha: 0.8,
                width: 2,
              });
              highlightBox.rect(0, 0, 32, 32);
              highlightBox.moveTo(8, 8).lineTo(24, 24);
              highlightBox.moveTo(24, 8).lineTo(8, 24);
              highlightBox.stroke();
            } else if (tool === "erase") {
              highlightBox.setStrokeStyle({
                color: 0xffffff,
                alpha: 1.0,
                width: 2,
              });
              highlightBox.rect(0, 0, 32, 32);
              highlightBox.stroke();
            }

            // Preview logic
            highlightPreview.removeChildren();
            if (sheetRef.current) {
              const sheet = sheetRef.current;
              const addPreviewSprite = (
                name: string,
                px: number,
                py: number,
              ) => {
                const tex = sheet.textures[name];
                if (tex) {
                  const s = new Sprite(tex);
                  s.width = 32;
                  s.height = 32;
                  s.x = px * 32;
                  s.y = py * 32;
                  highlightPreview.addChild(s);
                }
              };

              const addPreviewText = (
                text: string,
                size: number,
                color: string,
                align: "top" | "bottom" | "center" = "center",
              ) => {
                const t = new Text({
                  text,
                  style: new TextStyle({
                    fontFamily: "monospace",
                    fontSize: size,
                    fill: color,
                    fontWeight: "bold",
                  }),
                });
                t.x = (32 - t.width) / 2;
                if (align === "center") t.y = (32 - t.height) / 2;
                else if (align === "top") t.y = 2;
                else if (align === "bottom") t.y = 32 - t.height - 2;
                highlightPreview.addChild(t);
              };

              if (tool === "terrain") {
                const char = selectedTerrainRef.current;
                const override = { x: tx, y: ty, char };
                // Draw 3x3 area to show how neighbors update their borders!
                for (let dy = -1; dy <= 1; dy++) {
                  for (let dx = -1; dx <= 1; dx++) {
                    const nx = tx + dx;
                    const ny = ty + dy;
                    if (
                      nx >= 0 &&
                      nx < widthRef.current &&
                      ny >= 0 &&
                      ny < heightRef.current
                    ) {
                      // simpleGrass: true for preview
                      const sprites = getTileSprites(
                        nx,
                        ny,
                        undefined,
                        true,
                        override,
                      );
                      for (const sp of sprites) addPreviewSprite(sp, dx, dy);
                    }
                  }
                }
              } else if (tool === "building") {
                const bType = selectedBuildingRef.current;
                addPreviewSprite(
                  bType === "City"
                    ? "city_idle"
                    : bType === "Factory"
                      ? "factory_idle"
                      : "hq_bottom",
                  0,
                  0,
                );
                addPreviewText(
                  `P${selectedPlayerRef.current}`,
                  10,
                  "#ffffff",
                  "top",
                );
              } else if (tool === "unit") {
                addPreviewText(
                  selectedUnitRef.current.substring(0, 3).toUpperCase(),
                  10,
                  "#ff5555",
                  "bottom",
                );
              }
            }

            if (isDrawing && (tx !== lastDrawnPos.x || ty !== lastDrawnPos.y)) {
              lastDrawnPos = { x: tx, y: ty };
              applyToolRef.current(tx, ty);
            }
          } else {
            setHoveredPos(null);
            highlight.visible = false;
          }
        });

        app.canvas.addEventListener("pointerout", () => {
          setHoveredPos(null);
          highlight.visible = false;
        });

        // Prevent context menu on right click to allow panning
        app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        // Trigger initial draw by slightly changing state reference or just letting useEffect handle it
        setMapData((prev) => ({ ...prev }));
      });

    return () => {
      destroyed = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []); // Only run once

  // Redraw map when state changes
  useEffect(() => {
    const container = mapContainerRef.current;
    const sheet = sheetRef.current;
    if (!container || !sheet) return;

    container.removeChildren();

    const addSprite = (name: string, x: number, y: number, alpha = 1) => {
      const tex = sheet.textures[name];
      if (tex) {
        const s = new Sprite(tex);
        s.x = x * 32;
        s.y = y * 32;
        s.width = 32;
        s.height = 32;
        s.alpha = alpha;
        container.addChild(s);
      }
    };

    const addText = (
      text: string,
      x: number,
      y: number,
      size: number,
      color: string,
      align: "top" | "bottom" | "center" = "center",
    ) => {
      const t = new Text({
        text,
        style: new TextStyle({
          fontFamily: "monospace",
          fontSize: size,
          fill: color,
          fontWeight: "bold",
        }),
      });
      t.x = x * 32 + (32 - t.width) / 2;
      if (align === "center") t.y = y * 32 + (32 - t.height) / 2;
      else if (align === "top") t.y = y * 32 + 2;
      else if (align === "bottom") t.y = y * 32 + 32 - t.height - 2;
      container.addChild(t);
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isEdge =
          x === 0 || y === 0 || x === width - 1 || y === height - 1;
        const sprites = getTileSprites(x, y, isEdge ? "O" : undefined);
        for (const sp of sprites) addSprite(sp, x, y);
        const bldg = !isEdge && buildings.find((b) => b.x === x && b.y === y);
        if (bldg) {
          addSprite(
            bldg.type === "City"
              ? "city_idle"
              : bldg.type === "Factory"
                ? "factory_idle"
                : "hq_bottom",
            x,
            y,
          );
          if (bldg.type === "HQ") addSprite("hq_top", x, y - 1);
          addText(`P${bldg.player}`, x, y, 10, "#ffffff", "top");
        }

        const unit = !isEdge && units.find((u) => u.x === x && u.y === y);
        if (unit) {
          addText(
            `${unit.type.substring(0, 3).toUpperCase()}`,
            x,
            y,
            10,
            "#ff5555",
            "bottom",
          );
        }
      }
    }
  }, [mapData, getTileSprites, hoveredPos]); // mapData covers all sub-properties

  return (
    <BlueprintContainer fullWidth>
      <div className="flex w-full h-full gap-4 text-white font-mono">
        {/* PixiJS Canvas Container */}
        <PixelPanel className="flex-1 flex flex-col relative overflow-hidden">
          {/* Menu bar */}
          <div className="flex items-center gap-2 border-b border-white/20 pb-2 mb-1 shrink-0">
            <span
              className="text-xl font-bold underline mr-auto"
              style={{ textUnderlineOffset: "5px" }}
            >
              [TACTICAL_MAP_CANVAS]
            </span>
            <div className="relative" ref={mapMenuRef}>
              <button
                onClick={() => setIsMapMenuOpen((v) => !v)}
                className={`px-4 py-2 text-sm uppercase tracking-wider border-2 border-white/30 transition-all duration-150 ${isMapMenuOpen ? "bg-white text-blueprint-blue" : "hover:bg-white/10"}`}
              >
                Map ▾
              </button>
              {isMapMenuOpen && (
                <div className="absolute top-full right-0 mt-1 z-20 border-2 border-white bg-blueprint-blue/95 shadow-[0_0_15px_rgba(255,255,255,0.1)] min-w-[200px]">
                  <button
                    onClick={() => {
                      handleRandomize();
                      setIsMapMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm uppercase tracking-wider border-b border-white/15 hover:bg-white hover:text-blueprint-blue transition-all duration-150"
                  >
                    &gt; Randomize
                  </button>
                  <button
                    onClick={() => {
                      handleExport();
                      setIsMapMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm uppercase tracking-wider border-b border-white/15 hover:bg-white hover:text-blueprint-blue transition-all duration-150"
                  >
                    &gt; Export
                  </button>
                  <label
                    className="block w-full text-left px-4 py-3 text-sm uppercase tracking-wider border-b border-white/15 hover:bg-white hover:text-blueprint-blue transition-all duration-150 cursor-pointer"
                    onClick={() => setIsMapMenuOpen(false)}
                  >
                    &gt; Import
                    <input
                      type="file"
                      multiple
                      accept=".txt"
                      ref={fileInputRef}
                      onChange={handleImport}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => {
                      setIsResetModalOpen(true);
                      setIsMapMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm uppercase tracking-wider text-red-400 hover:bg-red-400 hover:text-blueprint-blue transition-all duration-150"
                  >
                    &gt; Reset
                  </button>
                </div>
              )}
            </div>
          </div>
          <div ref={containerRef} className="w-full flex-1 cursor-crosshair" />
        </PixelPanel>

        {/* Tools Palette */}
        <PixelPanel
          className="w-64 flex flex-col gap-4 overflow-y-auto"
          title="EDITOR_TOOLS"
        >
          <div>
            <div className="text-xs mb-2 opacity-50">DIMENSIONS (MAX 40)</div>
            <div className="flex flex-col gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-50 w-6">W</span>
                <input
                  type="range"
                  min="10"
                  max="40"
                  value={width}
                  onChange={(e) =>
                    handleResize(parseInt(e.target.value, 10), height)
                  }
                  className="flex-1 accent-white h-2 cursor-pointer"
                />
                <span className="text-base w-8 text-center">{width}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-50 w-6">H</span>
                <input
                  type="range"
                  min="10"
                  max="40"
                  value={height}
                  onChange={(e) =>
                    handleResize(width, parseInt(e.target.value, 10))
                  }
                  className="flex-1 accent-white h-2 cursor-pointer"
                />
                <span className="text-base w-8 text-center">{height}</span>
              </div>
            </div>
          </div>
          <hr className="border-white/20" />
          <div>
            <div className="text-xs mb-2 opacity-50">TOOL CATEGORY</div>
            <div className="flex flex-col gap-1">
              <PixelButton
                variant={toolCategory === "terrain" ? "green" : "blue"}
                onClick={() => setToolCategory("terrain")}
              >
                Terrain
              </PixelButton>
              <PixelButton
                variant={toolCategory === "building" ? "green" : "blue"}
                onClick={() => setToolCategory("building")}
              >
                Building
              </PixelButton>
              <PixelButton
                variant={toolCategory === "unit" ? "green" : "blue"}
                onClick={() => setToolCategory("unit")}
              >
                Unit
              </PixelButton>
              <PixelButton
                variant={toolCategory === "erase" ? "green" : "blue"}
                onClick={() => setToolCategory("erase")}
              >
                Erase Object
              </PixelButton>
            </div>
          </div>
          {toolCategory === "terrain" && (
            <div>
              <div className="text-xs mb-2 opacity-50 mt-4">TERRAIN</div>
              <div className="grid grid-cols-2 gap-1">
                {TERRAIN_TYPES.map((t) => (
                  <button
                    key={t.char}
                    onClick={() => setSelectedTerrain(t.char)}
                    className={`h-8 border text-xs flex items-center justify-center ${selectedTerrain === t.char ? "border-green-500 text-green-500 bg-white/5" : "border-white/30 hover:border-white/60"}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {toolCategory === "building" && (
            <div>
              <div className="text-xs mb-2 opacity-50 mt-4">BUILDINGS</div>
              <div className="flex flex-col gap-1">
                {BUILDING_TYPES.map((b) => (
                  <PixelButton
                    key={b}
                    variant={selectedBuilding === b ? "green" : "gray"}
                    onClick={() => setSelectedBuilding(b)}
                  >
                    {b}
                  </PixelButton>
                ))}
              </div>
            </div>
          )}
          {toolCategory === "unit" && (
            <div>
              <div className="text-xs mb-2 opacity-50 mt-4">UNITS</div>
              <div className="flex flex-col gap-1">
                {UNIT_TYPES.map((u) => (
                  <button
                    key={u}
                    onClick={() => setSelectedUnit(u)}
                    className={`text-left text-sm p-1 border ${selectedUnit === u ? "border-green-500 text-green-500 bg-white/5" : "border-transparent hover:border-white/30"}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(toolCategory === "building" || toolCategory === "unit") && (
            <div>
              <div className="text-xs mb-2 opacity-50 mt-4">PLAYER OWNER</div>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedPlayer(p)}
                    className={`w-8 h-8 border text-sm flex items-center justify-center ${selectedPlayer === p ? "border-green-500 text-green-500 bg-white/5" : "border-white/30 hover:border-white/60"}`}
                  >
                    P{p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </PixelPanel>
      </div>

      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-blueprint-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <PixelPanel title="CONFIRM_RESET" className="!p-6">
              <div className="flex flex-col gap-5">
                <div className="text-center text-red-500 uppercase tracking-widest">
                  Warning: This will clear all terrain, buildings, and units.
                  You can undo this action.
                </div>
                <div className="flex justify-between gap-4 mt-4">
                  <PixelButton
                    variant="gray"
                    className="flex-1"
                    onClick={() => setIsResetModalOpen(false)}
                  >
                    CANCEL
                  </PixelButton>
                  <PixelButton
                    className="flex-1 !border-red-500 !text-red-500 hover:!bg-red-500 hover:!text-black"
                    onClick={handleReset}
                  >
                    CONFIRM RESET
                  </PixelButton>
                </div>
              </div>
            </PixelPanel>
          </div>
        </div>
      )}
    </BlueprintContainer>
  );
}
