import { useEffect, useRef, useCallback } from "react";
import { useGameStore, TEAMS } from "../data/gameStore";
import type { GamePlayerState } from "../data/gameStore";
import type { MapDef } from "../game/local/types";
import type { LocalGameState } from "../game/local/types";
import {
  initGame,
  applyMove,
  applyAttack,
  applyCapture,
  applyEndTurn,
} from "../game/local/engine";
import { planAITurn } from "../game/local/ai";
import { TileType } from "../game/types";

const UNIT_TYPE_MAP: Record<string, string> = {
  Infantry: "rifle",
  Tank: "tank",
  Ranger: "artillery",
};

export function useLocalGameState(
  mapDef: MapDef | null,
  difficulty: string = "normal",
): { loading: boolean; restart: () => void } {
  const engineStateRef = useRef<LocalGameState | null>(null);
  const aiRunningRef = useRef(false);

  const syncStoreFromState = useCallback((state: LocalGameState) => {
    const store = useGameStore.getState();

    // Sync game info
    store.setGame({
      gameId: 0,
      currentPlayer: state.currentPlayer,
      round: state.round,
      winner: state.winner,
      state: state.state === "Playing" ? "Playing" : "Finished",
      name: "SOLO_MISSION",
      mapId: 0,
      width: state.width,
      height: state.height,
      playerCount: 2,
      isTestMode: false,
    });

    // Sync players
    const playerStates: GamePlayerState[] = state.players.map((p) => ({
      playerId: p.playerId,
      address: p.playerId === 1 ? "0xLOCAL_PLAYER" : "0xAI_OPPONENT",
      gold: p.gold,
      unitCount: state.units.filter((u) => u.playerId === p.playerId).length,
      factoryCount: state.buildings.filter(
        (b) => b.type === "Factory" && b.playerId === p.playerId,
      ).length,
      cityCount: state.buildings.filter(
        (b) => b.type === "City" && b.playerId === p.playerId,
      ).length,
      isAlive: p.isAlive,
    }));
    store.setPlayers(playerStates);

    // Sync units — diff against current store
    const existingUnits = store.units;
    const engineUnitIds = new Set(state.units.map((u) => u.unitId));
    const existingByOnchainId = new Map(
      existingUnits.map((u) => [u.onchainId, u]),
    );

    // Remove dead units
    for (const eu of existingUnits) {
      if (!engineUnitIds.has(eu.onchainId)) {
        store.removeUnit(eu.onchainId);
      }
    }

    // Update or add units
    for (const lu of state.units) {
      const existing = existingByOnchainId.get(lu.unitId);
      const storeType = UNIT_TYPE_MAP[lu.type] ?? "rifle";
      const team = TEAMS[lu.playerId] ?? "blue";

      if (existing) {
        store.updateUnit(lu.unitId, {
          x: lu.x,
          y: lu.y,
          hp: lu.hp,
          type: storeType,
          team,
          lastMovedRound: lu.lastMovedRound,
          lastActedRound: lu.lastActedRound,
        });
      } else {
        store.addUnit(
          storeType,
          team,
          lu.x,
          lu.y,
          lu.unitId,
          lu.hp,
          lu.lastMovedRound,
          lu.lastActedRound,
        );
      }
    }
  }, []);

  const initializeGame = useCallback(
    (map: MapDef) => {
      const store = useGameStore.getState();
      store.clearUnits();
      store.clearQueue();
      store.setSelectedUnitId(null);
      store.setIsEndingTurn(false);

      // Build tileMap with building overlays
      const tileMap = new Uint8Array(map.tileMap);
      for (const b of map.buildings) {
        const idx = b.y * map.width + b.x;
        if (b.type === "HQ") tileMap[idx] = TileType.HQ;
        else if (b.type === "Factory") tileMap[idx] = TileType.Factory;
        else if (b.type === "City") tileMap[idx] = TileType.City;
      }
      store.setTileMap(
        tileMap,
        new Uint8Array(map.borderMap),
        map.width,
        map.height,
      );

      // Set local game flags
      store.setIsLocalGame(true);
      store.setLocalPlayerTeam("blue");

      const engineState = initGame(map);
      engineStateRef.current = engineState;
      syncStoreFromState(engineState);
    },
    [syncStoreFromState],
  );

  const runAITurn = useCallback(
    async (state: LocalGameState) => {
      if (aiRunningRef.current) return;
      aiRunningRef.current = true;

      const store = useGameStore.getState();
      store.setIsEndingTurn(true);

      const aiActions = planAITurn(state, state.currentPlayer, difficulty);

      let current = state;

      for (const action of aiActions) {
        if (action.type === "end_turn") break;

        // Apply action with delay for animation
        await new Promise((r) =>
          setTimeout(r, action.type === "attack" ? 500 : 350),
        );

        if (action.type === "move") {
          const result = applyMove(current, action.unitId, action.path);
          if (result) {
            current = result;
            syncStoreFromState(current);
          }
        } else if (action.type === "attack") {
          const result = applyAttack(current, action.unitId, action.targetId);
          if (result) {
            current = result.state;
            syncStoreFromState(current);
          }
        } else if (action.type === "capture") {
          const result = applyCapture(current, action.unitId);
          if (result) {
            current = result;
            syncStoreFromState(current);
          }
        }

        if (current.state === "Finished") break;
      }

      // Apply end turn for AI
      if (current.state === "Playing") {
        current = applyEndTurn(current);
        syncStoreFromState(current);
      }

      engineStateRef.current = current;
      aiRunningRef.current = false;
      store.setIsEndingTurn(false);
    },
    [difficulty, syncStoreFromState],
  );

  const handleLocalEndTurn = useCallback(() => {
    const state = engineStateRef.current;
    if (!state || state.state !== "Playing") return;
    if (aiRunningRef.current) return;

    const store = useGameStore.getState();
    const { moveQueue, clearQueue, requestDeselect } = store;

    requestDeselect();

    // Apply queued moves/attacks from player
    let current = state;

    for (const qm of moveQueue) {
      // Apply move
      if (qm.path.length > 0) {
        const result = applyMove(current, qm.unitOnchainId, qm.path);
        if (result) {
          current = result;
        }
      }

      // Apply attacks from calls
      for (const call of qm.calls) {
        if (call.entrypoint === "attack") {
          const attackerId = parseInt(call.calldata[1], 10);
          const targetId = parseInt(call.calldata[2], 10);
          const result = applyAttack(current, attackerId, targetId);
          if (result) {
            current = result.state;
          }
        }
      }
    }

    clearQueue({ fade: true });

    // Apply end turn for player
    current = applyEndTurn(current);
    engineStateRef.current = current;
    syncStoreFromState(current);

    // Trigger AI turn if game is still playing and it's AI's turn
    if (current.state === "Playing" && current.currentPlayer === 2) {
      void runAITurn(current);
    }
  }, [syncStoreFromState, runAITurn]);

  // Initialize on mount
  useEffect(() => {
    if (!mapDef) return;
    initializeGame(mapDef);

    // Set the end turn handler
    useGameStore.getState().setOnLocalEndTurn(handleLocalEndTurn);

    return () => {
      const store = useGameStore.getState();
      store.setIsLocalGame(false);
      store.setLocalPlayerTeam(null);
      store.setOnLocalEndTurn(null);
      store.clearUnits();
      store.setGame(null);
      store.setPlayers([]);
    };
  }, [mapDef, initializeGame, handleLocalEndTurn]);

  // Update the end turn handler when it changes
  useEffect(() => {
    if (!mapDef) return;
    useGameStore.getState().setOnLocalEndTurn(handleLocalEndTurn);
  }, [handleLocalEndTurn, mapDef]);

  const restart = useCallback(() => {
    if (!mapDef) return;
    aiRunningRef.current = false;
    initializeGame(mapDef);
    useGameStore.getState().setOnLocalEndTurn(handleLocalEndTurn);
  }, [mapDef, initializeGame, handleLocalEndTurn]);

  return { loading: !mapDef, restart };
}
