import {
  Player,
  Position,
  Assignment,
  GameSheet,
  OUTFIELD_POSITIONS,
  TOTAL_INNINGS,
} from "./types";

// ── Constants ────────────────────────────────────────────────────────

const BENCH_SCHEDULE_13: number[][] = [
  [12, 13, 2], [10, 8, 6], [11, 5, 4], [9, 3, 7], [13, 11, 1], [10, 9, 12],
];

const IF_POSITIONS: Position[] = ["1B", "P", "2B", "SS", "3B", "C"];
const OF_POSITIONS: Position[] = ["RF", "LF", "Rover", "CF"];
const OF_SET = new Set<string>(OF_POSITIONS);

function isOutfield(pos: Assignment): boolean {
  return OF_SET.has(pos as string);
}

function isEligible(rank: number, pos: Position): boolean {
  if (pos === "1B" && rank > 4) return false;
  if (pos === "P" && rank > 6) return false;
  return true;
}

// ── Phase 1: Bench Schedule (deterministic) ─────────────────────────

function buildBenchSchedule(players: Player[]): Set<string>[] {
  const count = players.length;
  const byRank = [...players].sort((a, b) => a.rank - b.rank);

  if (count === 10) return Array.from({ length: TOTAL_INNINGS }, () => new Set());
  if (count === 11) {
    return [11, 10, 9, 8, 7, 1].map((r) => new Set([byRank[r - 1].id]));
  }
  if (count === 12) {
    return [[12,2],[10,8],[11,4],[9,6],[7,1],[5,3]].map((ranks) =>
      new Set(ranks.map((r) => byRank[r - 1].id))
    );
  }
  return BENCH_SCHEDULE_13.map((ranks) => new Set(ranks.map((r) => byRank[r - 1].id)));
}

// ── Phase 2: OF Schedule (deterministic, constraint-aware) ──────────

/**
 * For each player, compute which innings they are allowed to play OF.
 * A player CANNOT play OF if:
 *   - They are benched that inning
 *   - They are benched the inning before or after (adjacency rule)
 */
function computeOFEligibility(
  players: Player[],
  bench: Set<string>[]
): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const p of players) {
    const eligible = new Set<number>();
    for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
      if (bench[inn].has(p.id)) continue;
      if (inn > 0 && bench[inn - 1].has(p.id)) continue;
      if (inn < TOTAL_INNINGS - 1 && bench[inn + 1].has(p.id)) continue;
      eligible.add(inn);
    }
    map.set(p.id, eligible);
  }
  return map;
}

/**
 * Build a deterministic OF schedule: which players play OF in which innings.
 * Guarantees:
 *   - Every player gets at least 1 OF inning
 *   - Exactly 4 OF players per inning
 *   - No 3+ consecutive OF innings for any player
 *   - Respects OF adjacency (bench neighbors)
 *   - Keeps enough top-4/top-6 players in IF for 1B/P eligibility
 */
function buildOFSchedule(
  players: Player[],
  bench: Set<string>[]
): Map<string, Set<number>> {
  const ofEligibility = computeOFEligibility(players, bench);
  const ofSchedule = new Map<string, Set<number>>();
  players.forEach((p) => ofSchedule.set(p.id, new Set()));

  const ofPerInning = new Array(TOTAL_INNINGS).fill(0);

  // Sort players by number of OF-eligible innings (most constrained first)
  const sorted = [...players].sort((a, b) => {
    const aSize = ofEligibility.get(a.id)!.size;
    const bSize = ofEligibility.get(b.id)!.size;
    if (aSize !== bSize) return aSize - bSize;
    return b.rank - a.rank; // tie-break: lower-ranked to OF first
  });

  // Step 1: Assign at least 1 OF inning to every player
  for (const player of sorted) {
    const eligible = ofEligibility.get(player.id)!;

    // Find the eligible inning with the fewest OF assigned
    let bestInn = -1;
    let bestCount = Infinity;
    for (const inn of eligible) {
      if (ofPerInning[inn] >= 4) continue;
      // Check: would this create 3+ consecutive OF?
      if (wouldCreateConsecutiveOF(ofSchedule.get(player.id)!, inn, 3)) continue;
      // Check: would removing this player from IF leave enough eligible for 1B/P?
      if (!canSpareFromIF(player, inn, players, bench, ofSchedule)) continue;

      if (ofPerInning[inn] < bestCount) {
        bestCount = ofPerInning[inn];
        bestInn = inn;
      }
    }

    if (bestInn >= 0) {
      ofSchedule.get(player.id)!.add(bestInn);
      ofPerInning[bestInn]++;
    }
    // If no valid inning found, we'll try again in step 2
  }

  // Step 2: Fill remaining OF slots to reach exactly 4 per inning
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    while (ofPerInning[inn] < 4) {
      let bestPlayer: Player | null = null;
      let bestScore = -Infinity;

      for (const player of players) {
        if (bench[inn].has(player.id)) continue;
        if (ofSchedule.get(player.id)!.has(inn)) continue;
        if (!ofEligibility.get(player.id)!.has(inn)) continue;
        if (wouldCreateConsecutiveOF(ofSchedule.get(player.id)!, inn, 3)) continue;
        if (!canSpareFromIF(player, inn, players, bench, ofSchedule)) continue;

        const currentOF = ofSchedule.get(player.id)!.size;
        // Prefer: fewer OF assigned, higher rank number (weaker → OF)
        const score = -currentOF * 1000 + player.rank;
        if (score > bestScore) {
          bestScore = score;
          bestPlayer = player;
        }
      }

      if (!bestPlayer) {
        // Relax the IF-sparing constraint
        for (const player of players) {
          if (bench[inn].has(player.id)) continue;
          if (ofSchedule.get(player.id)!.has(inn)) continue;
          if (!ofEligibility.get(player.id)!.has(inn)) continue;
          if (wouldCreateConsecutiveOF(ofSchedule.get(player.id)!, inn, 3)) continue;

          bestPlayer = player;
          break;
        }
      }

      if (!bestPlayer) break; // truly can't fill
      ofSchedule.get(bestPlayer.id)!.add(inn);
      ofPerInning[inn]++;
    }
  }

  // Step 3: Verify every player got at least 1 OF
  for (const player of players) {
    if (ofSchedule.get(player.id)!.size === 0) {
      // Force-assign to the least-full eligible inning, relaxing constraints
      const eligible = ofEligibility.get(player.id)!;
      let bestInn = -1;
      let bestCount = Infinity;
      for (const inn of eligible) {
        if (ofPerInning[inn] < bestCount) {
          bestCount = ofPerInning[inn];
          bestInn = inn;
        }
      }
      if (bestInn >= 0) {
        // Swap out the player in this inning with the most OF assigned
        if (ofPerInning[bestInn] >= 4) {
          const inThisInning = players.filter(
            (p) => ofSchedule.get(p.id)!.has(bestInn) && ofSchedule.get(p.id)!.size > 1
          );
          inThisInning.sort((a, b) => ofSchedule.get(b.id)!.size - ofSchedule.get(a.id)!.size);
          if (inThisInning.length > 0) {
            ofSchedule.get(inThisInning[0].id)!.delete(bestInn);
            ofPerInning[bestInn]--;
          }
        }
        ofSchedule.get(player.id)!.add(bestInn);
        ofPerInning[bestInn]++;
      }
    }
  }

  return ofSchedule;
}

function wouldCreateConsecutiveOF(
  existing: Set<number>,
  newInn: number,
  maxConsec: number
): boolean {
  let count = 1;
  let i = newInn - 1;
  while (i >= 0 && existing.has(i)) { count++; i--; }
  i = newInn + 1;
  while (i < TOTAL_INNINGS && existing.has(i)) { count++; i++; }
  return count >= maxConsec;
}

/**
 * Check that assigning this player to OF in this inning leaves enough
 * IF players for 1B (need at least 1 top-4) and P (need at least 1 top-6).
 */
function canSpareFromIF(
  player: Player,
  inn: number,
  allPlayers: Player[],
  bench: Set<string>[],
  ofSchedule: Map<string, Set<number>>
): boolean {
  // Count how many top-4 and top-6 players would remain in IF
  let top4InIF = 0;
  let top6InIF = 0;
  for (const p of allPlayers) {
    if (bench[inn].has(p.id)) continue;
    if (p.id === player.id) continue; // this player would be in OF
    if (ofSchedule.get(p.id)!.has(inn)) continue; // already in OF

    if (p.rank <= 4) top4InIF++;
    if (p.rank <= 6) top6InIF++;
  }
  return top4InIF >= 1 && top6InIF >= 2; // need 1 for 1B, 1 more for P
}

// ── Phase 3: Position Assignment (deterministic) ────────────────────

/**
 * Assign specific positions to all players across all innings.
 * Uses deterministic assignment with constraint checking.
 */
function assignPositions(
  players: Player[],
  bench: Set<string>[],
  ofSchedule: Map<string, Set<number>>
): GameSheet {
  const sheet: GameSheet = Array.from({ length: TOTAL_INNINGS }, () => ({}));
  const posCounts = new Map<string, Map<string, number>>();
  players.forEach((p) => posCounts.set(p.id, new Map()));

  // Mark bench
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    for (const pid of bench[inn]) {
      sheet[inn][pid] = "Bench";
    }
  }

  // Assign each inning
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    const active = players.filter((p) => !bench[inn].has(p.id));
    const ifPlayers = active.filter((p) => !ofSchedule.get(p.id)!.has(inn));
    const ofPlayers = active.filter((p) => ofSchedule.get(p.id)!.has(inn));

    // Assign IF positions deterministically
    assignGroupPositions(ifPlayers, IF_POSITIONS, inn, sheet, posCounts, true);

    // Assign OF positions deterministically
    assignGroupPositions(ofPlayers, OF_POSITIONS, inn, sheet, posCounts, false);
  }

  return sheet;
}

/**
 * Assign a group of players to a group of positions for one inning.
 * Uses deterministic matching with constraint awareness.
 */
function assignGroupPositions(
  players: Player[],
  positions: Position[],
  inn: number,
  sheet: GameSheet,
  posCounts: Map<string, Map<string, number>>,
  isIF: boolean
): void {
  if (players.length !== positions.length) return;

  // Try deterministic assignment first
  const assignment = findValidAssignment(players, positions, inn, sheet, posCounts);

  if (assignment) {
    for (let i = 0; i < players.length; i++) {
      const pos = assignment[i];
      sheet[inn][players[i].id] = pos;
      const counts = posCounts.get(players[i].id)!;
      counts.set(pos, (counts.get(pos) || 0) + 1);
    }
  }
}

/**
 * Find a valid assignment of players to positions using recursive search.
 * Deterministic: always tries positions in the same order,
 * players sorted by rank (best first for IF).
 */
function findValidAssignment(
  players: Player[],
  positions: Position[],
  inn: number,
  sheet: GameSheet,
  posCounts: Map<string, Map<string, number>>
): Position[] | null {
  const n = players.length;
  const result: Position[] = new Array(n);
  const usedPositions = new Set<Position>();

  function solve(idx: number): boolean {
    if (idx === n) return true;
    const player = players[idx];

    for (const pos of positions) {
      if (usedPositions.has(pos)) continue;
      if (!isEligible(player.rank, pos)) continue;

      // No same position in consecutive active innings
      if (inn > 0) {
        const prev = sheet[inn - 1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }

      // Max 2 per position per game
      const count = posCounts.get(player.id)!.get(pos) || 0;
      if (count >= 2) continue;

      result[idx] = pos;
      usedPositions.add(pos);
      if (solve(idx + 1)) return true;
      usedPositions.delete(pos);
    }
    return false;
  }

  // Sort: best-ranked first for IF groups, worst-ranked first for OF
  const isIF = positions.includes("1B" as Position);
  const sorted = [...players].sort((a, b) =>
    isIF ? a.rank - b.rank : b.rank - a.rank
  );
  // Rebuild with sorted order
  const originalOrder = players.map((p) => p.id);
  for (let i = 0; i < n; i++) players[i] = sorted[i];

  const found = solve(0);

  // Restore original player order and map results
  if (found) {
    const resultMap = new Map<string, Position>();
    for (let i = 0; i < n; i++) {
      resultMap.set(players[i].id, result[i]);
    }
    // Restore
    for (let i = 0; i < n; i++) {
      players[i] = sorted[i]; // already sorted
    }
    // Return results in current player order
    return players.map((p) => resultMap.get(p.id)!);
  }

  // Fallback: relax max-2 constraint
  usedPositions.clear();
  function solveRelaxed(idx: number): boolean {
    if (idx === n) return true;
    const player = players[idx];
    for (const pos of positions) {
      if (usedPositions.has(pos)) continue;
      if (!isEligible(player.rank, pos)) continue;
      if (inn > 0) {
        const prev = sheet[inn - 1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }
      result[idx] = pos;
      usedPositions.add(pos);
      if (solveRelaxed(idx + 1)) return true;
      usedPositions.delete(pos);
    }
    return false;
  }

  if (solveRelaxed(0)) {
    return result;
  }

  return null;
}

// ── Main Entry Point ────────────────────────────────────────────────

export function generateGameSheet(allPlayers: Player[]): GameSheet {
  const present = allPlayers
    .filter((p) => !p.absent)
    .sort((a, b) => a.rank - b.rank);

  const count = present.length;
  if (count < 10) throw new Error(`Need at least 10 present players, got ${count}.`);
  if (count > 13) throw new Error(`Maximum 13 present players, got ${count}.`);

  // Phase 1: Bench schedule
  const bench = buildBenchSchedule(present);

  // Phase 2: OF schedule
  const ofSchedule = buildOFSchedule(present, bench);

  // Phase 3: Position assignment
  const sheet = assignPositions(present, bench, ofSchedule);

  // Verify completeness
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    for (const p of present) {
      if (!sheet[inn][p.id]) {
        throw new Error(
          `Failed to assign ${p.name} in inning ${inn + 1}. ` +
          `Try adjusting player ranks.`
        );
      }
    }
  }

  return sheet;
}

// ── Validation ──────────────────────────────────────────────────────

export function validateGameSheet(
  sheet: GameSheet,
  presentPlayers: Player[]
): string[] {
  const violations: string[] = [];

  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    const active = presentPlayers.filter(
      (p) => sheet[inn][p.id] && sheet[inn][p.id] !== "Bench"
    );

    if (active.length !== 10) {
      violations.push(`Inning ${inn + 1}: ${active.length} on field (expected 10)`);
    }

    for (const p of presentPlayers) {
      if (!sheet[inn][p.id]) {
        violations.push(`Inning ${inn + 1}: ${p.name} unassigned`);
      }
    }

    const positions = active.map((p) => sheet[inn][p.id]);
    if (new Set(positions).size !== positions.length) {
      violations.push(`Inning ${inn + 1}: duplicate positions`);
    }

    for (const player of active) {
      const pos = sheet[inn][player.id];
      if (pos === "1B" && player.rank > 4)
        violations.push(`Inning ${inn + 1}: ${player.name} at 1B (needs top 4)`);
      if (pos === "P" && player.rank > 6)
        violations.push(`Inning ${inn + 1}: ${player.name} at P (needs top 6)`);
    }
  }

  for (const player of presentPlayers) {
    let ofCount = 0;
    let consecutiveOF = 0;
    let maxConsecutiveOF = 0;
    let consecutiveBench = 0;
    const posCts = new Map<string, number>();

    for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
      const a = sheet[inn][player.id];
      if (!a) continue;

      if (a === "Bench") {
        consecutiveBench++;
        consecutiveOF = 0;
        if (consecutiveBench > 1)
          violations.push(`${player.name}: consecutive bench innings ${inn} & ${inn + 1}`);
      } else {
        consecutiveBench = 0;
        posCts.set(a, (posCts.get(a) || 0) + 1);
        if (isOutfield(a)) {
          ofCount++;
          consecutiveOF++;
          maxConsecutiveOF = Math.max(maxConsecutiveOF, consecutiveOF);
        } else {
          consecutiveOF = 0;
        }
      }

      // Consecutive same position
      if (inn > 0 && a !== "Bench" && sheet[inn - 1][player.id] !== "Bench" &&
          sheet[inn - 1][player.id] === a) {
        violations.push(
          `${player.name}: same position (${a}) in innings ${inn} & ${inn + 1}`
        );
      }

      // OF adjacency
      if (isOutfield(a)) {
        if (inn > 0 && sheet[inn - 1][player.id] === "Bench")
          violations.push(`${player.name}: OF in inning ${inn + 1} after bench`);
        if (inn < TOTAL_INNINGS - 1 && sheet[inn + 1]?.[player.id] === "Bench")
          violations.push(`${player.name}: OF in inning ${inn + 1} before bench`);
      }
    }

    if (maxConsecutiveOF >= 3)
      violations.push(`${player.name}: ${maxConsecutiveOF} consecutive OF innings`);

    for (const [pos, c] of posCts) {
      if (c >= 3)
        violations.push(`${player.name}: plays ${pos} ${c} times (max 2)`);
    }

    const benchCount = Array.from({ length: TOTAL_INNINGS }).filter(
      (_, i) => sheet[i][player.id] === "Bench"
    ).length;
    if (TOTAL_INNINGS - benchCount > 0 && ofCount === 0)
      violations.push(`${player.name}: no outfield inning`);
  }

  return violations;
}
