#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <map_id>" >&2
  exit 1
fi

MAP_ID="$1"

# Call the view function
RAW=$(sozo call chain_tactics-actions get_buildings "$MAP_ID" 2>&1)

# Strip brackets, parse hex to decimal
VALUES=()
for token in $RAW; do
  [[ "$token" == "[" || "$token" == "]" ]] && continue
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
BUILDING_COUNT=${VALUES[2]}
BUILDINGS=("${VALUES[@]:3}")

if [ ${#BUILDINGS[@]} -ne "$BUILDING_COUNT" ]; then
  echo "Error: expected $BUILDING_COUNT buildings, got ${#BUILDINGS[@]}" >&2
  exit 1
fi

# BuildingType: None=0, City=1, Factory=2, HQ=3
# Display: player_id + building char (c=City, f=Factory, h=HQ), 0=neutral
BLDG_CHARS=('?' 'c' 'f' 'h')

# Build empty grid
TOTAL=$(( WIDTH * HEIGHT ))
declare -a GRID
for (( i=0; i<TOTAL; i++ )); do
  GRID[$i]='.'
done

# Unpack each u32: (player_id << 24) | (building_type << 16) | (x << 8) | y
for (( b=0; b<BUILDING_COUNT; b++ )); do
  PACKED=${BUILDINGS[$b]}
  PLAYER=$(( PACKED / 16777216 ))
  BTYPE=$(( (PACKED / 65536) % 256 ))
  X=$(( (PACKED / 256) % 256 ))
  Y=$(( PACKED % 256 ))
  IDX=$(( Y * WIDTH + X ))
  GRID[$IDX]="${PLAYER}${BLDG_CHARS[$BTYPE]}"
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
