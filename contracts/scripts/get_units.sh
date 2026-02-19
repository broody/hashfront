#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <map_id>" >&2
  exit 1
fi

MAP_ID="$1"

# Call the view function
RAW=$(sozo call chain_tactics-actions get_units "$MAP_ID" 2>&1)

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
UNIT_COUNT=${VALUES[2]}
UNITS=("${VALUES[@]:3}")

if [ ${#UNITS[@]} -ne "$UNIT_COUNT" ]; then
  echo "Error: expected $UNIT_COUNT units, got ${#UNITS[@]}" >&2
  exit 1
fi

# UnitType: None=0, Infantry=1, Tank=2, Ranger=3
# Display: player_id + unit char (i=Infantry, t=Tank, r=Ranger)
UNIT_CHARS=('?' 'i' 't' 'r')

# Build empty grid
TOTAL=$(( WIDTH * HEIGHT ))
declare -a GRID
for (( i=0; i<TOTAL; i++ )); do
  GRID[$i]='.'
done

# Unpack each u32: (player_id << 24) | (unit_type << 16) | (x << 8) | y
for (( u=0; u<UNIT_COUNT; u++ )); do
  PACKED=${UNITS[$u]}
  PLAYER=$(( PACKED / 16777216 ))
  UTYPE=$(( (PACKED / 65536) % 256 ))
  X=$(( (PACKED / 256) % 256 ))
  Y=$(( PACKED % 256 ))
  IDX=$(( Y * WIDTH + X ))
  GRID[$IDX]="${PLAYER}${UNIT_CHARS[$UTYPE]}"
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
