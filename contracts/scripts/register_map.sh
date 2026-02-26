#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAPS_DIR="$SCRIPT_DIR/maps"

PROFILE="sepolia"
MAP_NAME=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    *)
      if [ -z "$MAP_NAME" ]; then
        MAP_NAME="$1"
      else
        echo "Usage: $0 [--profile <profile>] <map_name> (default profile: sepolia)" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$MAP_NAME" ]; then
  echo "Usage: $0 [--profile <profile>] <map_name> (default profile: sepolia)" >&2
  echo "Available maps:" >&2
  for d in "$MAPS_DIR"/*/; do
    name="$(basename "$d")"
    [[ "$name" == _* ]] && continue
    echo "  $name" >&2
  done
  exit 1
fi

MAP_DIR="$MAPS_DIR/$MAP_NAME"
TERRAIN_FILE="$MAP_DIR/terrain.txt"
BUILDINGS_FILE="$MAP_DIR/buildings.txt"
UNITS_FILE="$MAP_DIR/units.txt"

if [ ! -d "$MAP_DIR" ]; then
  echo "Error: map directory not found: $MAP_DIR" >&2
  exit 1
fi

if [ ! -f "$TERRAIN_FILE" ]; then
  echo "Error: terrain.txt required but not found in $MAP_DIR" >&2
  exit 1
fi

# ============================================================================
# Parse terrain
# ============================================================================

ROWS=()
while IFS= read -r line; do
  ROWS+=("$line")
done < <(sed '/^[[:space:]]*$/d' "$TERRAIN_FILE")

HEIGHT=${#ROWS[@]}
if [ "$HEIGHT" -eq 0 ]; then
  echo "Error: terrain.txt is empty" >&2
  exit 1
fi

read -ra FIRST_CELLS <<< "${ROWS[0]}"
WIDTH=${#FIRST_CELLS[@]}

# Build sparse tile values: only non-grass tiles as packed u32 = (index << 8) | type
TILES=""
TILE_COUNT=0

for (( y=0; y<HEIGHT; y++ )); do
  read -ra CELLS <<< "${ROWS[$y]}"
  if [ ${#CELLS[@]} -ne "$WIDTH" ]; then
    echo "Error: terrain row $y has ${#CELLS[@]} cells, expected $WIDTH" >&2
    exit 1
  fi
  for (( x=0; x<WIDTH; x++ )); do
    CH="${CELLS[$x]}"
    case "$CH" in
      '.') continue ;;
      'M') V=1 ;;
      'C') V=2 ;;
      'F') V=3 ;;
      'H') V=4 ;;
      'R') V=5 ;;
      'T') V=6 ;;
      'D') V=7 ;;
      'O') V=8 ;;
      'b') V=$(( 1 * 16 + 8 )) ;;  # Ocean + Bluff
      'k') V=$(( 2 * 16 + 8 )) ;;  # Ocean + Cliff
      's') V=$(( 3 * 16 + 8 )) ;;  # Ocean + Beach
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

# ============================================================================
# Parse buildings (optional)
# ============================================================================

# packed u32 = (player_id << 24) | (building_type << 16) | (x << 8) | y
# BuildingType: City=1, Factory=2, HQ=3

BUILDINGS=""
BUILDING_COUNT=0

if [ -f "$BUILDINGS_FILE" ]; then
  while IFS= read -r line; do
    # Skip comments and blank lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue

    read -r TYPE PLAYER X Y <<< "$line"
    case "$TYPE" in
      City)    BT=1 ;;
      Factory) BT=2 ;;
      HQ)      BT=3 ;;
      *) echo "Error: unknown building type '$TYPE'" >&2; exit 1 ;;
    esac
    PACKED=$(( PLAYER * 16777216 + BT * 65536 + X * 256 + Y ))
    if [ -z "$BUILDINGS" ]; then
      BUILDINGS="$PACKED"
    else
      BUILDINGS="$BUILDINGS $PACKED"
    fi
    BUILDING_COUNT=$(( BUILDING_COUNT + 1 ))
  done < "$BUILDINGS_FILE"
  echo "  buildings.txt: ${BUILDING_COUNT} buildings"
else
  echo "  buildings.txt: not found, skipping"
fi

# ============================================================================
# Parse units (optional)
# ============================================================================

# packed u32 = (player_id << 24) | (unit_type << 16) | (x << 8) | y
# UnitType: Infantry=1, Tank=2, Ranger=3

UNITS=""
UNIT_COUNT=0

if [ -f "$UNITS_FILE" ]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue

    read -r TYPE PLAYER X Y <<< "$line"
    case "$TYPE" in
      Infantry) UT=1 ;;
      Tank)     UT=2 ;;
      Ranger)   UT=3 ;;
      *) echo "Error: unknown unit type '$TYPE'" >&2; exit 1 ;;
    esac
    PACKED=$(( PLAYER * 16777216 + UT * 65536 + X * 256 + Y ))
    if [ -z "$UNITS" ]; then
      UNITS="$PACKED"
    else
      UNITS="$UNITS $PACKED"
    fi
    UNIT_COUNT=$(( UNIT_COUNT + 1 ))
  done < "$UNITS_FILE"
  echo "  units.txt: ${UNIT_COUNT} units"
else
  echo "  units.txt: not found, skipping"
fi

# ============================================================================
# Register
# ============================================================================

echo "Map '$MAP_NAME': ${WIDTH}x${HEIGHT}, ${TILE_COUNT} tiles, ${BUILDING_COUNT} buildings, ${UNIT_COUNT} units"

PROFILE_ARGS=()
if [ -n "$PROFILE" ]; then
  PROFILE_ARGS=(--profile "$PROFILE")
fi

sozo execute --wait ${PROFILE_ARGS[@]:+"${PROFILE_ARGS[@]}"} hashfront-actions register_map \
  str:"$MAP_NAME" \
  $WIDTH $HEIGHT \
  $TILE_COUNT $TILES \
  $BUILDING_COUNT $BUILDINGS \
  $UNIT_COUNT $UNITS
