#!/usr/bin/env bash
set -euo pipefail

PROFILE="sepolia"
MAP_ID=""
PLAYER_ID="1"
TEST_MODE="1"
GAME_NAME=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --player)
      PLAYER_ID="$2"
      shift 2
      ;;
    --no-test)
      TEST_MODE="0"
      shift
      ;;
    --name)
      GAME_NAME="$2"
      shift 2
      ;;
    *)
      if [ -z "$MAP_ID" ]; then
        MAP_ID="$1"
      else
        echo "Usage: $0 [--profile <profile>] [--player <player_id>] [--no-test] [--name <name>] <map_id> (default profile: sepolia)" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$MAP_ID" ]; then
  echo "Usage: $0 [--profile <profile>] [--player <player_id>] [--no-test] [--name <name>] <map_id> (default profile: sepolia)" >&2
  exit 1
fi

if [ -z "$GAME_NAME" ]; then
  GAME_NAME="game-$MAP_ID"
fi

PROFILE_ARGS=()
if [ -n "$PROFILE" ]; then
  PROFILE_ARGS=(--profile "$PROFILE")
fi

echo "Creating game: name=$GAME_NAME, map_id=$MAP_ID, player_id=$PLAYER_ID, test_mode=$TEST_MODE"

sozo execute ${PROFILE_ARGS[@]:+"${PROFILE_ARGS[@]}"} hashfront-actions create_game \
  str:"$GAME_NAME" $MAP_ID $PLAYER_ID $TEST_MODE
