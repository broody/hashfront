import { useEffect, useRef, useCallback } from "react";
import {
  AnimatedSprite,
  Application,
  Assets,
  Graphics,
  Sprite,
  Spritesheet,
  Texture,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import { tileMap, units, addUnit } from "../data/gameStore";
import type { Unit } from "../data/gameStore";
import { GRID_SIZE, TILE_PX, TILE_COLORS, TileType } from "../game/types";
import { terrainAtlas } from "../game/spritesheets/terrain";
import {
  unitAtlasBlue,
  unitAtlasRed,
  unitAtlasGreen,
  unitAtlasYellow,
} from "../game/spritesheets/units";
import { findPath } from "../game/pathfinding";

const WORLD_SIZE = GRID_SIZE * TILE_PX;

export default function GameViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const init = useCallback(async () => {
    if (!containerRef.current || appRef.current) return;

    const app = new Application();
    await app.init({
      resizeTo: containerRef.current,
      backgroundColor: 0x1b1b1b,
      antialias: false,
    });

    // Guard against strict mode double-mount race
    if (!containerRef.current || appRef.current) {
      app.destroy();
      return;
    }

    appRef.current = app;
    containerRef.current.appendChild(app.canvas as HTMLCanvasElement);

    const vp = new Viewport({
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      worldWidth: WORLD_SIZE,
      worldHeight: WORLD_SIZE,
      events: app.renderer.events,
    });
    app.stage.addChild(vp as any);

    vp.drag({ mouseButtons: "left" }).pinch().wheel().clampZoom({
      minScale: 1,
      maxScale: 4,
    });

    // Center on the map
    vp.moveCenter(WORLD_SIZE / 2, WORLD_SIZE / 2);
    vp.fitWorld();

    // --- Load terrain spritesheet ---
    const terrainTexture = await Assets.load({
      src: "/tilesets/terrain.png",
      data: { scaleMode: "nearest" },
    });
    const terrainSheet = new Spritesheet(terrainTexture, terrainAtlas);
    await terrainSheet.parse();

    // --- Tile rendering ---
    const gridGfx = new Graphics();
    vp.addChild(gridGfx);

    // Weighted grass variants: ~60% plain, ~25% dirt, ~15% weed
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
    const totalWeight = grassVariants.reduce((sum, [, w]) => sum + w, 0);

    function pickGrass(x: number, y: number): string {
      const hash = ((x * 2654435761) ^ (y * 2246822519)) >>> 0;
      let roll = hash % totalWeight;
      for (const [name, weight] of grassVariants) {
        roll -= weight;
        if (roll < 0) return name;
      }
      return "grass";
    }

    function isTileType(x: number, y: number, type: TileType): boolean {
      if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
      return tileMap[y * GRID_SIZE + x] === type;
    }

    function pickAutotile(
      x: number,
      y: number,
      type: TileType,
      prefix: string,
    ): string {
      const left = isTileType(x - 1, y, type);
      const right = isTileType(x + 1, y, type);
      const up = isTileType(x, y - 1, type);
      const down = isTileType(x, y + 1, type);

      const horizontal = left || right;
      const vertical = up || down;

      // Vertical chain
      if (vertical && !horizontal) {
        if (up && down) return `${prefix}_vertical_mid`;
        if (!up && down) return `${prefix}_top`;
        if (up && !down) return `${prefix}_bottom`;
      }

      // Horizontal chain
      if (horizontal && !vertical) {
        if (left && right) return `${prefix}_horizontal_mid`;
        if (!left && right) return `${prefix}_left`;
        if (left && !right) return `${prefix}_right`;
      }

      // Corners and edges
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
    }

    function addTileSprite(frameName: string, x: number, y: number) {
      const sprite = new Sprite(terrainSheet.textures[frameName]);
      sprite.x = x * TILE_PX;
      sprite.y = y * TILE_PX;
      sprite.width = TILE_PX;
      sprite.height = TILE_PX;
      vp.addChild(sprite);
    }

    function addTileAnim(animName: string, x: number, y: number) {
      const frames = terrainSheet.animations[animName];
      const anim = new AnimatedSprite(frames);
      anim.animationSpeed = 0.05;
      anim.play();
      anim.x = x * TILE_PX;
      anim.y = y * TILE_PX;
      anim.width = TILE_PX;
      anim.height = TILE_PX;
      vp.addChild(anim);
    }

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const tile = tileMap[y * GRID_SIZE + x] as TileType;

        if (tile === TileType.Grass) {
          addTileSprite(pickGrass(x, y), x, y);
        } else if (tile === TileType.Mountain) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileSprite(
            pickAutotile(x, y, TileType.Mountain, "mountain"),
            x,
            y,
          );
        } else if (tile === TileType.Tree) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileSprite(pickAutotile(x, y, TileType.Tree, "tree"), x, y);
        } else if (tile === TileType.Road) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileSprite(pickAutotile(x, y, TileType.Road, "road"), x, y);
        } else if (tile === TileType.DirtRoad) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileSprite(
            pickAutotile(x, y, TileType.DirtRoad, "dirtroad"),
            x,
            y,
          );
        } else if (tile === TileType.Factory) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileAnim("factory_producing", x, y);
        } else if (tile === TileType.HQ) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileSprite("hq_bottom", x, y);
          if (y > 0) {
            addTileSprite(pickGrass(x, y - 1), x, y - 1);
            addTileSprite("hq_top", x, y - 1);
          }
        } else if (tile === TileType.Barracks) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileAnim("barracks_producing", x, y);
        } else {
          const color = TILE_COLORS[tile];
          gridGfx.rect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX).fill(color);
        }
      }
    }

    // --- Load unit spritesheets ---
    const [blueTexture, redTexture, greenTexture, yellowTexture] =
      await Promise.all([
        Assets.load({
          src: "/tilesets/units_blue.png",
          data: { scaleMode: "nearest" },
        }),
        Assets.load({
          src: "/tilesets/units_red.png",
          data: { scaleMode: "nearest" },
        }),
        Assets.load({
          src: "/tilesets/units_green.png",
          data: { scaleMode: "nearest" },
        }),
        Assets.load({
          src: "/tilesets/units_yellow.png",
          data: { scaleMode: "nearest" },
        }),
      ]);
    const blueSheet = new Spritesheet(blueTexture, unitAtlasBlue);
    const redSheet = new Spritesheet(redTexture, unitAtlasRed);
    const greenSheet = new Spritesheet(greenTexture, unitAtlasGreen);
    const yellowSheet = new Spritesheet(yellowTexture, unitAtlasYellow);
    await Promise.all([
      blueSheet.parse(),
      redSheet.parse(),
      greenSheet.parse(),
      yellowSheet.parse(),
    ]);
    const unitSheets: Record<string, Spritesheet> = {
      blue: blueSheet,
      red: redSheet,
      green: greenSheet,
      yellow: yellowSheet,
    };

    // PRD unit types: Infantry (rifle), Tank (tank), Ranger (artillery)
    const UNIT_MOVE_RANGE: Record<string, number> = {
      rifle: 3, // Infantry
      tank: 2, // Tank
      artillery: 2, // Ranger
    };

    // --- Spawn starting units ---
    // Blue team (west side, near HQ at 1,7)
    addUnit("rifle", "blue", 2, 6);
    addUnit("rifle", "blue", 2, 8);
    addUnit("tank", "blue", 3, 7);
    addUnit("artillery", "blue", 1, 5);

    // Red team (east side, near HQ at 18,8)
    const r1 = addUnit("rifle", "red", 17, 7);
    r1.facing = "left";
    const r2 = addUnit("rifle", "red", 17, 9);
    r2.facing = "left";
    const r3 = addUnit("tank", "red", 16, 8);
    r3.facing = "left";
    const r4 = addUnit("artillery", "red", 18, 10);
    r4.facing = "left";

    // --- Render units ---
    const unitSprites = new Map<number, AnimatedSprite>();

    function createUnitSprite(unit: Unit): AnimatedSprite {
      const sheet = unitSheets[unit.team];
      const animKey = `${unit.type}_${unit.animation}`;
      const frames = sheet.animations[animKey];
      const anim = new AnimatedSprite(frames);
      anim.animationSpeed = 0.1;
      anim.play();
      anim.anchor.set(0.5, 0.5);
      anim.x = unit.x * TILE_PX + TILE_PX / 2;
      anim.y = unit.y * TILE_PX + TILE_PX / 2;
      anim.width = TILE_PX;
      anim.height = TILE_PX;
      if (unit.facing === "left") {
        anim.scale.x *= -1;
      }
      vp.addChild(anim);
      return anim;
    }

    function setUnitAnim(
      unit: Unit,
      sprite: AnimatedSprite,
      anim: Unit["animation"],
      facing?: Unit["facing"],
    ) {
      const newKey = `${unit.type}_${anim}`;
      const sheet = unitSheets[unit.team];
      const frames = sheet.animations[newKey];
      if (!frames) return;
      unit.animation = anim;
      if (facing !== undefined) unit.facing = facing;
      sprite.textures = frames;
      sprite.play();
      // Preserve size through texture swap
      const absScaleX = Math.abs(sprite.scale.x);
      sprite.scale.x = unit.facing === "left" ? -absScaleX : absScaleX;
    }

    for (const unit of units) {
      const sprite = createUnitSprite(unit);
      unitSprites.set(unit.id, sprite);
    }

    // --- Selection state ---
    let selectedUnit: Unit | null = null;
    const selectGfx = new Graphics();
    vp.addChild(selectGfx);
    let selectPulse = 0;

    function drawSelection() {
      selectGfx.clear();
      if (!selectedUnit) return;
      const sprite = unitSprites.get(selectedUnit.id);
      if (!sprite) return;

      const pulse = 1 + Math.sin(selectPulse) * 0.12;
      const pad = 3; // pixels outside the tile
      const half = (TILE_PX / 2 + pad) * pulse;
      const cx = sprite.x;
      const cy = sprite.y;
      const len = 6 * pulse; // corner arm length
      const teamColors: Record<string, number> = {
        blue: 0x4a9eff,
        red: 0xff4a4a,
        green: 0x4aff4a,
        yellow: 0xffdd4a,
      };
      const color = teamColors[selectedUnit.team] ?? 0xff8c00;
      const width = 2;

      // Top-left corner
      selectGfx
        .moveTo(cx - half + len, cy - half)
        .lineTo(cx - half, cy - half)
        .lineTo(cx - half, cy - half + len);
      // Top-right corner
      selectGfx
        .moveTo(cx + half - len, cy - half)
        .lineTo(cx + half, cy - half)
        .lineTo(cx + half, cy - half + len);
      // Bottom-left corner
      selectGfx
        .moveTo(cx - half, cy + half - len)
        .lineTo(cx - half, cy + half)
        .lineTo(cx - half + len, cy + half);
      // Bottom-right corner
      selectGfx
        .moveTo(cx + half, cy + half - len)
        .lineTo(cx + half, cy + half)
        .lineTo(cx + half - len, cy + half);

      selectGfx.stroke({ color, width });
    }

    // --- Blocked tiles from unit positions ---
    function getBlockedTiles(excludeId: number): Set<number> {
      const blocked = new Set<number>();
      for (const u of units) {
        if (u.id === excludeId) continue;
        blocked.add(u.y * GRID_SIZE + u.x);
      }
      return blocked;
    }

    // --- Movement state (per-unit) ---
    interface MoveState {
      unit: Unit;
      path: { x: number; y: number }[];
      stepIndex: number;
      progress: number;
      startX: number;
      startY: number;
    }
    const activeMovements = new Map<number, MoveState>();

    // --- Hover highlight + path preview ---
    const hoverGfx = new Graphics();
    const pathGfx = new Graphics();
    vp.addChild(pathGfx);
    vp.addChild(hoverGfx);

    const canvas = app.canvas as HTMLCanvasElement;
    let lastPathGridX = -1;
    let lastPathGridY = -1;

    function drawPathPreview(gridX: number, gridY: number) {
      pathGfx.clear();
      if (!selectedUnit || activeMovements.has(selectedUnit.id)) return;
      if (gridX === selectedUnit.x && gridY === selectedUnit.y) return;

      const range = UNIT_MOVE_RANGE[selectedUnit.type] ?? 5;
      const path = findPath(
        tileMap,
        selectedUnit.x,
        selectedUnit.y,
        gridX,
        gridY,
        range,
        getBlockedTiles(selectedUnit.id),
      );
      if (path.length === 0) return;

      for (const step of path) {
        pathGfx
          .rect(step.x * TILE_PX, step.y * TILE_PX, TILE_PX, TILE_PX)
          .fill({ color: 0xffffff, alpha: 0.2 });
      }
    }

    function onPointerMove(ev: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const screenX = ev.clientX - rect.left;
      const screenY = ev.clientY - rect.top;
      const worldPos = vp.toWorld(screenX, screenY);
      const gridX = Math.floor(worldPos.x / TILE_PX);
      const gridY = Math.floor(worldPos.y / TILE_PX);

      hoverGfx.clear();
      if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        hoverGfx
          .rect(gridX * TILE_PX, gridY * TILE_PX, TILE_PX, TILE_PX)
          .fill({ color: 0xffffff, alpha: 0.2 });

        // Update path preview only when grid cell changes
        if (gridX !== lastPathGridX || gridY !== lastPathGridY) {
          lastPathGridX = gridX;
          lastPathGridY = gridY;
          drawPathPreview(gridX, gridY);
        }
      }
    }

    function onPointerLeave() {
      hoverGfx.clear();
    }

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // --- Left-click selection (via pixi-viewport 'clicked' to avoid drag conflicts) ---
    function onVpClicked(e: { world: { x: number; y: number } }) {
      const gridX = Math.floor(e.world.x / TILE_PX);
      const gridY = Math.floor(e.world.y / TILE_PX);
      if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE)
        return;

      // Find unit at clicked tile — click empty space to deselect
      const clicked = units.find(
        (u) => u.x === gridX && u.y === gridY && !activeMovements.has(u.id),
      );
      selectedUnit = clicked ?? null;
      drawSelection();
      pathGfx.clear();
      lastPathGridX = -1;
      lastPathGridY = -1;
    }
    vp.on("clicked", onVpClicked);

    // --- Right-click movement ---
    function onContextMenu(ev: MouseEvent) {
      ev.preventDefault();
    }

    function startMovement(unit: Unit, gridX: number, gridY: number) {
      if (activeMovements.has(unit.id)) return; // already moving

      const range = UNIT_MOVE_RANGE[unit.type] ?? 5;
      const path = findPath(
        tileMap,
        unit.x,
        unit.y,
        gridX,
        gridY,
        range,
        getBlockedTiles(unit.id),
      );
      if (path.length === 0) return;

      const ms: MoveState = {
        unit,
        path,
        stepIndex: 0,
        progress: 0,
        startX: unit.x,
        startY: unit.y,
      };
      activeMovements.set(unit.id, ms);

      // Set initial walk animation
      const sprite = unitSprites.get(unit.id)!;
      const dx = path[0].x - unit.x;
      const dy = path[0].y - unit.y;
      if (dy > 0) {
        setUnitAnim(unit, sprite, "walk_down");
      } else if (dy < 0) {
        setUnitAnim(unit, sprite, "walk_up");
      } else {
        setUnitAnim(unit, sprite, "walk_side", dx < 0 ? "left" : "right");
      }
    }

    function onPointerDown(ev: PointerEvent) {
      if (ev.button !== 2) return; // right-click only
      if (!selectedUnit) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = ev.clientX - rect.left;
      const screenY = ev.clientY - rect.top;
      const worldPos = vp.toWorld(screenX, screenY);
      const gridX = Math.floor(worldPos.x / TILE_PX);
      const gridY = Math.floor(worldPos.y / TILE_PX);

      if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE)
        return;

      startMovement(selectedUnit, gridX, gridY);
      pathGfx.clear();
    }

    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("pointerdown", onPointerDown);

    // --- Movement ticker ---
    const MOVE_SPEED = 4; // tiles per second

    const tickerCb = (ticker: { deltaTime: number }) => {
      for (const [id, ms] of activeMovements) {
        const sprite = unitSprites.get(id);
        if (!sprite) continue;

        ms.progress += (ticker.deltaTime * MOVE_SPEED) / 60;

        if (ms.progress >= 1) {
          const step = ms.path[ms.stepIndex];
          ms.unit.x = step.x;
          ms.unit.y = step.y;
          ms.startX = step.x;
          ms.startY = step.y;
          ms.stepIndex++;
          ms.progress = 0;

          if (ms.stepIndex >= ms.path.length) {
            sprite.x = ms.unit.x * TILE_PX + TILE_PX / 2;
            sprite.y = ms.unit.y * TILE_PX + TILE_PX / 2;
            setUnitAnim(ms.unit, sprite, "idle");
            activeMovements.delete(id);
            drawSelection();
            continue;
          }

          // Update facing for next step
          const next = ms.path[ms.stepIndex];
          const dx = next.x - ms.unit.x;
          const dy = next.y - ms.unit.y;
          if (dy > 0) {
            setUnitAnim(ms.unit, sprite, "walk_down");
          } else if (dy < 0) {
            setUnitAnim(ms.unit, sprite, "walk_up");
          } else {
            setUnitAnim(
              ms.unit,
              sprite,
              "walk_side",
              dx < 0 ? "left" : "right",
            );
          }
        }

        // Lerp position
        const target = ms.path[ms.stepIndex];
        const lx = ms.startX + (target.x - ms.startX) * ms.progress;
        const ly = ms.startY + (target.y - ms.startY) * ms.progress;
        sprite.x = lx * TILE_PX + TILE_PX / 2;
        sprite.y = ly * TILE_PX + TILE_PX / 2;
      }

      // Update selection highlight with pulse
      selectPulse += ticker.deltaTime * 0.15;
      drawSelection();
    };

    app.ticker.add(tickerCb);

    // --- Resize handling ---
    const ro = new ResizeObserver(() => {
      app.resize();
      vp.resize(app.screen.width, app.screen.height);
    });
    ro.observe(containerRef.current);

    cleanupRef.current = () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("pointerdown", onPointerDown);
      vp.off("clicked", onVpClicked);
      app.ticker.remove(tickerCb);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    init();
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, [init]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
      }}
    />
  );
}
