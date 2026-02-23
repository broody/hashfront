#!/usr/bin/env python3
"""
Hashfront Autoplay — Autonomous self-play bot.

Manages up to MAX_GAMES concurrent self-play games on Starknet Sepolia.
Creates games, plays both sides, logs results.

Usage:
    python main.py                  # Run continuous loop
    python main.py --once           # Single tick (for cron)
    python main.py --games 3        # Override max concurrent games
    python main.py --map 8          # Use specific map ID
"""

import argparse
import logging
import random
import sys
import time

from config import MAX_GAMES, MAP_ID, TICK_INTERVAL, GAME_NAMES, TX_WAIT, CONTRACT, OPEN_GAME_PREFIX, OPEN_GAME_NAMES, BOT_ADDRESS
from state import fetch_game_state, fetch_game_counter, fetch_active_games, fetch_all_games, fetch_player_states, fetch_map_ids
from planner import plan_turn, EndTurnAction
from executor import execute_turn, create_game, join_game

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("main")


class GameManager:
    """Manages multiple concurrent self-play games."""

    def __init__(self, max_games: int = MAX_GAMES, map_id: int = MAP_ID):
        self.max_games = max_games
        self.map_id = map_id  # only used as fallback
        self.available_maps: list = []  # populated on first tick
        self.active_game_ids: set = set()
        self.human_games: dict = {}  # {game_id: bot_player_id} — games vs humans
        self.game_name_idx = 0
        self.error_counts: dict = {}  # {game_id: consecutive_errors}
        self.stats = {
            "games_created": 0,
            "turns_played": 0,
            "games_finished": 0,
            "errors": 0,
            "p1_wins": 0,
            "p2_wins": 0,
        }

    def _random_map(self) -> int:
        """Pick a random map ID from available maps."""
        if not self.available_maps:
            try:
                self.available_maps = fetch_map_ids()
                log.info(f"Loaded {len(self.available_maps)} maps: {self.available_maps}")
            except Exception as e:
                log.error(f"Failed to fetch maps: {e}")
                return self.map_id
        return random.choice(self.available_maps) if self.available_maps else self.map_id

    def tick(self):
        """One iteration of the game manager loop."""
        # Discover active games
        self._discover_games()

        # Ensure there's always an open game for humans
        self._ensure_open_game()

        # Create new games if under limit
        while len(self.active_game_ids) < self.max_games:
            if not self._create_new_game():
                break

        # Process each active game (self-play: both sides)
        finished = []
        for game_id in list(self.active_game_ids):
            try:
                result = self._process_game(game_id)
                if result == "finished":
                    finished.append(game_id)
            except Exception as e:
                log.error(f"[GAME {game_id}] Error: {e}")
                self.stats["errors"] += 1

        for gid in finished:
            self.active_game_ids.discard(gid)

        # Process human games (bot plays only its side)
        finished_human = []
        for game_id, bot_pid in list(self.human_games.items()):
            try:
                result = self._process_game(game_id, only_player=bot_pid)
                if result == "finished":
                    finished_human.append(game_id)
            except Exception as e:
                log.error(f"[GAME {game_id}] Error: {e}")
                self.stats["errors"] += 1

        for gid in finished_human:
            self.human_games.pop(gid, None)

        self._log_stats()

    def _discover_games(self):
        """Find active games to manage. OPEN_ games with a human opponent are played single-sided."""
        try:
            active = fetch_active_games()
            for game in active:
                if game.game_id in self.active_game_ids or game.game_id in self.human_games:
                    continue
                if game.name.startswith(OPEN_GAME_PREFIX):
                    # Human joined an open game! Figure out which side we play.
                    bot_pid = self._detect_bot_side(game.game_id)
                    if bot_pid:
                        self.human_games[game.game_id] = bot_pid
                        log.info(f"⚔️ Human game {game.game_id} ({game.name}) — bot is P{bot_pid}")
                    else:
                        log.warning(f"OPEN game {game.game_id} has no bot player?")
                else:
                    self.active_game_ids.add(game.game_id)
                    log.info(f"Discovered active game {game.game_id} ({game.name}) R{game.round}")
        except Exception as e:
            log.error(f"Failed to discover games: {e}")

    def _detect_bot_side(self, game_id: int) -> int:
        """Determine which player_id the bot is in a game. Returns player_id or 0."""
        try:
            players = fetch_player_states(game_id)
            bot_addr = BOT_ADDRESS.lower()
            # In a human game, bot created (P1) and human joined (P2), or vice versa.
            # Bot is always the creator (P1) since we create OPEN games.
            for pid, addr in players:
                if addr.lower() == bot_addr:
                    # Check if the OTHER player is different
                    others = [a for p, a in players if p != pid]
                    if others and others[0].lower() != bot_addr:
                        return pid
            return 0
        except Exception as e:
            log.error(f"Failed to detect bot side for game {game_id}: {e}")
            return 0

    def _ensure_open_game(self):
        """Make sure there's always one OPEN_ game in Lobby for humans to join."""
        try:
            all_games = fetch_all_games()
            open_in_lobby = [g for g in all_games if g.name.startswith(OPEN_GAME_PREFIX) and g.state == "Lobby"]
            if open_in_lobby:
                return  # already have one waiting

            # Create a new open game
            name = OPEN_GAME_NAMES[random.randint(0, len(OPEN_GAME_NAMES) - 1)]
            suffix = random.randint(100, 999)
            name = f"{name}_{suffix}"
            map_id = self._random_map()
            log.info(f"🎮 Creating open game '{name}' for humans on map {map_id}...")
            result = create_game(name, map_id)
            if result["status"] == "success":
                time.sleep(TX_WAIT)
                game_id = fetch_game_counter()
                log.info(f"🎮 Open game {game_id} ({name}) ready — waiting for a human challenger!")
            else:
                log.error(f"Failed to create open game: {result.get('message', '')[:100]}")
        except Exception as e:
            log.error(f"Failed to ensure open game: {e}")

    def _create_new_game(self) -> bool:
        """Create a new game and join as P2. Returns True on success."""
        name = GAME_NAMES[self.game_name_idx % len(GAME_NAMES)]
        # Add random suffix to avoid name collision
        suffix = random.randint(100, 999)
        name = f"{name}_{suffix}"
        self.game_name_idx += 1

        map_id = self._random_map()
        log.info(f"Creating game '{name}' on map {map_id}...")
        result = create_game(name, map_id)
        if result["status"] != "success":
            log.error(f"Failed to create game: {result.get('message', '')[:100]}")
            return False

        time.sleep(TX_WAIT)

        # Get the game ID from counter
        try:
            game_id = fetch_game_counter()
        except Exception as e:
            log.error(f"Failed to fetch game counter: {e}")
            return False

        log.info(f"Created game {game_id}, joining as P2...")
        time.sleep(1)

        result = join_game(game_id, 2)
        if result["status"] != "success":
            log.error(f"Failed to join game {game_id}: {result.get('message', '')[:100]}")
            return False

        time.sleep(TX_WAIT)

        self.active_game_ids.add(game_id)
        self.stats["games_created"] += 1
        log.info(f"✓ Game {game_id} ready — self-play on map {map_id}")
        return True

    def _process_game(self, game_id: int, only_player: int = 0) -> str:
        """Process one game. Returns 'finished' if game ended, 'ok' otherwise.
        only_player: if set, only play when it's this player's turn (for human games).
        """
        state = fetch_game_state(game_id)

        if state.info.state == "Finished":
            winner = state.info.winner
            is_human = game_id in self.human_games
            prefix = "⚔️" if is_human else ""
            log.info(f"{prefix}[GAME {game_id}] FINISHED — P{winner} wins at round {state.info.round}")
            self.stats["games_finished"] += 1
            if winner == 1:
                self.stats["p1_wins"] += 1
            elif winner == 2:
                self.stats["p2_wins"] += 1
            return "finished"

        if state.info.state != "Playing":
            return "ok"

        player = state.info.current_player

        # In human games, only play our side
        if only_player and player != only_player:
            return "ok"  # human's turn, skip
        label = f"[GAME {game_id}] R{state.info.round} P{player}"

        my_units = state.alive_units(player)
        enemy_units = state.enemy_units(player)

        if not my_units:
            # No units left — just end turn so the winning side can finish
            log.info(f"{label}: no units, ending turn")
            result = execute_turn(game_id, [EndTurnAction()], label)
            self.stats["turns_played"] += 1
            return "ok"

        log.info(f"{label}: {len(my_units)} units vs {len(enemy_units)} enemies")

        # Plan the turn
        actions = plan_turn(state, player)

        # Count action types for logging
        from planner import MoveAction, AttackAction, CaptureAction
        n_moves = sum(1 for a in actions if isinstance(a, MoveAction))
        n_attacks = sum(1 for a in actions if isinstance(a, AttackAction))
        n_captures = sum(1 for a in actions if isinstance(a, CaptureAction))
        log.info(f"{label}: planned {n_moves} moves, {n_attacks} attacks, {n_captures} captures")

        # Execute
        result = execute_turn(game_id, actions, label)
        self.stats["turns_played"] += 1

        if result["status"] == "error":
            error_msg = result.get("message", "")
            self.stats["errors"] += 1
            self.error_counts[game_id] = self.error_counts.get(game_id, 0) + 1

            # Check for game-ending conditions
            if "Game not playing" in error_msg:
                log.info(f"{label}: game ended during execution")
                return "finished"

            # Too many consecutive errors — resign and move on
            if self.error_counts[game_id] >= 3:
                log.warning(f"{label}: {self.error_counts[game_id]} consecutive errors, resigning")
                from executor import execute_calls
                execute_calls([{
                    "contractAddress": CONTRACT,
                    "entrypoint": "resign",
                    "calldata": [str(game_id)],
                }], f"{label} RESIGN")
                self.error_counts[game_id] = 0
                return "finished"

            if "multicall-failed" in error_msg:
                log.warning(f"{label}: multicall failed ({self.error_counts[game_id]}/3), will retry")
        else:
            # Reset error count on success
            self.error_counts[game_id] = 0

        return "ok"

    def _log_stats(self):
        s = self.stats
        log.info(
            f"Stats: {len(self.active_game_ids)} self-play | "
            f"{len(self.human_games)} vs human | "
            f"{s['games_created']} created | {s['turns_played']} turns | "
            f"{s['games_finished']} finished (P1:{s['p1_wins']} P2:{s['p2_wins']}) | "
            f"{s['errors']} errors"
        )


def main():
    parser = argparse.ArgumentParser(description="Hashfront Autoplay Bot")
    parser.add_argument("--once", action="store_true", help="Single tick then exit")
    parser.add_argument("--games", type=int, default=MAX_GAMES, help=f"Max concurrent games (default {MAX_GAMES})")
    parser.add_argument("--map", type=int, default=MAP_ID, help=f"Map ID (default {MAP_ID})")
    parser.add_argument("--interval", type=int, default=TICK_INTERVAL, help=f"Tick interval seconds (default {TICK_INTERVAL})")
    args = parser.parse_args()

    manager = GameManager(max_games=args.games, map_id=args.map)

    if args.once:
        log.info("=== Hashfront Autoplay — single tick ===")
        manager.tick()
        return

    log.info(f"=== Hashfront Autoplay — continuous mode ===")
    log.info(f"Max games: {args.games} | Map: {args.map} | Tick: {args.interval}s")

    while True:
        try:
            manager.tick()
        except KeyboardInterrupt:
            log.info("Shutting down...")
            break
        except Exception as e:
            log.error(f"Tick error: {e}")

        time.sleep(args.interval)


if __name__ == "__main__":
    main()
