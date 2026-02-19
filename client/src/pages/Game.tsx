import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useProvider } from "@starknet-react/core";
import GameViewport from "../components/GameViewport";
import HUD from "../components/HUD";
import { ACTIONS_ADDRESS } from "../StarknetProvider";
import {
  setTileMap,
  clearUnits,
  addUnit,
  initTestGame,
} from "../data/gameStore";
import type { TeamId } from "../data/gameStore";
import { TileType, GRID_SIZE } from "../game/types";

export default function Game() {
  const { id } = useParams<{ id: string }>();
  const { provider } = useProvider();
  const [loading, setLoading] = useState(true);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadGame() {
      if (id === "test-game-1") {
        initTestGame();
        if (active) {
          loadedIdRef.current = id || null;
          setLoading(false);
        }
        return;
      }

      const mapIdNum = parseInt(id || "", 10);
      if (isNaN(mapIdNum)) {
        console.error("Invalid map ID");
        if (active) setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log("Loading map ID:", mapIdNum);

        const [terrainRes, buildingsRes, unitsRes] = await Promise.all([
          provider.callContract({
            contractAddress: ACTIONS_ADDRESS,
            entrypoint: "get_terrain",
            calldata: [mapIdNum.toString()],
          }),
          provider.callContract({
            contractAddress: ACTIONS_ADDRESS,
            entrypoint: "get_buildings",
            calldata: [mapIdNum.toString()],
          }),
          provider.callContract({
            contractAddress: ACTIONS_ADDRESS,
            entrypoint: "get_units",
            calldata: [mapIdNum.toString()],
          }),
        ]);

        if (!active) return;

        // Parse terrain
        const tWidth = parseInt(terrainRes[0] || "0", 16);
        const tHeight = parseInt(terrainRes[1] || "0", 16);

        if (tWidth !== GRID_SIZE || tHeight !== GRID_SIZE) {
          console.warn(
            `Map dimensions (${tWidth}x${tHeight}) do not match GRID_SIZE (${GRID_SIZE}). Render may be glitchy.`,
          );
        }

        // We assume map is GRID_SIZE x GRID_SIZE for now as frontend expects it
        const newTileMap = new Uint8Array(GRID_SIZE * GRID_SIZE);

        const terrainLookup: Record<number, TileType> = {
          0: TileType.Grass,
          1: TileType.Mountain,
          2: TileType.City,
          3: TileType.Factory,
          4: TileType.HQ,
          5: TileType.Road,
          6: TileType.Tree,
          7: TileType.DirtRoad,
        };

        const tLen = parseInt(terrainRes[2] || "0", 16);
        for (let i = 0; i < tLen; i++) {
          const packed = parseInt(terrainRes[3 + i] || "0", 16);
          const idx = Math.floor(packed / 256);
          const type = packed % 256;
          // Protect against out-of-bounds mapping
          if (idx < newTileMap.length) {
            newTileMap[idx] = terrainLookup[type] ?? TileType.Grass;
          }
        }

        // Parse buildings
        const bLen = parseInt(buildingsRes[2] || "0", 16);
        for (let i = 0; i < bLen; i++) {
          const packed = parseInt(buildingsRes[3 + i] || "0", 16);
          const bType = Math.floor(packed / 65536) % 256;
          const x = Math.floor(packed / 256) % 256;
          const y = packed % 256;
          const idx = y * GRID_SIZE + x;

          if (idx < newTileMap.length) {
            if (bType === 1) newTileMap[idx] = TileType.City;
            else if (bType === 2) newTileMap[idx] = TileType.Factory;
            else if (bType === 3) newTileMap[idx] = TileType.HQ;
          }
        }

        setTileMap(newTileMap);

        // Parse units
        clearUnits();
        const uLen = parseInt(unitsRes[2] || "0", 16);
        const teams: Record<number, TeamId> = {
          1: "blue",
          2: "red",
          3: "green",
          4: "yellow",
        };
        const unitTypes: Record<number, string> = {
          1: "rifle",
          2: "tank",
          3: "artillery",
        };

        for (let i = 0; i < uLen; i++) {
          const packed = parseInt(unitsRes[3 + i] || "0", 16);
          const player = Math.floor(packed / 16777216);
          const uType = Math.floor(packed / 65536) % 256;
          const x = Math.floor(packed / 256) % 256;
          const y = packed % 256;

          const teamId = teams[player] || "blue";
          const typeName = unitTypes[uType] || "rifle";

          const u = addUnit(typeName, teamId, x, y);
          if (teamId === "red") {
            u.facing = "left";
          }
        }

        if (active) {
          loadedIdRef.current = id || null;
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to load map data:", e);
        if (active) setLoading(false);
      }
    }

    // Only run if we actually need to load this id
    if (loadedIdRef.current !== id) {
      loadGame();
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [id, provider]);

  if (loading) {
    return (
      <div className="crt-screen w-screen h-screen flex items-center justify-center bg-blueprint-dark text-blueprint-light">
        Loading...
      </div>
    );
  }

  return (
    <div className="crt-screen w-screen h-screen overflow-hidden relative bg-blueprint-dark">
      <div className="crt-vignette"></div>
      <div className="haze-bloom w-full h-full relative">
        <GameViewport key={id} />
        <HUD />
      </div>
    </div>
  );
}
