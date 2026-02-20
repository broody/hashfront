import {
  useAccount,
  useConnect,
  useExplorer,
  useProvider,
  useSendTransaction,
} from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useClient } from "urql";
import { ACTIONS_ADDRESS } from "../StarknetProvider";
import { useToast } from "./Toast";
import { PixelButton } from "./PixelButton";
import { PixelPanel } from "./PixelPanel";

const TILE_PX = 24;
const TERRAIN_IMAGE = "/tilesets/terrain.png";

const LEGEND: { label: string; x: number; y: number }[] = [
  { label: "Grass", x: 0, y: TILE_PX * 4 },
  { label: "Mountain", x: TILE_PX * 6, y: 0 },
  { label: "Road", x: TILE_PX * 6, y: TILE_PX * 8 },
  { label: "Tree", x: TILE_PX * 6, y: TILE_PX * 4 },
];

interface GraphEdge<T> {
  node: T;
}

interface TurnStatusQueryResult {
  hashfrontGameModels: {
    edges: GraphEdge<{ name: string; current_player: string | number; is_test_mode: boolean }>[];
  };
  hashfrontPlayerStateModels: {
    edges: GraphEdge<{ player_id: string | number; address: string }>[];
  };
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

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
  const graphqlClient = useClient();
  const explorer = useExplorer();
  const { provider } = useProvider();
  const { sendAsync: sendTransaction } = useSendTransaction({});
  const { toast } = useToast();

  const { connect, connectors } = useConnect();
  const { address } = useAccount();
  const [username, setUsername] = useState<string>();
  const [gameName, setGameName] = useState<string>("");
  const [currentPlayer, setCurrentPlayer] = useState<number | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null);
  const [isTestMode, setIsTestMode] = useState(false);
  const [isEndingTurn, setIsEndingTurn] = useState(false);
  const controllerConnector = useMemo(
    () => ControllerConnector.fromConnectors(connectors),
    [connectors],
  );
  const canEndTurn =
    currentPlayer !== null &&
    (isTestMode || (myPlayerId !== null && myPlayerId === currentPlayer));

  useEffect(() => {
    if (!address) return;
    controllerConnector.username()?.then(setUsername);
  }, [address, controllerConnector]);

  useEffect(() => {
    let active = true;

    async function loadTurnStatus() {
      try {
        const query = `
          query {
            hashfrontGameModels(where: {game_idEQ: ${gameId}}) {
              edges {
                node {
                  name
                  current_player
                  is_test_mode
                }
              }
            }
            hashfrontPlayerStateModels(where: {game_idEQ: ${gameId}}) {
              edges {
                node {
                  player_id
                  address
                }
              }
            }
          }
        `;

        const result = await graphqlClient
          .query<TurnStatusQueryResult>(query, undefined, {
            requestPolicy: "network-only",
          })
          .toPromise();

        if (!active || result.error || !result.data) return;

        const gameNode = result.data.hashfrontGameModels.edges[0]?.node;
        setGameName(gameNode?.name ?? "");
        const nextCurrentPlayer = toNumber(gameNode?.current_player);
        setCurrentPlayer(nextCurrentPlayer > 0 ? nextCurrentPlayer : null);
        setIsTestMode(gameNode?.is_test_mode ?? false);

        if (!address) {
          setMyPlayerId(null);
          return;
        }

        const normalizedAddress = normalizeAddressHex(address);
        const myPlayer = result.data.hashfrontPlayerStateModels.edges.find(
          (edge) =>
            normalizeAddressHex(edge.node.address) === normalizedAddress,
        )?.node;
        setMyPlayerId(myPlayer ? toNumber(myPlayer.player_id) : null);
      } catch (error) {
        console.error("Failed to load turn status:", error);
      }
    }

    void loadTurnStatus();
    const intervalId = window.setInterval(() => {
      void loadTurnStatus();
    }, 2000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [address, gameId, graphqlClient]);

  async function handleEndTurn() {
    if (!address) {
      connect({ connector: controllerConnector });
      return;
    }
    if (!canEndTurn || isEndingTurn) return;

    setIsEndingTurn(true);
    try {
      toast("Ending turn...", "info");
      const tx = await sendTransaction([
        {
          contractAddress: ACTIONS_ADDRESS,
          entrypoint: "end_turn",
          calldata: [gameId.toString()],
        },
      ]);
      if (!tx?.transaction_hash) {
        throw new Error("Missing transaction hash");
      }
      await provider.waitForTransaction(tx.transaction_hash, {
        retryInterval: 500,
      });
      toast("Turn ended.", "success", {
        linkUrl: explorer.transaction(tx.transaction_hash),
        linkLabel: `TX ${shortTxHash(tx.transaction_hash)}`,
      });
    } catch (error) {
      console.error("Failed to end turn:", error);
      toast("Failed to end turn.", "error");
    } finally {
      setIsEndingTurn(false);
    }
  }

  return (
    <>
      <div className="absolute top-0 left-0 right-0 h-16 bg-blueprint-blue/60 flex items-center justify-between px-8 z-10 border-b-2 border-white backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
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
            <PixelButton
              variant="gray"
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
              <span className="font-bold">
                {currentPlayer === null ? "UNKNOWN" : `P${currentPlayer}`}
              </span>
            </div>
            <div>
              MY PLAYER ID:{" "}
              <span className="font-bold">
                {myPlayerId === null ? "NOT JOINED" : `P${myPlayerId}`}
              </span>
            </div>
            <PixelButton
              variant="blue"
              onClick={handleEndTurn}
              disabled={isEndingTurn || !address || !canEndTurn}
              className="!mt-2"
            >
              {isEndingTurn ? "ENDING..." : "END TURN"}
            </PixelButton>
          </div>
        </PixelPanel>
      </div>
    </>
  );
}
