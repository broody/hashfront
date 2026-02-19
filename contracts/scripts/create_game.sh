#!/usr/bin/env bash
set -euo pipefail

PROFILE=""
MAP_ID=""
PLAYER_ID="2"
TEST_MODE="1"

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
    *)
      if [ -z "$MAP_ID" ]; then
        MAP_ID="$1"
      else
        echo "Usage: $0 [--profile <profile>] [--player <player_id>] [--no-test] <map_id>" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$MAP_ID" ]; then
  echo "Usage: $0 [--profile <profile>] [--player <player_id>] [--no-test] <map_id>" >&2
  exit 1
fi

PROFILE_ARGS=()
if [ -n "$PROFILE" ]; then
  PROFILE_ARGS=(--profile "$PROFILE")
fi

echo "Creating game: map_id=$MAP_ID, player_id=$PLAYER_ID, test_mode=$TEST_MODE"

sozo execute ${PROFILE_ARGS[@]:+"${PROFILE_ARGS[@]}"} chain_tactics-actions create_game \
  $MAP_ID $PLAYER_ID $TEST_MODE
