import { useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import {
  AnimatedSprite,
  Application,
  Assets,
  Graphics,
  Sprite,
  Spritesheet,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import { useGameStore, TEAMS, UNIT_MAX_HP } from "../data/gameStore";
import type { Unit, QueuedMove } from "../data/gameStore";
import { GRID_SIZE, TILE_PX, TILE_COLORS, TileType } from "../game/types";
import { terrainAtlas } from "../game/spritesheets/terrain";
import {
  unitAtlasBlue,
  unitAtlasRed,
  unitAtlasGreen,
  unitAtlasYellow,
} from "../game/spritesheets/units";
import { findPath, findReachable } from "../game/pathfinding";
import { num } from "starknet";
import { ACTIONS_ADDRESS } from "../StarknetProvider";

const WORLD_SIZE = GRID_SIZE * TILE_PX;

function isPlayerInGame(address: string | undefined): boolean {
  if (!address) return false;
  const hex = num.toHex(address);
  return useGameStore
    .getState()
    .players.some((p) => num.toHex(p.address) === hex);
}

function getMyTeam(address: string | undefined): string | null {
  if (!address) return null;
  const hex = num.toHex(address);
  const player = useGameStore
    .getState()
    .players.find((p) => num.toHex(p.address) === hex);
  if (!player) return null;
  return TEAMS[player.playerId] ?? null;
}

export default function GameViewport({ onLoaded }: { onLoaded?: () => void }) {
  const { id } = useParams<{ id: string }>();
  const gameId = Number.parseInt(id || "", 10);
  const { address } = useAccount();
  const gameIdRef = useRef(gameId);
  const addressRef = useRef(address);
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    gameIdRef.current = gameId;
    addressRef.current = address;
  }, [address, gameId]);

  const init = useCallback(async () => {
    if (!containerRef.current || appRef.current) return;

    // Capture current store state for initial rendering
    const tileMap = useGameStore.getState().tileMap;
    const initialUnits = useGameStore.getState().units;

    const app = new Application();
    await app.init({
      resizeTo: containerRef.current,
      backgroundColor: 0x001a33,
      antialias: false,
      roundPixels: true,
    });

    // Guard against strict mode double-mount race
    if (!containerRef.current || appRef.current || !app.canvas) {
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

    // Initial zoom and center on the map
    vp.scale.set(2);
    vp.moveCenter(WORLD_SIZE / 2, WORLD_SIZE / 2);
    vp.x = Math.round(vp.x);
    vp.y = Math.round(vp.y);

    // --- Draw Background Grid ---
    const bgGrid = new Graphics();
    vp.addChild(bgGrid);

    // Grid lines color (faint blueprint style)
    const GRID_COLOR = 0x224466;
    const GRID_ALPHA = 0.5;

    bgGrid.setStrokeStyle({ color: GRID_COLOR, alpha: GRID_ALPHA, width: 1 });

    // Draw an infinitely expanding grid (practically large enough to never see the edge)
    const EXTENT = TILE_PX * 200;
    const START_X = -EXTENT;
    const END_X = WORLD_SIZE + EXTENT;
    const START_Y = -EXTENT;
    const END_Y = WORLD_SIZE + EXTENT;

    // Draw vertical lines
    for (let x = START_X; x <= END_X; x += TILE_PX) {
      bgGrid.moveTo(x, START_Y).lineTo(x, END_Y);
    }
    // Draw horizontal lines
    for (let y = START_Y; y <= END_Y; y += TILE_PX) {
      bgGrid.moveTo(START_X, y).lineTo(END_X, y);
    }
    bgGrid.stroke();

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
      const sprite = new Sprite(
        terrainSheet.textures[frameName as keyof typeof terrainSheet.textures],
      );
      sprite.x = x * TILE_PX;
      sprite.y = y * TILE_PX;
      sprite.width = TILE_PX;
      sprite.height = TILE_PX;
      vp.addChild(sprite);
    }

    function addTileAnim(animName: string, x: number, y: number) {
      const frames =
        terrainSheet.animations[
          animName as keyof typeof terrainSheet.animations
        ];
      const anim = new AnimatedSprite(frames);
      anim.animationSpeed = 0.05;
      anim.play();
      anim.x = x * TILE_PX;
      anim.y = y * TILE_PX;
      anim.width = TILE_PX;
      anim.height = TILE_PX;
      vp.addChild(anim);
    }

    // Draw water under the full outer border ring.
    for (let y = -1; y <= GRID_SIZE; y++) {
      for (let x = -1; x <= GRID_SIZE; x++) {
        const isOuterRing =
          x === -1 || x === GRID_SIZE || y === -1 || y === GRID_SIZE;
        if (isOuterRing) {
          addTileSprite("border_water", x, y);
        }
      }
    }

    // Border pieces on top of the water ring.
    addTileSprite("border_top_left", -1, -1);
    addTileSprite("border_top_right", GRID_SIZE, -1);
    addTileSprite("border_bottom_left", -1, GRID_SIZE);
    addTileSprite("border_bottom_right", GRID_SIZE, GRID_SIZE);
    for (let x = 0; x < GRID_SIZE; x++) {
      addTileSprite("border_top_edge", x, -1);
      addTileSprite("border_bottom_edge", x, GRID_SIZE);
    }
    for (let y = 0; y < GRID_SIZE; y++) {
      addTileSprite("border_left_edge", -1, y);
      addTileSprite("border_right_edge", GRID_SIZE, y);
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

    const TEAM_COLORS: Record<string, number> = {
      blue: 0x4a9eff,
      red: 0xff4a4a,
      green: 0x4aff4a,
      yellow: 0xffdd4a,
    };

    // PRD unit types: Infantry (rifle), Tank (tank), Ranger (artillery)
    const UNIT_MOVE_RANGE: Record<string, number> = {
      rifle: 3, // Infantry
      tank: 2, // Tank
      artillery: 2, // Ranger
    };

    // Attack range: [min, max] Manhattan distance
    const UNIT_ATTACK_RANGE: Record<string, [number, number]> = {
      rifle: [1, 1], // Infantry: melee
      tank: [1, 1], // Tank: melee
      artillery: [2, 3], // Ranger: ranged (min range 2)
    };

    // --- Move trail overlay (added before units so trails render underneath) ---
    const trailGfx = new Graphics();
    vp.addChild(trailGfx);

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

    for (const unit of initialUnits) {
      const sprite = createUnitSprite(unit);
      unitSprites.set(unit.id, sprite);
    }

    // --- Selection state ---
    let selectedUnit: Unit | null = null;
    const pendingMoveTransactions = new Set<number>();
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
      const color = 0x00bb00; // Tactical darker green for selection
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
      for (const u of useGameStore.getState().units) {
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
      originX: number;
      originY: number;
    }
    const activeMovements = new Map<number, MoveState>();

    // Fading trail state: snapshot of queue + units when cleared
    const TRAIL_DELAY_MS = 3000;
    const TRAIL_FADE_MS = 1000;
    let fadingTrails: {
      queue: QueuedMove[];
      units: Unit[];
      startTime: number;
    } | null = null;

    // Remote (subscription) movement trails: track path + fade state
    interface RemoteTrail {
      unitId: number;
      originX: number;
      originY: number;
      path: { x: number; y: number }[];
      unit: Unit;
      fadeStart: number | null; // null = still moving
    }
    const remoteTrails = new Map<number, RemoteTrail>();

    function drawTrailsForQueue(
      queue: QueuedMove[],
      units: Unit[],
      alphaMul: number,
    ) {
      for (const m of queue) {
        const unit = units.find((u) => u.id === m.unitId);
        const color = 0x000000; // Uniform dark color for all trails
        const unitType = unit?.type ?? "rifle";

        if (m.path.length < 2) continue;

        // Compute max drawable distance based on animation progress
        const ms = activeMovements.get(m.unitId);
        let maxDist = Infinity; // no active movement = draw full trail
        if (ms) {
          maxDist = 0;
          for (let s = 0; s < ms.stepIndex && s < ms.path.length; s++) {
            const prev =
              s === 0 ? { x: ms.originX, y: ms.originY } : ms.path[s - 1];
            const cur = ms.path[s];
            maxDist += Math.sqrt(
              ((cur.x - prev.x) * TILE_PX) ** 2 +
                ((cur.y - prev.y) * TILE_PX) ** 2,
            );
          }
          if (ms.stepIndex < ms.path.length) {
            const prev =
              ms.stepIndex === 0
                ? { x: ms.originX, y: ms.originY }
                : ms.path[ms.stepIndex - 1];
            const cur = ms.path[ms.stepIndex];
            const stepDist = Math.sqrt(
              ((cur.x - prev.x) * TILE_PX) ** 2 +
                ((cur.y - prev.y) * TILE_PX) ** 2,
            );
            maxDist += stepDist * ms.progress;
          }
        }

        if (unitType === "tank" || unitType === "artillery") {
          const rungSpacing = 4;
          const trackOffset = 5;
          const rungHalfWidth = 2.5;
          let totalDist = 0;
          let rungIndex = 0;
          for (let i = 0; i < m.path.length - 1; i++) {
            const ax = m.path[i].x * TILE_PX + TILE_PX / 2;
            const ay = m.path[i].y * TILE_PX + TILE_PX / 2;
            const bx = m.path[i + 1].x * TILE_PX + TILE_PX / 2;
            const by = m.path[i + 1].y * TILE_PX + TILE_PX / 2;
            const segDist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
            if (segDist < 0.1) continue;
            const nx = (bx - ax) / segDist;
            const ny = (by - ay) / segDist;
            const px = -ny;
            const py = nx;
            let nextRung = rungSpacing * rungIndex;
            while (nextRung < totalDist + segDist) {
              if (nextRung > maxDist) break;
              const localD = nextRung - totalDist;
              const cx = ax + nx * localD;
              const cy = ay + ny * localD;
              for (const side of [-1, 1]) {
                const ox = px * trackOffset * side;
                const oy = py * trackOffset * side;
                trailGfx
                  .moveTo(
                    cx + ox - px * rungHalfWidth,
                    cy + oy - py * rungHalfWidth,
                  )
                  .lineTo(
                    cx + ox + px * rungHalfWidth,
                    cy + oy + py * rungHalfWidth,
                  )
                  .stroke({ color, alpha: 0.45 * alphaMul, width: 2 });
              }
              rungIndex++;
              nextRung = rungSpacing * rungIndex;
            }
            totalDist += segDist;
            if (totalDist >= maxDist) break;
          }
        } else {
          const stepSpacing = 8;
          const footOffset = 2.0;
          const footLen = 2.5;
          let totalDist = 0;
          let stepIndex = 0;
          for (let i = 0; i < m.path.length - 1; i++) {
            const ax = m.path[i].x * TILE_PX + TILE_PX / 2;
            const ay = m.path[i].y * TILE_PX + TILE_PX / 2;
            const bx = m.path[i + 1].x * TILE_PX + TILE_PX / 2;
            const by = m.path[i + 1].y * TILE_PX + TILE_PX / 2;
            const segDist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
            if (segDist < 0.1) continue;
            const nx = (bx - ax) / segDist;
            const ny = (by - ay) / segDist;
            const px = -ny;
            const py = nx;
            let nextStep = stepSpacing * stepIndex;
            while (nextStep < totalDist + segDist) {
              if (nextStep > maxDist) break;
              const localD = nextStep - totalDist;
              const side = stepIndex % 2 === 0 ? 1 : -1;
              const cx = ax + nx * localD + px * footOffset * side;
              const cy = ay + ny * localD + py * footOffset * side;
              const halfLen = footLen / 2;
              trailGfx
                .moveTo(cx - nx * halfLen, cy - ny * halfLen)
                .lineTo(cx + nx * halfLen, cy + ny * halfLen)
                .stroke({ color, alpha: 0.5 * alphaMul, width: 2 });
              stepIndex++;
              nextStep = stepSpacing * stepIndex;
            }
            totalDist += segDist;
            if (totalDist >= maxDist) break;
          }
        }
      }
    }

    function drawTrails() {
      trailGfx.clear();
      const { moveQueue: queue, units } = useGameStore.getState();

      // Draw fading trails from previous queue
      if (fadingTrails) {
        const elapsed = Date.now() - fadingTrails.startTime;
        if (elapsed >= TRAIL_DELAY_MS + TRAIL_FADE_MS) {
          fadingTrails = null;
        } else if (elapsed < TRAIL_DELAY_MS) {
          drawTrailsForQueue(fadingTrails.queue, fadingTrails.units, 1);
        } else {
          const fadeMul = 1 - (elapsed - TRAIL_DELAY_MS) / TRAIL_FADE_MS;
          drawTrailsForQueue(fadingTrails.queue, fadingTrails.units, fadeMul);
        }
      }

      // Draw remote (subscription) movement trails
      for (const [id, rt] of remoteTrails) {
        const synthPath = [{ x: rt.originX, y: rt.originY }, ...rt.path];
        const synth: QueuedMove[] = [
          {
            unitId: rt.unitId,
            unitOnchainId: 0,
            calls: [],
            originX: rt.originX,
            originY: rt.originY,
            destX: rt.path[rt.path.length - 1].x,
            destY: rt.path[rt.path.length - 1].y,
            path: synthPath,
          },
        ];
        if (rt.fadeStart !== null) {
          const elapsed = Date.now() - rt.fadeStart;
          if (elapsed >= TRAIL_DELAY_MS + TRAIL_FADE_MS) {
            remoteTrails.delete(id);
            continue;
          }
          const alphaMul =
            elapsed < TRAIL_DELAY_MS
              ? 1
              : 1 - (elapsed - TRAIL_DELAY_MS) / TRAIL_FADE_MS;
          drawTrailsForQueue(synth, [rt.unit], alphaMul);
        } else {
          drawTrailsForQueue(synth, [rt.unit], 1);
        }
      }

      if (queue.length === 0) return;
      drawTrailsForQueue(queue, units, 1);
    }

    // --- Hover highlight + movement range ---
    const hoverGfx = new Graphics();
    const rangeGfx = new Graphics();
    vp.addChild(rangeGfx);
    vp.addChild(hoverGfx);

    const targetGfx = new Graphics();
    vp.addChild(targetGfx);

    const hpGfx = new Graphics();
    vp.addChild(hpGfx);

    let attackableTargets: Unit[] = [];
    let hoveredEnemy: Unit | null = null;

    const canvas = app.canvas as HTMLCanvasElement;

    function unitHasMoved(unit: Unit): boolean {
      const { game: g, moveQueue } = useGameStore.getState();
      if (moveQueue.some((m) => m.unitId === unit.id)) return true;
      if (g && unit.lastMovedRound >= g.round) return true;
      return false;
    }

    function drawMoveRange() {
      rangeGfx.clear();
      attackableTargets = [];
      if (!selectedUnit || activeMovements.has(selectedUnit.id)) return;
      if (useGameStore.getState().game?.state !== "Playing") return;

      // If unit has a queued move without attack, show attack targets from destination
      const queued = useGameStore
        .getState()
        .moveQueue.find((m) => m.unitId === selectedUnit!.id);
      if (queued) {
        if (queued.calls.some((c) => c.entrypoint === "attack")) return;
        const [minAtkRange, maxAtkRange] = UNIT_ATTACK_RANGE[
          selectedUnit.type
        ] ?? [1, 1];
        const enemies = useGameStore
          .getState()
          .units.filter((u) => u.team !== selectedUnit!.team);
        for (const enemy of enemies) {
          const dist =
            Math.abs(enemy.x - queued.destX) + Math.abs(enemy.y - queued.destY);
          if (dist >= minAtkRange && dist <= maxAtkRange) {
            attackableTargets.push(enemy);
          }
        }
        return;
      }

      if (unitHasMoved(selectedUnit)) return;

      const range = UNIT_MOVE_RANGE[selectedUnit.type] ?? 5;
      const reachable = findReachable(
        tileMap,
        selectedUnit.x,
        selectedUnit.y,
        range,
        getBlockedTiles(selectedUnit.id),
      );

      const reachableSet = new Set(reachable.map((t) => `${t.x},${t.y}`));
      const rangeColor = 0xecf0f1; // Tactical light gray/off-white for move range

      for (const tile of reachable) {
        rangeGfx
          .rect(tile.x * TILE_PX, tile.y * TILE_PX, TILE_PX, TILE_PX)
          .fill({ color: rangeColor, alpha: 0.2 });

        // Draw border edges where the range meets non-reachable tiles
        const x = tile.x * TILE_PX;
        const y = tile.y * TILE_PX;
        if (!reachableSet.has(`${tile.x},${tile.y - 1}`)) {
          rangeGfx
            .moveTo(x, y)
            .lineTo(x + TILE_PX, y)
            .stroke({ color: rangeColor, alpha: 0.4, width: 1 });
        }
        if (!reachableSet.has(`${tile.x},${tile.y + 1}`)) {
          rangeGfx
            .moveTo(x, y + TILE_PX)
            .lineTo(x + TILE_PX, y + TILE_PX)
            .stroke({ color: rangeColor, alpha: 0.4, width: 1 });
        }
        if (!reachableSet.has(`${tile.x - 1},${tile.y}`)) {
          rangeGfx
            .moveTo(x, y)
            .lineTo(x, y + TILE_PX)
            .stroke({ color: rangeColor, alpha: 0.4, width: 1 });
        }
        if (!reachableSet.has(`${tile.x + 1},${tile.y}`)) {
          rangeGfx
            .moveTo(x + TILE_PX, y)
            .lineTo(x + TILE_PX, y + TILE_PX)
            .stroke({ color: rangeColor, alpha: 0.4, width: 1 });
        }
      }

      // Find attackable enemy units from any reachable position (including current)
      const [minAtkRange, maxAtkRange] = UNIT_ATTACK_RANGE[
        selectedUnit.type
      ] ?? [1, 1];
      const allPositions = [
        { x: selectedUnit.x, y: selectedUnit.y },
        ...reachable,
      ];
      const enemies = useGameStore
        .getState()
        .units.filter((u) => u.team !== selectedUnit!.team);
      for (const enemy of enemies) {
        for (const pos of allPositions) {
          const dist = Math.abs(enemy.x - pos.x) + Math.abs(enemy.y - pos.y);
          if (dist >= minAtkRange && dist <= maxAtkRange) {
            attackableTargets.push(enemy);
            break;
          }
        }
      }
    }

    function drawTargetAt(
      cx: number,
      cy: number,
      color: number,
      alpha: number,
      size: number,
    ) {
      const bLen = 5;
      targetGfx
        .moveTo(cx - size, cy - size + bLen)
        .lineTo(cx - size, cy - size)
        .lineTo(cx - size + bLen, cy - size)
        .moveTo(cx + size, cy - size + bLen)
        .lineTo(cx + size, cy - size)
        .lineTo(cx + size - bLen, cy - size)
        .moveTo(cx - size, cy + size - bLen)
        .lineTo(cx - size, cy + size)
        .lineTo(cx - size + bLen, cy + size)
        .moveTo(cx + size, cy + size - bLen)
        .lineTo(cx + size, cy + size)
        .lineTo(cx + size - bLen, cy + size)
        .stroke({ color, width: 2, alpha });

      const cSize = 3;
      targetGfx
        .moveTo(cx - cSize, cy)
        .lineTo(cx + cSize, cy)
        .moveTo(cx, cy - cSize)
        .lineTo(cx, cy + cSize)
        .stroke({ color, width: 1.5, alpha });
    }

    function drawAttackTargets() {
      targetGfx.clear();

      const color = 0xff4a4a; // Tactical Red
      const baseSize = TILE_PX / 2 - 3;
      const pulse = 1 + Math.sin(selectPulse * 3) * 0.08;

      // Draw queued attack targets (static, full opacity)
      const { moveQueue, units: storeUnits } = useGameStore.getState();
      for (const m of moveQueue) {
        for (const call of m.calls) {
          if (call.entrypoint !== "attack") continue;
          const targetOnchainId = parseInt(call.calldata[2], 10);
          const target = storeUnits.find(
            (u) => u.onchainId === targetOnchainId,
          );
          if (!target) continue;
          const cx = target.x * TILE_PX + TILE_PX / 2;
          const cy = target.y * TILE_PX + TILE_PX / 2;
          drawTargetAt(cx, cy, color, 1.0, baseSize);
        }
      }

      // Draw attackable targets for selected unit
      if (attackableTargets.length === 0 || !selectedUnit) return;

      for (const enemy of attackableTargets) {
        const isHovered = hoveredEnemy === enemy;
        const cx = enemy.x * TILE_PX + TILE_PX / 2;
        const cy = enemy.y * TILE_PX + TILE_PX / 2;
        const size = baseSize * (isHovered ? pulse : 1);
        const alpha = isHovered ? 1.0 : 0.4;
        const bLen = 5;

        targetGfx
          .moveTo(cx - size, cy - size + bLen)
          .lineTo(cx - size, cy - size)
          .lineTo(cx - size + bLen, cy - size)
          .moveTo(cx + size, cy - size + bLen)
          .lineTo(cx + size, cy - size)
          .lineTo(cx + size - bLen, cy - size)
          .moveTo(cx - size, cy + size - bLen)
          .lineTo(cx - size, cy + size)
          .lineTo(cx - size + bLen, cy + size)
          .moveTo(cx + size, cy + size - bLen)
          .lineTo(cx + size, cy + size)
          .lineTo(cx + size - bLen, cy + size)
          .stroke({ color, width: 2, alpha });

        if (isHovered) {
          drawTargetAt(cx, cy, color, 1.0, size);
        }
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
      hoveredEnemy = null;
      if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        hoverGfx
          .rect(gridX * TILE_PX, gridY * TILE_PX, TILE_PX, TILE_PX)
          .fill({ color: 0xffffff, alpha: 0.2 });

        // Track if hovering over an attackable target
        hoveredEnemy =
          attackableTargets.find((u) => u.x === gridX && u.y === gridY) || null;
      }
    }

    function onPointerLeave() {
      hoverGfx.clear();
      hoveredEnemy = null;
    }

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // --- Left-click selection (via pixi-viewport 'clicked' to avoid drag conflicts) ---
    function onVpClicked(e: { world: { x: number; y: number } }) {
      if (!isPlayerInGame(addressRef.current)) return;
      if (useGameStore.getState().isEndingTurn) return;

      const gridX = Math.floor(e.world.x / TILE_PX);
      const gridY = Math.floor(e.world.y / TILE_PX);
      if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE)
        return;

      // Find unit at clicked tile — click empty space to deselect
      const { units, game, moveQueue } = useGameStore.getState();
      const myTeam = getMyTeam(addressRef.current);
      const currentTeam =
        game?.currentPlayer !== undefined
          ? (TEAMS[game.currentPlayer] ?? null)
          : null;
      const isMyTurn =
        currentTeam !== null &&
        (game?.isTestMode
          ? isPlayerInGame(addressRef.current)
          : myTeam === currentTeam);
      const allowedTeam = game?.isTestMode ? currentTeam : myTeam;
      // Check unmoved units at their store position
      let clicked = units.find(
        (u) =>
          u.x === gridX &&
          u.y === gridY &&
          !activeMovements.has(u.id) &&
          !pendingMoveTransactions.has(u.id),
      );
      // Also check moved units at their queued destination (if no attack queued yet)
      if (!clicked) {
        const queuedAtDest = moveQueue.find(
          (m) =>
            m.destX === gridX &&
            m.destY === gridY &&
            !activeMovements.has(m.unitId) &&
            !m.calls.some((c) => c.entrypoint === "attack"),
        );
        if (queuedAtDest) {
          clicked =
            units.find((u) => u.id === queuedAtDest.unitId) ?? undefined;
        }
      }
      // Only allow selecting units of the current turn's team
      if (!isMyTurn || (clicked && clicked.team !== allowedTeam)) {
        selectedUnit = null;
      } else {
        selectedUnit = clicked ?? null;
      }
      drawSelection();
      drawMoveRange();
    }
    vp.on("clicked", onVpClicked);

    // --- Right-click movement ---
    function startMovement(unit: Unit, path: { x: number; y: number }[]) {
      if (activeMovements.has(unit.id)) return; // already moving
      if (pendingMoveTransactions.has(unit.id)) return; // waiting on tx
      if (path.length === 0) return;

      const ms: MoveState = {
        unit,
        path,
        stepIndex: 0,
        progress: 0,
        startX: unit.x,
        startY: unit.y,
        originX: unit.x,
        originY: unit.y,
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

    function tryMoveSelectedUnit(screenX: number, screenY: number) {
      if (!selectedUnit) return;
      if (useGameStore.getState().isEndingTurn) return;
      const { game, units } = useGameStore.getState();
      if (game?.state !== "Playing") return;
      const currentTeam =
        game?.currentPlayer !== undefined
          ? (TEAMS[game.currentPlayer] ?? null)
          : null;
      const allowedTeam = game?.isTestMode
        ? currentTeam
        : getMyTeam(addressRef.current);
      if (!allowedTeam || selectedUnit.team !== allowedTeam) return;

      const worldPos = vp.toWorld(screenX, screenY);
      const gridX = Math.floor(worldPos.x / TILE_PX);
      const gridY = Math.floor(worldPos.y / TILE_PX);

      if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE)
        return;

      // If unit already has a queued move (no attack yet), allow adding attack
      const existingQueue = useGameStore
        .getState()
        .moveQueue.find((m) => m.unitId === selectedUnit!.id);
      if (
        existingQueue &&
        !existingQueue.calls.some((c) => c.entrypoint === "attack")
      ) {
        const targetEnemy = attackableTargets.find(
          (u) => u.x === gridX && u.y === gridY,
        );
        if (!targetEnemy) return;

        const attackCall = {
          contractAddress: ACTIONS_ADDRESS,
          entrypoint: "attack",
          calldata: [
            gameIdRef.current.toString(),
            selectedUnit.onchainId.toString(),
            targetEnemy.onchainId.toString(),
          ],
        };
        // Append attack to existing queue entry
        useGameStore.getState().queueMove({
          ...existingQueue,
          calls: [...existingQueue.calls, attackCall],
        });
        // Play attack animation
        const sprite = unitSprites.get(selectedUnit.id);
        if (sprite) {
          setUnitAnim(selectedUnit, sprite, "attack");
        }
        selectedUnit = null;
        rangeGfx.clear();
        attackableTargets = [];
        drawTrails();
        return;
      }

      if (pendingMoveTransactions.has(selectedUnit.id)) return;
      if (unitHasMoved(selectedUnit)) return;

      // Check if right-clicked tile has an attackable enemy
      const targetEnemy = attackableTargets.find(
        (u) => u.x === gridX && u.y === gridY,
      );

      if (targetEnemy) {
        const attackCall = {
          contractAddress: ACTIONS_ADDRESS,
          entrypoint: "attack",
          calldata: [
            gameIdRef.current.toString(),
            selectedUnit.onchainId.toString(),
            targetEnemy.onchainId.toString(),
          ],
        };

        const [minAtkRange, maxAtkRange] = UNIT_ATTACK_RANGE[
          selectedUnit.type
        ] ?? [1, 1];
        const dist =
          Math.abs(targetEnemy.x - selectedUnit.x) +
          Math.abs(targetEnemy.y - selectedUnit.y);

        if (dist >= minAtkRange && dist <= maxAtkRange) {
          // Already in range — queue attack only (no move needed)
          pendingMoveTransactions.add(selectedUnit.id);
          const entry: QueuedMove = {
            unitId: selectedUnit.id,
            unitOnchainId: selectedUnit.onchainId,
            calls: [attackCall],
            originX: selectedUnit.x,
            originY: selectedUnit.y,
            destX: selectedUnit.x,
            destY: selectedUnit.y,
            path: [],
          };
          useGameStore.getState().queueMove(entry);
          // Play attack animation immediately since no movement needed
          const sprite = unitSprites.get(selectedUnit.id);
          if (sprite) {
            setUnitAnim(selectedUnit, sprite, "attack");
          }
        } else {
          // Need to move first — find closest reachable tile in attack range
          const range = UNIT_MOVE_RANGE[selectedUnit.type] ?? 5;
          const reachable = findReachable(
            tileMap,
            selectedUnit.x,
            selectedUnit.y,
            range,
            getBlockedTiles(selectedUnit.id),
          );

          // Filter to tiles that put enemy in attack range
          const candidates = reachable.filter((t) => {
            const d =
              Math.abs(targetEnemy.x - t.x) + Math.abs(targetEnemy.y - t.y);
            return d >= minAtkRange && d <= maxAtkRange;
          });

          if (candidates.length === 0) return;

          // Sort by Manhattan distance from unit's current position (prefer shortest move)
          candidates.sort(
            (a, b) =>
              Math.abs(a.x - selectedUnit!.x) +
              Math.abs(a.y - selectedUnit!.y) -
              (Math.abs(b.x - selectedUnit!.x) +
                Math.abs(b.y - selectedUnit!.y)),
          );

          // Find first candidate with a valid path
          let movePath: { x: number; y: number }[] = [];
          for (const candidate of candidates) {
            movePath = findPath(
              tileMap,
              selectedUnit.x,
              selectedUnit.y,
              candidate.x,
              candidate.y,
              range,
              getBlockedTiles(selectedUnit.id),
            );
            if (movePath.length > 0) break;
          }
          if (movePath.length === 0) return;

          const originX = selectedUnit.x;
          const originY = selectedUnit.y;
          startMovement(selectedUnit, movePath);
          queueMoveForUnit(selectedUnit, movePath, originX, originY, [
            attackCall,
          ]);
        }

        selectedUnit = null;
        rangeGfx.clear();
        attackableTargets = [];
        drawTrails();
        return;
      }

      // Regular move (no attack)
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

      const originX = selectedUnit.x;
      const originY = selectedUnit.y;
      startMovement(selectedUnit, path);
      queueMoveForUnit(selectedUnit, path, originX, originY);

      // Check if there are attack targets from the destination
      const dest = path[path.length - 1];
      const [minAtk, maxAtk] = UNIT_ATTACK_RANGE[selectedUnit.type] ?? [1, 1];
      const enemies = useGameStore
        .getState()
        .units.filter((u) => u.team !== selectedUnit!.team);
      const hasTargets = enemies.some((enemy) => {
        const d = Math.abs(enemy.x - dest.x) + Math.abs(enemy.y - dest.y);
        return d >= minAtk && d <= maxAtk;
      });

      if (hasTargets) {
        // Keep selected — drawMoveRange will show attack targets from destination
        drawMoveRange();
      } else {
        selectedUnit = null;
        rangeGfx.clear();
        attackableTargets = [];
      }
      drawTrails();
    }

    function onContextMenu(ev: MouseEvent) {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      tryMoveSelectedUnit(ev.clientX - rect.left, ev.clientY - rect.top);
    }

    function onPointerDown(ev: PointerEvent) {
      if (ev.button !== 2) return; // right-click only
      const rect = canvas.getBoundingClientRect();
      tryMoveSelectedUnit(ev.clientX - rect.left, ev.clientY - rect.top);
    }

    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("pointerdown", onPointerDown);

    // --- Movement ticker ---
    const MOVE_SPEED = 4; // tiles per second

    function encodeMovePath(path: { x: number; y: number }[]): string[] {
      const calldata: string[] = [path.length.toString()];
      for (const step of path) {
        calldata.push(step.x.toString(), step.y.toString());
      }
      return calldata;
    }

    function queueMoveForUnit(
      unit: Unit,
      path: { x: number; y: number }[],
      originX: number,
      originY: number,
      extraCalls: {
        contractAddress: string;
        entrypoint: string;
        calldata: string[];
      }[] = [],
    ) {
      pendingMoveTransactions.add(unit.id);

      const moveCall = {
        contractAddress: ACTIONS_ADDRESS,
        entrypoint: "move_unit",
        calldata: [
          gameIdRef.current.toString(),
          unit.onchainId.toString(),
          ...encodeMovePath(path),
        ],
      };

      const dest = path[path.length - 1];
      const entry: QueuedMove = {
        unitId: unit.id,
        unitOnchainId: unit.onchainId,
        calls: [moveCall, ...extraCalls],
        originX,
        originY,
        destX: dest.x,
        destY: dest.y,
        path: [{ x: originX, y: originY }, ...path],
      };

      useGameStore.getState().queueMove(entry);
    }

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
            // Play attack animation if this unit has a queued attack
            const queued = useGameStore
              .getState()
              .moveQueue.find((m) => m.unitId === id);
            const hasAttack = queued?.calls.some(
              (c) => c.entrypoint === "attack",
            );
            if (hasAttack) {
              setUnitAnim(ms.unit, sprite, "attack");
            } else {
              setUnitAnim(ms.unit, sprite, "idle");
            }
            activeMovements.delete(id);
            // Start fade timer for remote trails
            const rt = remoteTrails.get(id);
            if (rt && rt.fadeStart === null) {
              rt.fadeStart = Date.now();
            }
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

      // Draw health bars above units
      hpGfx.clear();
      for (const [id, sprite] of unitSprites) {
        const unit = useGameStore.getState().units.find((u) => u.id === id);
        if (!unit) continue;
        const maxHp = UNIT_MAX_HP[unit.type] ?? 3;
        if (unit.hp <= 0) continue;

        const boxSize = 3;
        const gap = 1;
        const totalW = maxHp * boxSize + (maxHp - 1) * gap;
        const startX = sprite.x - totalW / 2;
        const hpOffset = unit.type === "rifle" ? 1 : -5;
        const barY = sprite.y - TILE_PX / 2 + hpOffset;

        for (let i = 0; i < maxHp; i++) {
          const bx = startX + i * (boxSize + gap);
          if (i < unit.hp) {
            hpGfx
              .rect(bx, barY, boxSize, boxSize)
              .fill({ color: 0xffdd4a, alpha: 1 });
          }
          hpGfx
            .rect(bx, barY, boxSize, boxSize)
            .stroke({ color: 0x000000, alpha: 0.5, width: 0.5 });
        }
      }

      // Face idle units toward their closest enemy
      const allUnits = useGameStore.getState().units;
      for (const unit of allUnits) {
        if (activeMovements.has(unit.id)) continue;
        const sprite = unitSprites.get(unit.id);
        if (!sprite) continue;
        const enemies = allUnits.filter((u) => u.team !== unit.team);
        if (enemies.length === 0) continue;
        let closest = enemies[0];
        let closestDist =
          Math.abs(enemies[0].x - unit.x) + Math.abs(enemies[0].y - unit.y);
        for (let i = 1; i < enemies.length; i++) {
          const d =
            Math.abs(enemies[i].x - unit.x) + Math.abs(enemies[i].y - unit.y);
          if (d < closestDist) {
            closest = enemies[i];
            closestDist = d;
          }
        }
        const dx = closest.x - unit.x;
        if (dx === 0) continue; // directly above/below — keep current facing
        const newFacing: Unit["facing"] = dx < 0 ? "left" : "right";
        if (unit.facing !== newFacing) {
          unit.facing = newFacing;
          const absScaleX = Math.abs(sprite.scale.x);
          sprite.scale.x = newFacing === "left" ? -absScaleX : absScaleX;
        }
      }

      // Update selection highlight with pulse
      selectPulse += ticker.deltaTime * 0.15;
      drawSelection();
      drawAttackTargets();
      drawTrails();
    };

    app.ticker.add(tickerCb);

    // --- Resize handling ---
    const ro = new ResizeObserver(() => {
      app.resize();
      vp.resize(app.screen.width, app.screen.height);
    });
    ro.observe(containerRef.current);

    // --- Subscribe to store for real-time unit updates (other players' moves) ---
    const storeUnsub = useGameStore.subscribe((state, prevState) => {
      // Deselect when requested (e.g. end turn)
      if (state._deselectRequested && !prevState._deselectRequested) {
        selectedUnit = null;
        rangeGfx.clear();
        attackableTargets = [];
        drawSelection();
        useGameStore.setState({ _deselectRequested: false });
      }

      // Sync pendingMoveTransactions and sprites from moveQueue
      if (state.moveQueue !== prevState.moveQueue) {
        // If queue was cleared with fade requested (end-turn success), snapshot for fade-out
        if (
          state.moveQueue.length === 0 &&
          prevState.moveQueue.length > 0 &&
          state._trailFadeRequested
        ) {
          fadingTrails = {
            queue: prevState.moveQueue,
            units: prevState.units,
            startTime: Date.now(),
          };
          useGameStore.setState({ _trailFadeRequested: false });
        }
        const queuedIds = new Set(state.moveQueue.map((m) => m.unitId));
        // For dequeued units, cancel any active movement and snap sprite to store position
        for (const prev of prevState.moveQueue) {
          if (!queuedIds.has(prev.unitId)) {
            activeMovements.delete(prev.unitId);
            pendingMoveTransactions.delete(prev.unitId);
            const sprite = unitSprites.get(prev.unitId);
            const unit = state.units.find((u) => u.id === prev.unitId);
            if (sprite && unit) {
              sprite.x = unit.x * TILE_PX + TILE_PX / 2;
              sprite.y = unit.y * TILE_PX + TILE_PX / 2;
              setUnitAnim(unit, sprite, "idle");
            }
          }
        }
        drawSelection();
        drawMoveRange();
        drawTrails();
      }

      if (state.units === prevState.units) return;

      const newUnits = state.units;
      const newIds = new Set(newUnits.map((u) => u.id));

      // Remove sprites for units that no longer exist — play death animation
      for (const [id, sprite] of unitSprites) {
        if (!newIds.has(id)) {
          const prevUnit = prevState.units.find((u) => u.id === id);
          unitSprites.delete(id);
          activeMovements.delete(id);
          if (selectedUnit?.id === id) selectedUnit = null;

          if (prevUnit) {
            const sheet = unitSheets[prevUnit.team];
            const frames = sheet.animations[`${prevUnit.type}_death`];
            if (frames) {
              sprite.textures = frames;
              sprite.loop = false;
              sprite.animationSpeed = 0.05;
              const absScaleX = Math.abs(sprite.scale.x);
              sprite.scale.x =
                prevUnit.facing === "left" ? -absScaleX : absScaleX;
              sprite.gotoAndPlay(0);
              sprite.onComplete = () => {
                sprite.gotoAndStop(sprite.totalFrames - 1);
                const fadeStart = Date.now();
                const fadeCb = () => {
                  const elapsed = Date.now() - fadeStart;
                  const t = Math.min(elapsed / 1000, 1);
                  sprite.alpha = 1 - t;
                  if (t >= 1) {
                    app.ticker.remove(fadeCb);
                    vp.removeChild(sprite);
                    sprite.destroy();
                  }
                };
                app.ticker.add(fadeCb);
              };
              continue;
            }
          }

          vp.removeChild(sprite);
          sprite.destroy();
        }
      }

      // Add sprites for new units, animate position changes for existing
      for (const unit of newUnits) {
        const existing = unitSprites.get(unit.id);
        if (!existing) {
          // New unit from subscription
          const sprite = createUnitSprite(unit);
          unitSprites.set(unit.id, sprite);
        } else if (
          !activeMovements.has(unit.id) &&
          !state.moveQueue.some((m) => m.unitId === unit.id) &&
          !prevState.moveQueue.some((m) => m.unitId === unit.id)
        ) {
          // Check if position changed compared to previous state (remote moves only)
          const prevUnit = prevState.units.find((u) => u.id === unit.id);
          const moved =
            prevUnit && (prevUnit.x !== unit.x || prevUnit.y !== unit.y);

          if (moved) {
            // Animate along a pathfound route from old to new position
            const path = findPath(
              tileMap,
              prevUnit.x,
              prevUnit.y,
              unit.x,
              unit.y,
              100, // generous range — move already confirmed on-chain
              getBlockedTiles(unit.id),
            );
            if (path.length > 0) {
              // Create a temporary unit at the old position for the movement system
              const animUnit: Unit = { ...prevUnit };
              startMovement(animUnit, path);
              // Track trail for remote movement
              remoteTrails.set(unit.id, {
                unitId: unit.id,
                originX: prevUnit.x,
                originY: prevUnit.y,
                path,
                unit: animUnit,
                fadeStart: null,
              });
            } else {
              // No path found — teleport as fallback
              existing.x = unit.x * TILE_PX + TILE_PX / 2;
              existing.y = unit.y * TILE_PX + TILE_PX / 2;
            }
          }
        }
      }
    });

    // Call onLoaded after everything is set up
    if (onLoaded) {
      setTimeout(onLoaded, 500); // Slight delay to ensure first frame is actually visible
    }

    cleanupRef.current = () => {
      storeUnsub();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("pointerdown", onPointerDown);
      vp.off("clicked", onVpClicked);
      app.ticker.remove(tickerCb);
      ro.disconnect();
    };
  }, [gameId, onLoaded]);

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
