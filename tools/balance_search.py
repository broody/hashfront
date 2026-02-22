#!/usr/bin/env python3
"""
Hashfront Balance Search — Automated parameter tuning via hill-climbing.

Goal: Find unit/economy stats where Aggressive > Rush > Balanced > Aggressive (RPS triangle).
Runs 200 games per matchup, scores against RPS targets, logs results.

Usage: python3 tools/balance_search.py [--dry-run]
"""

import json
import os
import sys
import time
import random
import copy
import fcntl
from pathlib import Path
from datetime import datetime, timezone

# Add tools dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

LOCK_FILE = Path(__file__).parent / ".balance_search.lock"
LOG_FILE = Path(__file__).parent / "balance_log.json"
BEST_FILE = Path(__file__).parent / "balance_best.json"
STATE_FILE = Path(__file__).parent / "balance_state.json"

GAMES_PER_MATCHUP = 200
SEED = 42

# Target win rates for RPS triangle (row beats col)
# aggressive > rush, rush > balanced, balanced > aggressive
# Target: 58-72% for the favored side
RPS_TARGETS = {
    ("aggressive", "rush"): (58, 72),      # aggressive should beat rush
    ("rush", "balanced"): (58, 72),         # rush should beat balanced
    ("balanced", "aggressive"): (58, 72),   # balanced should beat aggressive
}

# Parameters and their valid ranges
# Constraints enforced in validate_config():
#   Tank HP > Ranger HP >= Infantry HP
#   Tank ATK > Ranger ATK >= Infantry ATK
#   Infantry Move > Ranger Move >= Tank Move
#   Tank Cost > Ranger Cost > Infantry Cost (infantry locked at 1)
PARAM_SPACE = {
    # Infantry: locked stats, only accuracy is tunable
    "infantry_accuracy": (80, 95),
    # Tank: the heavy hitter
    "tank_hp": (5, 8),
    "tank_atk": (3, 6),
    "tank_move": (2, 3),
    "tank_cost": (3, 5),
    "tank_accuracy": (75, 95),
    # Ranger: the skirmisher
    "ranger_hp": (3, 5),
    "ranger_atk": (2, 4),
    "ranger_move": (3, 4),
    "ranger_cost": (2, 3),
    "ranger_accuracy": (80, 95),
    "ranger_can_capture": (0, 1),
    # Economy
    "starting_gold": (3, 8),
    "hq_income": (0, 2),
    "capture_threshold": (2, 4),
    "max_rounds": (20, 40),
}

DEFAULT_CONFIG = {
    "infantry_hp": 3,
    "infantry_atk": 2,
    "infantry_move": 4,
    "infantry_cost": 1,
    "infantry_accuracy": 90,
    "tank_hp": 5,
    "tank_atk": 4,
    "tank_move": 2,
    "tank_cost": 4,
    "tank_accuracy": 85,
    "ranger_hp": 3,
    "ranger_atk": 3,
    "ranger_move": 3,
    "ranger_cost": 2,
    "ranger_accuracy": 88,
    "ranger_can_capture": 1,
    "starting_gold": 5,
    "hq_income": 1,
    "capture_threshold": 2,
    "max_rounds": 30,
}


def acquire_lock():
    """Try to acquire lockfile. Returns file handle or None."""
    try:
        fh = open(LOCK_FILE, "w")
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fh.write(str(os.getpid()))
        fh.flush()
        return fh
    except (IOError, OSError):
        return None


def release_lock(fh):
    if fh:
        fcntl.flock(fh, fcntl.LOCK_UN)
        fh.close()
        try:
            LOCK_FILE.unlink()
        except:
            pass


def apply_config(config):
    """Apply config to the simulator module."""
    import simulator

    simulator.UNIT_STATS[simulator.UnitType.INFANTRY] = {
        "hp": config["infantry_hp"],
        "atk": config["infantry_atk"],
        "move": config["infantry_move"],
        "range": (1, 1),
        "accuracy": config["infantry_accuracy"],
        "can_attack_after_move": True,
    }
    simulator.UNIT_STATS[simulator.UnitType.TANK] = {
        "hp": config["tank_hp"],
        "atk": config["tank_atk"],
        "move": config["tank_move"],
        "range": (1, 1),
        "accuracy": config["tank_accuracy"],
        "can_attack_after_move": True,
    }
    simulator.UNIT_STATS[simulator.UnitType.RANGER] = {
        "hp": config["ranger_hp"],
        "atk": config["ranger_atk"],
        "move": config["ranger_move"],
        "range": (2, 3),
        "accuracy": config["ranger_accuracy"],
        "can_attack_after_move": False,
    }
    simulator.UNIT_COST = {
        "INFANTRY": config["infantry_cost"],
        "TANK": config["tank_cost"],
        "RANGER": config["ranger_cost"],
    }
    simulator.STARTING_GOLD = config["starting_gold"]
    simulator.P2_STARTING_GOLD = config.get("p2_starting_gold", config["starting_gold"] + 2)
    simulator.VEHICLE_TYPES = {simulator.UnitType.TANK, simulator.UnitType.RANGER}
    simulator.CAPTURE_THRESHOLD = config["capture_threshold"]
    simulator.MAX_ROUNDS = config["max_rounds"]

    # Ranger capture — patch do_capture
    if config["ranger_can_capture"]:
        simulator._CAPTURE_TYPES = (simulator.UnitType.INFANTRY, simulator.UnitType.RANGER)
    else:
        simulator._CAPTURE_TYPES = (simulator.UnitType.INFANTRY,)

    # HQ income — store for patching
    simulator._HQ_INCOME = config["hq_income"]


def run_triangle(config):
    """Run aggressive/rush/balanced triangle, return win rates."""
    import simulator

    apply_config(config)

    strategies = ["aggressive", "rush", "balanced"]
    results = {}

    for s1_name in strategies:
        for s2_name in strategies:
            if s1_name == s2_name:
                continue
            s1 = simulator.STRATEGIES[s1_name]()
            s2 = simulator.STRATEGIES[s2_name]()
            p1_wins = 0

            for i in range(GAMES_PER_MATCHUP):
                seed = SEED + hash((s1_name, s2_name)) + i
                rng = random.Random(seed)
                state = simulator.create_game(width=14, height=14, rng_seed=seed)
                state.current_player = rng.choice([1, 2])
                strats = {1: s1, 2: s2}

                while state.winner is None:
                    player = state.current_player
                    strats[player].play_turn(state, player, rng)
                    if state.winner is None:
                        simulator.end_turn(state)

                if state.winner == 1:
                    p1_wins += 1

            win_pct = p1_wins / GAMES_PER_MATCHUP * 100
            results[(s1_name, s2_name)] = win_pct

    return results


def score_rps(results):
    """Score how close results are to RPS triangle. Lower is better. 0 = perfect."""
    total_penalty = 0

    for (s1, s2), (lo, hi) in RPS_TARGETS.items():
        # s1 should beat s2 at lo-hi%
        win_rate = results.get((s1, s2), 50)
        lose_rate = results.get((s2, s1), 50)
        # Use average of both directions
        effective = (win_rate + (100 - lose_rate)) / 2

        if effective < lo:
            total_penalty += (lo - effective) ** 2
        elif effective > hi:
            total_penalty += (effective - hi) ** 2
        # In range = 0 penalty

    # Penalize mirror-like matchups being too far from 50%
    # (we don't run mirrors, so skip)

    return total_penalty


def validate_config(config):
    """Check logical constraints. Returns True if valid."""
    # Tank HP > Ranger HP >= Infantry HP
    if not (config["tank_hp"] > config["ranger_hp"] >= config["infantry_hp"]):
        return False
    # Tank ATK > Ranger ATK >= Infantry ATK
    if not (config["tank_atk"] > config["ranger_atk"] >= config["infantry_atk"]):
        return False
    # Infantry Move > Ranger Move >= Tank Move
    if not (config["infantry_move"] > config["ranger_move"] >= config["tank_move"]):
        return False
    # Tank Cost > Ranger Cost > Infantry Cost
    if not (config["tank_cost"] > config["ranger_cost"] > config["infantry_cost"]):
        return False
    return True


def load_state():
    """Load search state."""
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {
        "current_config": copy.deepcopy(DEFAULT_CONFIG),
        "best_config": copy.deepcopy(DEFAULT_CONFIG),
        "best_score": 99999,
        "iteration": 0,
        "param_index": 0,
        "direction": 1,  # +1 or -1
        "params_tried_this_round": [],
    }


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def log_result(iteration, config, results, score, improved):
    """Append to log file."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "iteration": iteration,
        "config": config,
        "results": {f"{k[0]}_vs_{k[1]}": f"{v:.1f}%" for k, v in results.items()},
        "score": score,
        "improved": improved,
    }

    log = []
    if LOG_FILE.exists():
        with open(LOG_FILE) as f:
            log = json.load(f)
    log.append(entry)
    # Keep last 200 entries
    if len(log) > 200:
        log = log[-200:]
    with open(LOG_FILE, "w") as f:
        json.dump(log, f, indent=2)

    return entry


def pick_tweak(state):
    """Pick a parameter to tweak. Returns (param_name, new_value) or None if exhausted."""
    params = list(PARAM_SPACE.keys())
    config = state["current_config"]

    # Rotate through parameters
    attempts = 0
    while attempts < len(params) * 2:
        idx = state["param_index"] % len(params)
        param = params[idx]
        lo, hi = PARAM_SPACE[param]
        current = config[param]
        direction = state["direction"]

        new_val = current + direction
        if lo <= new_val <= hi and param not in state.get("params_tried_this_round", []):
            test_config = copy.deepcopy(config)
            test_config[param] = new_val
            if validate_config(test_config):
                return param, new_val

        # Try other direction
        new_val = current - direction
        if lo <= new_val <= hi and param not in state.get("params_tried_this_round", []):
            test_config = copy.deepcopy(config)
            test_config[param] = new_val
            if validate_config(test_config):
                state["direction"] = -direction
                return param, new_val

        # This param is at boundary or already tried, move to next
        state["param_index"] = (idx + 1) % len(params)
        attempts += 1

    # All params exhausted this round, reset
    state["params_tried_this_round"] = []
    state["param_index"] = 0
    return None, None


def format_results(results):
    """Format results for display."""
    lines = []
    lines.append("  Aggr > Rush: {:.1f}% (target: 58-72%)".format(results.get(("aggressive", "rush"), 0)))
    lines.append("  Rush > Bal:  {:.1f}% (target: 58-72%)".format(results.get(("rush", "balanced"), 0)))
    lines.append("  Bal > Aggr:  {:.1f}% (target: 58-72%)".format(results.get(("balanced", "aggressive"), 0)))
    return "\n".join(lines)


def format_config_diff(config, default=DEFAULT_CONFIG):
    """Show only params that differ from default."""
    diffs = []
    for k, v in config.items():
        if v != default.get(k):
            diffs.append(f"{k}: {default.get(k)} → {v}")
    return ", ".join(diffs) if diffs else "(default config)"


def main():
    dry_run = "--dry-run" in sys.argv

    # Acquire lock
    lock = acquire_lock()
    if lock is None:
        print("SKIP: Previous balance search still running")
        return "skip"

    try:
        state = load_state()
        iteration = state["iteration"]

        if iteration == 0:
            # First run: establish baseline with current config
            print(f"Balance Search — Iteration 0 (baseline)")
            config = state["current_config"]
        else:
            # Random multi-param tweak from best known config
            desc, config = pick_tweak(state)
            if desc is None:
                print("Search failed to find valid random config after 50 attempts")
                save_state(state)
                return "stuck"

            print(f"Balance Search — Iteration {iteration}: {desc}")

        if dry_run:
            print(f"Config: {format_config_diff(config)}")
            print("DRY RUN — skipping simulation")
            return "dry_run"

        # Run simulation
        start = time.time()
        results = run_triangle(config)
        elapsed = time.time() - start
        score = score_rps(results)

        improved = score < state["best_score"]
        if improved:
            state["best_score"] = score
            state["best_config"] = copy.deepcopy(config)
            state["current_config"] = copy.deepcopy(config)
            # Save best
            with open(BEST_FILE, "w") as f:
                json.dump({
                    "config": config,
                    "score": score,
                    "results": {f"{k[0]}_vs_{k[1]}": f"{v:.1f}%" for k, v in results.items()},
                    "iteration": iteration,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, f, indent=2)
        else:
            pass  # Random search — no revert tracking needed, always starts from best

        entry = log_result(iteration, config, results, score, improved)

        state["iteration"] = iteration + 1
        save_state(state)

        # Build summary
        summary = []
        summary.append(f"Balance Search #{iteration} ({elapsed:.0f}s)")
        summary.append(f"Config: {format_config_diff(config)}")
        summary.append(format_results(results))
        summary.append(f"Score: {score:.1f} (best: {state['best_score']:.1f})")
        if improved:
            summary.append("✅ NEW BEST")
        else:
            summary.append("❌ No improvement, reverting")

        report = "\n".join(summary)
        print(report)

        return report

    finally:
        release_lock(lock)


if __name__ == "__main__":
    main()
