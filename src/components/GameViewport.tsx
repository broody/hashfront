import { useEffect, useRef, useCallback } from "react";
import { Application, Assets, Graphics, Sprite, Spritesheet, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { tileMap } from "../data/gameStore";
import { GRID_SIZE, TILE_PX, TILE_COLORS, TileType } from "../game/types";
import { terrainAtlas } from "../game/spritesheets/terrain";

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

    vp.drag({ mouseButtons: "left" })
      .pinch()
      .wheel()
      .clampZoom({
        minScale: 0.5,
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

    function pickAutotile(x: number, y: number, type: TileType, prefix: string): string {
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

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const tile = tileMap[y * GRID_SIZE + x] as TileType;

        if (tile === TileType.Grass) {
          addTileSprite(pickGrass(x, y), x, y);
        } else if (tile === TileType.Mountain) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileSprite(pickAutotile(x, y, TileType.Mountain, "mountain"), x, y);
        } else if (tile === TileType.Tree) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileSprite(pickAutotile(x, y, TileType.Tree, "tree"), x, y);
        } else if (tile === TileType.Road) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileSprite(pickAutotile(x, y, TileType.Road, "road"), x, y);
        } else if (tile === TileType.DirtRoad) {
          addTileSprite(pickGrass(x, y), x, y);
          addTileSprite(pickAutotile(x, y, TileType.DirtRoad, "dirtroad"), x, y);
        } else {
          const color = TILE_COLORS[tile];
          gridGfx
            .rect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX)
            .fill(color);
        }
      }
    }


    // --- Hover highlight ---
    const hoverGfx = new Graphics();
    vp.addChild(hoverGfx);

    const canvas = app.canvas as HTMLCanvasElement;

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
      }
    }

    function onPointerLeave() {
      hoverGfx.clear();
    }

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // --- Resize handling ---
    const ro = new ResizeObserver(() => {
      app.resize();
      vp.resize(app.screen.width, app.screen.height);
    });
    ro.observe(containerRef.current);

    cleanupRef.current = () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
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
