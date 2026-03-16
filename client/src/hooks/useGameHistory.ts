import { useEffect, useState, useCallback, useRef } from "react";
import { fetchToriiSql } from "../utils/toriiSql";
import { TEAMS } from "../data/gameStore";
import { UNIT_DISPLAY_NAMES, UNIT_TYPES } from "../game/balance";

export interface GameHistoryEvent {
  id: string;
  transactionHash?: string;
  type: string;
  timestamp: string;
  message: string;
  data: any;
}

const BASE_HISTORY_INTERVAL = 5000;
const MAX_HISTORY_INTERVAL = 30000;
const MAX_HISTORY_FAILURES = 10;

export function useGameHistory(gameId: number | undefined) {
  const [events, setEvents] = useState<GameHistoryEvent[]>([]);
  const lastEventIdRef = useRef<string | null>(null);
  const eventsLengthRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    eventsLengthRef.current = events.length;
  }, [events.length]);

  useEffect(() => {
    if (!gameId) return;

    let active = true;
    let delay = BASE_HISTORY_INTERVAL;
    let consecutiveFailures = 0;

    async function fetchHistory() {
      try {
        const [eventRows, unitRows] = await Promise.all([
          fetchToriiSql<{
            event_id: string;
            executed_at: string;
            model_name: string;
            data: string;
          }>(
            `SELECT e.event_id, e.executed_at, m.name as model_name, e.data
             FROM event_messages_historical e
             JOIN models m ON e.model_id = m.id
             WHERE json_extract(e.data, '$.game_id') = ${gameId}
             ORDER BY e.executed_at ASC, e.event_id ASC`,
          ),
          fetchToriiSql<{ unit_id: number; unit_type: string }>(
            `SELECT unit_id, unit_type FROM "hashfront-Unit" WHERE game_id = ${gameId}`,
          ),
        ]);

        if (!active) return;

        if (
          eventRows.length === eventsLengthRef.current &&
          eventRows.length > 0 &&
          eventRows[eventRows.length - 1].event_id === lastEventIdRef.current
        ) {
          delay = BASE_HISTORY_INTERVAL;
          consecutiveFailures = 0;
          scheduleNext();
          return;
        }

        // Build unit ID -> Display Name map
        const unitIdToName: Record<number, string> = {};
        for (const u of unitRows) {
          const typeKey = UNIT_TYPES[u.unit_type] || "rifle";
          unitIdToName[u.unit_id] = UNIT_DISPLAY_NAMES[typeKey] || "Unit";
        }

        const getUnitName = (id: number) => {
          const name = unitIdToName[id] || "Unit";
          return `${name} #${id}`;
        };

        const parsedEvents: GameHistoryEvent[] = eventRows.map((row) => {
          const data = JSON.parse(row.data);
          let message = "";

          // event_id format: block_hash:transaction_hash:world_address:event_index
          const parts = row.event_id.split(":");
          const transactionHash = parts.length > 1 ? parts[1] : undefined;

          switch (row.model_name) {
            case "UnitMoved":
              message = `${getUnitName(data.unit_id)} moved to (${data.x}, ${data.y})`;
              break;
            case "UnitAttacked":
              message = `${getUnitName(data.attacker_id)} attacked ${getUnitName(data.target_id)} (-${data.damage_to_defender} HP)`;
              break;
            case "UnitDied":
              message = `${getUnitName(data.unit_id)} was destroyed`;
              break;
            case "UnitBuilt": {
              const rawType = String(data.unit_type || "Infantry");
              const typeKey = UNIT_TYPES[rawType] || "rifle";
              const typeName = UNIT_DISPLAY_NAMES[typeKey] || rawType;
              message = `New ${typeName} deployed at (${data.x}, ${data.y})`;
              break;
            }
            case "TurnEnded":
              message = `Round ${data.round} started - ${TEAMS[data.next_player]?.toUpperCase() || "UNKNOWN"}'s turn`;
              break;
            case "GameOver":
              message = `Game Over - ${TEAMS[data.winner]?.toUpperCase() || "UNKNOWN"} WINS`;
              break;
            case "BuildingCaptured":
              message = `${TEAMS[data.player_id]?.toUpperCase() || "PLAYER"} captured building at (${data.x}, ${data.y})`;
              break;
            case "PlayerJoined":
              message = `Player ${data.player_id} joined the battle`;
              break;
            case "GameCreated":
              message = `Operation initialized`;
              break;
            case "GameStarted":
              message = `Engagement started with ${data.player_count} commanders`;
              break;
            default:
              message = `${row.model_name} event triggered`;
          }

          return {
            id: row.event_id,
            transactionHash,
            type: row.model_name,
            timestamp: row.executed_at,
            message,
            data,
          };
        });

        setEvents(parsedEvents);
        if (parsedEvents.length > 0) {
          lastEventIdRef.current = parsedEvents[parsedEvents.length - 1].id;
        }
        delay = BASE_HISTORY_INTERVAL;
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures++;
        delay = Math.min(delay * 2, MAX_HISTORY_INTERVAL);
        console.warn(
          `[Torii] History poll failed (${consecutiveFailures}/${MAX_HISTORY_FAILURES}):`,
          error,
        );
        if (consecutiveFailures >= MAX_HISTORY_FAILURES) {
          console.warn("[Torii] Max history retries reached, stopping poll.");
          return;
        }
      }
      scheduleNext();
    }

    function scheduleNext() {
      if (!active) return;
      timerRef.current = setTimeout(fetchHistory, delay);
    }

    fetchHistory();
    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameId]);

  return { events };
}
