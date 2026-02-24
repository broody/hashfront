import {
  useAccount,
  useConnect,
  useExplorer,
  useProvider,
  useSendTransaction,
} from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { lookupAddresses } from "@cartridge/controller";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ACTIONS_ADDRESS } from "../StarknetProvider";
import { useToast } from "./Toast";
import { parseTransactionError } from "../utils/parseTransactionError";
import { PixelButton } from "./PixelButton";
import { PixelPanel } from "./PixelPanel";
import { useGameStore, TEAMS, UNIT_MAX_HP } from "../data/gameStore";
import { GRID_SIZE, TileType } from "../game/types";

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

// First idle frame (x, y) in the 32x32 spritesheet (896x1328)
const UNIT_SPRITE_OFFSET: Record<string, { x: number; y: number }> = {
  rifle: { x: 0, y: 48 },
  tank: { x: 0, y: 432 },
  artillery: { x: 0, y: 336 },
};

const UNIT_DISPLAY_NAMES: Record<string, string> = {
  rifle: "Infantry",
  tank: "Tank",
  artillery: "Ranger",
};

const UNIT_ATTACK_POWER: Record<string, number> = {
  rifle: 2,
  tank: 4,
  artillery: 3,
};

const UNIT_ATTACK_RANGE: Record<string, [number, number]> = {
  rifle: [1, 1],
  tank: [1, 1],
  artillery: [2, 3],
};

const UNIT_MOVE_RANGE: Record<string, number> = {
  rifle: 4,
  tank: 2,
  artillery: 3,
};

const TERRAIN_DEFENSE: Record<number, number> = {
  [TileType.Grass]: 0,
  [TileType.Mountain]: 2,
  [TileType.City]: 1,
  [TileType.Factory]: 1,
  [TileType.HQ]: 2,
  [TileType.Road]: 0,
  [TileType.Tree]: 1,
  [TileType.DirtRoad]: 0,
  [TileType.Barracks]: 0,
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
};

function normalizeAddressHex(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return BigInt(value).toString(16);
  } catch {
    return value.toLowerCase().replace(/^0x/, "");
  }
}

function shortTxHash(txHash: string): string {
  if (txHash.length <= 14) return txHash;
  return `${txHash.slice(0, 8)}...${txHash.slice(-6)}`;
}

export default function HUD() {
  const { id } = useParams<{ id: string }>();
  const gameId = parseInt(id || "1", 10) || 1;
  const explorer = useExplorer();
  const { provider } = useProvider();
  const { sendAsync: sendTransaction } = useSendTransaction({});
  const { toast, showErrorModal } = useToast();

  const { connect, connectors } = useConnect();
  const { address } = useAccount();
  const [username, setUsername] = useState<string>();
  const [playerUsernames, setPlayerUsernames] = useState<
    Record<string, string>
  >({});
  const isEndingTurn = useGameStore((s) => s.isEndingTurn);
  const setIsEndingTurn = useGameStore((s) => s.setIsEndingTurn);
  const [isResigning, setIsResigning] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  const controllerConnector = useMemo(
    () => ControllerConnector.fromConnectors(connectors),
    [connectors],
  );

  // Read game state from Zustand store (reactive — updates via gRPC subscriptions)
  const game = useGameStore((s) => s.game);
  const players = useGameStore((s) => s.players);
  const moveQueue = useGameStore((s) => s.moveQueue);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const units = useGameStore((s) => s.units);
  const tileMap = useGameStore((s) => s.tileMap);

  const selectedUnit = useMemo(() => {
    if (selectedUnitId === null) return null;
    return units.find((u) => u.id === selectedUnitId) ?? null;
  }, [selectedUnitId, units]);

  const selectedUnitTerrain = useMemo(() => {
    if (!selectedUnit || tileMap.length === 0) return null;
    // Check if unit has a queued move — use destination tile
    const queued = moveQueue.find((m) => m.unitId === selectedUnit.id);
    const ux = queued ? queued.destX : selectedUnit.x;
    const uy = queued ? queued.destY : selectedUnit.y;
    if (ux < 0 || ux >= GRID_SIZE || uy < 0 || uy >= GRID_SIZE) return null;
    const tileType = tileMap[uy * GRID_SIZE + ux] as TileType;
    return {
      type: tileType,
      name: TERRAIN_NAMES[tileType] ?? "Unknown",
      defense: TERRAIN_DEFENSE[tileType] ?? 0,
    };
  }, [selectedUnit, tileMap, moveQueue]);

  const currentPlayer = game?.currentPlayer ?? null;
  const gameName = game?.name ?? "";
  const connectedAddressHex = useMemo(
    () => normalizeAddressHex(address),
    [address],
  );
  const currentTurnAddressHex = useMemo(() => {
    if (currentPlayer === null) return null;
    const currentTurnPlayer = players.find((p) => p.playerId === currentPlayer);
    return normalizeAddressHex(currentTurnPlayer?.address);
  }, [currentPlayer, players]);

  const canEndTurn =
    game?.state === "Playing" &&
    connectedAddressHex !== null &&
    currentTurnAddressHex !== null &&
    connectedAddressHex === currentTurnAddressHex;

  const isLobby = game?.state === "Lobby";
  const canJoin = isLobby && !!address;
  const [isJoining, setIsJoining] = useState(false);

  const firstAvailableSlot = useMemo(() => {
    if (!isLobby || !game) return null;
    const occupiedIds = new Set(players.map((p) => p.playerId));
    for (let id = 1; id <= game.playerCount; id++) {
      if (!occupiedIds.has(id)) return id;
    }
    return null;
  }, [isLobby, game, players]);

  async function handleJoinGame() {
    if (!address || !canJoin || firstAvailableSlot === null || isJoining)
      return;
    setIsJoining(true);
    try {
      const tx = await sendTransaction([
        {
          contractAddress: ACTIONS_ADDRESS,
          entrypoint: "join_game",
          calldata: [gameId.toString(), firstAvailableSlot.toString()],
        },
      ]);
      if (!tx?.transaction_hash) throw new Error("Missing transaction hash");
      await provider.waitForTransaction(tx.transaction_hash, {
        retryInterval: 250,
      });
      toast("Joined game.", "success", {
        linkUrl: explorer.transaction(tx.transaction_hash),
        linkLabel: `TX ${shortTxHash(tx.transaction_hash)}`,
      });
    } catch (error) {
      console.error("Failed to join game:", error);
      const parsed = parseTransactionError(error);
      if (parsed) {
        showErrorModal("TRANSACTION_REJECTED", parsed.message, parsed.rawError);
      } else {
        toast("Failed to join game.", "error");
      }
    } finally {
      setIsJoining(false);
    }
  }

  useEffect(() => {
    if (!address) return;
    controllerConnector.username()?.then(setUsername);
  }, [address, controllerConnector]);

  useEffect(() => {
    if (players.length === 0) return;
    let active = true;

    async function loadUsernames() {
      try {
        const addressMap = await lookupAddresses(players.map((p) => p.address));
        if (!active) return;

        const normalizedLookup: Record<string, string> = {};
        for (const [addressKey, name] of addressMap.entries()) {
          const normalized = normalizeAddressHex(addressKey);
          if (normalized) normalizedLookup[normalized] = name;
        }

        const result: Record<string, string> = {};
        for (const player of players) {
          const normalized = normalizeAddressHex(player.address);
          if (!normalized) continue;
          const name = normalizedLookup[normalized];
          if (name) result[player.address] = name;
        }
        setPlayerUsernames(result);
      } catch (error) {
        console.error("Failed to lookup player usernames:", error);
      }
    }

    void loadUsernames();
    return () => {
      active = false;
    };
  }, [players]);

  async function handleEndTurn() {
    if (!address) {
      connect({ connector: controllerConnector });
      return;
    }
    if (!canEndTurn || isEndingTurn) return;

    setIsEndingTurn(true);
    const {
      moveQueue: queue,
      updateUnit,
      clearQueue,
      requestDeselect,
    } = useGameStore.getState();
    requestDeselect();
    try {
      const calls = [
        ...queue.flatMap((m) => m.calls),
        {
          contractAddress: ACTIONS_ADDRESS,
          entrypoint: "end_turn",
          calldata: [gameId.toString()],
        },
      ];
      const tx = await sendTransaction(calls);
      if (!tx?.transaction_hash) {
        throw new Error("Missing transaction hash");
      }
      await provider.waitForTransaction(tx.transaction_hash, {
        retryInterval: 250,
      });
      // Set store positions to destinations so sprites don't snap back
      for (const m of queue) {
        updateUnit(m.unitOnchainId, { x: m.destX, y: m.destY });
      }
      clearQueue({ fade: true });
      toast("Turn ended.", "success", {
        linkUrl: explorer.transaction(tx.transaction_hash),
        linkLabel: `TX ${shortTxHash(tx.transaction_hash)}`,
      });
    } catch (error) {
      console.error("Failed to end turn:", error);
      for (const m of queue) {
        updateUnit(m.unitOnchainId, { x: m.originX, y: m.originY });
      }
      clearQueue();
      const parsed = parseTransactionError(error);
      if (parsed) {
        showErrorModal("TRANSACTION_REJECTED", parsed.message, parsed.rawError);
      } else {
        toast("Failed to end turn.", "error");
      }
    } finally {
      setIsEndingTurn(false);
    }
  }

  async function handleResign() {
    if (!address || isResigning) return;

    setIsResigning(true);
    setShowResignConfirm(false);
    try {
      const tx = await sendTransaction([
        {
          contractAddress: ACTIONS_ADDRESS,
          entrypoint: "resign",
          calldata: [gameId.toString()],
        },
      ]);
      if (!tx?.transaction_hash) {
        throw new Error("Missing transaction hash");
      }
      await provider.waitForTransaction(tx.transaction_hash, {
        retryInterval: 250,
      });
      toast("Resigned from game.", "info", {
        linkUrl: explorer.transaction(tx.transaction_hash),
        linkLabel: `TX ${shortTxHash(tx.transaction_hash)}`,
      });
    } catch (error) {
      console.error("Failed to resign:", error);
      const parsed = parseTransactionError(error);
      if (parsed) {
        showErrorModal("TRANSACTION_REJECTED", parsed.message, parsed.rawError);
      } else {
        toast("Failed to resign.", "error");
      }
    } finally {
      setIsResigning(false);
    }
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
            // {gameName || `OPERATION_${gameId}`}
          </span>
        </div>

        {address ? (
          <div className="flex items-center gap-6">
            {canJoin && firstAvailableSlot !== null && (
              <PixelButton
                variant="blue"
                onClick={() => void handleJoinGame()}
                disabled={isJoining}
                className="!py-1 !px-4"
              >
                {isJoining ? "JOINING..." : "JOIN_GAME"}
              </PixelButton>
            )}
            <PixelButton
              variant="blue"
              onClick={() => controllerConnector.controller.openProfile()}
              className="!py-1 !px-4"
            >
              COMMANDER:{" "}
              {username ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
            </PixelButton>
          </div>
        ) : (
          <PixelButton
            variant="blue"
            onClick={() => connect({ connector: controllerConnector })}
            className="!py-1 !px-4"
          >
            CONNECT_SYSTEM
          </PixelButton>
        )}
      </div>

      {selectedUnit && (
        <div className="absolute top-24 left-8 z-10">
          <PixelPanel title="UNIT_INTEL" className="!p-5 min-w-[260px]">
            <div className="flex flex-col gap-4 mt-2">
              {/* Unit portrait */}
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

              {/* Stats */}
              <div className="flex flex-col gap-2 text-sm uppercase tracking-widest">
                <div className="flex justify-between">
                  <span className="text-white/60">HP</span>
                  <span>
                    {selectedUnit.hp} / {UNIT_MAX_HP[selectedUnit.type] ?? 3}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">ATK</span>
                  <span>{UNIT_ATTACK_POWER[selectedUnit.type] ?? 0}</span>
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

                {/* Terrain info */}
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
                      (selectedUnitTerrain.type === TileType.Road ||
                        selectedUnitTerrain.type === TileType.DirtRoad) && (
                        <div className="flex justify-between">
                          <span className="text-white/60">ROAD BONUS</span>
                          <span>+2 MOVE</span>
                        </div>
                      )}
                  </>
                )}

                {/* Status */}
                <div className="flex justify-between">
                  <span className="text-white/60">STATUS</span>
                  <span>
                    {(() => {
                      const g = game;
                      if (!g) return "—";
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
                const name =
                  playerUsernames[p.address] ??
                  `${p.address.slice(0, 6)}...${p.address.slice(-4)}`;
                const isTurn = p.playerId === currentPlayer;
                return (
                  <div key={p.playerId} className="flex items-center gap-2">
                    <span
                      className="text-[10px] w-3"
                      style={{ color: isTurn ? color : "transparent" }}
                    >
                      {isTurn ? "▶" : ""}
                    </span>
                    <span
                      className={`text-sm ${isTurn ? "font-bold" : "font-normal opacity-50"}`}
                      style={{ color }}
                    >
                      {name}
                    </span>
                  </div>
                );
              })}
              {players.length === 0 && (
                <span className="font-bold text-base">UNKNOWN</span>
              )}
            </div>
            {canEndTurn && (
              <div className="flex flex-col gap-2 !mt-2">
                <PixelButton
                  variant="blue"
                  onClick={handleEndTurn}
                  disabled={isEndingTurn || isResigning || !address}
                  className="w-full"
                >
                  {isEndingTurn
                    ? "ENDING..."
                    : moveQueue.length > 0
                      ? `END_TURN (${moveQueue.length})`
                      : "END_TURN"}
                </PixelButton>

                {moveQueue.length > 0 && (
                  <PixelButton
                    variant="gray"
                    onClick={handleUndoMove}
                    disabled={isEndingTurn || isResigning}
                    className="w-full animate-fade-in-up"
                  >
                    UNDO_LAST_MOVE
                  </PixelButton>
                )}

                <button
                  onClick={() => setShowResignConfirm(true)}
                  disabled={isEndingTurn || isResigning}
                  className="text-[10px] text-white/30 hover:text-red-400 transition-colors uppercase tracking-[0.2em] mt-1 self-center"
                >
                  {isResigning ? "RESIGNING..." : "RESIGN_COMMAND"}
                </button>
              </div>
            )}
          </div>
        </PixelPanel>
      </div>

      {showResignConfirm && (
        <div className="fixed inset-0 z-[100] bg-blueprint-dark/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm animate-fade-in-up">
            <PixelPanel title="CONFIRM_RESIGNATION" className="!p-6">
              <div className="flex flex-col gap-6">
                <div className="text-sm uppercase tracking-[0.2em] text-blueprint-light text-center leading-relaxed">
                  ARE YOU SURE YOU WANT TO <span className="text-red-400">ABANDON</span> THE SECTOR? 
                  <br/>
                  ALL FORCES WILL BE DECOMMISSIONED.
                </div>
                <div className="flex gap-4">
                  <PixelButton
                    variant="gray"
                    onClick={() => setShowResignConfirm(false)}
                    className="flex-1"
                  >
                    CANCEL
                  </PixelButton>
                  <PixelButton
                    variant="blue"
                    onClick={() => void handleResign()}
                    className="flex-1 !border-red-500/50 !text-red-400 hover:!bg-red-500/20"
                  >
                    RESIGN
                  </PixelButton>
                </div>
              </div>
            </PixelPanel>
          </div>
        </div>
      )}
    </>
  );
}
