#!/bin/sh

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

torii --config "$ROOT/contracts/torii_sepolia.toml" --db-dir "$ROOT/torii-db"
