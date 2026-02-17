import { useEffect, useRef, useCallback } from "react";
import { Application, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { tileMap } from "../data/gameStore";
import { GRID_SIZE, TILE_PX, TILE_COLORS, TileType } from "../game/types";

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

    // --- Tile rendering ---
    const gridGfx = new Graphics();
    vp.addChild(gridGfx);

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const tile = tileMap[y * GRID_SIZE + x] as TileType;
        const color = TILE_COLORS[tile];
        gridGfx
          .rect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX)
          .fill(color);
      }
    }

    // --- Grid lines ---
    const lineGfx = new Graphics();
    vp.addChild(lineGfx);

    for (let x = 0; x <= GRID_SIZE; x++) {
      lineGfx
        .moveTo(x * TILE_PX, 0)
        .lineTo(x * TILE_PX, WORLD_SIZE)
        .stroke({ color: 0x000000, width: 1, alpha: 0.15 });
    }
    for (let y = 0; y <= GRID_SIZE; y++) {
      lineGfx
        .moveTo(0, y * TILE_PX)
        .lineTo(WORLD_SIZE, y * TILE_PX)
        .stroke({ color: 0x000000, width: 1, alpha: 0.15 });
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
