# Hashfront Autonomous Research Program

Your goal is to maximize the win rate of an AI agent playing the turn-based tactics game Hashfront against a randomized ensemble of heuristic opponents: `AggressiveStrategy`, `DefensiveStrategy`, `RushStrategy`, and `BalancedStrategy`.

## Instructions & Constraints:

1. Modify only `train.py` unless the simulator API changes again.
2. The source of truth for game rules is `../tools/simulator.py`. Match its current units, combat formulas, movement rules, capture rules, and map loading.
3. The current roster is `INFANTRY`, `TANK`, and `ARTILLERY`. Do not reintroduce stale simulator assumptions.
4. Training must keep the fixed 300-second wall-clock budget.
5. At the end of a run, print `Final win rate: X.XXXX`.
6. Measure robustness against the full heuristic ensemble, not a single baseline opponent.
7. The trainer now mixes heuristic opponents with frozen self-play snapshots. Improve the league, not just heuristic win rate.

Focus on improving policy quality through better action representations, observation design, reward shaping, exploration, optimization, or validation strategy while staying aligned with the live Hashfront simulator.
