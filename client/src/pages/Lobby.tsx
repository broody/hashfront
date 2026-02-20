import { Link, useNavigate } from "react-router-dom";
import {
  useAccount,
  useConnect,
  useProvider,
  useSendTransaction,
} from "@starknet-react/core";
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

export default function Lobby() {
  const { connect, connectors } = useConnect();
  const { address } = useAccount();
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
      const tx = await sendTransaction([
        {
          contractAddress: ACTIONS_ADDRESS,
          entrypoint: "create_game",
          calldata: [mapId.toString(), selectedPlayerId.toString(), "1"],
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
      console.log("create_game receipt:", receipt);

      toast("Deployment confirmed.", "success");
      setIsCreateModalOpen(false);
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
      toast("Joined game successfully.", "success");
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
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-[3px] border-white pb-5 mb-2">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-[2px] m-0">
            HASHFRONT
          </h1>
          <div className="text-sm mt-1 opacity-80">
            &gt; FULLY_ONCHAIN_STRATEGY
          </div>
        </div>
        <div className="text-right mt-4 md:mt-0 flex flex-col items-end">
          {address ? (
            <PixelButton
              variant="gray"
              onClick={() => controllerConnector.controller.openProfile()}
              className="!py-3 !px-8 text-lg"
            >
              COMMANDER:{" "}
              {username ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
            </PixelButton>
          ) : (
            <PixelButton
              variant="blue"
              onClick={() => connect({ connector: controllerConnector })}
              className="!py-3 !px-10 text-lg"
            >
              CONNECT_SYSTEM
            </PixelButton>
          )}
        </div>
      </header>

      <div className="grid md:grid-cols-[2.5fr_1fr] gap-8 flex-1 min-h-0 overflow-hidden">
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
                    className="border-b-2 border-dashed border-white py-5 grid grid-cols-[120px_1fr_180px] items-center gap-4 hover:bg-white/10 transition-colors"
                  >
                    <div className="text-sm opacity-70">ID: {gameId}</div>
                    <div>
                      <div className="text-lg font-bold">
                        OPERATION_{gameId}
                      </div>
                      <div className="text-xs mt-1">
                        STATUS: {statusLabel} | SLOTS:{" "}
                        {toNumber(game.num_players)}/
                        {toNumber(game.player_count)}
                        {isPlaying ? ` | ROUND: ${toNumber(game.round)}` : ""}
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
              className="w-full py-4 text-lg"
            >
              DEPLOY NEW OPERATION
            </PixelButton>
          </div>
        </PixelPanel>

        <div className="flex flex-col gap-8 overflow-y-auto">
          <PixelPanel title="System Nav">
            <div className="text-base flex flex-col gap-4">
              <Link
                to="/player/me"
                className="hover:translate-x-2 transition-transform"
              >
                &gt; PROFILE
              </Link>
              <Link
                to="/leaderboard"
                className="hover:translate-x-2 transition-transform"
              >
                &gt; LEADERBOARD
              </Link>
              <a
                href="#"
                className="hover:translate-x-2 transition-transform"
                onClick={(e) => {
                  e.preventDefault();
                  toast("Access denied", "error");
                }}
              >
                &gt; MAP_EDITOR
              </a>
              <a
                href="#"
                className="hover:translate-x-2 transition-transform"
                onClick={(e) => {
                  e.preventDefault();
                  toast("Access denied", "error");
                }}
              >
                &gt; SETTINGS
              </a>
            </div>
          </PixelPanel>

          <PixelPanel title="24HR STATUS">
            <div className="text-base space-y-3">
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="opacity-70">IN_PROGRESS:</span>
                <span className="font-bold">342</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="opacity-70">COMPLETED:</span>
                <span className="font-bold">1420</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span className="opacity-70">TRANSACTIONS:</span>
                <span className="font-bold">12K</span>
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
                  OPERATION NAME (PLACEHOLDER)
                  <input
                    value={operationName}
                    onChange={(e) => setOperationName(e.target.value)}
                    placeholder="e.g. Iron Ridge Offensive"
                    className="bg-blueprint-dark/80 border border-white/40 px-3 py-2 outline-none uppercase tracking-wide"
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
                      isDeploying || !selectedMapInfo || !selectedPlayerId
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
                          OPERATION_{toNumber(joinTargetGame.game_id)}
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
