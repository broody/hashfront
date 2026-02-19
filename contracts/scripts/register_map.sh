#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <terrain.txt>" >&2
  exit 1
fi

MAP_FILE="$1"

if [ ! -f "$MAP_FILE" ]; then
  echo "Error: file not found: $MAP_FILE" >&2
  exit 1
fi

# Read non-empty lines into array
mapfile -t ROWS < <(sed '/^[[:space:]]*$/d' "$MAP_FILE")

HEIGHT=${#ROWS[@]}
if [ "$HEIGHT" -eq 0 ]; then
  echo "Error: map file is empty" >&2
  exit 1
fi

# Parse double-spaced format: "T T T . . M M"
# Split first row to determine width
read -ra FIRST_CELLS <<< "${ROWS[0]}"
WIDTH=${#FIRST_CELLS[@]}

# Build sparse tile values: only non-grass tiles as packed u32 = (index << 8) | type
TILES=""
TILE_COUNT=0

for (( y=0; y<HEIGHT; y++ )); do
  read -ra CELLS <<< "${ROWS[$y]}"
  if [ ${#CELLS[@]} -ne "$WIDTH" ]; then
    echo "Error: row $y has ${#CELLS[@]} cells, expected $WIDTH" >&2
    exit 1
  fi
  for (( x=0; x<WIDTH; x++ )); do
    CH="${CELLS[$x]}"
    case "$CH" in
      '.') continue ;;  # Skip grass
      'M') V=1 ;;
      'C') V=2 ;;
      'F') V=3 ;;
      'H') V=4 ;;
      'R') V=5 ;;
      'T') V=6 ;;
      'D') V=7 ;;
      *) echo "Error: unknown tile char '$CH' at ($x,$y)" >&2; exit 1 ;;
    esac
    INDEX=$(( y * WIDTH + x ))
    PACKED=$(( INDEX * 256 + V ))
    if [ -z "$TILES" ]; then
      TILES="$PACKED"
    else
      TILES="$TILES $PACKED"
    fi
    TILE_COUNT=$(( TILE_COUNT + 1 ))
  done
done

# Buildings: HQ at opposite corners
# packed u32 = (player_id << 24) | (building_type << 16) | (x << 8) | y
# BuildingType::HQ = 3
LAST_X=$(( WIDTH - 1 ))
LAST_Y=$(( HEIGHT - 1 ))
B1=$(( 1 * 16777216 + 3 * 65536 + 0 * 256 + 0 ))               # P1 HQ @ (0, 0)
B2=$(( 2 * 16777216 + 3 * 65536 + LAST_X * 256 + LAST_Y ))      # P2 HQ @ (W-1, H-1)
BUILDING_COUNT=2
BUILDINGS="$B1 $B2"

# Units: 1 infantry per player next to their HQ
# packed u32 = (player_id << 24) | (unit_type << 16) | (x << 8) | y
# UnitType::Infantry = 1
U1=$(( 1 * 16777216 + 1 * 65536 + 1 * 256 + 0 ))                       # P1 Infantry @ (1, 0)
U2=$(( 2 * 16777216 + 1 * 65536 + (LAST_X - 1) * 256 + LAST_Y ))       # P2 Infantry @ (W-2, H-1)
UNIT_COUNT=2
UNITS="$U1 $U2"

echo "Map: ${WIDTH}x${HEIGHT}, ${TILE_COUNT} tiles, ${BUILDING_COUNT} buildings, ${UNIT_COUNT} units"

sozo execute chain_tactics-actions register_map \
  $WIDTH $HEIGHT \
  $TILE_COUNT $TILES \
  $BUILDING_COUNT $BUILDINGS \
  $UNIT_COUNT $UNITS
