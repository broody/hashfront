# Gas Usage Comparison: Per-Player Spawn vs Bulk Spawn

**Date:** 2026-02-20
**Commit (before):** `7c8bf11` (main)
**Change:** Per-player unit spawning in `create_game`/`join_game` instead of bulk spawn on game start

## Per-Function Gas Analysis

Test gas is cumulative (each test includes setup). By subtracting shared setup costs,
we can isolate the actual per-function gas changes.

### Isolated function costs (derived from test deltas)

| Function | Before | After | Delta | Notes |
|----------|--------|-------|-------|-------|
| `create_game` | baseline | +9,537,287 | **+9,537,287** | Now spawns creator's 1 unit |
| `join_game` (last player) | baseline | -3,820,742 | **-3,820,742** | No longer bulk-spawns all units |
| **Total (create + join)** | — | — | **+5,716,545** | Net cost of extra `read_model(game)` in create_game |

**How derived:**
- `test_create_game` delta = **+9,537,287** (only calls `create_game`, so this is the pure `create_game` increase)
- `test_join_game` delta = **+5,716,545** (calls `create_game` + `join_game`)
- Isolated `join_game` delta = 5,716,545 - 9,537,287 = **-3,820,742** (join_game got cheaper)

### What this means in production

| | Before (bulk spawn) | After (per-player spawn) |
|---|---|---|
| **Creator tx** (`create_game`) | Spawns 0 units | Spawns own units (+9.5M gas) |
| **Joiner tx** (`join_game`) | Spawns ALL units for ALL players | Spawns only own units (-3.8M gas) |
| **Gas fairness** | Last joiner pays for everyone | Each player pays for their own |

The ~5.7M net increase across the full flow comes from the extra `world.read_model(@game)`
call added in `create_game` to re-read the game after initial write and persist `next_unit_id`.

## Test-Level Results

Tests that only call `register_map` are unchanged. All other tests include `create_game`
in their setup, so they all show the +9.5M (create-only) or +5.7M (create+join) increase.

| Test | Before | After | Delta |
|------|--------|-------|-------|
| **register_map (unchanged)** | | | |
| test_register_map | 33,513,542 | 33,513,542 | 0 |
| test_register_map_grass_not_allowed | 23,436,952 | 23,436,952 | 0 |
| test_register_map_out_of_bounds | 24,930,430 | 24,930,430 | 0 |
| test_register_map_too_few_hqs | 24,202,306 | 24,202,306 | 0 |
| test_register_map_too_many_hqs | 34,581,874 | 34,581,874 | 0 |
| test_register_map_unit_invalid_player | 26,871,538 | 26,871,538 | 0 |
| test_register_map_with_mixed_tiles | 42,523,003 | 42,523,003 | 0 |
| **create_game tests (+9.5M from create_game)** | | | |
| test_create_game | 45,385,094 | 54,922,381 | +9,537,287 |
| test_create_game_invalid_map | 22,037,415 | 22,302,275 | +264,860 |
| **join_game tests (create+join setup: +5.7M)** | | | |
| test_join_game | 72,444,505 | 78,161,050 | +5,716,545 |
| test_join_game_already_joined | 43,207,500 | 52,744,677 | +9,537,177 |
| test_join_game_already_playing | 71,755,341 | 77,471,896 | +5,716,555 |
| test_join_game_assigns_hqs | 71,642,128 | 77,358,673 | +5,716,545 |
| test_join_game_full | 71,755,341 | 77,471,896 | +5,716,555 |
| test_join_game_runs_p1_income | 70,868,916 | 76,585,461 | +5,716,545 |
| test_join_game_spawns_units | 75,474,949 | 81,191,494 | +5,716,545 |
| test_self_play_game | 71,627,689 | 77,344,034 | +5,716,345 |
| **gameplay tests (create+join setup: +5.7M)** | | | |
| test_attack_already_acted | 89,596,013 | 95,312,558 | +5,716,545 |
| test_attack_both_survive | 86,934,800 | 92,651,345 | +5,716,545 |
| test_attack_counterattack_kills_attacker | 92,815,786 | 98,532,331 | +5,716,545 |
| test_attack_kills_defender | 94,781,122 | 100,497,667 | +5,716,545 |
| test_attack_not_your_turn | 78,430,733 | 84,147,278 | +5,716,545 |
| test_attack_out_of_range | 74,793,305 | 80,509,850 | +5,716,545 |
| test_attack_own_unit | 80,488,511 | 86,205,056 | +5,716,545 |
| test_build_infantry | 80,754,187 | 86,470,732 | +5,716,545 |
| test_build_ranger | 80,753,967 | 86,470,512 | +5,716,545 |
| test_build_tank | 80,754,377 | 86,470,922 | +5,716,545 |
| test_build_unit_already_queued | 82,665,898 | 88,382,443 | +5,716,545 |
| test_build_unit_not_a_factory | 75,753,305 | 81,469,850 | +5,716,545 |
| test_build_unit_not_enough_gold | 78,389,445 | 84,105,990 | +5,716,545 |
| test_build_unit_not_your_factory | 77,621,105 | 83,337,650 | +5,716,545 |
| test_build_unit_type_none | 75,311,393 | 81,027,938 | +5,716,545 |
| test_capture_completes | 87,303,976 | 93,020,521 | +5,716,545 |
| test_capture_enemy_building_updates_counts | 91,223,440 | 96,939,985 | +5,716,545 |
| test_capture_first_step | 83,715,990 | 89,432,535 | +5,716,545 |
| test_capture_hq_wins_game | 92,574,430 | 98,290,975 | +5,716,545 |
| test_capture_no_building | 75,464,323 | 81,180,868 | +5,716,545 |
| test_capture_not_infantry | 78,994,871 | 84,711,416 | +5,716,545 |
| test_capture_own_building | 77,765,123 | 83,481,668 | +5,716,545 |
| test_end_turn_not_your_turn | 73,107,717 | 78,824,262 | +5,716,545 |
| test_end_turn_resets_unit_flags | 107,129,230 | 112,845,775 | +5,716,545 |
| test_end_turn_round_increments | 99,905,387 | 105,621,932 | +5,716,545 |
| test_end_turn_runs_income | 88,539,462 | 94,256,007 | +5,716,545 |
| test_end_turn_runs_production | 93,633,617 | 99,350,162 | +5,716,545 |
| test_end_turn_switches_player | 85,771,903 | 91,488,448 | +5,716,545 |
| test_end_turn_timeout | 90,307,314 | 96,023,859 | +5,716,545 |
| test_move_unit_already_moved | 82,059,702 | 87,776,247 | +5,716,545 |
| test_move_unit_diagonal_path | 79,718,123 | 85,434,668 | +5,716,545 |
| test_move_unit_empty_path | 74,166,511 | 79,883,056 | +5,716,545 |
| test_move_unit_exceeds_range | 76,665,317 | 82,381,862 | +5,716,545 |
| test_move_unit_full_range | 80,369,951 | 86,086,496 | +5,716,545 |
| test_move_unit_not_your_turn | 73,144,347 | 78,860,892 | +5,716,545 |
| test_move_unit_not_your_unit | 74,172,331 | 79,888,876 | +5,716,545 |
| test_move_unit_one_step | 79,066,195 | 84,782,740 | +5,716,545 |
| test_move_unit_path_not_adjacent | 74,172,331 | 79,888,876 | +5,716,545 |
| test_move_unit_steps_not_adjacent | 75,062,089 | 80,778,634 | +5,716,545 |
| test_wait_unit | 76,175,259 | 81,891,804 | +5,716,545 |
| test_wait_unit_not_your_turn | 72,702,337 | 78,418,882 | +5,716,545 |
| test_wait_unit_not_your_unit | 73,730,321 | 79,446,866 | +5,716,545 |
