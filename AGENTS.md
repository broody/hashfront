# AGENTS.md — Hashfront

## Pre-commit Checklist

Always run before every check-in:

```bash
pnpm format && pnpm build
```

If either fails, fix before committing. No exceptions.

## Commit Messages

Use the following commit message format for check-ins:

```text
feat: <concise description>
```

## Balance & Unit Stats

All unit stats, terrain modifiers, and combat formulas live in [`BALANCE.md`](BALANCE.md).
Contracts (`contracts/src/helpers/unit_stats.cairo`) must match those values.

## Stack

- **Client:** Vite + React + TypeScript + PixiJS v8 + pixi-viewport
- **Contracts:** Dojo/Cairo (TBD)
- **Indexer:** Torii (TBD)

## Contracts

- Optimize for gas — this is an on-chain game and inefficient execution leads to higher transaction fees
- Use the `/dojo` skill when modifying contracts for Dojo-specific patterns and best practices

## Conventions

- Use `type` imports for type-only symbols (`import type { Foo }`)
- No TypeScript `enum` — use `as const` objects instead (erasableSyntaxOnly)
- Data layer abstracted in `src/data/` for future Torii swap

## Autoresearch

- `autoresearch/program.md` is the task contract for autonomous model-improvement work
- Unless the simulator API changes, limit autoresearch edits to `autoresearch/train.py`
- Build the Rust simulator first: `cd autoresearch && uv run maturin develop --release --manifest-path ../tools/hashfront_sim/Cargo.toml`
- Run training from `autoresearch/` with `uv run train.py`
- The trainer now auto-resumes from `autoresearch/checkpoints/best.pt` and writes run metrics to `autoresearch/checkpoints/history.jsonl` and `autoresearch/checkpoints/last_run.json`
- Recommended full self-play run: `uv run train.py --parallel-envs 8 --sim-workers 8 --self-play-ratio 1.0 --validation-interval 150`
- `--sim-workers` enables multi-process CPU-side simulator parallelism while the main process keeps batched policy inference and learning
- Use `--fresh-start` to ignore the saved incumbent, or `--checkpoint-dir <dir>` to branch a separate experiment line
- Keep the 300-second wall-clock budget and ensure the run still prints `Final win rate: X.XXXX`
