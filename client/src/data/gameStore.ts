import { create } from "zustand";

// --- Teams ---
export type TeamId = "blue" | "red" | "green" | "yellow";

export const TEAMS: Record<number, TeamId> = {
  1: "blue",
  2: "red",
  3: "green",
  4: "yellow",
};

export const UNIT_TYPES: Record<string, string> = {
  Infantry: "rifle",
  Tank: "tank",
  Ranger: "artillery",
};

// --- Units ---
// Max HP per unit type (Infantry=3, Tank=5, Ranger=3)
export const UNIT_MAX_HP: Record<string, number> = {
  rifle: 3,
  tank: 5,
  artillery: 3,
};

export interface Unit {
  id: number;
  onchainId: number;
  type: string;
  team: TeamId;
  x: number;
  y: number;
  hp: number;
  lastMovedRound: number;
  lastActedRound: number;
  facing: "left" | "right" | "up" | "down";
  animation:
    | "idle"
    | "walk_side"
    | "walk_down"
    | "walk_up"
    | "attack"
    | "hit"
    | "death";
}

// --- Game info ---
export interface GameInfo {
  currentPlayer: number;
  round: number;
  winner: number;
  state: string;
  name: string;
  mapId: number;
  width: number;
  height: number;
  playerCount: number;
  isTestMode: boolean;
}

// --- Player state ---
export interface GamePlayerState {
  playerId: number;
  address: string;
  gold: number;
  unitCount: number;
  factoryCount: number;
  cityCount: number;
  isAlive: boolean;
}

// --- Move queue ---
export interface QueuedMove {
  unitId: number;
  unitOnchainId: number;
  calls: { contractAddress: string; entrypoint: string; calldata: string[] }[];
  originX: number;
  originY: number;
  destX: number;
  destY: number;
  path: { x: number; y: number }[];
}

// --- Store ---
interface GameStore {
  tileMap: Uint8Array;
  setTileMap: (map: Uint8Array) => void;

  units: Unit[];
  nextId: number;
  addUnit: (
    type: string,
    team: TeamId,
    x: number,
    y: number,
    onchainId: number,
    hp?: number,
    lastMovedRound?: number,
    lastActedRound?: number,
  ) => Unit;
  updateUnit: (
    onchainId: number,
    updates: Partial<
      Pick<
        Unit,
        "x" | "y" | "type" | "team" | "hp" | "lastMovedRound" | "lastActedRound"
      >
    >,
  ) => void;
  removeUnit: (onchainId: number) => void;
  setUnits: (units: Unit[]) => void;
  clearUnits: () => void;

  game: GameInfo | null;
  setGame: (game: GameInfo | null) => void;

  players: GamePlayerState[];
  setPlayers: (players: GamePlayerState[]) => void;

  moveQueue: QueuedMove[];
  queueMove: (entry: QueuedMove) => void;
  dequeueMove: (unitId: number) => void;
  clearQueue: (opts?: { fade?: boolean }) => void;
  _trailFadeRequested: boolean;
  selectedUnitId: number | null;
  setSelectedUnitId: (id: number | null) => void;
  _deselectRequested: boolean;
  requestDeselect: () => void;
  isEndingTurn: boolean;
  setIsEndingTurn: (v: boolean) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  tileMap: new Uint8Array(0),
  setTileMap: (map) => set({ tileMap: new Uint8Array(map) }),

  units: [],
  nextId: 1,
  addUnit: (
    type,
    team,
    x,
    y,
    onchainId,
    hp,
    lastMovedRound = 0,
    lastActedRound = 0,
  ) => {
    const { nextId, units } = get();
    const unit: Unit = {
      id: nextId,
      onchainId,
      type,
      team,
      x,
      y,
      hp: hp ?? UNIT_MAX_HP[type] ?? 3,
      lastMovedRound,
      lastActedRound,
      facing: team === "red" ? "left" : "right",
      animation: "idle",
    };
    set({ units: [...units, unit], nextId: nextId + 1 });
    return unit;
  },
  updateUnit: (onchainId, updates) => {
    set((state) => ({
      units: state.units.map((u) =>
        u.onchainId === onchainId ? { ...u, ...updates } : u,
      ),
    }));
  },
  removeUnit: (onchainId) => {
    set((state) => ({
      units: state.units.filter((u) => u.onchainId !== onchainId),
    }));
  },
  setUnits: (units) => {
    const maxId = units.reduce((max, u) => Math.max(max, u.id), 0);
    set({ units, nextId: maxId + 1 });
  },
  clearUnits: () => set({ units: [], nextId: 1 }),

  game: null,
  setGame: (game) => set({ game }),

  players: [],
  setPlayers: (players) => set({ players }),

  moveQueue: [],
  queueMove: (entry) =>
    set((state) => ({
      moveQueue: [
        ...state.moveQueue.filter((m) => m.unitId !== entry.unitId),
        entry,
      ],
    })),
  dequeueMove: (unitId) =>
    set((state) => ({
      moveQueue: state.moveQueue.filter((m) => m.unitId !== unitId),
    })),
  _trailFadeRequested: false,
  clearQueue: (opts) =>
    set({ moveQueue: [], _trailFadeRequested: !!opts?.fade }),
  selectedUnitId: null,
  setSelectedUnitId: (id) => set({ selectedUnitId: id }),
  _deselectRequested: false,
  requestDeselect: () =>
    set({ _deselectRequested: true, selectedUnitId: null }),
  isEndingTurn: false,
  setIsEndingTurn: (v) => set({ isEndingTurn: v }),
}));
