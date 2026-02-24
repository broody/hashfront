import { useEffect, useRef, useState } from "react";
import {
  KeysClause,
  ToriiQueryBuilder,
  type StandardizedQueryResult,
} from "@dojoengine/sdk";
import { useDojo } from "../dojo/DojoProvider";
import type { Schema } from "../dojo/schema";
import {
  useGameStore,
  TEAMS,
  UNIT_TYPES,
  type GamePlayerState,
} from "../data/gameStore";
import { GRID_SIZE, TileType } from "../game/types";

const TILE_TYPE_MAP: Record<string, number> = {
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

const BUILDING_TYPE_MAP: Record<string, number> = {
  City: 1,
  Factory: 2,
  HQ: 3,
};

function parseTileType(value: string | number): number {
  if (typeof value === "number") return value;
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric;
  return TILE_TYPE_MAP[value] ?? TileType.Grass;
}

function parseBuildingType(value: string | number): number {
  if (typeof value === "number") return value;
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric;
  return BUILDING_TYPE_MAP[value] ?? 0;
}

function toBigInt(value: any): bigint {
  try {
    if (value === null || value === undefined) return 0n;
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/** Process subscription entity updates into the game store */
function processEntityUpdates(
  entities: StandardizedQueryResult<Schema>,
  currentGameId: number,
) {
  const store = useGameStore.getState();
  const currentIdBI = BigInt(currentGameId);

  for (const entity of entities) {
    const models = entity.models?.hashfront;
    if (!models) continue;

    if (models.Game) {
      const g = models.Game;
      if (toBigInt(g.game_id) !== currentIdBI) {
        console.warn(
          `[Torii] MODEL CROSS-TALK (Game): Model game_id ${g.game_id} mismatch.`,
          g,
        );
        continue;
      }

      store.setGame({
        gameId: currentGameId,
        currentPlayer: toNumber(g.current_player),
        round: toNumber(g.round),
        winner: toNumber(g.winner),
        state: String(g.state ?? ""),
        name: String(g.name ?? ""),
        mapId: toNumber(g.map_id),
        width: toNumber(g.width),
        height: toNumber(g.height),
        playerCount: toNumber(g.player_count),
        isTestMode: Boolean(g.is_test_mode),
      });
    }

    if (models.Unit) {
      const u = models.Unit;
      if (toBigInt(u.game_id) !== currentIdBI) {
        console.warn(
          `[Torii] MODEL CROSS-TALK (Unit): Model game_id ${u.game_id} mismatch.`,
          u,
        );
        continue;
      }

      const unitId = toNumber(u.unit_id);
      const playerId = toNumber(u.player_id);
      const isAlive = Boolean(u.is_alive);
      const existing = store.units.find((unit) => unit.onchainId === unitId);

      if (!isAlive && existing) {
        store.removeUnit(unitId);
      } else if (existing) {
        store.updateUnit(unitId, {
          x: toNumber(u.x),
          y: toNumber(u.y),
          hp: toNumber(u.hp),
          type: UNIT_TYPES[String(u.unit_type)] || existing.type,
          team: TEAMS[playerId] || existing.team,
          lastMovedRound: toNumber(u.last_moved_round),
          lastActedRound: toNumber(u.last_acted_round),
        });
      } else if (isAlive && unitId > 0) {
        const teamId = TEAMS[playerId] || "blue";
        const typeName = UNIT_TYPES[String(u.unit_type)] || "rifle";
        store.addUnit(
          typeName,
          teamId,
          toNumber(u.x),
          toNumber(u.y),
          unitId,
          toNumber(u.hp),
          toNumber(u.last_moved_round),
          toNumber(u.last_acted_round),
        );
      }
    }

    if (models.PlayerState) {
      const p = models.PlayerState;
      if (toBigInt(p.game_id) !== currentIdBI) {
        console.warn(
          `[Torii] MODEL CROSS-TALK (PlayerState): Model game_id ${p.game_id} mismatch.`,
          p,
        );
        continue;
      }

      const playerId = toNumber(p.player_id);
      const newPlayer: GamePlayerState = {
        playerId,
        address: String(p.address ?? ""),
        gold: toNumber(p.gold),
        unitCount: toNumber(p.unit_count),
        factoryCount: toNumber(p.factory_count),
        cityCount: toNumber(p.city_count),
        isAlive: Boolean(p.is_alive),
      };

      const current = useGameStore.getState().players;
      const idx = current.findIndex((pl) => pl.playerId === playerId);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = newPlayer;
        store.setPlayers(updated);
      } else {
        store.setPlayers([...current, newPlayer]);
      }
    }
  }
}

/** Build the tile map from initial entity data */
function buildTileMap(
  tiles: StandardizedQueryResult<Schema>,
  buildings: StandardizedQueryResult<Schema>,
): Uint8Array {
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

  const tileMap = new Uint8Array(GRID_SIZE * GRID_SIZE);

  for (const entity of tiles) {
    const tile = entity.models?.hashfront?.MapTile;
    if (!tile) continue;
    const x = toNumber(tile.x);
    const y = toNumber(tile.y);
    const tileType = parseTileType(tile.tile_type as string | number);
    const idx = y * GRID_SIZE + x;
    if (idx >= 0 && idx < tileMap.length) {
      tileMap[idx] = terrainLookup[tileType] ?? TileType.Grass;
    }
  }

  for (const entity of buildings) {
    const building = entity.models?.hashfront?.Building;
    if (!building) continue;
    const x = toNumber(building.x);
    const y = toNumber(building.y);
    const buildingType = parseBuildingType(
      building.building_type as string | number,
    );
    const idx = y * GRID_SIZE + x;
    if (idx < 0 || idx >= tileMap.length) continue;
    if (buildingType === 1) tileMap[idx] = TileType.City;
    else if (buildingType === 2) tileMap[idx] = TileType.Factory;
    else if (buildingType === 3) tileMap[idx] = TileType.HQ;
  }

  return tileMap;
}

export function useGameState(id: string | undefined): {
  loading: boolean;
  error: string | null;
} {
  const sdk = useDojo();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const subscriptionRef = useRef<{ free(): void } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedIdRef = useRef<string | null>(null);

  const gameIdNum = Number.parseInt(id || "", 10);
  const isValidGameId = Number.isInteger(gameIdNum);

  useEffect(() => {
    if (!sdk) return;

    let active = true;

    async function load() {
      if (!isValidGameId) {
        setLoadError("Invalid game ID");
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
        const store = useGameStore.getState();
        store.clearUnits();
        store.setGame(null);
        store.setPlayers([]);

        const gameIdHex = `0x${gameIdNum.toString(16)}`;
        console.log(`[Torii] Subscribing to Sector ${id} (hex: ${gameIdHex})`);

        // Subscription 1: Targets models with only game_id as key.
        const [initialData1, sub1] = await sdk!.subscribeEntityQuery({
          query: new ToriiQueryBuilder<Schema>()
            .withClause(
              KeysClause<Schema>(
                ["hashfront-Game", "hashfront-PlayerState"],
                [gameIdHex],
                "VariableLen",
              ).build(),
            )
            .withLimit(1000)
            .includeHashedKeys(),
          callback: (response) => {
            if (!active) {
              sub1.free();
              return;
            }
            if (response.data) processEntityUpdates(response.data, gameIdNum);
          },
          fetchInitialData: true,
        });

        // Subscription 2: Targets models with compound keys starting with game_id.
        const [initialData2, sub2] = await sdk!.subscribeEntityQuery({
          query: new ToriiQueryBuilder<Schema>()
            .withClause(
              KeysClause<Schema>(
                ["hashfront-Unit", "hashfront-Building"],
                [gameIdHex],
                "VariableLen",
              ).build(),
            )
            .withLimit(1000)
            .includeHashedKeys(),
          callback: (response) => {
            if (!active) {
              sub2.free();
              return;
            }
            if (response.data) processEntityUpdates(response.data, gameIdNum);
          },
          fetchInitialData: true,
        });

        if (!active) {
          sub1.free();
          sub2.free();
          return;
        }

        subscriptionRef.current = {
          free: () => {
            console.log(`[Torii] Terminating subscriptions for Sector ${id}`);
            sub1.free();
            sub2.free();
          },
        };

        // Audit initial data sync
        const totalInitial =
          initialData1.getItems().length + initialData2.getItems().length;
        console.log(
          `[Torii] Subscribed. Initial sync: ${totalInitial} entities.`,
        );

        processEntityUpdates(initialData1.getItems(), gameIdNum);
        processEntityUpdates(initialData2.getItems(), gameIdNum);

        // Get map_id from the game state we just set
        const gameInfo = useGameStore.getState().game;
        const mapId = gameInfo?.mapId ?? 0;

        if (mapId > 0) {
          // Fetch all tiles for this map (one-time, not subscribed)
          const tileResult = await sdk!.getEntities({
            query: new ToriiQueryBuilder<Schema>()
              .withClause(
                KeysClause<Schema>(
                  ["hashfront-MapTile"],
                  [`0x${mapId.toString(16)}`],
                  "VariableLen",
                ).build(),
              )
              .withLimit(10000)
              .includeHashedKeys(),
          });

          if (!active) return;

          // Also get building entities for tile overlay (already in initial data)
          const buildingEntities = [
            ...initialData1.getItems(),
            ...initialData2.getItems(),
          ].filter((e) => e.models?.hashfront?.Building);

          const tileMap = buildTileMap(tileResult.getItems(), buildingEntities);

          const gameWidth = gameInfo?.width ?? 0;
          const gameHeight = gameInfo?.height ?? 0;
          if (gameWidth !== GRID_SIZE || gameHeight !== GRID_SIZE) {
            console.warn(
              `Map dimensions (${gameWidth}x${gameHeight}) do not match GRID_SIZE (${GRID_SIZE}). Render may be glitchy.`,
            );
          }

          store.setTileMap(tileMap);
        }

        if (!active) return;

        // Polling fallback: periodically fetch entities in case subscription drops
        const POLL_INTERVAL = 3000;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          if (!active) return;
          try {
            const [r1, r2] = await Promise.all([
              sdk!.getEntities({
                query: new ToriiQueryBuilder<Schema>()
                  .withClause(
                    KeysClause<Schema>(
                      ["hashfront-Game", "hashfront-PlayerState"],
                      [gameIdHex],
                      "VariableLen",
                    ).build(),
                  )
                  .withLimit(1000)
                  .includeHashedKeys(),
              }),
              sdk!.getEntities({
                query: new ToriiQueryBuilder<Schema>()
                  .withClause(
                    KeysClause<Schema>(
                      ["hashfront-Unit", "hashfront-Building"],
                      [gameIdHex],
                      "VariableLen",
                    ).build(),
                  )
                  .withLimit(1000)
                  .includeHashedKeys(),
              }),
            ]);
            if (!active) return;
            processEntityUpdates(r1.getItems(), gameIdNum);
            processEntityUpdates(r2.getItems(), gameIdNum);
          } catch (e) {
            console.warn("[Torii] Poll failed:", e);
          }
        }, POLL_INTERVAL);

        loadedIdRef.current = id || null;
        setLoadError(null);
        setLoading(false);
      } catch (e) {
        if (!active) return;
        console.error("Failed to load game state:", e);
        setLoadError("Failed to load game state");
        setLoading(false);
      }
    }

    load();

    return () => {
      console.log(`[Torii] Cleaning up state for Sector ${id}`);
      active = false;
      subscriptionRef.current?.free();
      subscriptionRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [sdk, gameIdNum, id, isValidGameId]);

  return { loading, error: loadError };
}
