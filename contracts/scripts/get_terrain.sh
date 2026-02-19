#!/usr/bin/env bash
set -euo pipefail

PROFILE=""
MAP_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    *)
      if [ -z "$MAP_ID" ]; then
        MAP_ID="$1"
      else
        echo "Usage: $0 [--profile <profile>] <map_id>" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$MAP_ID" ]; then
  echo "Usage: $0 [--profile <profile>] <map_id>" >&2
  exit 1
fi

PROFILE_ARGS=()
if [ -n "$PROFILE" ]; then
  PROFILE_ARGS=(--profile "$PROFILE")
fi

# Call the view function — output is hex values like 0x0x00...0a wrapped in [ ]
RAW=$(sozo call ${PROFILE_ARGS[@]:+"${PROFILE_ARGS[@]}"} chain_tactics-actions get_terrain "$MAP_ID" 2>&1)

# Strip brackets, parse hex to decimal
VALUES=()
for token in $RAW; do
  # Skip brackets
  [[ "$token" == "[" || "$token" == "]" ]] && continue
  # Strip 0x0x prefix -> 0x, then convert hex to decimal
  HEX="${token/#0x0x/0x}"
  VALUES+=("$(( HEX ))")
done

if [ ${#VALUES[@]} -lt 3 ]; then
  echo "Error: unexpected response from contract" >&2
  echo "$RAW" >&2
  exit 1
fi

WIDTH=${VALUES[0]}
HEIGHT=${VALUES[1]}
TILE_COUNT=${VALUES[2]}
TILES=("${VALUES[@]:3}")

if [ ${#TILES[@]} -ne "$TILE_COUNT" ]; then
  echo "Error: expected $TILE_COUNT tiles, got ${#TILES[@]}" >&2
  exit 1
fi

LOOKUP=('.' 'M' 'C' 'F' 'H' 'R' 'T' 'D')

# Build full grid initialized to grass
TOTAL=$(( WIDTH * HEIGHT ))
declare -a GRID
for (( i=0; i<TOTAL; i++ )); do
  GRID[$i]='.'
done

# Unpack each u32: (grid_index << 8) | tile_type
for (( t=0; t<TILE_COUNT; t++ )); do
  PACKED=${TILES[$t]}
  IDX=$(( PACKED / 256 ))
  TYPE=$(( PACKED % 256 ))
  GRID[$IDX]="${LOOKUP[$TYPE]}"
done

# Print grid
for (( y=0; y<HEIGHT; y++ )); do
  ROW=""
  for (( x=0; x<WIDTH; x++ )); do
    IDX=$(( y * WIDTH + x ))
    ROW+=$(printf '%-2s' "${GRID[$IDX]}")
  done
  echo "$ROW"
done
