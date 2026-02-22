#!/usr/bin/env python3
"""
Hashfront Balance Analyzer

Runs combat math from the PRD across all unit matchups and terrain types.
No game simulation — just expected values from the formulas.

Usage: python3 tools/balance_analyzer_2.py
"""

# === Unit Definitions ===

# Source of truth for this script is PRD.md (theory model), not current contracts.
UNITS = {
    "Infantry": {"hp": 3, "atk": 2, "move": 4, "range": (1, 1), "cost": 1, "accuracy": 90, "can_attack_after_move": True},
    "Tank":     {"hp": 5, "atk": 4, "move": 2, "range": (1, 1), "cost": 3, "accuracy": 85, "can_attack_after_move": True},
    "Ranger":   {"hp": 4, "atk": 3, "move": 3, "range": (2, 3), "cost": 2, "accuracy": 88, "can_attack_after_move": False},
}

# === Terrain Definitions ===

TERRAINS = {
    "Grass":    {"defense": 0, "evasion": 0},
    "Road":     {"defense": 0, "evasion": 0},
    "DirtRoad": {"defense": 0, "evasion": 0},
    "Tree":     {"defense": 1, "evasion": 5},
    "City":     {"defense": 1, "evasion": 8},
    "Factory":  {"defense": 1, "evasion": 8},
    "HQ":       {"defense": 2, "evasion": 10},
    "Mountain": {"defense": 2, "evasion": 12},
}

# === Combat Math ===

def clamp(lo, hi, val):
    return max(lo, min(hi, val))

def hit_damage(atk, terrain_defense):
    return max(atk - terrain_defense, 1)

def graze_damage(atk, terrain_defense):
    hd = hit_damage(atk, terrain_defense)
    return 1 if hd >= 2 else 0

def hit_chance(accuracy, terrain_evasion, moved, range_penalty=0):
    move_pen = 5 if moved else 0
    return clamp(75, 95, accuracy - terrain_evasion - move_pen - range_penalty) / 100.0

def expected_damage(atk, accuracy, terrain_defense, terrain_evasion, moved, range_penalty=0):
    """Returns expected damage per attack."""
    hc = hit_chance(accuracy, terrain_evasion, moved, range_penalty)
    hd = hit_damage(atk, terrain_defense)
    gd = graze_damage(atk, terrain_defense)
    return hc * hd + (1 - hc) * gd

def survival_probability_after_attack(
    defender_hp, atk, accuracy, terrain_defense, terrain_evasion, moved, range_penalty=0
):
    """Probability defender survives the incoming attack roll."""
    hc = hit_chance(accuracy, terrain_evasion, moved, range_penalty)
    hd = hit_damage(atk, terrain_defense)
    gd = graze_damage(atk, terrain_defense)

    survive_on_hit = 1.0 if hd < defender_hp else 0.0
    survive_on_miss = 1.0 if gd < defender_hp else 0.0
    return hc * survive_on_hit + (1 - hc) * survive_on_miss

def can_counter(attacker, defender, attack_range):
    """Check if defender can counterattack at the given range."""
    dmin, dmax = defender["range"]
    return dmin <= attack_range <= dmax

def combat_expected(attacker_name, defender_name, atk_terrain, def_terrain, attack_range, attacker_moved):
    """
    Returns (expected_dmg_to_defender, expected_dmg_to_attacker) for one exchange.
    """
    attacker = UNITS[attacker_name]
    defender = UNITS[defender_name]
    at = TERRAINS[atk_terrain]
    dt = TERRAINS[def_terrain]

    # Ranger can't attack after moving
    if not attacker["can_attack_after_move"] and attacker_moved:
        return (0, 0)

    # Check attack range validity
    amin, amax = attacker["range"]
    if not (amin <= attack_range <= amax):
        return (0, 0)

    # Range penalty for ranger at range 3
    range_pen = 5 if attacker_name == "Ranger" and attack_range == 3 else 0

    # Attacker's expected damage
    dmg_to_def = expected_damage(
        attacker["atk"], attacker["accuracy"],
        dt["defense"], dt["evasion"],
        attacker_moved, range_pen
    )

    # Counterattack is survival-weighted: defender only counters if they live.
    # Counter uses defender's own range penalty rules (e.g., ranger at range 3).
    dmg_to_atk = 0
    if can_counter(attacker, defender, attack_range):
        survive_prob = survival_probability_after_attack(
            defender["hp"],
            attacker["atk"],
            attacker["accuracy"],
            dt["defense"],
            dt["evasion"],
            attacker_moved,
            range_pen,
        )
        counter_range_pen = 5 if defender_name == "Ranger" and attack_range == 3 else 0
        counter_ev_if_alive = expected_damage(
            defender["atk"], defender["accuracy"],
            at["defense"], at["evasion"],
            moved=False,
            range_penalty=counter_range_pen,
        )
        dmg_to_atk = survive_prob * counter_ev_if_alive

    return (dmg_to_def, dmg_to_atk)

def hits_to_kill(dmg_per_hit, hp):
    """Average hits needed to kill."""
    if dmg_per_hit <= 0:
        return float('inf')
    return hp / dmg_per_hit

# === Analysis ===

def print_section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")

def matchup_analysis():
    """All 1v1 matchups on common terrains."""
    names = list(UNITS.keys())

    for moved_label, moved in [("attacker moved", True), ("attacker stationary", False)]:
        print_section(f"MATCHUP MATRIX — Expected Damage Per Exchange (Grass vs Grass, {moved_label})")

        header = f"{'Attacker':<12} {'Defender':<12} {'Rng':>3} {'Dmg→Def':>8} {'Dmg→Atk':>8} {'HTK Def':>8} {'HTK Atk':>8} {'Trade':>10}"
        print(header)
        print("-" * len(header))

        any_row = False
        for aname in names:
            a = UNITS[aname]
            amin, amax = a["range"]
            for dname in names:
                if aname == dname:
                    continue
                d = UNITS[dname]
                for r in range(amin, amax + 1):
                    dmg_d, dmg_a = combat_expected(aname, dname, "Grass", "Grass", r, attacker_moved=moved)
                    if dmg_d == 0 and dmg_a == 0:
                        continue
                    any_row = True
                    htk_d = hits_to_kill(dmg_d, d["hp"])
                    htk_a = hits_to_kill(dmg_a, a["hp"]) if dmg_a > 0 else float('inf')
                    gold_eff = f"{(dmg_d / d['hp'] * d['cost']) / a['cost']:.2f}" if dmg_d > 0 else "N/A"
                    htk_d_str = f"{htk_d:.1f}" if htk_d != float('inf') else "∞"
                    htk_a_str = f"{htk_a:.1f}" if htk_a != float('inf') else "∞"
                    print(f"{aname:<12} {dname:<12} {r:>3} {dmg_d:>8.2f} {dmg_a:>8.2f} {htk_d_str:>8} {htk_a_str:>8} {gold_eff:>10}")
        if not any_row:
            print("  (no valid engagements)")

def terrain_impact():
    """Show how terrain changes matchups."""
    key_terrains = ["Grass", "Tree", "City", "HQ", "Mountain"]
    names = list(UNITS.keys())

    for moved_label, moved in [("moved", True), ("stationary", False)]:
        print_section(f"TERRAIN IMPACT — Expected Damage to Defender (attacker on Grass, {moved_label})")

        header = f"{'Matchup':<20} " + " ".join(f"{t:>10}" for t in key_terrains)
        print(header)
        print("-" * len(header))

        for aname in names:
            a = UNITS[aname]
            amin, amax = a["range"]
            for dname in names:
                if aname == dname:
                    continue
                for r in range(amin, amax + 1):
                    label = f"{aname}→{dname} r{r}"
                    vals = []
                    all_zero = True
                    for dt in key_terrains:
                        if dt == "Mountain" and dname != "Infantry":
                            vals.append("N/A".rjust(10))
                            continue
                        dmg_d, _ = combat_expected(aname, dname, "Grass", dt, r, attacker_moved=moved)
                        if dmg_d == 0:
                            vals.append("—".rjust(10))
                        else:
                            all_zero = False
                            vals.append(f"{dmg_d:.2f}".rjust(10))
                    if not all_zero:
                        print(f"{label:<20} " + " ".join(vals))

def cost_efficiency():
    """Gold efficiency analysis."""
    print_section("COST EFFICIENCY — Damage Per Gold Spent (Grass vs Grass)")

    names = list(UNITS.keys())
    print(f"{'Unit':<12} {'HP/Gold':>8} {'Atk/Gold':>9} {'EffHP*':>8} {'Notes'}")
    print("-" * 60)
    for name in names:
        u = UNITS[name]
        hp_gold = u["hp"] / u["cost"]
        atk_gold = u["atk"] / u["cost"]
        # Effective HP considers that unit can be on terrain
        # Just base for now
        print(f"{name:<12} {hp_gold:>8.2f} {atk_gold:>9.2f} {u['hp']:>8} {'Siege unit (move OR attack)' if not u['can_attack_after_move'] else ''}")

def threat_range():
    """Effective threat range per unit."""
    print_section("THREAT RANGE — Tiles Threatened in One Turn")
    print("  Note: Uses theoretical max movement only; map pathing and occupancy can reduce this.")

    for name, u in UNITS.items():
        move = u["move"]
        rmin, rmax = u["range"]
        if u["can_attack_after_move"]:
            eff_min = move + rmin
            eff_max = move + rmax
            note = f"move {move} + range {rmin}-{rmax}"
        else:
            eff_min = rmax  # can only attack without moving
            eff_max = rmax
            note = f"range {rmin}-{rmax} only (cannot move+attack)"

        road_note = ""
        if name == "Tank":
            road_eff = move + 2 + rmax
            road_note = f", road upper bound: {road_eff} (start on road, contiguous road path)"

        print(f"  {name:<12} threat: {eff_min}-{eff_max} tiles ({note}{road_note})")

def multi_unit_trades():
    """How many cheaper units to kill an expensive one."""
    print_section("MULTI-UNIT TRADES — Swarm Analysis (Grass vs Grass, legal attack setup)")

    matchups = [
        ("Infantry", "Tank"),
        ("Infantry", "Ranger"),
        ("Ranger", "Tank"),
        ("Tank", "Infantry"),
        ("Tank", "Ranger"),
    ]

    for aname, dname in matchups:
        a = UNITS[aname]
        d = UNITS[dname]
        amin, amax = a["range"]
        r = amin  # use min range for melee

        # Ranger must be stationary to attack; others use moved=true by default.
        moved = a["can_attack_after_move"]
        dmg_d, dmg_a = combat_expected(aname, dname, "Grass", "Grass", r, attacker_moved=moved)
        if dmg_d <= 0:
            print(f"  {aname} vs {dname}: Cannot engage")
            continue

        # Simulate sequential attacks
        def_hp = d["hp"]
        atk_lost = 0
        attacks = 0
        while def_hp > 0:
            attacks += 1
            def_hp -= dmg_d
            if def_hp > 0 and dmg_a > 0:
                # Check if attacker dies
                if dmg_a >= a["hp"]:
                    atk_lost += 1
                else:
                    # Damaged but alive (simplified — assumes fresh attackers each time)
                    atk_lost += dmg_a / a["hp"]

        gold_committed = attacks * a["cost"]
        expected_gold_lost = atk_lost * a["cost"]
        gold_killed = d["cost"]
        favorable = expected_gold_lost <= gold_killed
        print(
            f"  {attacks}x {aname} (commit {gold_committed}g) → kill {dname} (cost {gold_killed}g), "
            f"~{atk_lost:.2f} {aname} lost (~{expected_gold_lost:.2f}g attrition), "
            f"attrition trade: {'favorable' if favorable else 'unfavorable'}"
        )

def ranger_positioning():
    """Analyze ranger move-or-attack tradeoff."""
    print_section("RANGER POSITIONING — Move vs Attack Tradeoff")
    print("  Note: This is a 1D lane toy model. It does not model map geometry, blocking, or true road connectivity.")

    r = UNITS["Ranger"]
    print(f"  Ranger stats: HP={r['hp']}, ATK={r['atk']}, Move={r['move']}, Range={r['range']}")
    print(f"  Can attack after move: {r['can_attack_after_move']}")
    print()
    print("  Scenario: Tank approaching Ranger")
    print("  ─────────────────────────────────")

    tank = UNITS["Tank"]
    # Tank starts at distance 5 from Ranger
    for start_dist in [6, 5, 4, 3]:
        print(f"\n  Tank at distance {start_dist}:")
        dist = start_dist
        turn = 0
        r_hp = r["hp"]
        t_hp = tank["hp"]
        while t_hp > 0 and r_hp > 0 and turn < 8:
            turn += 1
            # Ranger's turn: can it attack?
            if r["range"][0] <= dist <= r["range"][1]:
                # In range, attack
                range_pen = 5 if dist == 3 else 0
                dmg = expected_damage(r["atk"], r["accuracy"], 0, 0, False, range_pen)
                t_hp -= dmg
                action = f"fires ({dmg:.1f} dmg, tank HP: {t_hp:.1f})"
            elif dist > r["range"][1]:
                # Too far, wait (or reposition)
                action = "waits (out of range)"
            else:
                # Too close (dist < 2), must flee
                dist += r["move"]
                action = f"flees to dist {dist}"

            print(f"    Turn {turn} Ranger: {action}")

            if t_hp <= 0:
                print(f"    >>> Tank destroyed!")
                break

            # Tank's turn: close distance
            tank_move = tank["move"]  # no road bonus in this sim
            dist = max(0, dist - tank_move)
            print(f"    Turn {turn} Tank:   advances to dist {dist}")

            if dist <= 1 and dist >= tank["range"][0]:
                dmg = expected_damage(tank["atk"], tank["accuracy"], 0, 0, True)
                r_hp -= dmg
                print(f"    Turn {turn} Tank:   attacks! ({dmg:.1f} dmg, ranger HP: {r_hp:.1f})")
                if r_hp <= 0:
                    print(f"    >>> Ranger destroyed!")

    print("\n  With road bonus (+2):")
    for start_dist in [6, 5, 4]:
        dist = start_dist
        turn = 0
        r_hp = r["hp"]
        t_hp = tank["hp"]
        while t_hp > 0 and r_hp > 0 and turn < 6:
            turn += 1
            if r["range"][0] <= dist <= r["range"][1]:
                range_pen = 5 if dist == 3 else 0
                dmg = expected_damage(r["atk"], r["accuracy"], 0, 0, False, range_pen)
                t_hp -= dmg
                action = f"fires ({dmg:.1f} dmg, tank HP: {t_hp:.1f})"
            else:
                action = "can't attack"
            print(f"    Turn {turn} Ranger: {action}")
            if t_hp <= 0:
                print(f"    >>> Tank destroyed!")
                break
            dist = max(0, dist - (tank["move"] + 2))  # road bonus
            print(f"    Turn {turn} Tank:   advances to dist {dist} (road)")
            if dist <= 1:
                dmg = expected_damage(tank["atk"], tank["accuracy"], 0, 0, True)
                r_hp -= dmg
                print(f"    Turn {turn} Tank:   attacks! ({dmg:.1f} dmg, ranger HP: {r_hp:.1f})")
                if r_hp <= 0:
                    print(f"    >>> Ranger destroyed!")
                    break

if __name__ == "__main__":
    print("HASHFRONT BALANCE ANALYZER")
    print("Based on PRD combat formulas — no simulation, pure math")

    matchup_analysis()
    terrain_impact()
    cost_efficiency()
    threat_range()
    multi_unit_trades()
    ranger_positioning()

    print(f"\n{'='*70}")
    print("  DONE — Adjust values in UNITS/TERRAINS dicts and re-run")
    print(f"{'='*70}")
