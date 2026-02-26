#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAPS_DIR="$SCRIPT_DIR/maps"

PROFILE="sepolia"
DRY_RUN=0
BATCH_SIZE=3
declare -a MAPS=()
declare -a CALLS=()
declare -a BATCH_MAPS=()

usage() {
  cat <<'EOF'
Usage:
  register_all_maps.sh [--profile <profile>] [--batch <n>] [--dry-run] [map_name ...]

Description:
  Registers maps in batches (one transaction per batch):
  sozo execute --wait <map_call_1> / <map_call_2> / ...

Options:
  --profile <profile>  Sozo profile to use (default: sepolia)
  --batch <n>          Number of maps per transaction batch (default: 3)
  --dry-run            Print the multicall command and exit
  -h, --help           Show this help

Examples:
  ./register_all_maps.sh
  ./register_all_maps.sh --profile dev
  ./register_all_maps.sh --batch 2
  ./register_all_maps.sh --profile dev valley fortress
  ./register_all_maps.sh --dry-run
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      if [[ $# -lt 2 ]]; then
        echo "Error: --profile requires a value" >&2
        usage
        exit 1
      fi
      PROFILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --batch)
      if [[ $# -lt 2 ]]; then
        echo "Error: --batch requires a value" >&2
        usage
        exit 1
      fi
      BATCH_SIZE="$2"
      if ! [[ "$BATCH_SIZE" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: --batch must be a positive integer" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      MAPS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#MAPS[@]} -eq 0 ]]; then
  # Default map list for bulk registration.
  # Keep only bridgehead enabled for now; uncomment others when needed.
  MAPS=(
    bridgehead
    crossroads
    fortress
    gauntlet
    scattered
    valley
    terrain
    ridgeline
    archipelago
    ambush
    cliffside
    no_mans_land
  )
fi

if [[ ${#MAPS[@]} -eq 0 ]]; then
  echo "No maps found to register in $MAPS_DIR" >&2
  exit 1
fi

build_call_for_map() {
  local map_name="$1"
  local map_dir="$MAPS_DIR/$map_name"
  local terrain_file="$map_dir/terrain.txt"
  local buildings_file="$map_dir/buildings.txt"
  local units_file="$map_dir/units.txt"

  if [[ ! -d "$map_dir" ]]; then
    echo "Error: map directory not found: $map_dir" >&2
    exit 1
  fi
  if [[ ! -f "$terrain_file" ]]; then
    echo "Error: terrain.txt required but not found in $map_dir" >&2
    exit 1
  fi

  local -a rows=()
  while IFS= read -r line; do
    rows+=("$line")
  done < <(sed '/^[[:space:]]*$/d' "$terrain_file")

  local height="${#rows[@]}"
  if [[ "$height" -eq 0 ]]; then
    echo "Error: terrain.txt is empty in $map_dir" >&2
    exit 1
  fi

  local -a first_cells=()
  read -ra first_cells <<< "${rows[0]}"
  local width="${#first_cells[@]}"

  local -a tiles=()
  local tile_count=0

  local y
  for (( y=0; y<height; y++ )); do
    local -a cells=()
    read -ra cells <<< "${rows[$y]}"
    if [[ "${#cells[@]}" -ne "$width" ]]; then
      echo "Error: terrain row $y in $map_name has ${#cells[@]} cells, expected $width" >&2
      exit 1
    fi

    local x
    for (( x=0; x<width; x++ )); do
      local ch="${cells[$x]}"
      local tile_val=0
      case "$ch" in
        '.') continue ;;
        'M') tile_val=1 ;;
        'C') tile_val=2 ;;
        'F') tile_val=3 ;;
        'H') tile_val=4 ;;
        'R') tile_val=5 ;;
        'T') tile_val=6 ;;
        'D') tile_val=7 ;;
        'O') tile_val=8 ;;
        'b') tile_val=$(( 1 * 16 + 8 )) ;;  # Ocean + Bluff
        'k') tile_val=$(( 2 * 16 + 8 )) ;;  # Ocean + Cliff
        's') tile_val=$(( 3 * 16 + 8 )) ;;  # Ocean + Beach
        *)
          echo "Error: unknown tile char '$ch' at ($x,$y) in $map_name" >&2
          exit 1
          ;;
      esac
      local index=$(( y * width + x ))
      local packed=$(( index * 256 + tile_val ))
      tiles+=("$packed")
      tile_count=$((tile_count + 1))
    done
  done

  local -a buildings=()
  local building_count=0
  if [[ -f "$buildings_file" ]]; then
    while IFS= read -r line; do
      [[ "$line" =~ ^[[:space:]]*# ]] && continue
      [[ -z "${line// /}" ]] && continue

      local type player x y bt
      read -r type player x y <<< "$line"
      case "$type" in
        City) bt=1 ;;
        Factory) bt=2 ;;
        HQ) bt=3 ;;
        *)
          echo "Error: unknown building type '$type' in $map_name" >&2
          exit 1
          ;;
      esac
      buildings+=("$(( player * 16777216 + bt * 65536 + x * 256 + y ))")
      building_count=$((building_count + 1))
    done < "$buildings_file"
  fi

  local -a units=()
  local unit_count=0
  if [[ -f "$units_file" ]]; then
    while IFS= read -r line; do
      [[ "$line" =~ ^[[:space:]]*# ]] && continue
      [[ -z "${line// /}" ]] && continue

      local type player x y ut
      read -r type player x y <<< "$line"
      case "$type" in
        Infantry) ut=1 ;;
        Tank) ut=2 ;;
        Ranger) ut=3 ;;
        *)
          echo "Error: unknown unit type '$type' in $map_name" >&2
          exit 1
          ;;
      esac
      units+=("$(( player * 16777216 + ut * 65536 + x * 256 + y ))")
      unit_count=$((unit_count + 1))
    done < "$units_file"
  fi

  echo "Map '$map_name': ${width}x${height}, ${tile_count} tiles, ${building_count} buildings, ${unit_count} units"

  CALLS+=("hashfront-actions" "register_map" "str:$map_name" "$width" "$height" "$tile_count")
  CALLS+=("${tiles[@]}")
  CALLS+=("$building_count")
  CALLS+=("${buildings[@]}")
  CALLS+=("$unit_count")
  CALLS+=("${units[@]}")
}

echo "Preparing batched registration for ${#MAPS[@]} map(s) with profile '$PROFILE' (batch=$BATCH_SIZE)"

total_maps=${#MAPS[@]}
processed_maps=0
batch_count=0

for map in "${MAPS[@]}"; do
  if [[ "$batch_count" -gt 0 ]]; then
    CALLS+=("/")
  fi

  build_call_for_map "$map"
  BATCH_MAPS+=("$map")
  batch_count=$((batch_count + 1))
  processed_maps=$((processed_maps + 1))

  if [[ "$batch_count" -lt "$BATCH_SIZE" && "$processed_maps" -lt "$total_maps" ]]; then
    continue
  fi

  CMD=(sozo execute --wait --profile "$PROFILE" --max-calls "$batch_count" "${CALLS[@]}")

  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf 'Dry run command (batch: %s):\n' "${BATCH_MAPS[*]}"
    printf '%q ' "${CMD[@]}"
    printf '\n\n'
  else
    echo ""
    echo "=== Registering batch: ${BATCH_MAPS[*]} ==="
    "${CMD[@]}"
  fi

  CALLS=()
  BATCH_MAPS=()
  batch_count=0
done
