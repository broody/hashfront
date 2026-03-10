# Hashfront — Balance Reference

Source of truth for unit stats, terrain modifiers, and combat rules.
Contracts (`contracts/src/helpers/unit_stats.cairo`) must match these values.

---

## Units

| Stat | Infantry | Tank | Artillery |
|---|:---:|:---:|:---:|
| **HP** | 10 | 10 | 10 |
| **Move** | 2 | 3 | 3 |
| **Range** | 1 | 1 | 2-3 |
| **Cost** | 1 | 4 | 2 |
| **Accuracy** | 90 | 85 | 88 |

### Abilities

| Ability | Infantry | Tank | Artillery |
|---|:---:|:---:|:---:|
| **Capture** | yes | - | - |
| **Mountains** | yes (cost 1) | - | - |
| **Road Bonus** | - | +1 | +1 |
| **Attack After Move** | yes | yes | - |

---

## Terrain

| Tile | Move Cost | Defense | Evasion |
|---|:---:|:---:|:---:|
| Grass | 1 | 0 | 0 |
| Road | 1 | 0 | 0 |
| DirtRoad | 1 | 0 | 0 |
| Tree | 1 | 1 | 5 |
| City | 1 | 1 | 8 |
| Factory | 1 | 1 | 8 |
| HQ | 1 | 2 | 10 |
| Mountain | 1 (Infantry only) | 2 | 12 |
| Ocean | — | 0 | 0 |

Traversal restrictions: Mountains = Infantry only. Ocean = impassable (future: air/naval).

Road bonus: Tank and Artillery gain +1 temporary movement when they start on Road or DirtRoad.

---

## Combat

```
hit_chance = clamp(75, 95, base_accuracy - terrain_evasion - move_penalty - range_penalty)
hit_damage = max(base_damage(attacker_type, defender_type) - terrain_defense, 1)
```

### Base Damage Matrix

Damage on a hit before terrain defense:

| Attacker \ Defender | Infantry | Tank | Artillery |
|---|:---:|:---:|:---:|
| Infantry | 3 | 1 | 4 |
| Tank | 5 | 4 | 5 |
| Artillery | 3 | 5 | 2 |

| Modifier | Value | Condition |
|---|:---:|---|
| Move penalty | 5 | Attacker moved this turn |
| Range penalty | 5 | Artillery attacking at range 3 |

**Graze**: On miss, deal 1 damage — but only if `hit_damage >= 2`. Otherwise true whiff (0).

**Counterattack**: If defender survives and attacker is within defender's range, defender counterattacks using the same base damage matrix and hit formula (`move_penalty = 0`, uses the attacker's terrain for evasion/defense).
