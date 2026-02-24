"""Multicall JSON builder and transaction executor."""

import json
import subprocess
import logging
import time

from config import CONTRACT, TX_WAIT
from planner import (
    MoveAction, AttackAction, CaptureAction, EndTurnAction,
)

log = logging.getLogger("executor")


def encode_game_name(name: str) -> str:
    """Encode a game name as ByteArray calldata: num_full_words,pending_word_hex,pending_len"""
    # For names <= 31 chars (all ours), it's: 0,hex_felt,char_count
    hex_str = "0x" + name.encode("ascii").hex()
    return f"0,{hex_str},{len(name)}"


def actions_to_calls(game_id: int, actions: list) -> list:
    """Convert action objects to multicall JSON entries.
    If a CaptureAction is present, it becomes the final call (no end_turn after)
    since capturing HQ ends the game immediately.
    """
    has_capture = any(isinstance(a, CaptureAction) for a in actions)
    calls = []

    for action in actions:
        # Skip end_turn entirely if capture is present.
        if has_capture:
            if isinstance(action, EndTurnAction):
                continue
        if isinstance(action, MoveAction):
            path_flat = []
            for x, y in action.path:
                path_flat.extend([str(x), str(y)])
            calldata = [str(game_id), str(action.unit_id), str(len(action.path))] + path_flat
            calls.append({
                "contractAddress": CONTRACT,
                "entrypoint": "move_unit",
                "calldata": calldata,
            })

        elif isinstance(action, AttackAction):
            calls.append({
                "contractAddress": CONTRACT,
                "entrypoint": "attack",
                "calldata": [str(game_id), str(action.unit_id), str(action.target_id)],
            })

        elif isinstance(action, CaptureAction):
            # Capture is deferred to end of calls list (appended below)
            pass

        elif isinstance(action, EndTurnAction):
            calls.append({
                "contractAddress": CONTRACT,
                "entrypoint": "end_turn",
                "calldata": [str(game_id)],
            })

    # Append capture as the very last call (game ends on capture)
    for action in actions:
        if isinstance(action, CaptureAction):
            calls.append({
                "contractAddress": CONTRACT,
                "entrypoint": "capture",
                "calldata": [str(game_id), str(action.unit_id)],
            })

    return calls


def execute_calls(calls: list, label: str = "") -> dict:
    """Write calls to temp file and execute via controller CLI. Returns result dict."""
    if not calls:
        return {"status": "skip", "message": "No calls"}

    filepath = f"/tmp/hashfront/autoplay/_turn.json"
    with open(filepath, "w") as f:
        json.dump({"calls": calls}, f, indent=2)

    log.info(f"Executing {len(calls)} calls {label}")

    try:
        result = subprocess.run(
            ["controller", "execute", "--file", filepath, "--json"],
            capture_output=True, text=True, timeout=45,
        )
    except subprocess.TimeoutExpired:
        log.error(f"Transaction timed out {label}")
        return {"status": "error", "message": "Timeout"}

    # Parse output - controller outputs multiple JSON objects separated by newlines/braces
    # Combine stdout and stderr since controller may write to either
    output = (result.stdout or "") + (result.stderr or "")

    # Extract all JSON objects from output
    import re
    json_objects = []
    depth = 0
    start = None
    for i, ch in enumerate(output):
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    obj = json.loads(output[start:i+1])
                    json_objects.append(obj)
                except json.JSONDecodeError:
                    pass
                start = None

    # Look for success or error (check in reverse - last status matters)
    for data in reversed(json_objects):
        if data.get("status") == "success":
            tx_hash = data.get("data", {}).get("transaction_hash", "unknown")
            log.info(f"✓ TX submitted: {tx_hash[:18]}... {label}")
            return {"status": "success", "tx_hash": tx_hash}
        elif data.get("status") == "error":
            error_msg = data.get("message", "Unknown error")
            log.error(f"✗ TX failed {label}: {error_msg[:200]}")
            return {"status": "error", "message": error_msg}

    if result.returncode != 0:
        log.error(f"✗ Controller error {label}: {output[:200]}")
        return {"status": "error", "message": output[:200]}

    return {"status": "unknown", "message": output[:200]}


def execute_turn(game_id: int, actions: list, label: str = "") -> dict:
    """Build and execute a full turn from action objects."""
    calls = actions_to_calls(game_id, actions)
    result = execute_calls(calls, label)

    if result["status"] == "success":
        # Wait for indexer to catch up
        time.sleep(TX_WAIT)

    return result


def create_game(name: str, map_id: int) -> dict:
    """Create a new game in test mode as player 1."""
    calldata = encode_game_name(name) + f",{map_id},1,1"
    calls = [{
        "contractAddress": CONTRACT,
        "entrypoint": "create_game",
        "calldata": calldata.split(","),
    }]
    return execute_calls(calls, f"[CREATE {name}]")


def join_game(game_id: int, player_id: int = 2) -> dict:
    """Join an existing game."""
    calls = [{
        "contractAddress": CONTRACT,
        "entrypoint": "join_game",
        "calldata": [str(game_id), str(player_id)],
    }]
    return execute_calls(calls, f"[JOIN game {game_id} as P{player_id}]")
