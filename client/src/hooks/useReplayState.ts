import { useEffect, useState } from "react";
import { fetchToriiSql } from "../utils/toriiSql";
import {
  useGameStore,
  TEAMS,
  UNIT_TYPES,
  UNIT_MAX_HP,
  DEFAULT_UNIT_HP,
  type Unit,
  type GameInfo,
  type GamePlayerState,
} from "../data/gameStore";
import { TileType, BorderType } from "../game/types";

// --- SQL row types ---

interface GameRow {
  game_id: number;
  name: string;
  map_id: number;
  width: number;
  height: number;
  state: string;
  player_count: number;
  num_players: number;
  current_player: number;
  round: number;
  winner: number;
  is_test_mode: boolean;
}

interface PlayerRow {
  player_id: number;
  address: string;
  gold: number;
  unit_count: number;
  factory_count: number;
  city_count: number;
  is_alive: boolean;
}

interface MapTileRow {
  map_id: number;
  x: number;
  y: number;
  tile_type: string | number;
  border_type: string | number;
}

interface BuildingRow {
  game_id: number;
  x: number;
  y: number;
  building_type: string | number;
}

interface MapUnitRow {
  map_id: number;
  seq: number;
  player_id: number;
  unit_type: string;
  x: number;
  y: number;
}

interface UnitRow {
  unit_id: number;
  player_id: number;
}

interface HistoricalEventRow {
  event_id: string;
  executed_at: string;
  model_name: string;
  data: string; // JSON
}

// --- Snapshot type ---

export interface TurnSnapshot {
  round: number;
  currentPlayer: number;
  units: Unit[];
}

// --- Tile map builder ---

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
  Ocean: TileType.Ocean,
};

const BORDER_TYPE_MAP: Record<string, number> = {
  None: BorderType.None,
  Bluff: BorderType.Bluff,
  Cliff: BorderType.Cliff,
  Beach: BorderType.Beach,
};

function parseBorderType(value: string | number): number {
  if (typeof value === "number") return value;
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric;
  return BORDER_TYPE_MAP[value] ?? BorderType.None;
}

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

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function buildTileMapFromSql(
  tiles: MapTileRow[],
  buildings: BuildingRow[],
  gridWidth: number,
  gridHeight: number,
): { tileMap: Uint8Array; borderMap: Uint8Array } {
  const terrainLookup: Record<number, number> = {
    0: TileType.Grass,
    1: TileType.Mountain,
    2: TileType.City,
    3: TileType.Factory,
    4: TileType.HQ,
    5: TileType.Road,
    6: TileType.Tree,
    7: TileType.DirtRoad,
    8: TileType.Ocean,
  };

  const size = gridWidth * gridHeight;
  const tileMap = new Uint8Array(size);
  const borderMap = new Uint8Array(size);

  for (const tile of tiles) {
    const x = toNumber(tile.x);
    const y = toNumber(tile.y);
    const tileType = parseTileType(tile.tile_type);
    const idx = y * gridWidth + x;
    if (idx >= 0 && idx < size) {
      tileMap[idx] = terrainLookup[tileType] ?? TileType.Grass;
      borderMap[idx] = parseBorderType(tile.border_type);
    }
  }

  for (const building of buildings) {
    const x = toNumber(building.x);
    const y = toNumber(building.y);
    const buildingType = parseBuildingType(building.building_type);
    const idx = y * gridWidth + x;
    if (idx < 0 || idx >= size) continue;
    if (buildingType === 1) tileMap[idx] = TileType.City;
    else if (buildingType === 2) tileMap[idx] = TileType.Factory;
    else if (buildingType === 3) tileMap[idx] = TileType.HQ;
  }

  return { tileMap, borderMap };
}

// --- Event union for chronological processing ---

type GameEvent =
  | { type: "UnitMoved"; eventId: string; unitId: number; x: number; y: number }
  | {
      type: "UnitAttacked";
      eventId: string;
      attackerId: number;
      targetId: number;
      damageToDefender: number;
      damageToAttacker: number;
    }
  | { type: "UnitDied"; eventId: string; unitId: number }
  | {
      type: "UnitBuilt";
      eventId: string;
      unitType: string;
      x: number;
      y: number;
    }
  | { type: "TurnEnded"; eventId: string; nextPlayer: number; round: number }
  | { type: "GameOver"; eventId: string; winner: number };

function parseUnitType(value: string | number): string {
  if (typeof value === "string" && UNIT_TYPES[value]) return UNIT_TYPES[value];
  return "rifle";
}

// --- Build snapshots from events ---

function buildSnapshots(
  mapUnits: MapUnitRow[],
  unitRows: UnitRow[],
  events: GameEvent[],
  firstPlayer: number,
): TurnSnapshot[] {
  // Match MapUnit rows with on-chain Unit rows to get correct onchainIds.
  // The contract spawns units per-player in MapUnit seq order, assigning
  // incrementing unit_ids. Join order determines which player gets lower IDs,
  // but we don't need to know it — the Unit table has the definitive mapping.
  //
  // For each player: MapUnits sorted by seq pair 1:1 with Unit rows sorted
  // by unit_id, since spawn_player_units iterates in seq order.
  let nextLocalId = 1;
  const units: Unit[] = [];

  // Group on-chain Unit rows by player_id, sorted by unit_id
  const onchainByPlayer = new Map<number, number[]>();
  for (const row of unitRows) {
    const pid = toNumber(row.player_id);
    if (!onchainByPlayer.has(pid)) onchainByPlayer.set(pid, []);
    onchainByPlayer.get(pid)!.push(toNumber(row.unit_id));
  }

  // Group MapUnits by player_id, maintaining seq order
  const mapByPlayer = new Map<number, MapUnitRow[]>();
  for (const mu of mapUnits) {
    const pid = toNumber(mu.player_id);
    if (!mapByPlayer.has(pid)) mapByPlayer.set(pid, []);
    mapByPlayer.get(pid)!.push(mu);
  }

  // Pair them up: i-th MapUnit for a player → i-th unit_id for that player
  for (const [playerId, playerMapUnits] of mapByPlayer) {
    const playerUnitIds = onchainByPlayer.get(playerId) ?? [];
    for (let i = 0; i < playerMapUnits.length; i++) {
      const mu = playerMapUnits[i];
      const onchainId = playerUnitIds[i] ?? i + 1; // fallback if Unit row missing
      const team = TEAMS[playerId] ?? "blue";
      const type = parseUnitType(mu.unit_type);
      units.push({
        id: nextLocalId++,
        onchainId,
        type,
        team,
        x: toNumber(mu.x),
        y: toNumber(mu.y),
        hp: UNIT_MAX_HP[type] ?? DEFAULT_UNIT_HP,
        lastMovedRound: 0,
        lastActedRound: 0,
        facing: team === "red" ? "left" : "right",
        animation: "idle",
      });
    }
  }

  // Track highest onchainId for newly built units
  let maxOnchainId = units.reduce((max, u) => Math.max(max, u.onchainId), 0);

  const snapshots: TurnSnapshot[] = [];

  // Turn 0: initial state
  snapshots.push({
    round: 1,
    currentPlayer: firstPlayer,
    units: units.map((u) => ({ ...u })),
  });

  // Working copy of units
  const workingUnits = units.map((u) => ({ ...u }));

  for (const event of events) {
    switch (event.type) {
      case "UnitMoved": {
        const unit = workingUnits.find((u) => u.onchainId === event.unitId);
        if (unit) {
          unit.x = event.x;
          unit.y = event.y;
        }
        break;
      }
      case "UnitAttacked": {
        const defender = workingUnits.find(
          (u) => u.onchainId === event.targetId,
        );
        const attacker = workingUnits.find(
          (u) => u.onchainId === event.attackerId,
        );
        if (defender) defender.hp -= event.damageToDefender;
        if (attacker) attacker.hp -= event.damageToAttacker;
        break;
      }
      case "UnitDied": {
        const idx = workingUnits.findIndex((u) => u.onchainId === event.unitId);
        if (idx !== -1) workingUnits.splice(idx, 1);
        break;
      }
      case "UnitBuilt": {
        maxOnchainId++;
        const type = parseUnitType(event.unitType);
        // We don't know the player_id from the event directly,
        // but we can infer from the current snapshot's currentPlayer
        const lastSnap = snapshots[snapshots.length - 1];
        const team = TEAMS[lastSnap.currentPlayer] ?? "blue";
        workingUnits.push({
          id: nextLocalId++,
          onchainId: maxOnchainId,
          type,
          team,
          x: event.x,
          y: event.y,
          hp: UNIT_MAX_HP[type] ?? DEFAULT_UNIT_HP,
          lastMovedRound: 0,
          lastActedRound: 0,
          facing: team === "red" ? "left" : "right",
          animation: "idle",
        });
        break;
      }
      case "TurnEnded": {
        snapshots.push({
          round: event.round,
          currentPlayer: event.nextPlayer,
          units: workingUnits.map((u) => ({ ...u })),
        });
        break;
      }
      case "GameOver": {
        // Only create a snapshot if state differs from the last one
        // (avoids duplicate when GameOver fires right after TurnEnded)
        const lastSnap = snapshots[snapshots.length - 1];
        const currentUnitState = workingUnits.map((u) => ({ ...u }));
        const unitsChanged =
          currentUnitState.length !== lastSnap.units.length ||
          currentUnitState.some((u, index) => {
            const prev = lastSnap.units[index];
            return (
              !prev ||
              u.onchainId !== prev.onchainId ||
              u.x !== prev.x ||
              u.y !== prev.y ||
              u.hp !== prev.hp
            );
          });
        if (unitsChanged) {
          snapshots.push({
            round: lastSnap.round,
            currentPlayer: event.winner,
            units: currentUnitState,
          });
        }
        break;
      }
    }
  }

  return snapshots;
}

// --- Hook ---

export function useReplayState(id: string | undefined): {
  loading: boolean;
  error: string | null;
  snapshots: TurnSnapshot[];
} {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<TurnSnapshot[]>([]);

  const gameId = Number.parseInt(id || "", 10);
  const isValid = Number.isInteger(gameId) && gameId > 0;

  useEffect(() => {
    if (!isValid) {
      setError("Invalid game ID");
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const store = useGameStore.getState();
        store.clearUnits();

        // Fetch all data in parallel
        const [gameRows, playerRows, mapTileRows, buildingRows] =
          await Promise.all([
            fetchToriiSql<GameRow>(
              `SELECT * FROM "hashfront-Game" WHERE game_id = ${gameId}`,
            ),
            fetchToriiSql<PlayerRow>(
              `SELECT * FROM "hashfront-PlayerState" WHERE game_id = ${gameId}`,
            ),
            // We need map_id first for tiles, but we can do a subquery
            fetchToriiSql<MapTileRow>(
              `SELECT mt.* FROM "hashfront-MapTile" mt
               JOIN "hashfront-Game" g ON mt.map_id = g.map_id
               WHERE g.game_id = ${gameId}`,
            ),
            fetchToriiSql<BuildingRow>(
              `SELECT * FROM "hashfront-Building" WHERE game_id = ${gameId}`,
            ),
          ]);

        if (!active) return;

        const gameRow = gameRows[0];
        if (!gameRow) {
          setError("Game not found");
          setLoading(false);
          return;
        }

        const mapId = toNumber(gameRow.map_id);

        // Fetch map units, on-chain unit IDs, and all historical events
        const [mapUnitRows, unitRows, historicalRows] = await Promise.all([
          fetchToriiSql<MapUnitRow>(
            `SELECT * FROM "hashfront-MapUnit" WHERE map_id = ${mapId} ORDER BY seq ASC`,
          ),
          fetchToriiSql<UnitRow>(
            `SELECT unit_id, player_id FROM "hashfront-Unit" WHERE game_id = ${gameId} ORDER BY unit_id ASC`,
          ),
          fetchToriiSql<HistoricalEventRow>(
            `SELECT e.event_id, e.executed_at, m.name as model_name, e.data
             FROM event_messages_historical e
             JOIN models m ON e.model_id = m.id
             WHERE json_extract(e.data, '$.game_id') = ${gameId}
             ORDER BY e.executed_at ASC, e.event_id ASC`,
          ),
        ]);

        if (!active) return;

        // Parse historical events from JSON data column
        const allEvents: GameEvent[] = [];

        for (const row of historicalRows) {
          const d = JSON.parse(row.data);
          switch (row.model_name) {
            case "UnitMoved":
              allEvents.push({
                type: "UnitMoved",
                eventId: row.event_id,
                unitId: toNumber(d.unit_id),
                x: toNumber(d.x),
                y: toNumber(d.y),
              });
              break;
            case "UnitAttacked":
              allEvents.push({
                type: "UnitAttacked",
                eventId: row.event_id,
                attackerId: toNumber(d.attacker_id),
                targetId: toNumber(d.target_id),
                damageToDefender: toNumber(d.damage_to_defender),
                damageToAttacker: toNumber(d.damage_to_attacker),
              });
              break;
            case "UnitDied":
              allEvents.push({
                type: "UnitDied",
                eventId: row.event_id,
                unitId: toNumber(d.unit_id),
              });
              break;
            case "UnitBuilt":
              allEvents.push({
                type: "UnitBuilt",
                eventId: row.event_id,
                unitType: String(d.unit_type),
                x: toNumber(d.x),
                y: toNumber(d.y),
              });
              break;
            case "TurnEnded":
              allEvents.push({
                type: "TurnEnded",
                eventId: row.event_id,
                nextPlayer: toNumber(d.next_player),
                round: toNumber(d.round),
              });
              break;
            case "GameOver":
              allEvents.push({
                type: "GameOver",
                eventId: row.event_id,
                winner: toNumber(d.winner),
              });
              break;
          }
        }

        console.log("[Replay] Events fetched:", {
          total: allEvents.length,
          moved: allEvents.filter((e) => e.type === "UnitMoved").length,
          attacked: allEvents.filter((e) => e.type === "UnitAttacked").length,
          died: allEvents.filter((e) => e.type === "UnitDied").length,
          built: allEvents.filter((e) => e.type === "UnitBuilt").length,
          turnEnded: allEvents.filter((e) => e.type === "TurnEnded").length,
          gameOver: allEvents.filter((e) => e.type === "GameOver").length,
          mapUnits: mapUnitRows.length,
        });

        // Build snapshots using on-chain Unit rows for correct unit ID mapping
        const firstPlayer = 1;
        const snaps = buildSnapshots(
          mapUnitRows,
          unitRows,
          allEvents,
          firstPlayer,
        );

        console.log(
          "[Replay] Snapshots built:",
          snaps.length,
          "snapshots.",
          "Rounds:",
          snaps.map((s) => s.round).join(", "),
          "Units per snap:",
          snaps.map((s) => s.units.length).join(", "),
        );
        if (snaps.length >= 2) {
          const s0 = snaps[0].units;
          const s1 = snaps[1].units;
          const posChanged = s0.some((u) => {
            const u1 = s1.find((x) => x.onchainId === u.onchainId);
            return u1 && (u.x !== u1.x || u.y !== u1.y);
          });
          console.log(
            "[Replay] Positions changed between snap 0 and 1:",
            posChanged,
          );
        }

        if (!active) return;

        // Hydrate the store
        const gameInfo: GameInfo = {
          gameId: toNumber(gameRow.game_id),
          currentPlayer: snaps[0]?.currentPlayer ?? 1,
          round: snaps[0]?.round ?? 1,
          winner: toNumber(gameRow.winner),
          state: String(gameRow.state ?? "Finished"),
          name: String(gameRow.name ?? ""),
          mapId,
          width: toNumber(gameRow.width),
          height: toNumber(gameRow.height),
          playerCount: toNumber(gameRow.player_count),
          isTestMode: Boolean(gameRow.is_test_mode),
        };
        store.setGame(gameInfo);

        const players: GamePlayerState[] = playerRows.map((p) => ({
          playerId: toNumber(p.player_id),
          address: String(p.address ?? ""),
          gold: toNumber(p.gold),
          unitCount: toNumber(p.unit_count),
          factoryCount: toNumber(p.factory_count),
          cityCount: toNumber(p.city_count),
          isAlive: Boolean(p.is_alive),
        }));
        store.setPlayers(players);

        const gameWidth = toNumber(gameRow.width) || 20;
        const gameHeight = toNumber(gameRow.height) || 20;
        const { tileMap, borderMap } = buildTileMapFromSql(
          mapTileRows,
          buildingRows,
          gameWidth,
          gameHeight,
        );
        store.setTileMap(tileMap, borderMap, gameWidth, gameHeight);

        // Set initial units (turn 0)
        if (snaps.length > 0) {
          store.setUnits(snaps[0].units);
        }

        setSnapshots(snaps);
        setLoading(false);
      } catch (e) {
        if (!active) return;
        console.error("Failed to load replay state:", e);
        setError("Failed to load replay data");
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [gameId, isValid]);

  return { loading, error, snapshots };
}
