#!/usr/bin/env python3
"""
Hashfront Autoplay — Threaded autonomous bot.

Architecture:
  - TxQueue: Single thread processes all transactions (avoids controller CLI conflicts)
  - GameThread: One per game, polls every GAME_POLL_INTERVAL, enqueues actions
  - ManagerThread: Discovers games, creates new ones, spawns/reaps GameThreads

Usage:
    python main.py                  # Run continuous (default)
    python main.py --games 3        # Max concurrent self-play games
    python main.py --no-selfplay    # Only maintain open games for humans
"""

import argparse
import logging
import queue
import random
import threading
import time

from config import (
    MAX_GAMES, MAP_ID, GAME_NAMES, TX_WAIT, CONTRACT,
    OPEN_GAME_PREFIX, OPEN_GAME_NAMES, BOT_ADDRESS,
)
from state import (
    fetch_game_state, fetch_game_counter, fetch_active_games,
    fetch_all_games, fetch_player_states, fetch_map_ids,
)
from planner import plan_turn, EndTurnAction, MoveAction, AttackAction, CaptureAction
from executor import actions_to_calls, execute_calls, create_game, join_game

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("main")

# How often game threads poll for state changes
GAME_POLL_INTERVAL = 5      # seconds — human games feel responsive
SELFPLAY_POLL_INTERVAL = 8  # seconds — self-play can be slower
MANAGER_INTERVAL = 30       # seconds — manager checks for new games


# ─── TX Queue ────────────────────────────────────────────────────────────────

class TxQueue:
    """
    Single-threaded transaction executor. All game threads enqueue work here
    so controller CLI calls never overlap.
    """

    def __init__(self):
        self._queue = queue.Queue()
        self._thread = threading.Thread(target=self._run, daemon=True, name="tx-queue")
        self._thread.start()

    def submit(self, calls: list, label: str, callback=None):
        """Enqueue a multicall. Optional callback(result_dict) when done."""
        self._queue.put((calls, label, callback))

    def submit_and_wait(self, calls: list, label: str, timeout: float = 60) -> dict:
        """Enqueue a multicall and block until it completes."""
        event = threading.Event()
        result_box = [None]

        def cb(result):
            result_box[0] = result
            event.set()

        self.submit(calls, label, callback=cb)
        event.wait(timeout=timeout)
        return result_box[0] or {"status": "timeout", "message": "TX queue timeout"}

    def _run(self):
        while True:
            try:
                calls, label, callback = self._queue.get()
                result = execute_calls(calls, label)
                if callback:
                    try:
                        callback(result)
                    except Exception as e:
                        log.error(f"TX callback error: {e}")
                # Brief pause between TXs for nonce sequencing
                time.sleep(1)
            except Exception as e:
                log.error(f"TX queue error: {e}")


# ─── Game Thread ─────────────────────────────────────────────────────────────

class GameThread:
    """Manages a single game in its own thread."""

    def __init__(self, game_id: int, tx_queue: TxQueue, only_player: int = 0):
        """
        game_id: the game to manage
        tx_queue: shared TX queue
        only_player: if set, only play this player's turns (human game mode)
        """
        self.game_id = game_id
        self.tx_queue = tx_queue
        self.only_player = only_player  # 0 = self-play (both sides)
        self.error_count = 0
        self.finished = False
        self.stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._run, daemon=True,
            name=f"game-{game_id}{'(human)' if only_player else ''}",
        )

    def start(self):
        self._thread.start()

    def stop(self):
        self.stop_event.set()

    def is_alive(self):
        return self._thread.is_alive()

    @property
    def poll_interval(self):
        return GAME_POLL_INTERVAL if self.only_player else SELFPLAY_POLL_INTERVAL

    def _run(self):
        glog = logging.getLogger(f"G{self.game_id}")
        mode = f"P{self.only_player} only" if self.only_player else "self-play"
        glog.info(f"Started ({mode})")

        while not self.stop_event.is_set():
            try:
                self._tick(glog)
            except Exception as e:
                glog.error(f"Tick error: {e}")
                self.error_count += 1

            if self.finished:
                break
            self.stop_event.wait(timeout=self.poll_interval)

        glog.info("Thread exiting")

    def _tick(self, glog):
        state = fetch_game_state(self.game_id)

        # Check if game ended
        if state.info.state == "Finished":
            winner = state.info.winner
            prefix = "⚔️ " if self.only_player else ""
            glog.info(f"{prefix}FINISHED — P{winner} wins at R{state.info.round}")
            self.finished = True
            return

        if state.info.state != "Playing":
            return

        player = state.info.current_player

        # In human games, skip opponent's turn
        if self.only_player and player != self.only_player:
            return

        label = f"[G{self.game_id}] R{state.info.round} P{player}"
        my_units = state.alive_units(player)
        enemy_units = state.enemy_units(player)

        # Check if we should resign: no units, or no enemies + no units that can capture
        from config import INFANTRY, RANGER
        can_capture = any(u.unit_type in (INFANTRY, RANGER) for u in my_units)
        should_resign = (not my_units) or (not enemy_units and not can_capture)

        if should_resign:
            if self.only_player:
                reason = "no units" if not my_units else "no capturable units"
                glog.info(f"R{state.info.round} P{player}: {reason}, resigning 🏳️")
                calls = [{"contractAddress": CONTRACT, "entrypoint": "resign", "calldata": [str(self.game_id)]}]
                self.tx_queue.submit_and_wait(calls, f"{label} RESIGN")
                self.finished = True
            else:
                reason = "no units" if not my_units else "only tanks left, can't capture"
                glog.info(f"R{state.info.round} P{player}: {reason}, ending turn")
                calls = actions_to_calls(self.game_id, [EndTurnAction()])
                self.tx_queue.submit_and_wait(calls, label)
            return

        # Plan
        actions = plan_turn(state, player)
        n_moves = sum(1 for a in actions if isinstance(a, MoveAction))
        n_attacks = sum(1 for a in actions if isinstance(a, AttackAction))
        n_captures = sum(1 for a in actions if isinstance(a, CaptureAction))
        glog.info(f"R{state.info.round} P{player}: {len(my_units)}v{len(enemy_units)} — {n_moves}M {n_attacks}A {n_captures}C")

        # Execute via TX queue
        calls = actions_to_calls(self.game_id, actions)
        result = self.tx_queue.submit_and_wait(calls, label)

        if result["status"] == "error":
            error_msg = result.get("message", "")
            self.error_count += 1

            if "Game not playing" in error_msg:
                glog.info("Game ended during execution")
                self.finished = True
                return

            if self.error_count >= 3:
                glog.warning(f"{self.error_count} consecutive errors — abandoning game")
                self.finished = True
                return

            glog.warning(f"TX failed ({self.error_count}/3), will retry")
        else:
            self.error_count = 0
            # Wait for indexer to catch up before next poll
            time.sleep(TX_WAIT)


# ─── Manager Thread ──────────────────────────────────────────────────────────

class Manager:
    """
    Discovers games, creates new ones, spawns/reaps GameThreads.
    Runs in the main thread.
    """

    def __init__(self, tx_queue: TxQueue, max_games: int = MAX_GAMES, selfplay: bool = True):
        self.tx_queue = tx_queue
        self.max_games = max_games
        self.selfplay = selfplay
        self.available_maps: list = []
        self.game_threads: dict = {}  # {game_id: GameThread}
        self.known_finished: set = set()  # don't re-adopt finished games
        self.game_name_idx = 0
        self.stats = {
            "games_created": 0,
            "turns_played": 0,
            "games_finished": 0,
            "errors": 0,
        }

    def run(self):
        """Main loop — runs forever."""
        log.info(f"Manager started | self-play={'ON' if self.selfplay else 'OFF'} | max_games={self.max_games}")

        while True:
            try:
                self._tick()
            except KeyboardInterrupt:
                log.info("Shutting down...")
                for gt in self.game_threads.values():
                    gt.stop()
                break
            except Exception as e:
                log.error(f"Manager error: {e}")

            time.sleep(MANAGER_INTERVAL)

    def _tick(self):
        # Reap finished threads
        self._reap()

        # Discover new games
        self._discover()

        # Ensure open game exists for humans
        self._ensure_open_game()

        # Create self-play games if under limit
        if self.selfplay:
            selfplay_count = sum(1 for gt in self.game_threads.values() if not gt.only_player)
            while selfplay_count < self.max_games:
                if not self._create_selfplay_game():
                    break
                selfplay_count += 1

        self._log_stats()

    def _reap(self):
        """Remove finished game threads."""
        finished = [gid for gid, gt in self.game_threads.items() if gt.finished or not gt.is_alive()]
        for gid in finished:
            gt = self.game_threads.pop(gid)
            self.known_finished.add(gid)
            self.stats["games_finished"] += 1
            log.info(f"Reaped game {gid}")

    def _discover(self):
        """Find active games that need threads."""
        try:
            active = fetch_active_games()
        except Exception as e:
            log.error(f"Discovery failed: {e}")
            return

        for game in active:
            if game.game_id in self.game_threads or game.game_id in self.known_finished:
                continue

            if game.name.startswith(OPEN_GAME_PREFIX):
                # Human game — detect bot side
                bot_pid = self._detect_bot_side(game.game_id)
                if bot_pid:
                    gt = GameThread(game.game_id, self.tx_queue, only_player=bot_pid)
                    gt.start()
                    self.game_threads[game.game_id] = gt
                    log.info(f"⚔️ Human game {game.game_id} ({game.name}) — bot is P{bot_pid}")
            elif self.selfplay:
                # Self-play game — adopt it
                gt = GameThread(game.game_id, self.tx_queue, only_player=0)
                gt.start()
                self.game_threads[game.game_id] = gt
                log.info(f"Adopted self-play game {game.game_id} ({game.name}) R{game.round}")

    def _detect_bot_side(self, game_id: int) -> int:
        try:
            players = fetch_player_states(game_id)
            bot_addr = BOT_ADDRESS.lower()
            for pid, addr in players:
                if addr.lower() == bot_addr:
                    others = [a for p, a in players if p != pid]
                    if others and others[0].lower() != bot_addr:
                        return pid
            return 0
        except Exception as e:
            log.error(f"Failed to detect bot side for game {game_id}: {e}")
            return 0

    def _ensure_open_game(self):
        try:
            all_games = fetch_all_games()
            open_in_lobby = [g for g in all_games if g.name.startswith(OPEN_GAME_PREFIX) and g.state == "Lobby"]
            if open_in_lobby:
                return

            name = random.choice(OPEN_GAME_NAMES)
            suffix = random.randint(100, 999)
            name = f"{name}_{suffix}"
            map_id = self._random_map()
            log.info(f"🎮 Creating open game '{name}' on map {map_id}...")
            result = self.tx_queue.submit_and_wait(
                _create_game_calls(name, map_id), f"CREATE {name}"
            )
            if result["status"] == "success":
                time.sleep(TX_WAIT)
                game_id = fetch_game_counter()
                log.info(f"🎮 Open game {game_id} ({name}) — waiting for challengers!")
            else:
                log.error(f"Failed to create open game: {result.get('message', '')[:100]}")
        except Exception as e:
            log.error(f"Open game error: {e}")

    def _create_selfplay_game(self) -> bool:
        name = GAME_NAMES[self.game_name_idx % len(GAME_NAMES)]
        suffix = random.randint(100, 999)
        name = f"{name}_{suffix}"
        self.game_name_idx += 1
        map_id = self._random_map()

        log.info(f"Creating self-play '{name}' on map {map_id}...")
        result = self.tx_queue.submit_and_wait(
            _create_game_calls(name, map_id), f"CREATE {name}"
        )
        if result["status"] != "success":
            log.error(f"Failed to create: {result.get('message', '')[:100]}")
            return False

        time.sleep(TX_WAIT)
        try:
            game_id = fetch_game_counter()
        except Exception as e:
            log.error(f"Failed to fetch counter: {e}")
            return False

        log.info(f"Joining game {game_id} as P2...")
        result = self.tx_queue.submit_and_wait(
            _join_game_calls(game_id, 2), f"JOIN game {game_id} as P2"
        )
        if result["status"] != "success":
            log.error(f"Failed to join: {result.get('message', '')[:100]}")
            return False

        time.sleep(TX_WAIT)

        gt = GameThread(game_id, self.tx_queue, only_player=0)
        gt.start()
        self.game_threads[game_id] = gt
        self.stats["games_created"] += 1
        log.info(f"✓ Self-play game {game_id} on map {map_id}")
        return True

    def _random_map(self) -> int:
        if not self.available_maps:
            try:
                self.available_maps = fetch_map_ids()
                log.info(f"Loaded {len(self.available_maps)} maps")
            except Exception as e:
                log.error(f"Failed to fetch maps: {e}")
                return MAP_ID
        return random.choice(self.available_maps) if self.available_maps else MAP_ID

    def _log_stats(self):
        selfplay = sum(1 for gt in self.game_threads.values() if not gt.only_player)
        human = sum(1 for gt in self.game_threads.values() if gt.only_player)
        s = self.stats
        log.info(
            f"Threads: {selfplay} self-play | {human} vs human | "
            f"{s['games_created']} created | {s['games_finished']} finished | "
            f"{s['errors']} errors"
        )


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _encode_game_name(name: str) -> str:
    hex_str = "0x" + name.encode("ascii").hex()
    return f"0,{hex_str},{len(name)}"


def _create_game_calls(name: str, map_id: int) -> list:
    parts = _encode_game_name(name).split(",")
    calldata = parts + [str(map_id), "1", "1"]  # map_id, test_mode=1, ?=1
    return [{
        "contractAddress": CONTRACT,
        "entrypoint": "create_game",
        "calldata": calldata,
    }]


def _join_game_calls(game_id: int, player_id: int) -> list:
    return [{
        "contractAddress": CONTRACT,
        "entrypoint": "join_game",
        "calldata": [str(game_id), str(player_id)],
    }]


# ─── Entry Point ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Hashfront Autoplay Bot (threaded)")
    parser.add_argument("--games", type=int, default=MAX_GAMES, help=f"Max self-play games (default {MAX_GAMES})")
    parser.add_argument("--no-selfplay", action="store_true", help="Only maintain open games for humans")
    args = parser.parse_args()

    log.info("=== Hashfront Autoplay Bot (threaded) ===")
    log.info(f"Self-play: {'OFF' if args.no_selfplay else f'ON (max {args.games})'}")
    log.info(f"Human poll: {GAME_POLL_INTERVAL}s | Self-play poll: {SELFPLAY_POLL_INTERVAL}s | Manager: {MANAGER_INTERVAL}s")

    tx_queue = TxQueue()
    manager = Manager(
        tx_queue=tx_queue,
        max_games=args.games,
        selfplay=not args.no_selfplay,
    )
    manager.run()


if __name__ == "__main__":
    main()
