import { useEffect, useRef, useState } from "react";
import { useClient } from "urql";
import { addUnit, clearUnits, setTileMap } from "../data/gameStore";
import type { TeamId } from "../data/gameStore";
import { GRID_SIZE, TileType } from "../game/types";

interface GraphEdge<T> {
  node: T;
}

interface GameModelNode {
  height: string | number;
  width: string | number;
  current_player: string | number;
  winner?: string | number | null;
}

interface TileModelNode {
  tile_type: string | number;
  x: string | number;
  y: string | number;
}

interface BuildingModelNode {
  building_type: string | number;
  x: string | number;
  y: string | number;
}

interface UnitModelNode {
  player_id: string | number;
  unit_id: string | number;
  unit_type: string | number;
  x: string | number;
  y: string | number;
  is_alive: boolean;
}

interface PlayerStateModelNode {
  player_id: string | number;
  address: string;
  gold: string | number;
  unit_count: string | number;
  factory_count: string | number;
  city_count: string | number;
  is_alive: boolean;
}

interface GameStateQueryResult {
  chainTacticsGameModels: { edges: GraphEdge<GameModelNode>[] };
  chainTacticsBuildingModels: { edges: GraphEdge<BuildingModelNode>[] };
  chainTacticsUnitModels: { edges: GraphEdge<UnitModelNode>[] };
  chainTacticsPlayerStateModels: { edges: GraphEdge<PlayerStateModelNode>[] };
}

interface TilePageQueryResult {
  chainTacticsTileModels: {
    totalCount: string | number;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    edges: GraphEdge<TileModelNode>[];
  };
}

const GAME_STATE_ERROR_MESSAGE = "Failed to laod game state";
const TILE_PAGE_SIZE = 200;

export interface GamePlayerState {
  playerId: number;
  address: string;
  gold: number;
  unitCount: number;
  factoryCount: number;
  cityCount: number;
  isAlive: boolean;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function parseTileType(value: string | number): number {
  if (typeof value === "number") return value;

  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric;

  const enumMap: Record<string, number> = {
    None: TileType.Grass,
    Grass: TileType.Grass,
    Mountain: TileType.Mountain,
    City: TileType.City,
    Factory: TileType.Factory,
    HQ: TileType.HQ,
    Road: TileType.Road,
    Tree: TileType.Tree,
    DirtRoad: TileType.DirtRoad,
    Dirt_Road: TileType.DirtRoad,
  };

  return enumMap[value] ?? TileType.Grass;
}

function parseBuildingType(value: string | number): number {
  if (typeof value === "number") return value;

  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric;

  const enumMap: Record<string, number> = {
    None: 0,
    City: 1,
    Factory: 2,
    HQ: 3,
  };

  return enumMap[value] ?? 0;
}

function parseUnitType(value: string | number): number {
  if (typeof value === "number") return value;

  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric;

  const enumMap: Record<string, number> = {
    None: 0,
    Infantry: 1,
    Tank: 2,
    Ranger: 3,
  };

  return enumMap[value] ?? 0;
}

function buildGameStateQuery(gameId: number): string {
  return `
    query {
      chainTacticsGameModels(where: {game_idEQ: ${gameId}}) {
        edges {
          node {
            height
            width
            winner
            state
            player_count
            current_player
            num_players
            round
            next_unit_id
            is_test_mode
          }
        }
      }
      chainTacticsBuildingModels(where: {game_idEQ: ${gameId}}) {
        edges {
          node {
            player_id
            building_type
            x
            y
            capture_player
            capture_progress
            queued_unit
          }
        }
      }
      chainTacticsUnitModels(where: {game_idEQ: ${gameId}}) {
        edges {
          node {
            player_id
            unit_id
            unit_type
            hp
            x
            y
            has_moved
            has_acted
            is_alive
          }
        }
      }
      chainTacticsPlayerStateModels(where: {game_idEQ: ${gameId}}) {
        edges {
          node {
            player_id
            address
            gold
            unit_count
            factory_count
            city_count
            is_alive
          }
        }
      }
    }
  `;
}

function buildTilePageQuery(
  gameId: number,
  afterCursor: string | null,
): string {
  const afterArg =
    afterCursor !== null ? `, after: ${JSON.stringify(afterCursor)}` : "";
  return `
    query {
      chainTacticsTileModels(
        where: {game_idEQ: ${gameId}}
        first: ${TILE_PAGE_SIZE}${afterArg}
      ) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            tile_type
            x
            y
          }
        }
      }
    }
  `;
}

export function useGameState(id: string | undefined): {
  loading: boolean;
  error: string | null;
  currentPlayerId: number | null;
  playerStates: GamePlayerState[];
} {
  const graphqlClient = useClient();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<number | null>(null);
  const [playerStates, setPlayerStates] = useState<GamePlayerState[]>([]);
  const loadedIdRef = useRef<string | null>(null);
  const gameIdNum = Number.parseInt(id || "", 10);
  const isValidGameId = Number.isInteger(gameIdNum);

  useEffect(() => {
    let active = true;

    async function loadGameState() {
      if (!isValidGameId) {
        console.error("Invalid game ID");
        setLoadError(GAME_STATE_ERROR_MESSAGE);
        setCurrentPlayerId(null);
        setPlayerStates([]);
        setLoading(false);
        return;
      }

      if (loadedIdRef.current === id) {
        setLoadError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const gameStateResult = await graphqlClient
          .query<GameStateQueryResult>(
            buildGameStateQuery(gameIdNum),
            undefined,
            {
              requestPolicy: "network-only",
            },
          )
          .toPromise();

        if (!active) return;

        if (gameStateResult.error || !gameStateResult.data) {
          console.error(
            "Failed to load game state via GraphQL:",
            gameStateResult.error,
          );
          setLoadError(GAME_STATE_ERROR_MESSAGE);
          setCurrentPlayerId(null);
          setPlayerStates([]);
          setLoading(false);
          return;
        }

        const gameStateData = gameStateResult.data;
        if (gameStateData.chainTacticsGameModels.edges.length === 0) {
          setLoadError(GAME_STATE_ERROR_MESSAGE);
          setCurrentPlayerId(null);
          setPlayerStates([]);
          setLoading(false);
          return;
        }

        const allTileEdges: GraphEdge<TileModelNode>[] = [];
        let afterCursor: string | null = null;
        let hasNextPage = true;
        let pageCount = 0;

        while (hasNextPage) {
          pageCount += 1;
          if (pageCount > 1000) {
            throw new Error("Tile pagination exceeded safe page limit.");
          }

          const tilePageResult = (await graphqlClient
            .query<TilePageQueryResult>(
              buildTilePageQuery(gameIdNum, afterCursor),
              undefined,
              { requestPolicy: "network-only" },
            )
            .toPromise()) as {
            data?: TilePageQueryResult;
            error?: unknown;
          };

          if (!active) return;

          if (tilePageResult.error || !tilePageResult.data) {
            throw new Error("Failed to fetch tile page.");
          }

          const tileConnection: TilePageQueryResult["chainTacticsTileModels"] =
            tilePageResult.data.chainTacticsTileModels;
          allTileEdges.push(...tileConnection.edges);

          const totalCount = toNumber(tileConnection.totalCount);
          if (allTileEdges.length >= totalCount) {
            hasNextPage = false;
            break;
          }

          hasNextPage = tileConnection.pageInfo.hasNextPage;
          afterCursor = tileConnection.pageInfo.endCursor;
          if (hasNextPage && !afterCursor) {
            throw new Error("Missing cursor for next tile page.");
          }
        }

        const gameNode = gameStateData.chainTacticsGameModels.edges[0]?.node;
        const nextCurrentPlayer = toNumber(gameNode?.current_player);
        setCurrentPlayerId(nextCurrentPlayer > 0 ? nextCurrentPlayer : null);

        const nextPlayerStates =
          gameStateData.chainTacticsPlayerStateModels.edges.map(
            (edge): GamePlayerState => ({
              playerId: toNumber(edge.node.player_id),
              address: edge.node.address,
              gold: toNumber(edge.node.gold),
              unitCount: toNumber(edge.node.unit_count),
              factoryCount: toNumber(edge.node.factory_count),
              cityCount: toNumber(edge.node.city_count),
              isAlive: edge.node.is_alive,
            }),
          );
        setPlayerStates(nextPlayerStates);

        const gameWidth = toNumber(gameNode?.width);
        const gameHeight = toNumber(gameNode?.height);
        if (gameWidth !== GRID_SIZE || gameHeight !== GRID_SIZE) {
          console.warn(
            `Map dimensions (${gameWidth}x${gameHeight}) do not match GRID_SIZE (${GRID_SIZE}). Render may be glitchy.`,
          );
        }

        const terrainLookup: Record<number, number> = {
          0: TileType.Grass,
          1: TileType.Mountain,
          2: TileType.City,
          3: TileType.Factory,
          4: TileType.HQ,
          5: TileType.Road,
          6: TileType.Tree,
          7: TileType.DirtRoad,
        };
        const newTileMap = new Uint8Array(GRID_SIZE * GRID_SIZE);

        for (const edge of allTileEdges) {
          const tile = edge.node;
          const x = toNumber(tile.x);
          const y = toNumber(tile.y);
          const tileType = parseTileType(tile.tile_type);
          const idx = y * GRID_SIZE + x;
          if (idx >= 0 && idx < newTileMap.length) {
            newTileMap[idx] = terrainLookup[tileType] ?? TileType.Grass;
          }
        }

        for (const edge of gameStateData.chainTacticsBuildingModels.edges) {
          const building = edge.node;
          const x = toNumber(building.x);
          const y = toNumber(building.y);
          const buildingType = parseBuildingType(building.building_type);
          const idx = y * GRID_SIZE + x;
          if (idx < 0 || idx >= newTileMap.length) continue;
          if (buildingType === 1) newTileMap[idx] = TileType.City;
          else if (buildingType === 2) newTileMap[idx] = TileType.Factory;
          else if (buildingType === 3) newTileMap[idx] = TileType.HQ;
        }
        setTileMap(newTileMap);

        clearUnits();
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

        for (const edge of gameStateData.chainTacticsUnitModels.edges) {
          const unit = edge.node;
          if (!unit.is_alive) continue;
          const teamId = teams[toNumber(unit.player_id)] || "blue";
          const typeName = unitTypes[parseUnitType(unit.unit_type)] || "rifle";
          const x = toNumber(unit.x);
          const y = toNumber(unit.y);
          const onchainUnitId = toNumber(unit.unit_id);
          const addedUnit = addUnit(typeName, teamId, x, y, onchainUnitId);
          if (teamId === "red") {
            addedUnit.facing = "left";
          }
        }

        loadedIdRef.current = id || null;
        setLoadError(null);
        setLoading(false);
      } catch (e) {
        if (!active) return;
        console.error("Failed to load paginated game state:", e);
        setLoadError(GAME_STATE_ERROR_MESSAGE);
        setCurrentPlayerId(null);
        setPlayerStates([]);
        setLoading(false);
      }
    }

    loadGameState();
    return () => {
      active = false;
    };
  }, [gameIdNum, graphqlClient, id, isValidGameId]);

  return { loading, error: loadError, currentPlayerId, playerStates };
}
