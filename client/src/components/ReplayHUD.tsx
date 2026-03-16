import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useGameStore, UNIT_MAX_HP, DEFAULT_UNIT_HP } from "../data/gameStore";
import { PixelPanel } from "./PixelPanel";
import { TileType } from "../game/types";
import type { useReplayController } from "../hooks/useReplayController";
import {
  TERRAIN_DEFENSE,
  UNIT_ATTACK_RANGE,
  UNIT_DAMAGE_PROFILE_TEXT,
  UNIT_DISPLAY_NAMES,
  UNIT_MOVE_RANGE,
} from "../game/balance";

const PLAYER_COLORS: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
};

const UNIT_SPRITE_IMAGE: Record<string, string> = {
  blue: "/tilesets/units_blue.png",
  red: "/tilesets/units_red.png",
  green: "/tilesets/units_green.png",
  yellow: "/tilesets/units_yellow.png",
};

const UNIT_SPRITE_OFFSET: Record<string, { x: number; y: number }> = {
  rifle: { x: 0, y: 48 },
  tank: { x: 0, y: 432 },
  artillery: { x: 0, y: 336 },
  apc: { x: 0, y: 496 },
};

const TERRAIN_NAMES: Record<number, string> = {
  [TileType.Grass]: "Grass",
  [TileType.Mountain]: "Mountain",
  [TileType.City]: "City",
  [TileType.Factory]: "Factory",
  [TileType.HQ]: "HQ",
  [TileType.Road]: "Road",
  [TileType.Tree]: "Forest",
  [TileType.DirtRoad]: "Dirt Road",
  [TileType.Barracks]: "Barracks",
  [TileType.Ocean]: "Ocean",
};

const SPEED_OPTIONS = [
  { label: "1x", value: 1 },
  { label: "2x", value: 0.5 },
  { label: "4x", value: 0.25 },
];

interface ReplayHUDProps {
  controller: ReturnType<typeof useReplayController>;
  gameId: number;
}

export default function ReplayHUD({ controller, gameId }: ReplayHUDProps) {
  const {
    currentTurn,
    maxTurn,
    isPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    goToTurn,
    nextTurn,
    prevTurn,
    play,
    pause,
    currentSnap,
    teamName,
  } = controller;

  const game = useGameStore((s) => s.game);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const units = useGameStore((s) => s.units);
  const tileMap = useGameStore((s) => s.tileMap);
  const gridWidth = useGameStore((s) => s.gridWidth);
  const gridHeight = useGameStore((s) => s.gridHeight);
  const gameName = game?.name ?? "";

  const selectedUnit = useMemo(() => {
    if (selectedUnitId === null) return null;
    return units.find((u) => u.id === selectedUnitId) ?? null;
  }, [selectedUnitId, units]);

  const selectedUnitTerrain = useMemo(() => {
    if (!selectedUnit || tileMap.length === 0) return null;
    const ux = selectedUnit.x;
    const uy = selectedUnit.y;
    if (ux < 0 || ux >= gridWidth || uy < 0 || uy >= gridHeight) return null;
    const tileType = tileMap[uy * gridWidth + ux] as TileType;
    return {
      type: tileType,
      name: TERRAIN_NAMES[tileType] ?? "Unknown",
      defense: TERRAIN_DEFENSE[tileType] ?? 0,
    };
  }, [selectedUnit, tileMap, gridWidth, gridHeight]);

  const teamColor = teamName
    ? (PLAYER_COLORS[teamName] ?? "#ffffff")
    : "#ffffff";

  return (
    <>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-blueprint-blue/60 flex items-center justify-between px-8 z-10 border-b-2 border-white backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-4 hover:opacity-80 transition-opacity"
          >
            <div className="flicker-text scale-75">
              <svg width="40" height="40" viewBox="0 0 40 40">
                <g
                  transform="skewX(-15) skewY(5) scale(0.9)"
                  style={{ transformOrigin: "center" }}
                >
                  <g stroke="white" fill="none" strokeWidth="2">
                    <path d="M15 6 V34 M25 6 V34 M6 15 H34 M6 25 H34" />
                  </g>
                  <g
                    stroke="white"
                    fill="none"
                    strokeWidth="0.5"
                    opacity="0.3"
                    transform="translate(4,4)"
                  >
                    <path d="M15 6 V34 M25 6 V34 M6 15 H34 M6 25 H34" />
                  </g>
                </g>
                <path
                  d="M2 2 H8 M2 2 V8 M32 2 H38 M38 2 V8 M2 38 H8 M2 38 V32 M32 38 H38 M38 38 V32"
                  stroke="white"
                  strokeWidth="0.5"
                />
              </svg>
            </div>
            <span className="text-base font-bold tracking-[2px] uppercase">
              HASHFRONT
            </span>
          </Link>
          <span className="text-base font-bold tracking-[2px] uppercase">
            // {gameName || `OPERATION_${gameId}`}
          </span>
          <span className="text-xs font-mono border border-white/50 px-2 py-0.5 bg-white/10 tracking-widest animate-pulse">
            REPLAY
          </span>
        </div>
        <Link to="/">
          <button className="blueprint-btn !py-1 !px-4 text-sm">
            BACK_TO_LOBBY
          </button>
        </Link>
      </div>

      {/* Unit intel panel */}
      {selectedUnit && (
        <div className="absolute top-24 left-8 z-10">
          <PixelPanel title="UNIT_INTEL" className="!p-5 min-w-[260px]">
            <div className="flex flex-col gap-4 mt-2">
              <div className="flex items-center gap-4">
                <div
                  className="border border-white/30 bg-white/5 shrink-0"
                  style={{
                    width: 96,
                    height: 96,
                    imageRendering: "pixelated",
                    backgroundImage: `url(${UNIT_SPRITE_IMAGE[selectedUnit.team] ?? UNIT_SPRITE_IMAGE.blue})`,
                    backgroundPosition: (() => {
                      const off = UNIT_SPRITE_OFFSET[selectedUnit.type] ?? {
                        x: 0,
                        y: 48,
                      };
                      return `-${off.x * 3}px -${off.y * 3}px`;
                    })(),
                    backgroundSize: `${896 * 3}px ${1328 * 3}px`,
                    opacity: 0.8,
                  }}
                />
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold uppercase tracking-widest">
                    {UNIT_DISPLAY_NAMES[selectedUnit.type] ?? selectedUnit.type}
                  </span>
                  <span
                    className="text-sm uppercase tracking-widest"
                    style={{
                      color: PLAYER_COLORS[selectedUnit.team] ?? "#ffffff",
                    }}
                  >
                    {selectedUnit.team}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-sm uppercase tracking-widest">
                <div className="flex justify-between">
                  <span className="text-white/60">HP</span>
                  <span>
                    {selectedUnit.hp} /{" "}
                    {UNIT_MAX_HP[selectedUnit.type] ?? DEFAULT_UNIT_HP}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">DMG I/T/A</span>
                  <span>
                    {UNIT_DAMAGE_PROFILE_TEXT[selectedUnit.type] ?? "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">RANGE</span>
                  <span>
                    {(() => {
                      const [min, max] = UNIT_ATTACK_RANGE[
                        selectedUnit.type
                      ] ?? [1, 1];
                      return min === max ? `${min}` : `${min}-${max}`;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">MOVE</span>
                  <span>{UNIT_MOVE_RANGE[selectedUnit.type] ?? 0}</span>
                </div>
                {selectedUnitTerrain && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-white/60">TERRAIN</span>
                      <span>{selectedUnitTerrain.name}</span>
                    </div>
                    {selectedUnitTerrain.defense > 0 && (
                      <div className="flex justify-between">
                        <span className="text-white/60">DEF BONUS</span>
                        <span>+{selectedUnitTerrain.defense}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </PixelPanel>
        </div>
      )}

      {/* Bottom timeline bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-blueprint-blue/70 border-t-2 border-white backdrop-blur-sm">
        <div className="flex items-center gap-4 px-6 py-3">
          {/* Play/Pause */}
          <button
            onClick={isPlaying ? pause : play}
            className="blueprint-btn !py-1.5 !px-3 text-sm font-mono min-w-[60px]"
            disabled={maxTurn === 0}
          >
            {isPlaying ? "PAUSE" : "PLAY"}
          </button>

          {/* Prev / Next */}
          <button
            onClick={prevTurn}
            className="blueprint-btn !py-1.5 !px-2 text-sm font-mono"
            disabled={currentTurn === 0}
          >
            &lt;
          </button>
          <button
            onClick={nextTurn}
            className="blueprint-btn !py-1.5 !px-2 text-sm font-mono"
            disabled={currentTurn >= maxTurn}
          >
            &gt;
          </button>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={maxTurn}
            value={currentTurn}
            onChange={(e) => goToTurn(Number(e.target.value))}
            className="flex-1 h-1 accent-white cursor-pointer"
          />

          {/* Turn label */}
          <div className="text-sm font-mono tracking-widest whitespace-nowrap min-w-[200px] text-center">
            ROUND {currentSnap?.round ?? 1} //{" "}
            <span style={{ color: teamColor }}>
              {teamName.toUpperCase() || "—"}
            </span>
          </div>

          {/* Speed selector */}
          <div className="flex gap-1">
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setPlaybackSpeed(opt.value)}
                className={`text-xs font-mono px-2 py-1 border transition-colors ${
                  playbackSpeed === opt.value
                    ? "border-white bg-white/20 text-white"
                    : "border-white/30 text-white/50 hover:text-white hover:border-white/60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
