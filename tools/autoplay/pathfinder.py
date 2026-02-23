"""A* pathfinding with terrain costs and unit type restrictions."""

import heapq
from config import (
    INFANTRY, RANGER, TANK, MOVE_RANGE,
    TERRAIN_MOUNTAIN, TERRAIN_COST,
)


def manhattan(a: tuple, b: tuple) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def neighbors(x: int, y: int, width: int = 20, height: int = 20):
    """Yield adjacent tiles (up/down/left/right)."""
    for dx, dy in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
        nx, ny = x + dx, y + dy
        if 0 <= nx < width and 0 <= ny < height:
            yield nx, ny


def move_cost(terrain: int, unit_type: str):
    """Get movement cost for a unit type on a terrain. Returns None if impassable."""
    if terrain == TERRAIN_MOUNTAIN:
        if unit_type != INFANTRY:
            return None  # only infantry can enter mountains
        return 2
    return TERRAIN_COST.get(terrain, 1)


def find_reachable(grid, start: tuple, unit_type: str, occupied: set, max_range: int = None):
    """
    Dijkstra from start, returning all reachable tiles within move range.
    Returns dict: (x, y) -> (cost, path) where path is list of (x, y) steps.
    Occupied tiles block transit AND destination.
    """
    if max_range is None:
        max_range = MOVE_RANGE[unit_type]

    open_set = [(0, start, [])]
    best = {}

    while open_set:
        cost, pos, path = heapq.heappop(open_set)
        if pos in best:
            continue
        best[pos] = (cost, path)

        if cost >= max_range:
            continue

        for nx, ny in neighbors(pos[0], pos[1]):
            npos = (nx, ny)
            if npos in best:
                continue
            terrain = grid[ny][nx]
            step = move_cost(terrain, unit_type)
            if step is None:
                continue
            new_cost = cost + step
            if new_cost > max_range:
                continue
            # Occupied tiles block movement
            if npos in occupied:
                continue
            new_path = path + [npos]
            heapq.heappush(open_set, (new_cost, npos, new_path))

    return best


def full_path_distance(grid, start: tuple, goal: tuple, unit_type: str):
    """
    BFS/Dijkstra ignoring move range and occupancy to find true path distance.
    Returns dict of {tile: true_distance_to_goal} for tiles reachable from goal.
    This is used to pick the best direction when Manhattan distance is misleading
    (e.g., routing around mountain bands).
    """
    # Reverse Dijkstra from goal
    open_set = [(0, goal)]
    dist = {}
    while open_set:
        cost, pos = heapq.heappop(open_set)
        if pos in dist:
            continue
        dist[pos] = cost
        for nx, ny in neighbors(pos[0], pos[1]):
            npos = (nx, ny)
            if npos in dist:
                continue
            terrain = grid[ny][nx]
            step = move_cost(terrain, unit_type)
            if step is None:
                continue
            heapq.heappush(open_set, (cost + step, npos))
    return dist


def best_move_toward(grid, start: tuple, goal: tuple, unit_type: str, occupied: set):
    """
    Find the best reachable tile toward goal. Returns path (list of (x,y) steps).
    Uses true path distance (not Manhattan) to handle routing around obstacles.
    """
    reachable = find_reachable(grid, start, unit_type, occupied)

    if goal in reachable and reachable[goal][1]:
        return reachable[goal][1]

    # Use true path distance from each reachable tile to goal
    true_dist = full_path_distance(grid, start, goal, unit_type)

    if start not in true_dist:
        return []  # goal is completely unreachable

    start_dist = true_dist[start]
    best_tile = None
    best_dist = start_dist

    for tile, (cost, path) in reachable.items():
        if tile == start or not path:
            continue
        d = true_dist.get(tile, float('inf'))
        if d < best_dist:
            best_dist = d
            best_tile = tile

    if best_tile is None:
        return []  # stuck - can't move anywhere useful
    return reachable[best_tile][1]


def find_attack_position(grid, unit_pos: tuple, target_pos: tuple, unit_type: str,
                          occupied: set, attack_range):
    """
    Find a reachable tile from which the unit can attack the target.
    Returns path to that tile, or [] if unit is already in range, or None if unreachable.
    """
    # Check if already in range
    dist = manhattan(unit_pos, target_pos)
    if isinstance(attack_range, tuple):
        min_r, max_r = attack_range
        if min_r <= dist <= max_r:
            return []  # already in position
    else:
        if dist == attack_range:
            return []

    # Find reachable tiles that are in attack range of target
    reachable = find_reachable(grid, unit_pos, unit_type, occupied)

    candidates = []
    for tile, (cost, path) in reachable.items():
        if tile == unit_pos and not path:
            continue
        d = manhattan(tile, target_pos)
        if isinstance(attack_range, tuple):
            min_r, max_r = attack_range
            if min_r <= d <= max_r:
                candidates.append((cost, tile, path))
        else:
            if d == attack_range:
                candidates.append((cost, tile, path))

    if not candidates:
        return None  # can't reach attack position this turn

    # Pick cheapest (least movement used)
    candidates.sort()
    return candidates[0][2]


def find_adjacent_to(grid, target: tuple, unit_type: str, start: tuple, occupied: set):
    """Find best reachable tile adjacent to target. For melee units."""
    reachable = find_reachable(grid, start, unit_type, occupied)
    candidates = []
    for nx, ny in neighbors(target[0], target[1]):
        npos = (nx, ny)
        if npos in reachable and reachable[npos][1]:
            cost, path = reachable[npos]
            candidates.append((cost, npos, path))

    if not candidates:
        return None
    candidates.sort()
    return candidates[0][2]
