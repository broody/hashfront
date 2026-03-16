# Hashfront Autonomous Research Program

This is an experiment to have the LLM do its own research to build the strongest possible Hashfront game-playing agent.

## Goal

Maximize the win rate of an AI policy playing the turn-based tactics game Hashfront against:
1. A randomized ensemble of heuristic opponents: `AggressiveStrategy`, `DefensiveStrategy`, `RushStrategy`, and `BalancedStrategy`.
2. Frozen self-play snapshots (a league of past policy versions).

The primary metric is `Final win rate` (heuristic ensemble). The secondary metric is `best_self_play` (league quality).

## Setup

To set up a new experiment run, work with the user to:

1. **Agree on a run tag**: propose a tag based on today's date (e.g. `mar13`). The branch `autoresearch/<tag>` must not already exist — this is a fresh run.
2. **Create the branch**: `git checkout -b autoresearch/<tag>` from current main.
3. **Read the in-scope files**: Read these files for full context:
   - `train.py` — the file you modify. Policy network, training loop, reward shaping, observation encoding, candidate enumeration.
   - `../tools/simulator.py` — game rules reference. Do not modify.
   - `../tools/hashfront_sim/src/lib.rs` — Rust simulator port. Modify only if needed for new observations or API changes.
4. **Build the Rust simulator**: `uv run maturin develop --release --manifest-path ../tools/hashfront_sim/Cargo.toml`
5. **Initialize results.tsv**: Create `results.tsv` with just the header row. The baseline will be recorded after the first run.
6. **Confirm and go**: Confirm setup looks good.

Once you get confirmation, kick off the experimentation.

## Constraints

- **Modify `train.py`** — this is the primary file you edit. Everything is fair game: network architecture, optimizer, hyperparameters, reward shaping, observation design, action representation, exploration strategy, training loop.
- **Do NOT modify `../tools/simulator.py`**. It is the source of truth for game rules.
- You MAY modify `../tools/hashfront_sim/src/lib.rs` if you need to expose new data for observations or add helper functions. Rebuild with maturin after changes.
- The current unit roster is `INFANTRY`, `TANK`, and `ARTILLERY`. Do not reintroduce stale simulator assumptions.
- Training must keep the **fixed 400-second wall-clock budget**.
- At the end of a run, print `Final win rate: X.XXXX`.

**Simplicity criterion**: All else being equal, simpler is better. A small improvement that adds ugly complexity is not worth it. Removing something and getting equal or better results is a simplification win. Weigh the complexity cost against the improvement magnitude.

## Running an experiment

Each experiment runs on a single GPU. The training script runs for a fixed time budget of 400 seconds. Launch it as:

```
uv run python train.py > run.log 2>&1
```

Default args use 12 sim workers and self-play. You can tune CLI args:

```
uv run python train.py --parallel-envs 16 --sim-workers 12 --self-play-ratio 1.0 --validation-interval 150 > run.log 2>&1
```

Once the script finishes, extract results:

```
grep "Final win rate:\|best_self_play\|Best self-play" run.log
```

## Logging results

When an experiment is done, log it to `results.tsv` (tab-separated, NOT comma-separated).

The TSV has a header row and 5 columns:

```
commit	win_rate	self_play	status	description
```

1. git commit hash (short, 7 chars)
2. Final win rate against heuristic ensemble (e.g. 0.9524) — use 0.0000 for crashes
3. Best self-play score (e.g. 0.6667) — use 0.0000 for crashes
4. status: `keep`, `discard`, or `crash`
5. short text description of what this experiment tried

Example:

```
commit	win_rate	self_play	status	description
a1b2c3d	0.9524	0.5000	keep	baseline
b2c3d4e	0.9722	0.6667	keep	increase entropy bonus
c3d4e5f	0.9100	0.3333	discard	halve network width
d4e5f6g	0.0000	0.0000	crash	batch candidate features (shape mismatch)
```

## The experiment loop

The experiment runs on a dedicated branch (e.g. `autoresearch/mar13`).

LOOP FOREVER:

1. Look at the git state: the current branch/commit we're on
2. Tune `train.py` with an experimental idea by directly hacking the code.
3. git commit
4. Run the experiment: `uv run python train.py --fresh-start > run.log 2>&1` (redirect everything — do NOT use tee or let output flood your context)
5. Read out the results: `grep "Final win rate:\|best_self_play\|Best self-play" run.log`
6. If the grep output is empty, the run crashed. Run `tail -n 50 run.log` to read the Python stack trace and attempt a fix. If you can't get things to work after more than a few attempts, give up.
7. Record the results in the tsv (NOTE: do not commit the results.tsv file, leave it untracked by git)
8. If win_rate improved (higher) or self_play improved while win_rate held, you "advance" the branch, keeping the git commit
9. If both metrics are equal or worse, you `git reset --hard` back to where you started

The idea is that you are a completely autonomous researcher trying things out. If they work, keep. If they don't, discard. And you're advancing the branch so that you can iterate.

**Fresh checkpoints**: Use `--fresh-start` for each experiment so results are comparable. The 400-second budget is the full training time.

**Timeout**: Each experiment should take ~5 minutes total (+ a few seconds for startup and eval overhead). If a run exceeds 10 minutes, kill it and treat it as a failure.

**Crashes**: If a run crashes (OOM, bug, etc.), use your judgment: If it's something easy to fix (typo, missing import), fix and re-run. If the idea itself is broken, skip it, log "crash", and move on.

**NEVER STOP**: Once the experiment loop has begun, do NOT pause to ask the human if you should continue. Do NOT ask "should I keep going?". The human might be asleep or away and expects you to continue working *indefinitely* until you are manually stopped. You are autonomous. If you run out of ideas, think harder — re-read train.py for new angles, try combining previous near-misses, try more radical architectural changes. The loop runs until the human interrupts you, period.

## Ideas to explore

Here are some directions to consider (not exhaustive):

- **Architecture**: Deeper/wider conv layers, attention mechanisms, residual connections, different pooling strategies
- **Reward shaping**: Better immediate rewards, capture bonuses, territorial control signals
- **Observation design**: Additional board channels, global features, relative position encodings
- **Exploration**: Temperature schedules, entropy bonuses, epsilon-greedy, curiosity-driven exploration
- **Training efficiency**: Larger batches, gradient accumulation, learning rate schedules, different optimizers
- **Self-play**: Pool management, ELO-based matchmaking, population-based training
- **Candidate features**: Better action representations, more informative feature vectors
- **Imitation learning**: Curriculum from heuristic teacher, KL divergence scheduling
