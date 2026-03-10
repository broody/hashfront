import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PixelButton } from "./PixelButton";
import { PixelPanel } from "./PixelPanel";
import { useGameStore, TEAMS } from "../data/gameStore";
import { TileType } from "../game/types";
import {
  DEFAULT_UNIT_HP,
  TERRAIN_DEFENSE,
  UNIT_ATTACK_RANGE,
  UNIT_DAMAGE_PROFILE_TEXT,
  UNIT_DISPLAY_NAMES,
  UNIT_MAX_HP,
  UNIT_MOVE_RANGE,
  UNIT_ROAD_BONUS,
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

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "EASY",
  normal: "NORMAL",
  hard: "HARD",
};

interface LocalHUDProps {
  onRestart: () => void;
  difficulty: string;
}

export default function LocalHUD({ onRestart, difficulty }: LocalHUDProps) {
  const isEndingTurn = useGameStore((s) => s.isEndingTurn);
  const game = useGameStore((s) => s.game);
  const players = useGameStore((s) => s.players);
  const moveQueue = useGameStore((s) => s.moveQueue);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const units = useGameStore((s) => s.units);
  const tileMap = useGameStore((s) => s.tileMap);
  const gridWidth = useGameStore((s) => s.gridWidth);
  const gridHeight = useGameStore((s) => s.gridHeight);

  const selectedUnit = useMemo(() => {
    if (selectedUnitId === null) return null;
    return units.find((u) => u.id === selectedUnitId) ?? null;
  }, [selectedUnitId, units]);

  const selectedUnitTerrain = useMemo(() => {
    if (!selectedUnit || tileMap.length === 0) return null;
    const queued = moveQueue.find((m) => m.unitId === selectedUnit.id);
    const ux = queued ? queued.destX : selectedUnit.x;
    const uy = queued ? queued.destY : selectedUnit.y;
    if (ux < 0 || ux >= gridWidth || uy < 0 || uy >= gridHeight) return null;
    const tileType = tileMap[uy * gridWidth + ux] as TileType;
    return {
      type: tileType,
      name: TERRAIN_NAMES[tileType] ?? "Unknown",
      defense: TERRAIN_DEFENSE[tileType] ?? 0,
    };
  }, [selectedUnit, tileMap, moveQueue, gridWidth, gridHeight]);

  const isPlayerTurn =
    game?.state === "Playing" && game.currentPlayer === 1 && !isEndingTurn;

  function handleEndTurn() {
    const { onLocalEndTurn } = useGameStore.getState();
    if (onLocalEndTurn) onLocalEndTurn();
  }

  function handleUndoMove() {
    const { moveQueue, dequeueMove, updateUnit } = useGameStore.getState();
    if (moveQueue.length === 0) return;
    const last = moveQueue[moveQueue.length - 1];
    updateUnit(last.unitOnchainId, { x: last.originX, y: last.originY });
    dequeueMove(last.unitId);
  }

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
                  transform-origin="center"
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
            // SOLO_MISSION
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-white/50 uppercase tracking-[2px]">
            {DIFFICULTY_LABELS[difficulty] ?? difficulty.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Unit Intel Panel */}
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
                    {(selectedUnit.type === "tank" ||
                      selectedUnit.type === "artillery") &&
                      (UNIT_ROAD_BONUS[selectedUnit.type] ?? 0) > 0 &&
                      (selectedUnitTerrain.type === TileType.Road ||
                        selectedUnitTerrain.type === TileType.DirtRoad) && (
                        <div className="flex justify-between">
                          <span className="text-white/60">ROAD BONUS</span>
                          <span>
                            +{UNIT_ROAD_BONUS[selectedUnit.type] ?? 0} MOVE
                          </span>
                        </div>
                      )}
                  </>
                )}

                <div className="flex justify-between">
                  <span className="text-white/60">STATUS</span>
                  <span>
                    {(() => {
                      const g = game;
                      if (!g) return "--";
                      const currentTeam =
                        g.currentPlayer !== undefined
                          ? (TEAMS[g.currentPlayer] ?? null)
                          : null;
                      if (selectedUnit.team !== currentTeam) return "STANDBY";
                      const queued = moveQueue.some(
                        (m) => m.unitId === selectedUnit.id,
                      );
                      if (queued) return "QUEUED";
                      if (selectedUnit.lastActedRound >= g.round)
                        return "ACTED";
                      if (selectedUnit.lastMovedRound >= g.round)
                        return "MOVED";
                      return "READY";
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </PixelPanel>
        </div>
      )}

      {/* Command Panel */}
      <div className="absolute top-24 right-8 z-10">
        <PixelPanel title="COMMAND_STATUS" className="!p-4 min-w-[200px]">
          <div className="flex flex-col gap-2 mt-2 text-sm uppercase tracking-widest">
            <div className="border-b border-white/10 pb-2 mb-1 flex flex-col gap-1">
              <span className="text-white/40 text-[10px] block mb-1">
                PLAYERS
              </span>
              {players.map((p) => {
                const team = TEAMS[p.playerId] ?? "blue";
                const color = PLAYER_COLORS[team] ?? "#ffffff";
                const name = p.playerId === 1 ? "COMMANDER" : "AI_OPPONENT";
                const isTurn = p.playerId === game?.currentPlayer;
                return (
                  <div key={p.playerId} className="flex items-center gap-2">
                    <span
                      className="text-[10px] w-3"
                      style={{ color: isTurn ? color : "transparent" }}
                    >
                      {isTurn ? "\u25B6" : ""}
                    </span>
                    <span
                      className={`text-sm ${isTurn ? "font-bold" : "font-normal opacity-50"}`}
                      style={{ color }}
                    >
                      {name}
                    </span>
                    <span className="text-[10px] text-white/30 ml-auto">
                      {p.gold}g
                    </span>
                  </div>
                );
              })}
            </div>

            {isEndingTurn && (
              <div className="text-center text-xs text-yellow-400 animate-pulse py-2">
                AI_THINKING...
              </div>
            )}

            {game?.state === "Finished" && (
              <div className="text-center py-2">
                <span
                  className="text-lg font-bold"
                  style={{
                    color:
                      game.winner === 1
                        ? PLAYER_COLORS.blue
                        : PLAYER_COLORS.red,
                  }}
                >
                  {game.winner === 1 ? "VICTORY" : "DEFEAT"}
                </span>
              </div>
            )}

            {isPlayerTurn && (
              <div className="flex flex-col gap-2 !mt-2">
                <PixelButton
                  variant="blue"
                  onClick={handleEndTurn}
                  className="w-full"
                >
                  {moveQueue.length > 0
                    ? `END_TURN (${moveQueue.length})`
                    : "END_TURN"}
                </PixelButton>

                {moveQueue.length > 0 && (
                  <PixelButton
                    variant="gray"
                    onClick={handleUndoMove}
                    className="w-full animate-fade-in-up"
                  >
                    UNDO_LAST_MOVE
                  </PixelButton>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 mt-2">
              <PixelButton
                variant="gray"
                onClick={onRestart}
                className="w-full"
              >
                RESTART_MISSION
              </PixelButton>
              <Link to="/solo">
                <PixelButton variant="gray" className="w-full">
                  CHANGE_MAP
                </PixelButton>
              </Link>
            </div>
          </div>
        </PixelPanel>
      </div>
    </>
  );
}
