import { Link, useNavigate } from "react-router-dom";
import {
  useAccount,
  useConnect,
  useExplorer,
  useProvider,
  useSendTransaction,
} from "@starknet-react/core";
import { CallData, byteArray, hash, num } from "starknet";
import { lookupAddresses } from "@cartridge/controller";
import { ControllerConnector } from "@cartridge/connector";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "urql";
import { PixelButton } from "../components/PixelButton";
import { PixelPanel } from "../components/PixelPanel";
import { BlueprintContainer } from "../components/BlueprintContainer";
import { ACTIONS_ADDRESS } from "../StarknetProvider";
import { useToast } from "../components/Toast";

interface GraphEdge<T> {
  node: T;
}

interface GameModelNode {
  game_id: string | number;
  name: string;
  map_id: string | number;
  height: string | number;
  width: string | number;
  state: string | number;
  player_count: string | number;
  num_players: string | number;
  current_player: string | number;
  round: string | number;
  next_unit_id: string | number;
  is_test_mode: boolean;
  winner?: string | number | null;
}

interface LobbyGamesQueryResult {
  hashfrontGameModels: {
    totalCount: string | number;
    edges: GraphEdge<GameModelNode>[];
  };
}

interface MapInfoNode {
  map_id: string | number;
  player_count: string | number;
  height: string | number;
  width: string | number;
}

interface MapInfoQueryResult {
  hashfrontMapInfoModels: {
    edges: GraphEdge<MapInfoNode>[];
  };
}

interface PlayerStateNode {
  player_id: string | number;
  address: string;
}

interface PlayerStateQueryResult {
  hashfrontPlayerStateModels: {
    edges: GraphEdge<PlayerStateNode>[];
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

function parseGameState(value: string | number): "Lobby" | "Playing" | "Other" {
  if (typeof value === "string") {
    if (value === "Lobby") return "Lobby";
    if (value === "Playing") return "Playing";
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    if (numeric === 1) return "Lobby";
    if (numeric === 2) return "Playing";
  }
  return "Other";
}

function gameStatusLabel(state: "Lobby" | "Playing" | "Other"): string {
  if (state === "Lobby") return "OPEN";
  if (state === "Playing") return "IN_PROGRESS";
  return "UNKNOWN";
}

function normalizeAddressHex(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return `0x${BigInt(value).toString(16)}`;
  } catch {
    const normalized = value.toLowerCase();
    return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
  }
}

function shortTxHash(txHash: string): string {
  if (txHash.length <= 14) return txHash;
  return `${txHash.slice(0, 8)}...${txHash.slice(-6)}`;
}

const ECGMonitor = ({
  playerCount = 1,
  gameId = 0,
}: {
  playerCount: number;
  gameId: number;
}) => {
  const pulses = Math.max(1, playerCount);
  // Slower scroll speed: 1p=6s, 4p=1.5s approx
  const scrollDuration = Math.max(1.5, 7.5 - pulses * 1.5);

  // Use a more complex prime-based offset for better "randomness"
  // (gameId * a_prime + some_other_prime) % scrollDuration
  const randomDelay = (gameId * 37.7 + 13.3) % scrollDuration;

  return (
    <div className="relative w-16 h-16 border border-white/10 bg-blueprint-dark/40 overflow-hidden rounded group">
      <div 
        className="absolute inset-0 animate-intermittent-glitch"
        style={{ animationDelay: `-${(gameId * 1.43) % 32}s` }}
      >
        {/* Background Grid */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
            backgroundSize: "4px 4px",
          }}
        />

        <div className="absolute inset-0 flex items-center">
          <svg
            viewBox="0 0 160 40"
            className="h-full shrink-0 animate-ecg-scroll"
            style={{
              animationDuration: `${scrollDuration}s`,
              animationDelay: `-${randomDelay}s`,
            }}
          >
            {/* Repeating heartbeat path - 2 segments to allow continuous scroll */}
            <g
              className="flicker-text"
              style={{ animationDelay: `-${(randomDelay * 0.8) % 5}s` }}
            >
              <path
                d="M0,20 L15,20 L18,10 L22,30 L25,20 L40,20 L55,20 L58,10 L62,30 L65,20 L80,20 L95,20 L98,10 L102,30 L105,20 L120,20 L135,20 L138,10 L142,30 L145,20 L160,20"
                fill="none"
                stroke="rgba(255, 255, 255, 0.5)"
                strokeWidth="1.2"
                className="animate-ecg-glow"
                style={{
                  animationDuration: `${scrollDuration * 0.5}s`,
                }}
              />
            </g>
          </svg>
        </div>

        {/* Realistic CRT Beam */}
        <div
          className="absolute top-0 bottom-0 w-12 animate-ecg-sweep pointer-events-none"
          style={{
            animationDuration: `${scrollDuration * 2}s`,
            animationDelay: `-${(randomDelay * 1.3) % (scrollDuration * 2)}s`,
          }}
        >
          {/* Leading sharp line */}
          <div className="absolute right-0 top-0 bottom-0 w-[1.5px] bg-white/30 shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
          {/* Trailing phosphor decay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-white/10" />
        </div>

        {/* Pulse status indicator */}
        <div className="absolute bottom-1 right-1 text-[7px] font-mono text-white/20 leading-none uppercase">
          VITAL_{pulses > 1 ? "MULT" : "STABLE"}
        </div>
      </div>
    </div>
  );
};

export default function Lobby() {
  const { connect, connectors } = useConnect();
  const { address } = useAccount();
  const explorer = useExplorer();
  const { provider } = useProvider();
  const { sendAsync: sendTransaction } = useSendTransaction({});
  const graphqlClient = useClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const controllerConnector = useMemo(
    () => ControllerConnector.fromConnectors(connectors),
    [connectors],
  );
  const [username, setUsername] = useState<string>();
  const [games, setGames] = useState<GameModelNode[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesLoadingMore, setGamesLoadingMore] = useState(false);
  const [gamesTotalCount, setGamesTotalCount] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mapInfos, setMapInfos] = useState<MapInfoNode[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [operationName, setOperationName] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinTargetGameId, setJoinTargetGameId] = useState<number | null>(null);
  const [joinPlayers, setJoinPlayers] = useState<PlayerStateNode[]>([]);
  const [joinPlayerUsernames, setJoinPlayerUsernames] = useState<
    Record<string, string>
  >({});
  const [joinPlayersLoading, setJoinPlayersLoading] = useState(false);
  const [selectedJoinPlayerId, setSelectedJoinPlayerId] = useState<
    number | null
  >(null);
  const [isJoining, setIsJoining] = useState(false);
  const [joiningGameId, setJoiningGameId] = useState<number | null>(null);
  const gamesListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!address) return;
    controllerConnector.username()?.then(setUsername);
  }, [address, controllerConnector]);

  async function handleConfirmDeploy() {
    if (!selectedMapInfo || !selectedPlayerId) return;

    const mapId = toNumber(selectedMapInfo.map_id);
    setIsDeploying(true);
    try {
      toast("Submitting deployment...", "info");
      const trimmedName = operationName.trim();
      const nameByteArray = byteArray.byteArrayFromString(trimmedName);
      const tx = await sendTransaction([
        {
          contractAddress: ACTIONS_ADDRESS,
          entrypoint: "create_game",
          calldata: [
            nameByteArray.data.length.toString(),
            ...nameByteArray.data.map((d) => d.toString()),
            nameByteArray.pending_word.toString(),
            nameByteArray.pending_word_len.toString(),
            mapId.toString(),
            selectedPlayerId.toString(),
            "1",
          ],
        },
      ]);

      if (!tx?.transaction_hash) {
        throw new Error("Missing transaction hash");
      }

      const waitResult = await provider.waitForTransaction(
        tx.transaction_hash,
        {
          retryInterval: 500,
        },
      );
      console.log("create_game waitForTransaction result:", waitResult);

      const receipt = await provider.getTransactionReceipt(tx.transaction_hash);

      // Parse GameCreated event from receipt to get game_id
      // Dojo events: keys[0]=EventEmitted selector, keys[1]=event selector, keys[2]=system address
      // data: [keys_len, ...key_fields, values_len, ...value_fields]
      const eventEmittedSelector = hash.getSelectorFromName("EventEmitted");
      const normalizedActionsAddress = num.toHex(ACTIONS_ADDRESS);
      let createdGameId: number | null = null;
      if ("events" in receipt && Array.isArray(receipt.events)) {
        for (const event of receipt.events) {
          if (!event.keys || event.keys.length < 3 || !event.data) continue;
          // Match EventEmitted selector and actions contract address
          if (num.toHex(event.keys[0]) !== num.toHex(eventEmittedSelector)) continue;
          if (num.toHex(event.keys[2]) !== normalizedActionsAddress) continue;
          // GameCreated has 1 key field (game_id) and 2 value fields (map_id, player_count)
          const keysLen = Number(event.data[0]);
          if (keysLen !== 1 || event.data.length < 4) continue;
          const valuesLen = Number(event.data[2]);
          if (valuesLen !== 2) continue;
          createdGameId = Number(event.data[1]);
          break;
        }
      }

      toast("Deployment confirmed.", "success", {
        linkUrl: explorer.transaction(tx.transaction_hash),
        linkLabel: `TX ${shortTxHash(tx.transaction_hash)}`,
      });
      setIsCreateModalOpen(false);

      if (createdGameId !== null) {
        navigate(`/game/${createdGameId}`);
      }
    } catch (error) {
      console.error("Failed to create deployment:", error);
      toast("Failed to deploy operation.", "error");
    } finally {
      setIsDeploying(false);
    }
  }

  async function fetchPlayersForGame(
    gameId: number,
  ): Promise<PlayerStateNode[]> {
    const query = `
      query {
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
      .query<PlayerStateQueryResult>(query, undefined, {
        requestPolicy: "network-only",
      })
      .toPromise();
    if (result.error || !result.data) return [];
    return result.data.hashfrontPlayerStateModels.edges.map(
      (edge) => edge.node,
    );
  }

  async function runJoinTransaction(gameId: number, playerId: number) {
    setIsJoining(true);
    setJoiningGameId(gameId);
    try {
      toast("Joining game...", "info");
      const tx = await sendTransaction([
        {
          contractAddress: ACTIONS_ADDRESS,
          entrypoint: "join_game",
          calldata: [gameId.toString(), playerId.toString()],
        },
      ]);
      if (!tx?.transaction_hash) {
        throw new Error("Missing transaction hash");
      }

      await provider.waitForTransaction(tx.transaction_hash, {
        retryInterval: 500,
      });
      toast("Joined game successfully.", "success", {
        linkUrl: explorer.transaction(tx.transaction_hash),
        linkLabel: `TX ${shortTxHash(tx.transaction_hash)}`,
      });
      setIsJoinModalOpen(false);
      navigate(`/game/${gameId}`);
    } catch (error) {
      console.error("Failed to join game:", error);
      toast("Failed to join game.", "error");
    } finally {
      setIsJoining(false);
      setJoiningGameId(null);
    }
  }

  async function handleJoinGame(game: GameModelNode) {
    if (!address) {
      connect({ connector: controllerConnector });
      return;
    }
    const gameId = toNumber(game.game_id);
    setJoinTargetGameId(gameId);
    setIsJoinModalOpen(true);
  }

  const joinTargetGame = useMemo(
    () =>
      games.find((game) => toNumber(game.game_id) === joinTargetGameId) ?? null,
    [games, joinTargetGameId],
  );

  const joinOccupiedPlayerIds = useMemo(
    () => new Set(joinPlayers.map((p) => toNumber(p.player_id))),
    [joinPlayers],
  );

  const joinAvailablePlayerIds = useMemo(() => {
    if (!joinTargetGame) return [];
    const maxPlayerSlots = toNumber(joinTargetGame.player_count);
    const available: number[] = [];
    for (let playerId = 1; playerId <= maxPlayerSlots; playerId += 1) {
      if (!joinOccupiedPlayerIds.has(playerId)) {
        available.push(playerId);
      }
    }
    return available;
  }, [joinOccupiedPlayerIds, joinTargetGame]);

  useEffect(() => {
    if (!isJoinModalOpen || !joinTargetGameId) return;
    const targetGameId = joinTargetGameId;
    let active = true;

    async function loadJoinPlayers() {
      setJoinPlayersLoading(true);
      try {
        const players = await fetchPlayersForGame(targetGameId);
        if (!active) return;
        setJoinPlayers(players);
      } finally {
        if (active) setJoinPlayersLoading(false);
      }
    }

    void loadJoinPlayers();
    return () => {
      active = false;
    };
  }, [graphqlClient, isJoinModalOpen, joinTargetGameId]);

  useEffect(() => {
    if (!isJoinModalOpen || joinPlayers.length === 0) {
      setJoinPlayerUsernames({});
      return;
    }

    let active = true;

    async function loadJoinUsernames() {
      try {
        const addressMap = await lookupAddresses(
          joinPlayers.map((player) => player.address),
        );

        if (!active) return;

        const normalizedLookup: Record<string, string> = {};
        for (const [addressKey, username] of addressMap.entries()) {
          const normalizedKey = normalizeAddressHex(addressKey);
          if (normalizedKey) {
            normalizedLookup[normalizedKey] = username;
          }
        }

        const byPlayerAddress: Record<string, string> = {};
        for (const player of joinPlayers) {
          const normalized = normalizeAddressHex(player.address);
          if (!normalized) continue;
          const username = normalizedLookup[normalized];
          if (username) {
            byPlayerAddress[player.address] = username;
          }
        }
        setJoinPlayerUsernames(byPlayerAddress);
      } catch (error) {
        console.error("Failed to lookup player usernames:", error);
      }
    }

    void loadJoinUsernames();
    return () => {
      active = false;
    };
  }, [isJoinModalOpen, joinPlayers]);

  useEffect(() => {
    if (!isJoinModalOpen) return;
    setSelectedJoinPlayerId(joinAvailablePlayerIds[0] ?? null);
  }, [isJoinModalOpen, joinAvailablePlayerIds]);

  async function handleConfirmJoin() {
    if (!joinTargetGame || !selectedJoinPlayerId) return;
    const gameId = toNumber(joinTargetGame.game_id);
    await runJoinTransaction(gameId, selectedJoinPlayerId);
  }

  async function loadGamesPage(offset: number, append: boolean) {
    if (append) {
      setGamesLoadingMore(true);
    } else {
      setGamesLoading(true);
    }
    try {
      const query = `
        query {
          hashfrontGameModels(
            limit: 10
            offset: ${offset}
            order: {field: STATE, direction: ASC}
          ) {
            totalCount
            edges {
              node {
                game_id
                name
                map_id
                height
                width
                state
                player_count
                num_players
                current_player
                round
                next_unit_id
                is_test_mode
                winner
              }
            }
          }
        }
      `;

      const result = await graphqlClient
        .query<LobbyGamesQueryResult>(query, undefined, {
          requestPolicy: "network-only",
        })
        .toPromise();
      if (result.error || !result.data) return;

      const connection = result.data.hashfrontGameModels;
      const nextNodes = connection.edges.map((edge) => edge.node);

      setGamesTotalCount(toNumber(connection.totalCount));
      if (append) {
        setGames((prev) => {
          const existingIds = new Set(
            prev.map((game) => toNumber(game.game_id)),
          );
          const deduped = nextNodes.filter(
            (game) => !existingIds.has(toNumber(game.game_id)),
          );
          return [...prev, ...deduped];
        });
      } else {
        setGames(nextNodes);
      }
    } finally {
      setGamesLoading(false);
      setGamesLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadGamesPage(0, false);
  }, [graphqlClient]);

  function handleGamesScroll() {
    const el = gamesListRef.current;
    if (!el) return;
    if (gamesLoading || gamesLoadingMore) return;
    if (games.length >= gamesTotalCount) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= 80) {
      void loadGamesPage(games.length, true);
    }
  }

  useEffect(() => {
    if (!isCreateModalOpen) return;
    let active = true;

    async function loadMaps() {
      setMapsLoading(true);
      try {
        const query = `
          query {
            hashfrontMapInfoModels {
              edges {
                node {
                  map_id
                  player_count
                  height
                  width
                }
              }
            }
          }
        `;
        const result = await graphqlClient
          .query<MapInfoQueryResult>(query, undefined, {
            requestPolicy: "network-only",
          })
          .toPromise();
        if (!active || result.error || !result.data) return;
        const rows = result.data.hashfrontMapInfoModels.edges.map(
          (edge) => edge.node,
        );
        setMapInfos(rows);
        if (rows.length > 0) {
          const firstMapId = toNumber(rows[0].map_id);
          setSelectedMapId((prev) => prev ?? firstMapId);
        }
      } finally {
        if (active) setMapsLoading(false);
      }
    }

    void loadMaps();
    return () => {
      active = false;
    };
  }, [graphqlClient, isCreateModalOpen]);

  const selectedMapInfo = useMemo(
    () =>
      mapInfos.find((mapInfo) => toNumber(mapInfo.map_id) === selectedMapId) ??
      null,
    [mapInfos, selectedMapId],
  );
  const selectedMapPlayerCount = selectedMapInfo
    ? toNumber(selectedMapInfo.player_count)
    : 0;

  useEffect(() => {
    if (selectedMapPlayerCount <= 0) {
      setSelectedPlayerId(null);
      return;
    }
    setSelectedPlayerId((prev) => {
      if (prev === null || prev < 1 || prev > selectedMapPlayerCount) {
        return 1;
      }
      return prev;
    });
  }, [selectedMapPlayerCount]);

  return (
    <BlueprintContainer>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-[3px] border-white pb-3 md:pb-4 lg:pb-5 mb-2 relative overflow-hidden">
        {/* Decorative Background SVG for Header */}
        <div className="absolute right-0 top-0 h-full w-1/2 opacity-10 pointer-events-none">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 400 100"
            preserveAspectRatio="none"
          >
            <path
              d="M0,50 L400,50 M0,20 L400,20 M0,80 L400,80"
              stroke="white"
              strokeWidth="1"
              strokeDasharray="10,5"
            />
            <circle
              cx="350"
              cy="50"
              r="30"
              stroke="white"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M350,20 L350,80 M320,50 L380,50"
              stroke="white"
              strokeWidth="1"
            />
          </svg>
        </div>

        <div className="relative z-10 flex items-center gap-3 lg:gap-4">
          <div className="hidden md:block">
            <svg
              width="48"
              height="48"
              viewBox="0 0 40 40"
              className="flicker-text"
            >
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
              {/* Framing corners */}
              <path
                d="M2 2 H8 M2 2 V8 M32 2 H38 M38 2 V8 M2 38 H8 M2 38 V32 M32 38 H38 M38 38 V32"
                stroke="white"
                strokeWidth="0.5"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-[3px] lg:tracking-[4px] m-0 flex items-center gap-2 flicker-text">
              HASHFRONT{" "}
              <span className="text-xs font-normal border border-white px-1 animate-pulse">
                LIVE
              </span>
            </h1>
            <div className="text-sm mt-1 opacity-80 font-mono">
              &gt; SYSTEM_READY // LATENCY: 24ms // SECTOR: 0x7A
            </div>
          </div>
        </div>
        <div className="text-right mt-4 md:mt-0 flex flex-col items-end relative z-10">
          {address ? (
            <PixelButton
              variant="gray"
              onClick={() => controllerConnector.controller.openProfile()}
              className="!py-1.5 !px-5 lg:!py-2 lg:!px-8 text-base lg:text-lg"
            >
              COMMANDER:{" "}
              {username ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
            </PixelButton>
          ) : (
            <PixelButton
              variant="blue"
              onClick={() => connect({ connector: controllerConnector })}
              className="!py-1.5 !px-6 lg:!py-2 lg:!px-10 text-base lg:text-lg"
            >
              CONNECT_SYSTEM
            </PixelButton>
          )}
        </div>
      </header>

      <div className="grid md:grid-cols-[2.5fr_1fr] gap-4 lg:gap-8 flex-1 min-h-0 overflow-hidden">
        <PixelPanel
          title="DEPLOYMENTS"
          className="flex flex-col gap-0 min-h-0 overflow-hidden"
        >
          <div
            ref={gamesListRef}
            onScroll={handleGamesScroll}
            className="space-y-0 overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0"
          >
            {gamesLoading ? (
              <div className="border-b-2 border-dashed border-white py-5 text-sm opacity-80">
                SYNCING OPERATIONS...
              </div>
            ) : games.length === 0 ? (
              <div className="border-b-2 border-dashed border-white py-5 text-sm opacity-80">
                NO ACTIVE OPERATIONS
              </div>
            ) : (
              games.map((game) => {
                const gameId = toNumber(game.game_id);
                const state = parseGameState(game.state);
                const statusLabel = gameStatusLabel(state);
                const isLobby = state === "Lobby";
                const isPlaying = state === "Playing";
                const isJoiningThisGame = joiningGameId === gameId;
                const actionLabel = isLobby ? "JOIN" : "WATCH_FEED";

                return (
                  <div
                    key={gameId}
                    className="border-b-2 border-dashed border-white py-6 grid grid-cols-[50px_70px_1fr_180px] items-center gap-4 hover:bg-white/10 transition-colors relative"
                  >
                    <div className="text-sm opacity-50 font-mono">
                      #{gameId}
                    </div>
                    <div className="flex items-center">
                      <ECGMonitor
                        playerCount={toNumber(game.num_players)}
                        gameId={gameId}
                      />
                    </div>
                    <div>
                      <div className="text-lg font-bold flex items-center gap-2">
                        {game.name || `OPERATION_${gameId}`}
                        {isPlaying && (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>
                      <div className="text-xs mt-1 uppercase opacity-80 flex flex-col gap-1">
                        <div>
                          STATUS: {statusLabel} // SLOTS:{" "}
                          {toNumber(game.num_players)}/
                          {toNumber(game.player_count)}
                        </div>
                        <div>
                          MAP: {toNumber(game.map_id)} //{" "}
                          {isPlaying
                            ? `ROUND: ${toNumber(game.round)}`
                            : "PREPARING..."}
                        </div>
                      </div>
                    </div>
                    {isLobby ? (
                      <PixelButton
                        className="w-full flex items-center justify-center gap-2"
                        variant="blue"
                        onClick={() => void handleJoinGame(game)}
                        disabled={isJoiningThisGame}
                      >
                        {isJoiningThisGame && (
                          <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        )}
                        {isJoiningThisGame ? "JOINING..." : actionLabel}
                      </PixelButton>
                    ) : (
                      <Link to={`/game/${gameId}`}>
                        <PixelButton className="w-full" variant="blue">
                          {actionLabel}
                        </PixelButton>
                      </Link>
                    )}
                  </div>
                );
              })
            )}
            {gamesLoadingMore && (
              <div className="py-3 text-xs opacity-70 text-center">
                LOADING MORE DEPLOYMENTS...
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t-2 border-white/20">
            <PixelButton
              variant="green"
              onClick={() => {
                if (!address) {
                  connect({ connector: controllerConnector });
                  return;
                }
                setIsCreateModalOpen(true);
              }}
              className="w-full py-4 text-lg flicker-text"
              style={{ animationDelay: "-0.8s" }}
            >
              DEPLOY NEW OPERATION
            </PixelButton>
          </div>
        </PixelPanel>

        <div className="flex flex-col gap-8 overflow-y-auto pr-1">
          <PixelPanel title="System Nav" className="relative">
            <div className="absolute top-2 right-2 opacity-20 hidden lg:block">
              <svg width="60" height="60" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  stroke="white"
                  strokeWidth="1"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="30"
                  stroke="white"
                  strokeWidth="1"
                  fill="none"
                  opacity="0.5"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="15"
                  stroke="white"
                  strokeWidth="1"
                  fill="none"
                  opacity="0.3"
                />
                <line
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="5"
                  stroke="white"
                  strokeWidth="2"
                  className="origin-center animate-[spin_4s_linear_infinite]"
                />
                <circle
                  cx="70"
                  cy="30"
                  r="3"
                  fill="white"
                  className="animate-pulse"
                />
                <circle cx="40" cy="70" r="2" fill="white" opacity="0.5" />
              </svg>
            </div>
            <div className="text-base flex flex-col gap-4 relative z-10">
              <Link
                to="/player/me"
                className="hover:translate-x-2 transition-transform flex items-center gap-2"
              >
                <span>&gt;</span> PROFILE
              </Link>
              <Link
                to="/leaderboard"
                className="hover:translate-x-2 transition-transform flex items-center gap-2"
              >
                <span>&gt;</span> LEADERBOARD
              </Link>
              <Link
                to="/logo-gallery"
                className="hover:translate-x-2 transition-transform flex items-center gap-2 text-green-400"
              >
                <span>&gt;</span> LOGO_LAB{" "}
                <span className="text-[10px] border border-green-400 px-1">
                  NEW
                </span>
              </Link>
              <a
                href="#"
                className="hover:translate-x-2 transition-transform opacity-50 cursor-not-allowed flex items-center gap-2"
                onClick={(e) => {
                  e.preventDefault();
                  toast("Access denied", "error");
                }}
              >
                <span>&gt;</span> MAP_EDITOR{" "}
                <span className="text-[10px] border border-white/30 px-1">
                  LOCKED
                </span>
              </a>
              <a
                href="#"
                className="hover:translate-x-2 transition-transform flex items-center gap-2"
                onClick={(e) => {
                  e.preventDefault();
                  toast("Access denied", "error");
                }}
              >
                <span>&gt;</span> SETTINGS
              </a>
            </div>
          </PixelPanel>

          <PixelPanel title="24HR STATUS">
            <div className="text-base space-y-4">
              <div className="flex justify-between items-end border-b border-white/10 pb-2">
                <div className="flex flex-col">
                  <span className="text-xs opacity-50 uppercase tracking-tighter">
                    IN_PROGRESS
                  </span>
                  <span className="font-bold text-xl">342</span>
                </div>
                <div className="h-8 w-16">
                  <svg
                    viewBox="0 0 100 40"
                    className="h-full w-full stroke-blue-400 flicker-text"
                    style={{ animationDelay: "-1.2s" }}
                  >
                    <path
                      d="M0,35 L20,30 L40,35 L60,15 L80,25 L100,5"
                      fill="none"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex justify-between items-end border-b border-white/10 pb-2">
                <div className="flex flex-col">
                  <span className="text-xs opacity-50 uppercase tracking-tighter">
                    COMPLETED
                  </span>
                  <span className="font-bold text-xl">1420</span>
                </div>
                <div className="h-8 w-16">
                  <svg
                    viewBox="0 0 100 40"
                    className="h-full w-full stroke-green-400 flicker-text"
                    style={{ animationDelay: "-3.7s" }}
                  >
                    <path
                      d="M0,35 L20,25 L40,30 L60,10 L80,15 L100,5"
                      fill="none"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex justify-between items-end border-b border-white/10 pb-2">
                <div className="flex flex-col">
                  <span className="text-xs opacity-50 uppercase tracking-tighter">
                    TRANSACTIONS
                  </span>
                  <span className="font-bold text-xl">12K</span>
                </div>
                <div className="h-8 w-16">
                  <svg
                    viewBox="0 0 100 40"
                    className="h-full w-full stroke-white/50 flicker-text"
                    style={{ animationDelay: "-2.1s" }}
                  >
                    <path
                      d="M0,30 L20,32 L40,28 L60,35 L80,25 L100,20"
                      fill="none"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </PixelPanel>
        </div>
      </div>

      <footer className="flex justify-between border-t-[3px] border-white pt-5 mt-2 text-xs md:text-sm">
        <span>
          <a
            href="https://www.cartridge.gg"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            CARTRIDGE
          </a>{" "}
          //{" "}
          <a
            href="https://www.dojoengine.org"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            DOJO
          </a>{" "}
          //{" "}
          <a
            href="https://www.starknet.io"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            STARKNET
          </a>
        </span>
        <span className="hidden md:inline">VERSION: 0.1.3</span>
      </footer>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-blueprint-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            <PixelPanel className="!p-6">
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="blueprint-title mb-0">
                    [CREATE_DEPLOYMENT]
                  </div>
                  <PixelButton
                    variant="gray"
                    className="!py-1 !px-3"
                    onClick={() => setIsCreateModalOpen(false)}
                    disabled={isDeploying}
                  >
                    CLOSE
                  </PixelButton>
                </div>

                <label className="text-xs uppercase tracking-widest flex flex-col gap-2">
                  OPERATION NAME
                  <input
                    value={operationName}
                    onChange={(e) => setOperationName(e.target.value)}
                    placeholder="e.g. Iron Ridge Offensive"
                    maxLength={30}
                    className="bg-blueprint-dark/80 border border-white/40 px-3 py-2 outline-none tracking-wide"
                    disabled={isDeploying}
                  />
                </label>

                <label className="text-xs uppercase tracking-widest flex flex-col gap-2">
                  MAP ID
                  <select
                    value={selectedMapId ?? ""}
                    onChange={(e) =>
                      setSelectedMapId(
                        e.target.value
                          ? Number.parseInt(e.target.value, 10)
                          : null,
                      )
                    }
                    className="bg-blueprint-dark/80 border border-white/40 px-3 py-2 outline-none"
                    disabled={
                      isDeploying || mapsLoading || mapInfos.length === 0
                    }
                  >
                    {mapsLoading && <option value="">Loading maps...</option>}
                    {!mapsLoading && mapInfos.length === 0 && (
                      <option value="">No maps available</option>
                    )}
                    {mapInfos.map((mapInfo) => {
                      const mapId = toNumber(mapInfo.map_id);
                      return (
                        <option key={mapId} value={mapId}>
                          MAP {mapId}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="text-xs uppercase tracking-widest flex flex-col gap-2">
                  PLAYER SELECT
                  <select
                    value={selectedPlayerId ?? ""}
                    onChange={(e) =>
                      setSelectedPlayerId(
                        e.target.value
                          ? Number.parseInt(e.target.value, 10)
                          : null,
                      )
                    }
                    className="bg-blueprint-dark/80 border border-white/40 px-3 py-2 outline-none"
                    disabled={
                      isDeploying ||
                      !selectedMapInfo ||
                      selectedMapPlayerCount <= 0
                    }
                  >
                    {!selectedMapInfo || selectedMapPlayerCount <= 0 ? (
                      <option value="">No seats available</option>
                    ) : (
                      Array.from(
                        { length: selectedMapPlayerCount },
                        (_, idx) => {
                          const playerId = idx + 1;
                          return (
                            <option key={playerId} value={playerId}>
                              PLAYER {playerId}
                            </option>
                          );
                        },
                      )
                    )}
                  </select>
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-white/30 p-4 min-h-[170px] bg-blueprint-dark/60">
                    <div className="text-xs uppercase tracking-widest opacity-70 mb-2">
                      Map Preview (Placeholder)
                    </div>
                    <div className="w-full h-[120px] border border-dashed border-white/30 flex items-center justify-center text-xs uppercase tracking-widest opacity-60">
                      Preview coming soon
                    </div>
                  </div>
                  <div className="border border-white/30 p-4 bg-blueprint-dark/60">
                    <div className="text-xs uppercase tracking-widest opacity-70 mb-3">
                      Map Details
                    </div>
                    <div className="text-sm space-y-2 uppercase tracking-wide">
                      <div>
                        PLAYER COUNT:{" "}
                        <span className="font-bold">
                          {selectedMapInfo
                            ? toNumber(selectedMapInfo.player_count)
                            : "-"}
                        </span>
                      </div>
                      <div>
                        HEIGHT:{" "}
                        <span className="font-bold">
                          {selectedMapInfo
                            ? toNumber(selectedMapInfo.height)
                            : "-"}
                        </span>
                      </div>
                      <div>
                        WIDTH:{" "}
                        <span className="font-bold">
                          {selectedMapInfo
                            ? toNumber(selectedMapInfo.width)
                            : "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <PixelButton
                    variant="green"
                    onClick={handleConfirmDeploy}
                    disabled={
                      isDeploying || !selectedMapInfo || !selectedPlayerId || !operationName.trim()
                    }
                    className="flex items-center gap-2"
                  >
                    {isDeploying && (
                      <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    )}
                    {isDeploying ? "DEPLOYING..." : "CONFIRM DEPLOY"}
                  </PixelButton>
                </div>
              </div>
            </PixelPanel>
          </div>
        </div>
      )}

      {isJoinModalOpen && joinTargetGame && (
        <div className="fixed inset-0 z-50 bg-blueprint-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            <PixelPanel title="JOIN_DEPLOYMENT" className="!p-6">
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm uppercase tracking-widest opacity-80">
                    Select your seat and join
                  </div>
                  <PixelButton
                    variant="gray"
                    className="!py-1 !px-3"
                    onClick={() => setIsJoinModalOpen(false)}
                    disabled={isJoining}
                  >
                    CLOSE
                  </PixelButton>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-white/30 p-4 bg-blueprint-dark/60">
                    <div className="text-xs uppercase tracking-widest opacity-70 mb-3">
                      Deployment Details
                    </div>
                    <div className="text-sm space-y-2 uppercase tracking-wide">
                      <div>
                        NAME:{" "}
                        <span className="font-bold">
                          {joinTargetGame.name || `OPERATION_${toNumber(joinTargetGame.game_id)}`}
                        </span>
                      </div>
                      <div>
                        MAP ID:{" "}
                        <span className="font-bold">
                          {toNumber(joinTargetGame.map_id)}
                        </span>
                      </div>
                      <div>
                        STATUS:{" "}
                        <span className="font-bold">
                          {gameStatusLabel(
                            parseGameState(joinTargetGame.state),
                          )}
                        </span>
                      </div>
                      <div>
                        SIZE:{" "}
                        <span className="font-bold">
                          {toNumber(joinTargetGame.width)} x{" "}
                          {toNumber(joinTargetGame.height)}
                        </span>
                      </div>
                      <div>
                        SLOTS:{" "}
                        <span className="font-bold">
                          {toNumber(joinTargetGame.num_players)}/
                          {toNumber(joinTargetGame.player_count)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-white/30 p-4 bg-blueprint-dark/60">
                    <div className="text-xs uppercase tracking-widest opacity-70 mb-3">
                      Current Players
                    </div>
                    <div className="text-sm space-y-2 uppercase tracking-wide">
                      {joinPlayersLoading ? (
                        <div className="opacity-70">Loading players...</div>
                      ) : joinPlayers.length === 0 ? (
                        <div className="opacity-70">No players joined yet</div>
                      ) : (
                        joinPlayers.map((player) => {
                          const pid = toNumber(player.player_id);
                          const displayName =
                            joinPlayerUsernames[player.address] ??
                            `${player.address.slice(0, 6)}...${player.address.slice(-4)}`;
                          return (
                            <div key={`${pid}-${player.address}`}>
                              P{pid}: {displayName}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <label className="text-xs uppercase tracking-widest flex flex-col gap-2">
                  PLAYER SELECT
                  <select
                    value={selectedJoinPlayerId ?? ""}
                    onChange={(e) =>
                      setSelectedJoinPlayerId(
                        e.target.value
                          ? Number.parseInt(e.target.value, 10)
                          : null,
                      )
                    }
                    className="bg-blueprint-dark/80 border border-white/40 px-3 py-2 outline-none"
                    disabled={isJoining || joinPlayersLoading}
                  >
                    {joinAvailablePlayerIds.length === 0 ? (
                      <option value="">No available seats</option>
                    ) : (
                      joinAvailablePlayerIds.map((playerId) => (
                        <option key={playerId} value={playerId}>
                          PLAYER {playerId}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <div className="flex justify-end">
                  <PixelButton
                    variant="blue"
                    onClick={() => void handleConfirmJoin()}
                    disabled={
                      isJoining ||
                      joinPlayersLoading ||
                      joinAvailablePlayerIds.length === 0
                    }
                    className="flex items-center gap-2"
                  >
                    {isJoining && (
                      <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    )}
                    {isJoining ? "JOINING..." : "CONFIRM JOIN"}
                  </PixelButton>
                </div>
              </div>
            </PixelPanel>
          </div>
        </div>
      )}
    </BlueprintContainer>
  );
}
