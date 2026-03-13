import argparse
import copy
import json
import multiprocessing as mp
import os
import random
import sys
import time
from dataclasses import dataclass, field
from multiprocessing.connection import wait as wait_for_connections
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim


try:
    import hashfront_sim as _hs

    MAPS_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "contracts", "scripts", "maps")
    )

    def load_map(name):
        return _hs.load_map(name, MAPS_DIR)

    def list_maps():
        return _hs.list_maps(MAPS_DIR)

    def do_move(state, uid, tx, ty):
        _hs.do_move(state, uid, tx, ty)

    def do_attack(state, rng, attacker_uid, defender_uid):
        return _hs.do_attack(state, rng, attacker_uid, defender_uid)

    def do_capture(state, uid):
        return _hs.do_capture(state, uid)

    def do_wait(state, uid):
        _hs.do_wait(state, uid)

    def end_turn(state):
        _hs.end_turn(state)

    def reachable_tiles(state, uid):
        return _hs.reachable_tiles(state, uid)

    def best_move_toward(state, uid, tx, ty, occupied=None):
        return _hs.best_move_toward(state, uid, tx, ty, occupied)

    manhattan = _hs.manhattan_py
    can_capture = _hs.can_capture_py
    expected_damage = _hs.expected_damage_py
    defense_bonus = _hs.defense_bonus_py

    UNIT_HP = dict(_hs.UNIT_HP)
    UNIT_MIN_RANGE = dict(_hs.UNIT_MIN_RANGE)
    UNIT_MAX_RANGE = dict(_hs.UNIT_MAX_RANGE)
    INFANTRY = _hs.INFANTRY
    TANK = _hs.TANK
    ARTILLERY = _hs.ARTILLERY

    GameRng = _hs.GameRng

    def play_heuristic_turn(state, player, strategy_name, rng):
        _hs.play_heuristic_turn(state, player, strategy_name, rng)

    class _GameResult:
        __slots__ = ("winner", "rounds", "win_type")
        def __init__(self, winner, rounds, win_type):
            self.winner = winner
            self.rounds = rounds
            self.win_type = win_type

    def run_game(p1_strat, p2_strat, map_name, seed, verbose=False, replay=False):
        """Run a game. Strategies can be strings (heuristic names) or objects with play_turn."""
        p1_is_str = isinstance(p1_strat, str)
        p2_is_str = isinstance(p2_strat, str)
        p1_name = p1_strat if p1_is_str else None
        p2_name = p2_strat if p2_is_str else None
        # If both are native heuristic strings, run entirely in Rust
        if p1_is_str and p2_is_str:
            w, r, wt = _hs.run_game(p1_name, p2_name, map_name, seed, MAPS_DIR)
            return _GameResult(w, r, wt)
        # Otherwise run in Python with Rust GameState
        state = load_map(map_name)
        rng = GameRng(seed)
        strategies = {1: p1_strat, 2: p2_strat}
        while state.winner is None and state.round_num <= 100:
            player = state.current_player
            strat = strategies[player]
            if isinstance(strat, str):
                play_heuristic_turn(state, player, strat, rng)
            else:
                strat.play_turn(state, player, rng)
            if state.winner is None:
                end_turn(state)
        winner = state.winner
        if winner is None:
            p1u = state.player_units(1)
            p2u = state.player_units(2)
            hp1 = sum(u.hp for u in p1u)
            hp2 = sum(u.hp for u in p2u)
            winner = 1 if hp1 >= hp2 else 2
        return _GameResult(winner, state.round_num, "game")

    _USE_RUST_SIM = True
    print("Using Rust simulator (hashfront_sim)")
except ImportError:
    simulator_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "tools")
    )
    if simulator_path not in sys.path:
        sys.path.insert(0, simulator_path)
    try:
        from simulator import (
            DEFENSE_BONUS as _DEFENSE_BONUS_DICT,
            UNIT_HP as _UNIT_HP_DICT,
            UNIT_MAX_RANGE as _UNIT_MAX_RANGE_DICT,
            UNIT_MIN_RANGE as _UNIT_MIN_RANGE_DICT,
            TileType,
            UnitType,
            can_capture as _can_capture_py,
            do_attack as _do_attack_py,
            do_capture as _do_capture_py,
            do_move as _do_move_py,
            do_wait as _do_wait_py,
            end_turn as _end_turn_py,
            expected_damage as _expected_damage_py,
            list_maps,
            load_map,
            manhattan,
            reachable_tiles as _reachable_tiles_py,
            run_game as _run_game_py,
        )
        from simulator import (
            AggressiveStrategy,
            BalancedStrategy,
            DefensiveStrategy,
            RushStrategy,
        )

        INFANTRY = UnitType.INFANTRY.value
        TANK = UnitType.TANK.value
        ARTILLERY = UnitType.ARTILLERY.value
        UNIT_HP = {ut.value: hp for ut, hp in _UNIT_HP_DICT.items()}
        UNIT_MIN_RANGE = {ut.value: r for ut, r in _UNIT_MIN_RANGE_DICT.items()}
        UNIT_MAX_RANGE = {ut.value: r for ut, r in _UNIT_MAX_RANGE_DICT.items()}

        _TILE_STR = {t: t.name for t in TileType}
        _UT_INT = {UnitType.INFANTRY: 1, UnitType.TANK: 2, UnitType.ARTILLERY: 3}

        def defense_bonus(tile):
            if isinstance(tile, str):
                tile = TileType[tile]
            return _DEFENSE_BONUS_DICT[tile]

        def can_capture(ut):
            if isinstance(ut, int):
                ut = UnitType(ut)
            return _can_capture_py(ut)

        def expected_damage(atk, deft, tile, moved, dist):
            if isinstance(atk, int):
                atk = UnitType(atk)
            if isinstance(deft, int):
                deft = UnitType(deft)
            if isinstance(tile, str):
                tile = TileType[tile]
            return _expected_damage_py(atk, deft, tile, moved, dist)

        def reachable_tiles(state, uid_or_unit):
            if isinstance(uid_or_unit, int):
                unit = next(u for u in state.units if u.uid == uid_or_unit)
            else:
                unit = uid_or_unit
            return _reachable_tiles_py(state, unit)

        def do_move(state, uid, tx, ty):
            unit = next(u for u in state.units if u.uid == uid)
            _do_move_py(state, unit, tx, ty)

        def do_attack(state, rng, atk_uid, def_uid):
            atk = next(u for u in state.units if u.uid == atk_uid)
            deft = next(u for u in state.units if u.uid == def_uid)
            return _do_attack_py(state, rng, atk, deft)

        def do_capture(state, uid):
            unit = next(u for u in state.units if u.uid == uid)
            return _do_capture_py(state, unit)

        def do_wait(state, uid):
            unit = next(u for u in state.units if u.uid == uid)
            _do_wait_py(unit)

        def end_turn(state):
            _end_turn_py(state)

        _HEURISTIC_MAP = {
            "aggressive": AggressiveStrategy,
            "defensive": DefensiveStrategy,
            "rush": RushStrategy,
            "balanced": BalancedStrategy,
        }

        class _FallbackRng:
            def __init__(self, seed):
                self._rng = random.Random(seed)
            def randint(self, a, b):
                return self._rng.randint(a, b)

        GameRng = _FallbackRng

        def play_heuristic_turn(state, player, strategy_name, rng):
            strat = _HEURISTIC_MAP[strategy_name]()
            strat.play_turn(state, player, rng._rng if hasattr(rng, '_rng') else rng)

        _USE_RUST_SIM = False
        print("Using Python simulator (fallback)")
    except ImportError as exc:
        print(f"Failed to import simulator: {exc}")
        sys.exit(1)


TOTAL_DURATION = 300.0
FINAL_EVAL_BUDGET = 30.0
VALIDATION_INTERVAL = 30.0
BASE_SEED = 1337
GAMMA = 0.97
LAMBDA = 0.90
ENTROPY_WEIGHT = 0.025
VALUE_WEIGHT = 0.45
IMITATION_WEIGHT = 0.35
LEARNING_RATE = 3e-4
WEIGHT_DECAY = 1e-4
MAX_TILE_CANDIDATES = 8
BOARD_CHANNELS = 16
DEFAULT_ROLLOUT_FRAGMENT_STEPS = 32
DEFAULT_PARALLEL_ENVS_CPU = 4
DEFAULT_PARALLEL_ENVS_CUDA = 8
DEFAULT_SIM_WORKERS = 0
DEFAULT_SELF_PLAY_RATIO = 0.65
MAX_SNAPSHOT_POOL = 8
SNAPSHOT_EVAL_COUNT = 2
SNAPSHOT_EVAL_MAPS = 3
DEFAULT_VALIDATION_HEURISTIC_GAMES = 4
DEFAULT_VALIDATION_SELF_PLAY_GAMES = 6
DEFAULT_CHECKPOINT_DIR = "checkpoints"
MAX_TRAINING_TURNS = 50
LEARNER_POLICY_KEY = "__learner__"
REMOTE_BATCH_WAIT = 0.005
ACTION_TYPES = (
    "wait",
    "move_wait",
    "attack",
    "move_attack",
    "capture",
    "move_capture",
)
HEURISTIC_NAMES = (
    "aggressive",
    "defensive",
    "rush",
    "balanced",
)
HEURISTIC_BY_NAME = {name: name for name in HEURISTIC_NAMES}
EVAL_TEMPERATURES = {
    "ambush": 0.05,
    "archipelago": 0.30,
    "bridgehead": 0.05,
    "cliffside": 0.05,
    "contested": 0.05,
    "coral_strait": 0.05,
    "coral_strait_v2": 0.05,
    "coral_strait_v3": 0.20,
    "coral_strait_v4": 0.20,
    "crossroads": 0.05,
    "fortress": 0.05,
    "gauntlet": 0.05,
    "industrial": 0.05,
    "no_mans_land": 0.05,
    "ridgeline": 0.05,
    "scattered": 0.05,
    "sprawl": 0.05,
    "terrain": 0.05,
    "twinpeaks": 0.10,
    "valley": 0.05,
    "warfront": 0.05,
}

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


@dataclass
class ActionCandidate:
    kind: str
    move_to: tuple[int, int]
    target_uid: int | None
    features: list[float]
    heuristic_score: float


@dataclass
class TrainingEnv:
    state: object
    rng: random.Random
    learner_temperature: float
    opponent_strategy: object | None = None
    opponent_policy: object | None = None
    opponent_name: str = "heuristic"
    opponent_temperature: float = 0.10
    transitions: list[dict] = field(default_factory=list)
    turn_units: list = field(default_factory=list)
    turn_cursor: int = 0
    danger_maps: dict | None = None
    rusher_uid: int | None = None
    turn_player: int | None = None


@dataclass
class PolicySnapshot:
    name: str
    policy: object
    self_play_score: float
    heuristic_score: float


@dataclass
class PolicyDecisionRequest:
    env: TrainingEnv
    player: int
    policy: object
    unit: object
    board_tensor: torch.Tensor
    candidate_tensor: torch.Tensor
    heuristic_tensor: torch.Tensor
    candidates: list[ActionCandidate]
    before_metrics: tuple[int, int, int, int]
    temperature: float
    record_transition: bool
    teacher_index: int


@dataclass
class SimulationWorkerPool:
    ctx: object
    processes: dict[int, object]
    connections: dict[int, object]
    pending_requests: dict[int, dict] = field(default_factory=dict)
    idle_workers: set[int] = field(default_factory=set)
    next_worker_id: int = 0


def seed_everything(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def stable_map_token(map_name: str) -> int:
    return sum((idx + 1) * ord(ch) for idx, ch in enumerate(map_name))


def make_ensemble_opponent(map_name: str, seed: int) -> str:
    """Return a heuristic strategy name."""
    rng = random.Random(seed * 9973 + stable_map_token(map_name) * 37)
    return rng.choice(HEURISTIC_NAMES)


def evaluation_temperature(map_name: str) -> float:
    return EVAL_TEMPERATURES.get(map_name, 0.20)


def default_parallel_envs() -> int:
    return DEFAULT_PARALLEL_ENVS_CUDA if device.type == "cuda" else DEFAULT_PARALLEL_ENVS_CPU


def compute_board_limits(map_names: list[str]) -> tuple[int, int]:
    max_width = 0
    max_height = 0
    for map_name in map_names:
        state = load_map(map_name)
        max_width = max(max_width, state.width)
        max_height = max(max_height, state.height)
    return max_width, max_height


def one_hot(index: int, size: int) -> list[float]:
    values = [0.0] * size
    if 0 <= index < size:
        values[index] = 1.0
    return values


def find_building(state, x: int, y: int):
    for building in state.buildings:
        if building.x == x and building.y == y:
            return building
    return None


def current_metrics(state, player: int) -> tuple[int, int, int, int]:
    own_units = state.player_units(player)
    enemy_units = state.enemy_units(player)
    own_hp = sum(unit.hp for unit in own_units)
    enemy_hp = sum(unit.hp for unit in enemy_units)
    return own_hp, enemy_hp, len(own_units), len(enemy_units)


def normalize_heuristics(heuristic_tensor: torch.Tensor) -> torch.Tensor:
    if heuristic_tensor.numel() > 1:
        heuristic_tensor = (heuristic_tensor - heuristic_tensor.mean()) / (
            heuristic_tensor.std(unbiased=False) + 1e-6
        )
    return heuristic_tensor


def resolve_heuristic_strategy(name: str) -> str:
    """Return a validated heuristic strategy name."""
    if name not in HEURISTIC_BY_NAME:
        raise ValueError(f"Unknown heuristic strategy: {name}")
    return name


def tensor_on_device(tensor: torch.Tensor) -> torch.Tensor:
    return tensor.to(device) if tensor.device != device else tensor


def request_tensors_on_device(request_like) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    return (
        tensor_on_device(request_like.board_tensor),
        tensor_on_device(request_like.candidate_tensor),
        tensor_on_device(request_like.heuristic_tensor),
    )


def transition_tensors_on_device(transition: dict) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    return (
        tensor_on_device(transition["board_tensor"]),
        tensor_on_device(transition["candidate_tensor"]),
        tensor_on_device(transition["heuristic_tensor"]),
    )


def checkpoint_path(checkpoint_dir: str | None) -> Path | None:
    if not checkpoint_dir:
        return None
    return Path(checkpoint_dir) / "best.pt"


def history_path(checkpoint_dir: str | None) -> Path | None:
    if not checkpoint_dir:
        return None
    return Path(checkpoint_dir) / "history.jsonl"


def last_run_path(checkpoint_dir: str | None) -> Path | None:
    if not checkpoint_dir:
        return None
    return Path(checkpoint_dir) / "last_run.json"


def cpu_state_dict(model_or_state) -> dict[str, torch.Tensor]:
    state_dict = model_or_state if isinstance(model_or_state, dict) else model_or_state.state_dict()
    return {
        key: value.detach().cpu().clone()
        for key, value in state_dict.items()
    }


def serialize_snapshot_pool(snapshot_pool: list[PolicySnapshot]) -> list[dict]:
    serialized = []
    for snapshot in snapshot_pool:
        serialized.append(
            {
                "name": snapshot.name,
                "self_play_score": snapshot.self_play_score,
                "heuristic_score": snapshot.heuristic_score,
                "state_dict": cpu_state_dict(snapshot.policy),
            }
        )
    return serialized


def deserialize_snapshot_pool(raw_snapshots: list[dict], feature_dim: int) -> list[PolicySnapshot]:
    snapshot_pool = []
    for raw_snapshot in raw_snapshots:
        snapshot_policy = PolicyValueNet(feature_dim).to(device)
        snapshot_policy.load_state_dict(raw_snapshot["state_dict"])
        snapshot_policy.eval()
        snapshot_policy.requires_grad_(False)
        snapshot_pool.append(
            PolicySnapshot(
                name=raw_snapshot.get("name", "snapshot"),
                policy=snapshot_policy,
                self_play_score=float(raw_snapshot.get("self_play_score", 0.0)),
                heuristic_score=float(raw_snapshot.get("heuristic_score", 0.0)),
            )
        )
    return snapshot_pool


def load_training_checkpoint(
    checkpoint_dir: str | None,
    feature_dim: int,
) -> dict | None:
    path = checkpoint_path(checkpoint_dir)
    if path is None or not path.exists():
        return None

    checkpoint = torch.load(path, map_location="cpu")
    raw_snapshots = checkpoint.get("snapshot_pool", [])
    checkpoint["snapshot_pool"] = deserialize_snapshot_pool(raw_snapshots, feature_dim)
    return checkpoint


def save_training_checkpoint(
    checkpoint_dir: str | None,
    *,
    best_state: dict[str, torch.Tensor],
    best_self_play_score: float,
    best_heuristic_score: float,
    snapshot_pool: list[PolicySnapshot],
    snapshot_generation: int,
    sample_features: int,
    completed_runs: int,
    run_record: dict,
) -> Path | None:
    path = checkpoint_path(checkpoint_dir)
    if path is None:
        return None

    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "saved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sample_features": sample_features,
        "policy_state": cpu_state_dict(best_state),
        "best_self_play_score": best_self_play_score,
        "best_heuristic_score": best_heuristic_score,
        "snapshot_generation": snapshot_generation,
        "snapshot_pool": serialize_snapshot_pool(snapshot_pool),
        "completed_runs": completed_runs,
        "last_run": run_record,
    }
    torch.save(payload, path)
    return path


def append_history(checkpoint_dir: str | None, run_record: dict) -> None:
    path = history_path(checkpoint_dir)
    if path is None:
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(run_record, sort_keys=True) + "\n")


def write_last_run(checkpoint_dir: str | None, run_record: dict) -> None:
    path = last_run_path(checkpoint_dir)
    if path is None:
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(run_record, handle, indent=2, sort_keys=True)
        handle.write("\n")


def make_policy_snapshot(
    policy: "PolicyValueNet",
    self_play_score: float,
    heuristic_score: float,
    generation: int,
) -> PolicySnapshot:
    snapshot_policy = copy.deepcopy(policy).to(device)
    snapshot_policy.eval()
    snapshot_policy.requires_grad_(False)
    return PolicySnapshot(
        name=f"snapshot_{generation}",
        policy=snapshot_policy,
        self_play_score=self_play_score,
        heuristic_score=heuristic_score,
    )


def add_snapshot(
    snapshot_pool: list[PolicySnapshot],
    policy: "PolicyValueNet",
    self_play_score: float,
    heuristic_score: float,
    generation: int,
) -> PolicySnapshot:
    snapshot = make_policy_snapshot(policy, self_play_score, heuristic_score, generation)
    snapshot_pool.append(snapshot)
    if len(snapshot_pool) > MAX_SNAPSHOT_POOL:
        snapshot_pool.pop(0)
    return snapshot


def sample_training_opponent(
    snapshot_pool: list[PolicySnapshot],
    map_name: str,
    seed: int,
    self_play_ratio: float,
):
    if snapshot_pool and random.random() < self_play_ratio:
        snapshot = random.choice(snapshot_pool)
        return None, snapshot.policy, snapshot.name, evaluation_temperature(map_name)

    heuristic_name = make_ensemble_opponent(map_name, seed)
    return heuristic_name, None, heuristic_name, evaluation_temperature(map_name)


def build_danger_maps(state, player: int):
    width = state.width
    height = state.height
    danger_by_type = {
        unit_type: [[0.0 for _ in range(width)] for _ in range(height)]
        for unit_type in (INFANTRY, TANK, ARTILLERY)
    }

    for enemy in state.enemy_units(player):
        candidate_tiles = [(enemy.x, enemy.y)]
        if enemy.unit_type != ARTILLERY:
            candidate_tiles.extend(reachable_tiles(state, enemy.uid).keys())

        for ex, ey in candidate_tiles:
            moved = (ex, ey) != (enemy.x, enemy.y)
            min_range = UNIT_MIN_RANGE[enemy.unit_type]
            max_range = UNIT_MAX_RANGE[enemy.unit_type]
            for tx in range(max(0, ex - max_range), min(width, ex + max_range + 1)):
                for ty in range(max(0, ey - max_range), min(height, ey + max_range + 1)):
                    distance = manhattan(ex, ey, tx, ty)
                    if min_range <= distance <= max_range:
                        tile = state.tile_at(tx, ty)
                        for defender_type, danger in danger_by_type.items():
                            danger[ty][tx] += expected_damage(
                                enemy.unit_type,
                                defender_type,
                                tile,
                                moved,
                                distance,
                            )
    return danger_by_type


def encode_board(state, player: int, focus_uid: int, max_width: int, max_height: int):
    board = torch.zeros((BOARD_CHANNELS, max_height, max_width), dtype=torch.float32, device=device)

    for y in range(state.height):
        for x in range(state.width):
            tile = state.tile_at(x, y)
            board[0, y, x] = defense_bonus(tile) / 2.0
            board[1, y, x] = 1.0 if tile in ("ROAD", "DIRT_ROAD") else 0.0
            board[2, y, x] = 1.0 if tile == "MOUNTAIN" else 0.0
            board[3, y, x] = 1.0 if tile == "TREE" else 0.0

    for building in state.buildings:
        if building.owner == player:
            board[13, building.y, building.x] = 1.0
        else:
            board[14, building.y, building.x] = 1.0

    for unit in state.units:
        if not unit.alive:
            continue

        if unit.player == player:
            base = {
                INFANTRY: 4,
                TANK: 5,
                ARTILLERY: 6,
            }[unit.unit_type]
            board[7, unit.y, unit.x] = unit.hp / UNIT_HP[unit.unit_type]
            board[8, unit.y, unit.x] = 0.0 if unit.has_acted else 1.0
        else:
            base = {
                INFANTRY: 9,
                TANK: 10,
                ARTILLERY: 11,
            }[unit.unit_type]
            board[12, unit.y, unit.x] = unit.hp / UNIT_HP[unit.unit_type]

        board[base, unit.y, unit.x] = 1.0
        if unit.uid == focus_uid:
            board[15, unit.y, unit.x] = 1.0

    return board


def choose_rusher(state, player: int):
    enemy_hq = state.player_hq(state.other_player(player))
    if enemy_hq is None:
        return None

    candidates = [unit for unit in state.player_units(player) if can_capture(unit.unit_type)]
    if not candidates:
        return None

    closest = min(
        candidates,
        key=lambda unit: manhattan(unit.x, unit.y, enemy_hq.x, enemy_hq.y),
    )
    return closest.uid


def unit_order(state, player: int, rusher_uid: int | None):
    enemies = state.enemy_units(player)

    def nearest_enemy_distance(unit) -> int:
        if not enemies:
            return state.width + state.height
        return min(manhattan(unit.x, unit.y, enemy.x, enemy.y) for enemy in enemies)

    type_priority = {
        ARTILLERY: 0,
        TANK: 1,
        INFANTRY: 2,
    }

    units = state.player_units(player)
    units.sort(
        key=lambda unit: (
            0 if unit.uid == rusher_uid else 1,
            nearest_enemy_distance(unit),
            type_priority[unit.unit_type],
            -unit.hp,
        )
    )
    return units


def action_priority_key(
    state,
    player: int,
    unit,
    tile: tuple[int, int],
    danger_map: list[list[float]],
    rusher_uid: int | None,
):
    enemies = state.enemy_units(player)
    enemy_hq = state.player_hq(state.other_player(player))
    own_hq = state.player_hq(player)
    x, y = tile
    tile_defense = defense_bonus(state.tile_at(x, y))
    danger = danger_map[y][x]
    nearest_enemy = min((manhattan(x, y, enemy.x, enemy.y) for enemy in enemies), default=state.width + state.height)
    enemy_hq_dist = manhattan(x, y, enemy_hq.x, enemy_hq.y) if enemy_hq else state.width + state.height
    own_hq_dist = manhattan(x, y, own_hq.x, own_hq.y) if own_hq else 0
    hp_bias = 0.7 * nearest_enemy if unit.hp <= 1 else -0.4 * nearest_enemy
    rusher_bias = -enemy_hq_dist if unit.uid == rusher_uid else 0.0
    return tile_defense * 1.4 - danger * 0.8 + hp_bias + rusher_bias - own_hq_dist * 0.15


def candidate_targets(state, unit, move_to: tuple[int, int]):
    x, y = move_to
    moved = (x, y) != (unit.x, unit.y)
    if unit.unit_type == ARTILLERY and moved:
        return []

    min_range = UNIT_MIN_RANGE[unit.unit_type]
    max_range = UNIT_MAX_RANGE[unit.unit_type]
    targets = []
    for enemy in state.enemy_units(unit.player):
        distance = manhattan(x, y, enemy.x, enemy.y)
        if min_range <= distance <= max_range:
            targets.append(enemy)
    return targets


def candidate_feature_vector(
    state,
    player: int,
    unit,
    move_to: tuple[int, int],
    target,
    kind: str,
    danger_map: list[list[float]],
    heuristic_score: float,
    rusher_uid: int | None,
):
    own_units = state.player_units(player)
    enemy_units = state.enemy_units(player)
    own_hq = state.player_hq(player)
    enemy_hq = state.player_hq(state.other_player(player))

    x, y = move_to
    moved = 1.0 if (x, y) != (unit.x, unit.y) else 0.0
    action_one_hot = one_hot(ACTION_TYPES.index(kind), len(ACTION_TYPES))
    unit_one_hot = one_hot(
        {INFANTRY: 0, TANK: 1, ARTILLERY: 2}[unit.unit_type],
        3,
    )

    if target is None:
        target_one_hot = one_hot(3, 4)
        target_hp = 0.0
        damage = 0.0
        counter = 0.0
        kill_flag = 0.0
    else:
        target_one_hot = one_hot(
            {INFANTRY: 0, TANK: 1, ARTILLERY: 2}[target.unit_type],
            4,
        )
        distance = manhattan(x, y, target.x, target.y)
        damage = expected_damage(
            unit.unit_type,
            target.unit_type,
            state.tile_at(target.x, target.y),
            bool(moved),
            distance,
        )
        counter = 0.0
        if damage < target.hp:
            target_min = UNIT_MIN_RANGE[target.unit_type]
            target_max = UNIT_MAX_RANGE[target.unit_type]
            if target_min <= distance <= target_max:
                counter = expected_damage(
                    target.unit_type,
                    unit.unit_type,
                    state.tile_at(x, y),
                    False,
                    distance,
                )
        target_hp = target.hp / UNIT_HP[target.unit_type]
        kill_flag = 1.0 if damage >= target.hp else 0.0

    nearest_enemy = min((manhattan(x, y, enemy.x, enemy.y) for enemy in enemy_units), default=state.width + state.height)
    own_support = sum(1 for ally in own_units if ally.uid != unit.uid and manhattan(x, y, ally.x, ally.y) <= 2)
    enemy_support = sum(1 for enemy in enemy_units if manhattan(x, y, enemy.x, enemy.y) <= 2)
    defense = defense_bonus(state.tile_at(x, y)) / 2.0
    danger = danger_map[y][x] / 8.0

    enemy_hq_dist = 0.0
    own_hq_dist = 0.0
    delta_enemy_hq = 0.0
    if enemy_hq:
        enemy_hq_dist = manhattan(x, y, enemy_hq.x, enemy_hq.y) / (state.width + state.height)
        delta_enemy_hq = (
            manhattan(unit.x, unit.y, enemy_hq.x, enemy_hq.y)
            - manhattan(x, y, enemy_hq.x, enemy_hq.y)
        ) / (state.width + state.height)
    if own_hq:
        own_hq_dist = manhattan(x, y, own_hq.x, own_hq.y) / (state.width + state.height)

    delta_enemy = (
        min((manhattan(unit.x, unit.y, enemy.x, enemy.y) for enemy in enemy_units), default=state.width + state.height)
        - nearest_enemy
    ) / (state.width + state.height)

    own_hp, enemy_hp, own_count, enemy_count = current_metrics(state, player)
    on_enemy_hq = 1.0 if enemy_hq and (x, y) == (enemy_hq.x, enemy_hq.y) else 0.0
    on_own_hq = 1.0 if own_hq and (x, y) == (own_hq.x, own_hq.y) else 0.0
    capture_flag = 1.0 if "capture" in kind else 0.0
    is_rusher = 1.0 if unit.uid == rusher_uid else 0.0

    features = []
    features.extend(action_one_hot)
    features.extend(unit_one_hot)
    features.extend(target_one_hot)
    features.extend(
        [
            unit.hp / UNIT_HP[unit.unit_type],
            target_hp,
            moved,
            defense,
            danger,
            own_support / 4.0,
            enemy_support / 4.0,
            nearest_enemy / (state.width + state.height),
            enemy_hq_dist,
            own_hq_dist,
            delta_enemy_hq,
            delta_enemy,
            damage / 5.0,
            counter / 5.0,
            kill_flag,
            capture_flag,
            on_enemy_hq,
            on_own_hq,
            is_rusher,
            state.round_num / 30.0,
            max(-1.0, min(1.0, (own_count - enemy_count) / 6.0)),
            max(-1.0, min(1.0, (own_hp - enemy_hp) / 15.0)),
            heuristic_score / 20.0,
        ]
    )
    return features


def score_candidate(
    state,
    player: int,
    unit,
    move_to: tuple[int, int],
    target,
    kind: str,
    danger_map: list[list[float]],
    rusher_uid: int | None,
):
    own_hq = state.player_hq(player)
    enemy_hq = state.player_hq(state.other_player(player))
    x, y = move_to
    moved = (x, y) != (unit.x, unit.y)
    defense = defense_bonus(state.tile_at(x, y))
    danger = danger_map[y][x]
    enemies = state.enemy_units(player)

    nearest_enemy = min((manhattan(x, y, enemy.x, enemy.y) for enemy in enemies), default=state.width + state.height)
    own_hq_dist = manhattan(x, y, own_hq.x, own_hq.y) if own_hq else 0
    enemy_hq_dist = manhattan(x, y, enemy_hq.x, enemy_hq.y) if enemy_hq else state.width + state.height
    score = defense * 1.2 - danger * 1.0

    if target is not None:
        distance = manhattan(x, y, target.x, target.y)
        damage = expected_damage(
            unit.unit_type,
            target.unit_type,
            state.tile_at(target.x, target.y),
            moved,
            distance,
        )
        counter = 0.0
        if damage < target.hp:
            target_min = UNIT_MIN_RANGE[target.unit_type]
            target_max = UNIT_MAX_RANGE[target.unit_type]
            if target_min <= distance <= target_max:
                counter = expected_damage(
                    target.unit_type,
                    unit.unit_type,
                    state.tile_at(x, y),
                    False,
                    distance,
                )
        score += damage * 4.3 - counter * 2.6
        if damage >= target.hp:
            score += 7.5
        if target.unit_type == TANK:
            score += 2.5
        elif target.unit_type == ARTILLERY:
            score += 1.3

    if "capture" in kind:
        score += 13.0
        if enemy_hq and (x, y) == (enemy_hq.x, enemy_hq.y):
            score += 22.0

    if unit.hp <= 1:
        score += nearest_enemy * 0.8 - own_hq_dist * 0.5
    elif unit.unit_type == ARTILLERY:
        score += 2.5 - 1.3 * abs(nearest_enemy - 2.5)
    elif unit.unit_type == TANK:
        score -= nearest_enemy * 0.45
    else:
        score -= nearest_enemy * 0.28

    if can_capture(unit.unit_type) and enemy_hq:
        if unit.uid == rusher_uid:
            score -= enemy_hq_dist * 0.95
        else:
            score -= enemy_hq_dist * 0.25
        if (x, y) == (enemy_hq.x, enemy_hq.y):
            score += 6.0

    if own_hq:
        closest_enemy_to_hq = min(
            (manhattan(enemy.x, enemy.y, own_hq.x, own_hq.y) for enemy in enemies),
            default=99,
        )
        if closest_enemy_to_hq <= 5:
            score -= own_hq_dist * 0.35

    if kind.endswith("wait"):
        score -= 0.4

    return score


def enumerate_candidates(
    state,
    player: int,
    unit,
    danger_map: list[list[float]],
    rusher_uid: int | None,
):
    tile_scores = {
        (unit.x, unit.y): action_priority_key(
            state,
            player,
            unit,
            (unit.x, unit.y),
            danger_map,
            rusher_uid,
        )
    }
    for tile in reachable_tiles(state, unit.uid).keys():
        tile_scores[tile] = action_priority_key(
            state,
            player,
            unit,
            tile,
            danger_map,
            rusher_uid,
        )

    ranked_tiles = [
        tile for tile, _ in sorted(tile_scores.items(), key=lambda item: item[1], reverse=True)
    ][:MAX_TILE_CANDIDATES]

    if (unit.x, unit.y) not in ranked_tiles:
        ranked_tiles.append((unit.x, unit.y))

    candidates: list[ActionCandidate] = []
    seen = set()

    for tile in ranked_tiles:
        building = find_building(state, tile[0], tile[1])
        moved = tile != (unit.x, unit.y)

        if building and building.owner != player and can_capture(unit.unit_type):
            kind = "move_capture" if moved else "capture"
            heuristic = score_candidate(state, player, unit, tile, None, kind, danger_map, rusher_uid)
            features = candidate_feature_vector(
                state,
                player,
                unit,
                tile,
                None,
                kind,
                danger_map,
                heuristic,
                rusher_uid,
            )
            key = (kind, tile, None)
            if key not in seen:
                seen.add(key)
                candidates.append(ActionCandidate(kind, tile, None, features, heuristic))

        targets = candidate_targets(state, unit, tile)
        targets.sort(
            key=lambda enemy: score_candidate(
                state,
                player,
                unit,
                tile,
                enemy,
                "move_attack" if moved else "attack",
                danger_map,
                rusher_uid,
            ),
            reverse=True,
        )

        for target in targets[:3]:
            kind = "move_attack" if moved else "attack"
            heuristic = score_candidate(state, player, unit, tile, target, kind, danger_map, rusher_uid)
            features = candidate_feature_vector(
                state,
                player,
                unit,
                tile,
                target,
                kind,
                danger_map,
                heuristic,
                rusher_uid,
            )
            key = (kind, tile, target.uid)
            if key not in seen:
                seen.add(key)
                candidates.append(ActionCandidate(kind, tile, target.uid, features, heuristic))

        kind = "move_wait" if moved else "wait"
        heuristic = score_candidate(state, player, unit, tile, None, kind, danger_map, rusher_uid)
        features = candidate_feature_vector(
            state,
            player,
            unit,
            tile,
            None,
            kind,
            danger_map,
            heuristic,
            rusher_uid,
        )
        key = (kind, tile, None)
        if key not in seen:
            seen.add(key)
            candidates.append(ActionCandidate(kind, tile, None, features, heuristic))

    if not candidates:
        heuristic = 0.0
        features = candidate_feature_vector(
            state,
            player,
            unit,
            (unit.x, unit.y),
            None,
            "wait",
            danger_map,
            heuristic,
            rusher_uid,
        )
        candidates.append(ActionCandidate("wait", (unit.x, unit.y), None, features, heuristic))

    return candidates


def execute_candidate(state, unit, candidate: ActionCandidate, rng):
    if candidate.move_to != (unit.x, unit.y):
        do_move(state, unit.uid, candidate.move_to[0], candidate.move_to[1])

    if candidate.kind.endswith("capture"):
        do_capture(state, unit.uid)
        return

    if "attack" in candidate.kind and candidate.target_uid is not None:
        do_attack(state, rng, unit.uid, candidate.target_uid)
        return

    do_wait(state, unit.uid)


def immediate_reward(
    before: tuple[int, int, int, int],
    after: tuple[int, int, int, int],
    player: int,
    unit,
    candidate: ActionCandidate,
    state,
):
    own_hp_before, enemy_hp_before, own_count_before, enemy_count_before = before
    own_hp_after, enemy_hp_after, own_count_after, enemy_count_after = after

    hp_swing = (enemy_hp_before - enemy_hp_after) - 0.7 * (own_hp_before - own_hp_after)
    kill_swing = (enemy_count_before - enemy_count_after) - 0.5 * (own_count_before - own_count_after)
    reward = hp_swing + kill_swing * 3.0

    if candidate.kind.endswith("capture"):
        reward += 4.0
        building = find_building(state, unit.x, unit.y)
        if building and building.owner == player:
            reward += 8.0
            if building.building_type == "hq":
                reward += 18.0

    if state.winner == player:
        reward += 20.0
    elif state.winner is not None and state.winner == state.other_player(player):
        reward -= 20.0

    return reward


def store_transition(
    transitions: list[dict],
    board_tensor: torch.Tensor,
    candidate_tensor: torch.Tensor,
    heuristic_tensor: torch.Tensor,
    action_index: torch.Tensor | int,
    reward: float,
    teacher_index: int,
    temperature: float,
) -> None:
    transitions.append(
        {
            "board_tensor": board_tensor.detach(),
            "candidate_tensor": candidate_tensor.detach(),
            "heuristic_tensor": heuristic_tensor.detach(),
            "action_index": int(action_index.item()) if isinstance(action_index, torch.Tensor) else int(action_index),
            "reward": float(reward),
            "teacher_index": teacher_index,
            "temperature": float(temperature),
        }
    )


class ResidualBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return F.relu(out + residual)


class PolicyValueNet(nn.Module):
    def __init__(self, feature_dim: int):
        super().__init__()
        self.board_encoder = nn.Sequential(
            nn.Conv2d(BOARD_CHANNELS, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            ResidualBlock(64),
            ResidualBlock(64),
            ResidualBlock(64),
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
        )
        self.state_proj = nn.Sequential(
            nn.Linear(64, 192),
            nn.ReLU(),
            nn.Linear(192, 192),
            nn.ReLU(),
        )
        self.candidate_proj = nn.Sequential(
            nn.Linear(feature_dim, 192),
            nn.LayerNorm(192),
            nn.ReLU(),
            nn.Linear(192, 192),
            nn.ReLU(),
        )
        self.policy_head = nn.Sequential(
            nn.Linear(384, 192),
            nn.ReLU(),
            nn.Linear(192, 1),
        )
        self.value_head = nn.Sequential(
            nn.Linear(192, 192),
            nn.ReLU(),
            nn.Linear(192, 1),
        )
        self.logit_prior_scale = nn.Parameter(torch.tensor(3.0))
        nn.init.zeros_(self.policy_head[-1].weight)
        nn.init.zeros_(self.policy_head[-1].bias)

    def encode_state(self, board_tensor: torch.Tensor) -> torch.Tensor:
        if board_tensor.dim() == 3:
            board_tensor = board_tensor.unsqueeze(0)
        return self.state_proj(self.board_encoder(board_tensor))

    def score_candidates(
        self,
        state_embedding: torch.Tensor,
        candidate_tensor: torch.Tensor,
        heuristic_prior: torch.Tensor,
        candidate_counts: list[int] | None = None,
    ) -> torch.Tensor:
        if state_embedding.dim() == 1:
            state_embedding = state_embedding.unsqueeze(0)
        candidate_embedding = self.candidate_proj(candidate_tensor)
        if candidate_counts is None:
            expanded_state = state_embedding.expand(candidate_tensor.size(0), -1)
        elif len(candidate_counts) == 1:
            expanded_state = state_embedding.expand(candidate_tensor.size(0), -1)
        else:
            counts = torch.tensor(candidate_counts, device=state_embedding.device, dtype=torch.long)
            expanded_state = state_embedding.repeat_interleave(counts, dim=0)
        joint = torch.cat(
            [candidate_embedding, expanded_state],
            dim=-1,
        )
        logits = self.policy_head(joint).squeeze(-1)
        return logits + self.logit_prior_scale * heuristic_prior

    def predict_value(self, state_embedding: torch.Tensor) -> torch.Tensor:
        if state_embedding.dim() == 1:
            state_embedding = state_embedding.unsqueeze(0)
        return self.value_head(state_embedding).squeeze(-1)

    def forward(self, board_tensor, candidate_tensor, heuristic_prior):
        state_embedding = self.encode_state(board_tensor)
        logits = self.score_candidates(state_embedding, candidate_tensor, heuristic_prior)
        value = self.predict_value(state_embedding)
        return logits, value


class PolicyStrategy:
    def __init__(
        self,
        policy: PolicyValueNet,
        max_width: int,
        max_height: int,
        training: bool,
        temperature: float,
    ):
        self.policy = policy
        self.max_width = max_width
        self.max_height = max_height
        self.training = training
        self.temperature = temperature
        self.name = "policy"
        self.transitions = []

    def play_turn(self, state, player: int, rng: random.Random):
        danger_maps = build_danger_maps(state, player)
        rusher_uid = choose_rusher(state, player)

        for unit in unit_order(state, player, rusher_uid):
            if not unit.alive or unit.has_acted:
                continue

            danger_map = danger_maps[unit.unit_type]

            board_tensor = encode_board(
                state,
                player,
                unit.uid,
                self.max_width,
                self.max_height,
            )
            candidates = enumerate_candidates(state, player, unit, danger_map, rusher_uid)
            candidate_tensor = torch.tensor(
                [candidate.features for candidate in candidates],
                dtype=torch.float32,
                device=device,
            )
            heuristic_tensor = torch.tensor(
                [candidate.heuristic_score for candidate in candidates],
                dtype=torch.float32,
                device=device,
            )
            heuristic_tensor = normalize_heuristics(heuristic_tensor)

            context = torch.enable_grad() if self.training else torch.no_grad()
            with context:
                logits, value = self.policy(board_tensor, candidate_tensor, heuristic_tensor)
                scaled_logits = logits / self.temperature
                distribution = torch.distributions.Categorical(logits=scaled_logits)
                action_index = distribution.sample()

            selected = candidates[action_index.item()]
            before_metrics = current_metrics(state, player)
            execute_candidate(state, unit, selected, rng)
            after_metrics = current_metrics(state, player)

            if self.training:
                teacher_index = int(torch.argmax(heuristic_tensor).item())
                store_transition(
                    self.transitions,
                    board_tensor,
                    candidate_tensor,
                    heuristic_tensor,
                    action_index,
                    immediate_reward(
                        before_metrics,
                        after_metrics,
                        player,
                        unit,
                        selected,
                        state,
                    ),
                    teacher_index,
                    self.temperature,
                )

            if state.winner is not None:
                return


def clear_policy_turn(env: TrainingEnv) -> None:
    env.turn_units = []
    env.turn_cursor = 0
    env.danger_maps = None
    env.rusher_uid = None
    env.turn_player = None


def prepare_policy_turn(env: TrainingEnv, player: int = 1) -> None:
    env.danger_maps = build_danger_maps(env.state, player)
    env.rusher_uid = choose_rusher(env.state, player)
    env.turn_units = unit_order(env.state, player, env.rusher_uid)
    env.turn_cursor = 0
    env.turn_player = player


def spawn_training_env(
    map_name: str,
    seed: int,
    learner_temperature: float,
    snapshot_pool: list[PolicySnapshot],
    self_play_ratio: float,
) -> TrainingEnv:
    opponent_strategy, opponent_policy, opponent_name, opponent_temperature = sample_training_opponent(
        snapshot_pool,
        map_name,
        seed,
        self_play_ratio,
    )
    env = TrainingEnv(
        state=load_map(map_name),
        rng=GameRng(seed),
        learner_temperature=learner_temperature,
        opponent_strategy=opponent_strategy,
        opponent_policy=opponent_policy,
        opponent_name=opponent_name,
        opponent_temperature=opponent_temperature,
    )
    prepare_policy_turn(env)
    return env


def sample_training_opponent_spec(
    snapshot_pool: list[PolicySnapshot],
    map_name: str,
    seed: int,
    self_play_ratio: float,
) -> tuple[str, str, float]:
    if snapshot_pool and random.random() < self_play_ratio:
        snapshot = random.choice(snapshot_pool)
        return "snapshot", snapshot.name, evaluation_temperature(map_name)

    heuristic_name = make_ensemble_opponent(map_name, seed)
    return "heuristic", heuristic_name, evaluation_temperature(map_name)


def spawn_worker_training_env(
    map_name: str,
    seed: int,
    learner_temperature: float,
    opponent_kind: str,
    opponent_name: str,
    opponent_temperature: float,
) -> TrainingEnv:
    opponent_strategy = resolve_heuristic_strategy(opponent_name) if opponent_kind == "heuristic" else None
    opponent_policy = opponent_name if opponent_kind == "snapshot" else None
    env = TrainingEnv(
        state=load_map(map_name),
        rng=GameRng(seed),
        learner_temperature=learner_temperature,
        opponent_strategy=opponent_strategy,
        opponent_policy=opponent_policy,
        opponent_name=opponent_name,
        opponent_temperature=opponent_temperature,
    )
    prepare_policy_turn(env)
    return env


def remote_request_payload(
    worker_id: int,
    request: PolicyDecisionRequest,
    flush_transitions: list[dict] | None,
) -> dict:
    policy_key = request.policy if isinstance(request.policy, str) else LEARNER_POLICY_KEY
    return {
        "type": "policy_request",
        "worker_id": worker_id,
        "policy_key": policy_key,
        "board_tensor": request.board_tensor.cpu(),
        "candidate_tensor": request.candidate_tensor.cpu(),
        "heuristic_tensor": request.heuristic_tensor.cpu(),
        "temperature": request.temperature,
        "flush_transitions": flush_transitions,
    }


def apply_single_policy_decision(request: PolicyDecisionRequest, action_index: int) -> None:
    selected = request.candidates[action_index]
    execute_candidate(request.env.state, request.unit, selected, request.env.rng)
    after_metrics = current_metrics(request.env.state, request.player)

    if request.record_transition:
        store_transition(
            request.env.transitions,
            request.board_tensor,
            request.candidate_tensor,
            request.heuristic_tensor,
            action_index,
            immediate_reward(
                request.before_metrics,
                after_metrics,
                request.player,
                request.unit,
                selected,
                request.env.state,
            ),
            request.teacher_index,
            request.temperature,
        )


def worker_next_message(
    worker_id: int,
    env: TrainingEnv,
    max_width: int,
    max_height: int,
    rollout_fragment_steps: int,
) -> tuple[dict, PolicyDecisionRequest | None]:
    request = ensure_policy_request(env, max_width, max_height, LEARNER_POLICY_KEY)
    if request is None:
        transitions = env.transitions
        env.transitions = []
        return (
            {
                "type": "game_complete",
                "worker_id": worker_id,
                "winner": env.state.winner,
                "transitions": transitions,
            },
            None,
        )

    flush_transitions = None
    if request.record_transition and len(env.transitions) >= rollout_fragment_steps:
        flush_transitions = env.transitions
        env.transitions = []

    return remote_request_payload(worker_id, request, flush_transitions), request


def simulation_worker_main(
    connection,
    worker_id: int,
    max_width: int,
    max_height: int,
    rollout_fragment_steps: int,
) -> None:
    global device
    device = torch.device("cpu")
    seed_everything(BASE_SEED + worker_id)
    env = None
    pending_request = None

    while True:
        message = connection.recv()
        command = message["type"]

        if command == "shutdown":
            break

        if command == "start_env":
            env = spawn_worker_training_env(
                map_name=message["map_name"],
                seed=message["seed"],
                learner_temperature=message["learner_temperature"],
                opponent_kind=message["opponent_kind"],
                opponent_name=message["opponent_name"],
                opponent_temperature=message["opponent_temperature"],
            )
            outgoing, pending_request = worker_next_message(
                worker_id,
                env,
                max_width,
                max_height,
                rollout_fragment_steps,
            )
            connection.send(outgoing)
            continue

        if command == "action":
            if env is None or pending_request is None:
                raise RuntimeError("Worker received action without a pending request")
            apply_single_policy_decision(pending_request, int(message["action_index"]))
            outgoing, pending_request = worker_next_message(
                worker_id,
                env,
                max_width,
                max_height,
                rollout_fragment_steps,
            )
            connection.send(outgoing)
            continue

        raise ValueError(f"Unknown worker command: {command}")


def next_policy_request(
    env: TrainingEnv,
    max_width: int,
    max_height: int,
    player: int,
    policy,
    temperature: float,
    record_transition: bool,
) -> PolicyDecisionRequest | None:
    while env.turn_cursor < len(env.turn_units):
        unit = env.turn_units[env.turn_cursor]
        env.turn_cursor += 1
        if not unit.alive or unit.has_acted:
            continue

        danger_map = env.danger_maps[unit.unit_type]
        candidates = enumerate_candidates(env.state, player, unit, danger_map, env.rusher_uid)
        candidate_tensor = torch.tensor(
            [candidate.features for candidate in candidates],
            dtype=torch.float32,
            device=device,
        )
        heuristic_tensor = torch.tensor(
            [candidate.heuristic_score for candidate in candidates],
            dtype=torch.float32,
            device=device,
        )
        heuristic_tensor = normalize_heuristics(heuristic_tensor)

        return PolicyDecisionRequest(
            env=env,
            player=player,
            policy=policy,
            unit=unit,
            board_tensor=encode_board(env.state, player, unit.uid, max_width, max_height),
            candidate_tensor=candidate_tensor,
            heuristic_tensor=heuristic_tensor,
            candidates=candidates,
            before_metrics=current_metrics(env.state, player),
            temperature=temperature,
            record_transition=record_transition,
            teacher_index=int(torch.argmax(heuristic_tensor).item()) if record_transition else 0,
        )

    return None


def _check_turn_limit(state) -> bool:
    if state.winner is None and state.round_num >= MAX_TRAINING_TURNS:
        state.winner = -1
        return True
    return False


def ensure_policy_request(
    env: TrainingEnv,
    max_width: int,
    max_height: int,
    learner_policy: "PolicyValueNet",
) -> PolicyDecisionRequest | None:
    while env.state.winner is None:
        player = env.state.current_player
        if player == 1:
            if env.turn_player != player or env.danger_maps is None:
                clear_policy_turn(env)
                prepare_policy_turn(env, player)
            request = next_policy_request(
                env,
                max_width,
                max_height,
                player=1,
                policy=learner_policy,
                temperature=env.learner_temperature,
                record_transition=True,
            )
        elif env.opponent_policy is not None:
            if env.turn_player != player or env.danger_maps is None:
                clear_policy_turn(env)
                prepare_policy_turn(env, player)
            request = next_policy_request(
                env,
                max_width,
                max_height,
                player=player,
                policy=env.opponent_policy,
                temperature=env.opponent_temperature,
                record_transition=False,
            )
        else:
            clear_policy_turn(env)
            play_heuristic_turn(env.state, player, env.opponent_strategy, env.rng)
            if env.state.winner is None:
                end_turn(env.state)
            _check_turn_limit(env.state)
            continue

        if request is not None:
            return request

        clear_policy_turn(env)
        if env.state.winner is None:
            end_turn(env.state)
        _check_turn_limit(env.state)

    return None


def batched_policy_decisions(requests: list[PolicyDecisionRequest]):
    if not requests:
        return []

    decisions = []
    grouped_requests = {}
    for request in requests:
        grouped_requests.setdefault(id(request.policy), []).append(request)

    for grouped in grouped_requests.values():
        policy = grouped[0].policy
        board_batch = torch.stack([tensor_on_device(request.board_tensor) for request in grouped], dim=0)
        candidate_batch = torch.cat([tensor_on_device(request.candidate_tensor) for request in grouped], dim=0)
        heuristic_batch = torch.cat([tensor_on_device(request.heuristic_tensor) for request in grouped], dim=0)
        candidate_counts = [request.candidate_tensor.size(0) for request in grouped]

        context = torch.enable_grad() if any(request.record_transition for request in grouped) else torch.no_grad()
        with context:
            state_embeddings = policy.encode_state(board_batch)
            flat_logits = policy.score_candidates(
                state_embeddings,
                candidate_batch,
                heuristic_batch,
                candidate_counts,
            )
            values = policy.predict_value(state_embeddings)

        offset = 0
        for idx, request in enumerate(grouped):
            count = candidate_counts[idx]
            logits = flat_logits[offset : offset + count]
            distribution = torch.distributions.Categorical(logits=logits / request.temperature)
            action_index = distribution.sample()
            decisions.append((request, logits, values[idx], distribution, action_index))
            offset += count

    return decisions


def apply_policy_decisions(decisions) -> None:
    for request, logits, value, distribution, action_index in decisions:
        selected = request.candidates[action_index.item()]
        execute_candidate(request.env.state, request.unit, selected, request.env.rng)
        after_metrics = current_metrics(request.env.state, request.player)

        if request.record_transition:
            store_transition(
                request.env.transitions,
                request.board_tensor,
                request.candidate_tensor,
                request.heuristic_tensor,
                action_index,
                immediate_reward(
                    request.before_metrics,
                    after_metrics,
                    request.player,
                    request.unit,
                    selected,
                    request.env.state,
                ),
                request.teacher_index,
                request.temperature,
            )


def start_simulation_worker_pool(
    num_workers: int,
    max_width: int,
    max_height: int,
    rollout_fragment_steps: int,
) -> SimulationWorkerPool:
    ctx = mp.get_context("spawn")
    processes = {}
    connections = {}

    for worker_id in range(num_workers):
        parent_conn, child_conn = ctx.Pipe()
        process = ctx.Process(
            target=simulation_worker_main,
            args=(child_conn, worker_id, max_width, max_height, rollout_fragment_steps),
            daemon=True,
        )
        process.start()
        child_conn.close()
        processes[worker_id] = process
        connections[worker_id] = parent_conn

    return SimulationWorkerPool(
        ctx=ctx,
        processes=processes,
        connections=connections,
        idle_workers=set(processes.keys()),
        next_worker_id=num_workers,
    )


def shutdown_simulation_worker_pool(worker_pool: SimulationWorkerPool | None) -> None:
    if worker_pool is None:
        return

    for connection in worker_pool.connections.values():
        try:
            connection.send({"type": "shutdown"})
        except (BrokenPipeError, EOFError):
            pass

    for connection in worker_pool.connections.values():
        try:
            connection.close()
        except OSError:
            pass

    for process in worker_pool.processes.values():
        process.join(timeout=1.0)
        if process.is_alive():
            process.kill()


def maybe_start_worker_env(
    worker_pool: SimulationWorkerPool,
    worker_id: int,
    map_names: list[str],
    snapshot_pool: list[PolicySnapshot],
    self_play_ratio: float,
    temperature: float,
) -> None:
    if worker_id not in worker_pool.idle_workers:
        return

    map_name = random.choice(map_names)
    seed = random.randint(0, 1_000_000)
    opponent_kind, opponent_name, opponent_temperature = sample_training_opponent_spec(
        snapshot_pool,
        map_name,
        seed,
        self_play_ratio,
    )
    worker_pool.connections[worker_id].send(
        {
            "type": "start_env",
            "map_name": map_name,
            "seed": seed,
            "learner_temperature": temperature,
            "opponent_kind": opponent_kind,
            "opponent_name": opponent_name,
            "opponent_temperature": opponent_temperature,
        }
    )
    worker_pool.idle_workers.discard(worker_id)


def batched_remote_policy_decisions(
    pending_requests: dict[int, dict],
    policy_registry: dict[str, PolicyValueNet],
):
    if not pending_requests:
        return []

    decisions = []
    grouped_requests = {}
    for request in pending_requests.values():
        grouped_requests.setdefault(request["policy_key"], []).append(request)

    for policy_key, grouped in grouped_requests.items():
        policy = policy_registry[policy_key]
        board_batch = torch.stack([tensor_on_device(request["board_tensor"]) for request in grouped], dim=0)
        candidate_batch = torch.cat([tensor_on_device(request["candidate_tensor"]) for request in grouped], dim=0)
        heuristic_batch = torch.cat([tensor_on_device(request["heuristic_tensor"]) for request in grouped], dim=0)
        candidate_counts = [request["candidate_tensor"].size(0) for request in grouped]

        with torch.no_grad():
            state_embeddings = policy.encode_state(board_batch)
            flat_logits = policy.score_candidates(
                state_embeddings,
                candidate_batch,
                heuristic_batch,
                candidate_counts,
            )
            values = policy.predict_value(state_embeddings)

        offset = 0
        for idx, request in enumerate(grouped):
            count = candidate_counts[idx]
            logits = flat_logits[offset : offset + count]
            distribution = torch.distributions.Categorical(logits=logits / request["temperature"])
            action_index = int(distribution.sample().item())
            decisions.append((request, values[idx].detach(), action_index))
            offset += count

    return decisions


def estimate_request_value(policy: PolicyValueNet, request: PolicyDecisionRequest) -> torch.Tensor:
    board_tensor, candidate_tensor, heuristic_tensor = request_tensors_on_device(request)
    with torch.no_grad():
        _, value = policy(
            board_tensor,
            candidate_tensor,
            heuristic_tensor,
        )
    return value.squeeze(0).detach()


def update_rollout(
    policy: PolicyValueNet,
    transitions,
    player: int,
    optimizer,
    imitation_weight: float,
    bootstrap_value: torch.Tensor | None = None,
    winner: int | None = None,
):
    if not transitions:
        return

    if winner == player:
        transitions[-1]["reward"] += 12.0
    elif winner is not None and winner > 0:
        transitions[-1]["reward"] -= 12.0

    recomputed = []
    for transition in transitions:
        board_tensor, candidate_tensor, heuristic_tensor = transition_tensors_on_device(transition)
        logits, value = policy(
            board_tensor,
            candidate_tensor,
            heuristic_tensor,
        )
        value = value.squeeze(0)
        distribution = torch.distributions.Categorical(
            logits=logits / transition["temperature"],
        )
        recomputed.append(
            {
                "logits": logits,
                "value": value,
                "distribution": distribution,
                "action_index": torch.tensor(transition["action_index"], device=device, dtype=torch.long),
                "reward": transition["reward"],
                "teacher_index": transition["teacher_index"],
            }
        )

    returns = []
    advantages = []
    gae = torch.zeros((), dtype=torch.float32, device=device)
    next_value = bootstrap_value if bootstrap_value is not None else torch.zeros((), dtype=torch.float32, device=device)

    for transition in reversed(recomputed):
        reward = torch.tensor(transition["reward"], dtype=torch.float32, device=device)
        value = transition["value"]
        delta = reward + GAMMA * next_value - value
        gae = delta + GAMMA * LAMBDA * gae
        advantages.append(gae)
        returns.append(gae + value)
        next_value = value.detach()

    advantages.reverse()
    returns.reverse()
    advantage_tensor = torch.stack(advantages)
    return_tensor = torch.stack(returns).detach()
    advantage_tensor = (advantage_tensor - advantage_tensor.mean()) / (advantage_tensor.std(unbiased=False) + 1e-6)

    policy_loss = torch.zeros((), dtype=torch.float32, device=device)
    value_loss = torch.zeros((), dtype=torch.float32, device=device)
    entropy_bonus = torch.zeros((), dtype=torch.float32, device=device)
    imitation_loss = torch.zeros((), dtype=torch.float32, device=device)

    for idx, transition in enumerate(recomputed):
        policy_loss = policy_loss - transition["distribution"].log_prob(transition["action_index"]) * advantage_tensor[idx].detach()
        value_loss = value_loss + F.smooth_l1_loss(transition["value"], return_tensor[idx])
        entropy_bonus = entropy_bonus + transition["distribution"].entropy()
        target = torch.tensor([transition["teacher_index"]], device=device)
        imitation_loss = imitation_loss + F.cross_entropy(transition["logits"].unsqueeze(0), target)

    count = float(len(transitions))
    loss = (
        policy_loss / count
        + VALUE_WEIGHT * (value_loss / count)
        + imitation_weight * (imitation_loss / count)
        - ENTROPY_WEIGHT * (entropy_bonus / count)
    )

    optimizer.zero_grad(set_to_none=True)
    loss.backward()
    params = [param for group in optimizer.param_groups for param in group["params"]]
    torch.nn.utils.clip_grad_norm_(params, 1.0)
    optimizer.step()


def maybe_update_rollout_fragment(
    env: TrainingEnv,
    request: PolicyDecisionRequest,
    policy: PolicyValueNet,
    optimizer,
    imitation_weight: float,
    rollout_fragment_steps: int,
) -> bool:
    if not request.record_transition or len(env.transitions) < rollout_fragment_steps:
        return False

    update_rollout(
        policy,
        env.transitions,
        player=1,
        optimizer=optimizer,
        imitation_weight=imitation_weight,
        bootstrap_value=estimate_request_value(policy, request),
    )
    env.transitions.clear()
    return True


def finalize_finished_envs(active_envs, policy: PolicyValueNet, optimizer, imitation_weight: float):
    remaining_envs = []
    games_completed = 0
    wins = 0
    updates = 0

    for env in active_envs:
        if env.state.winner is None:
            remaining_envs.append(env)
            continue

        if env.transitions:
            update_rollout(
                policy,
                env.transitions,
                player=1,
                optimizer=optimizer,
                imitation_weight=imitation_weight,
                winner=env.state.winner,
            )
            env.transitions.clear()
            updates += 1
        games_completed += 1
        wins += 1 if env.state.winner == 1 else 0

    return remaining_envs, games_completed, wins, updates


def run_parallel_training(
    policy: PolicyValueNet,
    optimizer,
    max_width: int,
    max_height: int,
    map_names: list[str],
    snapshot_pool: list[PolicySnapshot],
    self_play_ratio: float,
    start_time: float,
    train_deadline: float,
    parallel_envs: int,
    active_envs: list[TrainingEnv],
    rollout_fragment_steps: int,
    imitation_weight: float = IMITATION_WEIGHT,
):
    games_played = 0
    wins = 0
    decisions = 0
    batches = 0
    updates = 0

    while time.perf_counter() < train_deadline:
        temperature = max(
            0.22,
            0.70
            - 0.45
            * ((time.perf_counter() - start_time) / max(1.0, train_deadline - start_time)),
        )

        while len(active_envs) < parallel_envs and time.perf_counter() < train_deadline:
            map_name = random.choice(map_names)
            seed = random.randint(0, 1_000_000)
            active_envs.append(
                spawn_training_env(
                    map_name,
                    seed,
                    temperature,
                    snapshot_pool,
                    self_play_ratio,
                )
            )

        requests = []
        for env in active_envs:
            request = ensure_policy_request(env, max_width, max_height, policy)
            if request is not None:
                if maybe_update_rollout_fragment(
                    env,
                    request,
                    policy,
                    optimizer,
                    imitation_weight,
                    rollout_fragment_steps,
                ):
                    updates += 1
                requests.append(request)

        if requests:
            decisions_batch = batched_policy_decisions(requests)
            apply_policy_decisions(decisions_batch)
            decisions += len(decisions_batch)
            batches += 1

        active_envs, completed_games, completed_wins, completed_updates = finalize_finished_envs(
            active_envs,
            policy,
            optimizer,
            imitation_weight,
        )
        games_played += completed_games
        wins += completed_wins
        updates += completed_updates

        if not requests and not active_envs:
            break

    return active_envs, games_played, wins, decisions, batches, updates


def handle_remote_worker_message(
    worker_pool: SimulationWorkerPool,
    message: dict,
    policy: PolicyValueNet,
    optimizer,
    map_names: list[str],
    snapshot_pool: list[PolicySnapshot],
    self_play_ratio: float,
    temperature: float,
    train_deadline: float,
    imitation_weight: float = IMITATION_WEIGHT,
) -> tuple[int, int, int]:
    message_type = message["type"]

    if message_type == "policy_request":
        worker_pool.pending_requests[message["worker_id"]] = message
        return 0, 0, 0

    if message_type == "game_complete":
        updates = 0
        transitions = message.get("transitions", [])
        if transitions:
            update_rollout(
                policy,
                transitions,
                player=1,
                optimizer=optimizer,
                imitation_weight=imitation_weight,
                winner=message["winner"],
            )
            updates += 1
        worker_id = message["worker_id"]
        worker_pool.idle_workers.add(worker_id)
        if time.perf_counter() < train_deadline:
            maybe_start_worker_env(
                worker_pool,
                worker_id,
                map_names,
                snapshot_pool,
                self_play_ratio,
                temperature,
            )
        return 1, 1 if message["winner"] == 1 else 0, updates

    raise ValueError(f"Unknown worker message: {message_type}")


def run_parallel_training_remote(
    policy: PolicyValueNet,
    optimizer,
    max_width: int,
    max_height: int,
    map_names: list[str],
    snapshot_pool: list[PolicySnapshot],
    policy_registry: dict[str, PolicyValueNet],
    self_play_ratio: float,
    start_time: float,
    train_deadline: float,
    parallel_envs: int,
    worker_pool: SimulationWorkerPool | None,
    rollout_fragment_steps: int,
    imitation_weight: float = IMITATION_WEIGHT,
):
    if worker_pool is None:
        worker_pool = start_simulation_worker_pool(
            parallel_envs,
            max_width,
            max_height,
            rollout_fragment_steps,
        )

    games_played = 0
    wins = 0
    decisions = 0
    batches = 0
    updates = 0

    while time.perf_counter() < train_deadline:
        temperature = max(
            0.22,
            0.70
            - 0.45
            * ((time.perf_counter() - start_time) / max(1.0, train_deadline - start_time)),
        )

        for worker_id in list(worker_pool.idle_workers):
            if time.perf_counter() >= train_deadline:
                break
            maybe_start_worker_env(
                worker_pool,
                worker_id,
                map_names,
                snapshot_pool,
                self_play_ratio,
                temperature,
            )

        if worker_pool.pending_requests:
            accumulate_deadline = time.perf_counter() + REMOTE_BATCH_WAIT
            while time.perf_counter() < accumulate_deadline and len(worker_pool.pending_requests) < parallel_envs:
                ready_connections = wait_for_connections(
                    list(worker_pool.connections.values()),
                    timeout=max(0.0, accumulate_deadline - time.perf_counter()),
                )
                if not ready_connections:
                    break
                connection_to_worker = {
                    connection: worker_id
                    for worker_id, connection in worker_pool.connections.items()
                }
                for connection in ready_connections:
                    worker_id = connection_to_worker[connection]
                    batch_games, batch_wins, batch_updates = handle_remote_worker_message(
                        worker_pool,
                        connection.recv(),
                        policy,
                        optimizer,
                        map_names,
                        snapshot_pool,
                        self_play_ratio,
                        temperature,
                        train_deadline,
                        imitation_weight,
                    )
                    games_played += batch_games
                    wins += batch_wins
                    updates += batch_updates
            decisions_batch = batched_remote_policy_decisions(worker_pool.pending_requests, policy_registry)
            for request, bootstrap_value, action_index in decisions_batch:
                flush_transitions = request.get("flush_transitions")
                if flush_transitions:
                    update_rollout(
                        policy,
                        flush_transitions,
                        player=1,
                        optimizer=optimizer,
                        imitation_weight=imitation_weight,
                        bootstrap_value=bootstrap_value,
                    )
                    updates += 1
                worker_id = request["worker_id"]
                worker_pool.connections[worker_id].send(
                    {"type": "action", "action_index": action_index}
                )
                del worker_pool.pending_requests[worker_id]
            decisions += len(decisions_batch)
            batches += 1
            continue

        ready_connections = wait_for_connections(
            list(worker_pool.connections.values()),
            timeout=max(0.0, min(0.05, train_deadline - time.perf_counter())),
        )
        if not ready_connections:
            if worker_pool.idle_workers == set(worker_pool.connections.keys()):
                break
            continue

        connection_to_worker = {
            connection: worker_id
            for worker_id, connection in worker_pool.connections.items()
        }
        for connection in ready_connections:
            batch_games, batch_wins, batch_updates = handle_remote_worker_message(
                worker_pool,
                connection.recv(),
                policy,
                optimizer,
                map_names,
                snapshot_pool,
                self_play_ratio,
                temperature,
                train_deadline,
                imitation_weight,
            )
            games_played += batch_games
            wins += batch_wins
            updates += batch_updates

    return worker_pool, games_played, wins, decisions, batches, updates


def evaluate_snapshot_pool(
    policy,
    max_width: int,
    max_height: int,
    snapshots: list[PolicySnapshot],
    map_names: list[str],
    seeds: list[int],
    max_games: int | None = None,
) -> float:
    if not snapshots:
        return 0.0

    was_training = policy.training
    policy.eval()
    wins = 0
    games = 0

    try:
        eval_snapshots = snapshots[-SNAPSHOT_EVAL_COUNT:]
        eval_maps = map_names[:SNAPSHOT_EVAL_MAPS] or map_names

        for snapshot in eval_snapshots:
            if max_games is not None and games >= max_games:
                break
            for map_name in eval_maps:
                if max_games is not None and games >= max_games:
                    break
                temperature = evaluation_temperature(map_name)
                for seed in seeds:
                    if max_games is not None and games >= max_games:
                        break
                    learner_first = PolicyStrategy(
                        policy=policy,
                        max_width=max_width,
                        max_height=max_height,
                        training=False,
                        temperature=temperature,
                    )
                    snapshot_second = PolicyStrategy(
                        policy=snapshot.policy,
                        max_width=max_width,
                        max_height=max_height,
                        training=False,
                        temperature=temperature,
                    )
                    result = run_game(
                        learner_first,
                        snapshot_second,
                        map_name,
                        seed,
                        verbose=False,
                        replay=False,
                    )
                    wins += 1 if result.winner == 1 else 0
                    games += 1
                    if max_games is not None and games >= max_games:
                        break

                    snapshot_first = PolicyStrategy(
                        policy=snapshot.policy,
                        max_width=max_width,
                        max_height=max_height,
                        training=False,
                        temperature=temperature,
                    )
                    learner_second = PolicyStrategy(
                        policy=policy,
                        max_width=max_width,
                        max_height=max_height,
                        training=False,
                        temperature=temperature,
                    )
                    swapped_result = run_game(
                        snapshot_first,
                        learner_second,
                        map_name,
                        seed + 50_000,
                        verbose=False,
                        replay=False,
                    )
                    wins += 1 if swapped_result.winner == 2 else 0
                    games += 1
    finally:
        policy.train(was_training)

    return wins / max(1, games)


def evaluate_fixed(
    policy,
    max_width: int,
    max_height: int,
    map_names: list[str],
    seeds: list[int],
    max_games: int | None = None,
) -> float:
    seed_everything(1337)
    wins = 0
    games = 0
    was_training = policy.training
    policy.eval()

    try:
        for map_name in map_names:
            if max_games is not None and games >= max_games:
                break
            for seed in seeds:
                if max_games is not None and games >= max_games:
                    break
                strategy = PolicyStrategy(
                    policy=policy,
                    max_width=max_width,
                    max_height=max_height,
                    training=False,
                    temperature=evaluation_temperature(map_name),
                )
                result = run_game(
                    strategy,
                    make_ensemble_opponent(map_name, seed),
                    map_name,
                    seed,
                    verbose=False,
                    replay=False,
                )
                wins += 1 if result.winner == 1 else 0
                games += 1
    finally:
        policy.train(was_training)

    return wins / max(1, games)


def evaluate_until_deadline(policy, max_width: int, max_height: int, map_names: list[str], deadline: float) -> float:
    seed_everything(1337)
    wins = 0
    games = 0
    seed = 10_000
    map_index = 0
    was_training = policy.training
    policy.eval()

    remaining = deadline - time.perf_counter()
    try:
        while time.perf_counter() + 0.6 < deadline:
            map_name = map_names[map_index % len(map_names)]
            strategy = PolicyStrategy(
                policy=policy,
                max_width=max_width,
                max_height=max_height,
                training=False,
                temperature=evaluation_temperature(map_name),
            )
            result = run_game(
                strategy,
                make_ensemble_opponent(map_name, seed),
                map_name,
                seed,
                verbose=False,
                replay=False,
            )
            wins += 1 if result.winner == 1 else 0
            games += 1
            seed += 1
            map_index += 1
    finally:
        policy.train(was_training)

    if games == 0:
        print(f"WARNING: final eval played 0 games (budget was {remaining:.1f}s)")
    return wins / max(1, games)


def make_run_record(
    *,
    seed: int,
    resumed_from: str | None,
    checkpoint_file: str | None,
    duration: float,
    final_eval_budget: float,
    validation_interval: float,
    parallel_envs: int,
    sim_workers: int,
    self_play_ratio: float,
    rollout_fragment_steps: int,
    validation_heuristic_games: int,
    validation_self_play_games: int,
    games_played: int,
    wins: int,
    decisions: int,
    updates: int,
    batches: int,
    best_self_play_score: float,
    best_heuristic_score: float,
    final_win_rate: float,
    snapshot_count: int,
    completed_runs: int,
) -> dict:
    return {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "seed": seed,
        "device": str(device),
        "resumed_from": resumed_from,
        "checkpoint_file": checkpoint_file,
        "completed_runs": completed_runs,
        "duration": duration,
        "final_eval_budget": final_eval_budget,
        "validation_interval": validation_interval,
        "parallel_envs": parallel_envs,
        "sim_workers": sim_workers,
        "self_play_ratio": self_play_ratio,
        "rollout_fragment_steps": rollout_fragment_steps,
        "validation_heuristic_games": validation_heuristic_games,
        "validation_self_play_games": validation_self_play_games,
        "games_played": games_played,
        "train_win_rate": wins / max(1, games_played),
        "decisions": decisions,
        "updates": updates,
        "avg_batch": decisions / max(1, batches),
        "best_self_play_validation": best_self_play_score,
        "best_heuristic_validation": best_heuristic_score,
        "final_win_rate": final_win_rate,
        "snapshot_count": snapshot_count,
    }


def train(
    duration: float = TOTAL_DURATION,
    final_eval_budget: float = FINAL_EVAL_BUDGET,
    validation_interval: float = VALIDATION_INTERVAL,
    parallel_envs: int | None = None,
    sim_workers: int = DEFAULT_SIM_WORKERS,
    self_play_ratio: float = DEFAULT_SELF_PLAY_RATIO,
    rollout_fragment_steps: int = DEFAULT_ROLLOUT_FRAGMENT_STEPS,
    validation_heuristic_games: int = DEFAULT_VALIDATION_HEURISTIC_GAMES,
    validation_self_play_games: int = DEFAULT_VALIDATION_SELF_PLAY_GAMES,
    checkpoint_dir: str | None = DEFAULT_CHECKPOINT_DIR,
    resume: bool = True,
    seed: int | None = None,
):
    if device.type == "cuda":
        torch.set_float32_matmul_precision("high")
    if parallel_envs is None:
        parallel_envs = default_parallel_envs()
    parallel_envs = max(1, parallel_envs)
    sim_workers = max(0, sim_workers)
    if sim_workers > 0:
        parallel_envs = min(parallel_envs, sim_workers)

    map_names = list_maps()
    if not map_names:
        print("No maps found.")
        return

    max_width, max_height = compute_board_limits(map_names)
    initial_state = load_map(map_names[0])
    initial_unit = initial_state.player_units(1)[0]
    initial_danger = build_danger_maps(initial_state, 1)[initial_unit.unit_type]
    sample_features = len(
        candidate_feature_vector(
            initial_state,
            1,
            initial_unit,
            (initial_unit.x, initial_unit.y),
            None,
            "wait",
            initial_danger,
            0.0,
            None,
        )
    )

    checkpoint_file = checkpoint_path(checkpoint_dir)
    resume_state = load_training_checkpoint(checkpoint_dir, sample_features) if resume else None
    previous_runs = int(resume_state.get("completed_runs", 0)) if resume_state else 0
    run_seed = seed if seed is not None else BASE_SEED + previous_runs
    seed_everything(run_seed)

    policy = PolicyValueNet(sample_features).to(device)
    optimizer = optim.AdamW(policy.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)

    if resume_state is not None:
        policy.load_state_dict(resume_state["policy_state"])

    validation_maps = map_names[::3] or map_names
    validation_seeds = [3]
    best_heuristic_score = evaluate_fixed(
        policy,
        max_width,
        max_height,
        validation_maps,
        validation_seeds,
        max_games=validation_heuristic_games,
    )
    best_heuristic_score = float(
        max(best_heuristic_score, resume_state.get("best_heuristic_score", 0.0))
    ) if resume_state else best_heuristic_score
    snapshot_pool_for_eval: list[PolicySnapshot] = list(resume_state.get("snapshot_pool", [])) if resume_state else []
    best_self_play_score = evaluate_snapshot_pool(
        policy,
        max_width,
        max_height,
        snapshot_pool_for_eval,
        validation_maps,
        validation_seeds,
        max_games=validation_self_play_games,
    ) if snapshot_pool_for_eval else 0.0
    best_metric = (best_self_play_score, best_heuristic_score)
    best_state = copy.deepcopy(policy.state_dict())
    snapshot_pool: list[PolicySnapshot] = list(resume_state.get("snapshot_pool", [])) if resume_state else []
    policy_registry = {LEARNER_POLICY_KEY: policy}
    for snapshot in snapshot_pool:
        policy_registry[snapshot.name] = snapshot.policy
    snapshot_generation = int(resume_state.get("snapshot_generation", 0)) if resume_state else 0
    if self_play_ratio > 0.0:
        if not snapshot_pool:
            snapshot = add_snapshot(
                snapshot_pool,
                policy,
                self_play_score=best_self_play_score,
                heuristic_score=best_heuristic_score,
                generation=snapshot_generation,
            )
            policy_registry[snapshot.name] = snapshot.policy
    start_time = time.perf_counter()
    deadline = start_time + duration
    train_deadline = deadline - final_eval_budget
    next_validation = start_time + validation_interval

    games_played = 0
    wins = 0
    decisions = 0
    batches = 0
    updates = 0
    active_envs: list[TrainingEnv] = []
    worker_pool: SimulationWorkerPool | None = None

    print(f"Using device: {device}")
    print(f"Run seed: {run_seed}")
    print(f"Parallel envs: {parallel_envs}")
    if sim_workers > 0:
        print(f"Sim workers: {sim_workers}")
    if resume_state is not None and checkpoint_file is not None:
        print(
            f"Resuming from {checkpoint_file} "
            f"(runs={previous_runs}, best_self_play={best_self_play_score:.3f}, best_heuristic={best_heuristic_score:.3f})"
        )
    elif checkpoint_file is not None:
        print(f"Checkpoint dir: {checkpoint_file.parent}")
    print(f"Starting {duration:.0f}-second training run...")

    try:
        while time.perf_counter() < train_deadline:
            policy.train()
            progress = (time.perf_counter() - start_time) / max(1.0, train_deadline - start_time)
            imitation_weight = IMITATION_WEIGHT * max(0.05, 1.0 - progress)
            if sim_workers > 0:
                worker_pool, batch_games, batch_wins, batch_decisions, batch_count, batch_updates = run_parallel_training_remote(
                    policy=policy,
                    optimizer=optimizer,
                    max_width=max_width,
                    max_height=max_height,
                    map_names=map_names,
                    snapshot_pool=snapshot_pool,
                    policy_registry=policy_registry,
                    self_play_ratio=self_play_ratio,
                    start_time=start_time,
                    train_deadline=min(train_deadline, next_validation),
                    parallel_envs=parallel_envs,
                    worker_pool=worker_pool,
                    rollout_fragment_steps=rollout_fragment_steps,
                    imitation_weight=imitation_weight,
                )
            else:
                active_envs, batch_games, batch_wins, batch_decisions, batch_count, batch_updates = run_parallel_training(
                    policy=policy,
                    optimizer=optimizer,
                    max_width=max_width,
                    max_height=max_height,
                    map_names=map_names,
                    snapshot_pool=snapshot_pool,
                    self_play_ratio=self_play_ratio,
                    start_time=start_time,
                    train_deadline=min(train_deadline, next_validation),
                    parallel_envs=parallel_envs,
                    active_envs=active_envs,
                    rollout_fragment_steps=rollout_fragment_steps,
                    imitation_weight=imitation_weight,
                )
            games_played += batch_games
            wins += batch_wins
            decisions += batch_decisions
            batches += batch_count
            updates += batch_updates

            now = time.perf_counter()
            if now >= next_validation:
                heuristic_score = evaluate_fixed(
                    policy,
                    max_width,
                    max_height,
                    validation_maps,
                    validation_seeds,
                    max_games=validation_heuristic_games,
                )
                self_play_score = evaluate_snapshot_pool(
                    policy,
                    max_width,
                    max_height,
                    snapshot_pool,
                    validation_maps,
                    validation_seeds,
                    max_games=validation_self_play_games,
                )
                metric = (self_play_score if snapshot_pool else 0.0, heuristic_score)
                if not snapshot_pool or metric > best_metric:
                    best_metric = metric
                    best_self_play_score, best_heuristic_score = metric
                    best_state = copy.deepcopy(policy.state_dict())
                snapshot_generation += 1
                snapshot = add_snapshot(
                    snapshot_pool,
                    policy,
                    self_play_score,
                    heuristic_score,
                    snapshot_generation,
                )
                policy_registry[snapshot.name] = snapshot.policy
                print(
                    f"[{now - start_time:6.1f}s] "
                    f"games={games_played:4d} train_win_rate={wins / max(1, games_played):.3f} "
                    f"decisions={decisions:5d} updates={updates:4d} avg_batch={decisions / max(1, batches):.1f} "
                    f"heuristic={heuristic_score:.3f} self_play={self_play_score:.3f} "
                    f"best_self_play={best_self_play_score:.3f} snapshots={len(snapshot_pool)}"
                )
                next_validation += validation_interval

        policy.load_state_dict(best_state)
        eval_deadline = max(deadline, time.perf_counter() + final_eval_budget)
        final_win_rate = evaluate_until_deadline(policy, max_width, max_height, map_names, eval_deadline)

        while time.perf_counter() < deadline:
            time.sleep(0.01)
    finally:
        shutdown_simulation_worker_pool(worker_pool)

    completed_runs = previous_runs + 1
    checkpoint_file_str = str(checkpoint_file) if checkpoint_file is not None else None
    resumed_from = checkpoint_file_str if resume_state is not None else None
    run_record = make_run_record(
        seed=run_seed,
        resumed_from=resumed_from,
        checkpoint_file=checkpoint_file_str,
        duration=duration,
        final_eval_budget=final_eval_budget,
        validation_interval=validation_interval,
        parallel_envs=parallel_envs,
        sim_workers=sim_workers,
        self_play_ratio=self_play_ratio,
        rollout_fragment_steps=rollout_fragment_steps,
        validation_heuristic_games=validation_heuristic_games,
        validation_self_play_games=validation_self_play_games,
        games_played=games_played,
        wins=wins,
        decisions=decisions,
        updates=updates,
        batches=batches,
        best_self_play_score=best_self_play_score,
        best_heuristic_score=best_heuristic_score,
        final_win_rate=final_win_rate,
        snapshot_count=len(snapshot_pool),
        completed_runs=completed_runs,
    )
    saved_checkpoint = save_training_checkpoint(
        checkpoint_dir,
        best_state=best_state,
        best_self_play_score=best_self_play_score,
        best_heuristic_score=best_heuristic_score,
        snapshot_pool=snapshot_pool,
        snapshot_generation=snapshot_generation,
        sample_features=sample_features,
        completed_runs=completed_runs,
        run_record=run_record,
    )
    append_history(checkpoint_dir, run_record)
    write_last_run(checkpoint_dir, run_record)

    if snapshot_pool:
        print(f"Best self-play validation: {best_self_play_score:.4f}")
    print(f"Final win rate: {final_win_rate:.4f}")
    if saved_checkpoint is not None:
        print(f"Saved checkpoint: {saved_checkpoint}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train a Hashfront policy with batched multi-game rollouts")
    parser.add_argument("--duration", type=float, default=TOTAL_DURATION, help="Total wall-clock budget in seconds")
    parser.add_argument(
        "--final-eval-budget",
        type=float,
        default=FINAL_EVAL_BUDGET,
        help="Reserved wall-clock time for the final evaluation pass",
    )
    parser.add_argument(
        "--validation-interval",
        type=float,
        default=VALIDATION_INTERVAL,
        help="How often to run fixed validation during training",
    )
    parser.add_argument(
        "--parallel-envs",
        type=int,
        default=None,
        help="Number of simultaneous training games (default: device-dependent)",
    )
    parser.add_argument(
        "--sim-workers",
        type=int,
        default=DEFAULT_SIM_WORKERS,
        help="Number of worker processes used for CPU-side simulator parallelism (0 disables it)",
    )
    parser.add_argument(
        "--self-play-ratio",
        type=float,
        default=DEFAULT_SELF_PLAY_RATIO,
        help="Probability of sampling a frozen self-play snapshot opponent for each new training game",
    )
    parser.add_argument(
        "--rollout-fragment-steps",
        type=int,
        default=DEFAULT_ROLLOUT_FRAGMENT_STEPS,
        help="Learner decisions to accumulate before bootstrapped mid-game updates",
    )
    parser.add_argument(
        "--validation-heuristic-games",
        type=int,
        default=DEFAULT_VALIDATION_HEURISTIC_GAMES,
        help="Maximum heuristic validation games to play at each checkpoint",
    )
    parser.add_argument(
        "--validation-self-play-games",
        type=int,
        default=DEFAULT_VALIDATION_SELF_PLAY_GAMES,
        help="Maximum self-play validation games to play at each checkpoint",
    )
    parser.add_argument(
        "--checkpoint-dir",
        type=str,
        default=DEFAULT_CHECKPOINT_DIR,
        help="Directory for the incumbent checkpoint and run history",
    )
    parser.add_argument(
        "--fresh-start",
        action="store_true",
        help="Ignore any existing checkpoint and start from scratch",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Override the training seed (defaults to a deterministic per-run seed)",
    )
    args = parser.parse_args()
    train(
        duration=args.duration,
        final_eval_budget=args.final_eval_budget,
        validation_interval=args.validation_interval,
        parallel_envs=args.parallel_envs,
        sim_workers=args.sim_workers,
        self_play_ratio=args.self_play_ratio,
        rollout_fragment_steps=args.rollout_fragment_steps,
        validation_heuristic_games=args.validation_heuristic_games,
        validation_self_play_games=args.validation_self_play_games,
        checkpoint_dir=args.checkpoint_dir,
        resume=not args.fresh_start,
        seed=args.seed,
    )
