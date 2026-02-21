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
import { useGameStore, TEAMS } from "../data/gameStore";

const PLAYER_COLORS: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
};

const TILE_PX = 24;
const TERRAIN_IMAGE = "/tilesets/terrain.png";

const LEGEND: { label: string; x: number; y: number }[] = [
  { label: "Grass", x: 0, y: TILE_PX * 4 },
  { label: "Mountain", x: TILE_PX * 6, y: 0 },
  { label: "Road", x: TILE_PX * 6, y: TILE_PX * 8 },
  { label: "Tree", x: TILE_PX * 6, y: TILE_PX * 4 },
];

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
  const controllerConnector = useMemo(
    () => ControllerConnector.fromConnectors(connectors),
    [connectors],
  );

  // Read game state from Zustand store (reactive — updates via gRPC subscriptions)
  const game = useGameStore((s) => s.game);
  const players = useGameStore((s) => s.players);
  const moveQueue = useGameStore((s) => s.moveQueue);

  const currentPlayer = game?.currentPlayer ?? null;
  const gameName = game?.name ?? "";
  const isTestMode = game?.isTestMode ?? false;

  const myPlayerId = useMemo(() => {
    if (!address) return null;
    const normalizedAddress = normalizeAddressHex(address);
    const myPlayer = players.find(
      (p) => normalizeAddressHex(p.address) === normalizedAddress,
    );
    return myPlayer?.playerId ?? null;
  }, [address, players]);

  const canEndTurn =
    game?.state === "Playing" &&
    currentPlayer !== null &&
    (isTestMode || (myPlayerId !== null && myPlayerId === currentPlayer));

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

  const currentTurnPlayer = useMemo(() => {
    if (currentPlayer === null) return null;
    const player = players.find((p) => p.playerId === currentPlayer);
    if (!player) return null;
    const team = TEAMS[currentPlayer] ?? "blue";
    const color = PLAYER_COLORS[team] ?? "#ffffff";
    const name = playerUsernames[player.address];
    return {
      playerId: currentPlayer,
      team,
      color,
      name,
      address: player.address,
    };
  }, [currentPlayer, players, playerUsernames]);

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

      <div className="absolute top-24 left-8 z-10">
        <PixelPanel title="TERRAIN_INTEL" className="!p-4 min-w-[200px]">
          <div className="flex flex-col gap-3 mt-2">
            {LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-4">
                <span
                  className="inline-block"
                  style={{
                    width: 32,
                    height: 32,
                    backgroundImage: `url(${TERRAIN_IMAGE})`,
                    backgroundPosition: `-${item.x * (32 / TILE_PX)}px -${item.y * (32 / TILE_PX)}px`,
                    backgroundSize: `${240 * (32 / TILE_PX)}px ${384 * (32 / TILE_PX)}px`,
                    imageRendering: "pixelated",
                  }}
                />
                <span className="text-sm uppercase tracking-widest">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </PixelPanel>
      </div>

      <div className="absolute top-24 right-8 z-10">
        <PixelPanel title="COMMAND_STATUS" className="!p-4 min-w-[200px]">
          <div className="flex flex-col gap-2 mt-2 text-xs uppercase tracking-widest">
            <div>
              CURRENT TURN:{" "}
              {currentTurnPlayer ? (
                <span
                  className="font-bold"
                  style={{ color: currentTurnPlayer.color }}
                >
                  {currentTurnPlayer.name ??
                    `${currentTurnPlayer.address.slice(0, 6)}...${currentTurnPlayer.address.slice(-4)}`}
                </span>
              ) : (
                <span className="font-bold">UNKNOWN</span>
              )}
            </div>
            {canEndTurn && (
              <div className="flex gap-2 !mt-2">
                {moveQueue.length > 0 && (
                  <PixelButton
                    variant="gray"
                    onClick={handleUndoMove}
                    disabled={isEndingTurn}
                  >
                    UNDO
                  </PixelButton>
                )}
                <PixelButton
                  variant="blue"
                  onClick={handleEndTurn}
                  disabled={isEndingTurn || !address}
                >
                  {isEndingTurn
                    ? "ENDING..."
                    : moveQueue.length > 0
                      ? `END TURN (${moveQueue.length})`
                      : "END TURN"}
                </PixelButton>
              </div>
            )}
          </div>
        </PixelPanel>
      </div>
    </>
  );
}
