import {
  Player,
  Position,
  Assignment,
  GameSheet,
  OUTFIELD_POSITIONS,
  TOTAL_INNINGS,
} from "./types";

/**
 * 13-player bench schedule by rank position (from the system guide).
 */
const BENCH_SCHEDULE_13: number[][] = [
  [12, 13, 2],   // Inn 1
  [10, 8, 6],    // Inn 2
  [11, 5, 4],    // Inn 3
  [9, 3, 7],     // Inn 4
  [13, 11, 1],   // Inn 5
  [10, 9, 12],   // Inn 6
];

const INFIELD_POSITIONS: Position[] = ["1B", "P", "2B", "SS", "3B", "C"];
const OF_POSITIONS: Position[] = ["RF", "LF", "Rover", "CF"];

function isOutfield(pos: Assignment): boolean {
  return OF_POSITIONS.includes(pos as Position);
}

function isEligible(rank: number, pos: Position): boolean {
  if (pos === "1B" && rank > 4) return false;
  if (pos === "P" && rank > 6) return false;
  return true;
}

/**
 * Build bench schedule for 10-13 players.
 */
function buildBenchSchedule(presentPlayers: Player[]): Set<string>[] {
  const count = presentPlayers.length;
  const byRank = [...presentPlayers].sort((a, b) => a.rank - b.rank);

  if (count === 10) {
    return Array.from({ length: TOTAL_INNINGS }, () => new Set<string>());
  }
  if (count === 11) {
    const sitterRanks = [11, 10, 9, 8, 7, 1];
    return sitterRanks.map((r) => new Set([byRank[r - 1].id]));
  }
  if (count === 12) {
    const schedule = [
      [12, 2], [10, 8], [11, 4], [9, 6], [7, 1], [5, 3],
    ];
    return schedule.map((ranks) => new Set(ranks.map((r) => byRank[r - 1].id)));
  }
  // 13
  return BENCH_SCHEDULE_13.map((ranks) => new Set(ranks.map((r) => byRank[r - 1].id)));
}

/**
 * Get innings where a player CAN play outfield (not benched, not adjacent to bench).
 */
function getOFEligibleInnings(playerId: string, benchSchedule: Set<string>[]): Set<number> {
  const eligible = new Set<number>();
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    if (benchSchedule[inn].has(playerId)) continue;
    const benchBefore = inn > 0 && benchSchedule[inn - 1].has(playerId);
    const benchAfter = inn < TOTAL_INNINGS - 1 && benchSchedule[inn + 1].has(playerId);
    if (!benchBefore && !benchAfter) eligible.add(inn);
  }
  return eligible;
}

function countConsecutiveOFWith(ofInnings: Set<number>, newInn: number): number {
  let count = 1;
  let i = newInn - 1;
  while (i >= 0 && ofInnings.has(i)) { count++; i--; }
  i = newInn + 1;
  while (i < TOTAL_INNINGS && ofInnings.has(i)) { count++; i++; }
  return count;
}

/**
 * Plan OF assignments: exactly 4 per inning, every player >= 1 OF, no 3+ consecutive OF.
 */
function planOutfieldAssignments(
  presentPlayers: Player[],
  benchSchedule: Set<string>[]
): Map<string, Set<number>> {
  const ofPlan = new Map<string, Set<number>>();
  presentPlayers.forEach((p) => ofPlan.set(p.id, new Set<number>()));

  const eligibleMap = new Map<string, Set<number>>();
  for (const p of presentPlayers) {
    eligibleMap.set(p.id, getOFEligibleInnings(p.id, benchSchedule));
  }

  const ofCountPerInning = new Array(TOTAL_INNINGS).fill(0);

  // Phase 1: Guarantee every player gets at least 1 OF inning (least flexible first)
  const sorted = [...presentPlayers].sort(
    (a, b) => eligibleMap.get(a.id)!.size - eligibleMap.get(b.id)!.size
  );

  for (const player of sorted) {
    const eligible = eligibleMap.get(player.id)!;
    let bestInn = -1;
    let bestCount = Infinity;
    for (const inn of eligible) {
      if (ofCountPerInning[inn] < 4 && ofCountPerInning[inn] < bestCount) {
        bestCount = ofCountPerInning[inn];
        bestInn = inn;
      }
    }
    if (bestInn >= 0) {
      ofPlan.get(player.id)!.add(bestInn);
      ofCountPerInning[bestInn]++;
    }
  }

  // Phase 2: Fill to exactly 4 OF per inning
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    while (ofCountPerInning[inn] < 4) {
      let best: Player | null = null;
      let bestScore = -Infinity;

      for (const player of presentPlayers) {
        if (benchSchedule[inn].has(player.id)) continue;
        if (ofPlan.get(player.id)!.has(inn)) continue;
        if (!eligibleMap.get(player.id)!.has(inn)) continue;
        if (countConsecutiveOFWith(ofPlan.get(player.id)!, inn) >= 3) continue;

        const currentOF = ofPlan.get(player.id)!.size;
        const score = -currentOF * 100 + player.rank; // fewer OF first, lower rank to OF
        if (score > bestScore) { bestScore = score; best = player; }
      }

      if (!best) break;
      ofPlan.get(best.id)!.add(inn);
      ofCountPerInning[inn]++;
    }
  }

  // Phase 3: Trim any over-filled innings
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    while (ofCountPerInning[inn] > 4) {
      let worst: Player | null = null;
      let worstCount = 0;
      for (const p of presentPlayers) {
        if (!ofPlan.get(p.id)!.has(inn)) continue;
        const c = ofPlan.get(p.id)!.size;
        if (c > 1 && c > worstCount) { worstCount = c; worst = p; }
      }
      if (!worst) break;
      ofPlan.get(worst.id)!.delete(inn);
      ofCountPerInning[inn]--;
    }
  }

  return ofPlan;
}

/**
 * Try to assign positions to a set of players for a single inning.
 * Uses backtracking to find a valid assignment.
 */
function assignPositions(
  players: Player[],
  positions: Position[],
  inn: number,
  sheet: GameSheet,
  posCounts: Map<string, Map<string, number>>
): Map<string, Position> | null {
  const result = new Map<string, Position>();

  function backtrack(playerIdx: number, usedPositions: Set<Position>): boolean {
    if (playerIdx === players.length) return true;
    const player = players[playerIdx];

    // Try each available position
    for (const pos of positions) {
      if (usedPositions.has(pos)) continue;
      if (!isEligible(player.rank, pos)) continue;

      // No same position in consecutive active innings
      if (inn > 0 && sheet[inn - 1][player.id] !== "Bench" && sheet[inn - 1][player.id] === pos) continue;

      // Max 2 per position per game
      const currentCount = posCounts.get(player.id)?.get(pos) || 0;
      if (currentCount >= 2) continue;

      result.set(player.id, pos);
      usedPositions.add(pos);

      if (backtrack(playerIdx + 1, usedPositions)) return true;

      result.delete(player.id);
      usedPositions.delete(pos);
    }

    return false;
  }

  // Try with max-2 constraint
  if (backtrack(0, new Set())) return result;

  // Relax max-2 constraint but keep eligibility strict
  function backtrackRelaxed(playerIdx: number, usedPositions: Set<Position>): boolean {
    if (playerIdx === players.length) return true;
    const player = players[playerIdx];

    for (const pos of positions) {
      if (usedPositions.has(pos)) continue;
      if (!isEligible(player.rank, pos)) continue;
      if (inn > 0 && sheet[inn - 1][player.id] !== "Bench" && sheet[inn - 1][player.id] === pos) continue;

      result.set(player.id, pos);
      usedPositions.add(pos);
      if (backtrackRelaxed(playerIdx + 1, usedPositions)) return true;
      result.delete(player.id);
      usedPositions.delete(pos);
    }
    return false;
  }

  if (backtrackRelaxed(0, new Set())) return result;

  // Last resort: relax consecutive constraint too, but NEVER eligibility
  function backtrackLastResort(playerIdx: number, usedPositions: Set<Position>): boolean {
    if (playerIdx === players.length) return true;
    const player = players[playerIdx];

    for (const pos of positions) {
      if (usedPositions.has(pos)) continue;
      if (!isEligible(player.rank, pos)) continue;

      result.set(player.id, pos);
      usedPositions.add(pos);
      if (backtrackLastResort(playerIdx + 1, usedPositions)) return true;
      result.delete(player.id);
      usedPositions.delete(pos);
    }
    return false;
  }

  if (backtrackLastResort(0, new Set())) return result;
  return null; // should never happen
}

/**
 * Main scheduling algorithm.
 */
export function generateGameSheet(allPlayers: Player[]): GameSheet {
  const presentPlayers = allPlayers
    .filter((p) => !p.absent)
    .sort((a, b) => a.rank - b.rank);

  const count = presentPlayers.length;
  if (count < 10) throw new Error(`Need at least 10 present players, got ${count}.`);
  if (count > 13) throw new Error(`Maximum 13 present players supported, got ${count}.`);

  const benchSchedule = buildBenchSchedule(presentPlayers);
  const ofPlan = planOutfieldAssignments(presentPlayers, benchSchedule);

  const sheet: GameSheet = Array.from({ length: TOTAL_INNINGS }, () => ({}));
  const posCounts = new Map<string, Map<string, number>>();
  presentPlayers.forEach((p) => posCounts.set(p.id, new Map()));

  // Mark bench
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    for (const playerId of benchSchedule[inn]) {
      sheet[inn][playerId] = "Bench";
    }
  }

  // Assign positions inning by inning
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    const activePlayers = presentPlayers.filter((p) => !benchSchedule[inn].has(p.id));

    const ofPlayerIds = new Set<string>();
    for (const p of activePlayers) {
      if (ofPlan.get(p.id)!.has(inn)) ofPlayerIds.add(p.id);
    }

    const ifPlayers = activePlayers.filter((p) => !ofPlayerIds.has(p.id));
    const ofPlayers = activePlayers.filter((p) => ofPlayerIds.has(p.id));

    // Sanity check
    if (ifPlayers.length !== INFIELD_POSITIONS.length) {
      console.warn(`Inn ${inn + 1}: ${ifPlayers.length} IF players for ${INFIELD_POSITIONS.length} positions`);
    }
    if (ofPlayers.length !== OF_POSITIONS.length) {
      console.warn(`Inn ${inn + 1}: ${ofPlayers.length} OF players for ${OF_POSITIONS.length} positions`);
    }

    // Assign IF using backtracking (guarantees eligibility)
    // Sort: best rank first for IF
    const ifSorted = [...ifPlayers].sort((a, b) => a.rank - b.rank);
    const ifAssignment = assignPositions(ifSorted, INFIELD_POSITIONS, inn, sheet, posCounts);
    if (ifAssignment) {
      for (const [pid, pos] of ifAssignment) {
        sheet[inn][pid] = pos;
        const counts = posCounts.get(pid)!;
        counts.set(pos, (counts.get(pos) || 0) + 1);
      }
    }

    // Assign OF using backtracking
    // Sort: worst rank first for OF (weaker players to OF)
    const ofSorted = [...ofPlayers].sort((a, b) => b.rank - a.rank);
    const ofAssignment = assignPositions(ofSorted, OF_POSITIONS, inn, sheet, posCounts);
    if (ofAssignment) {
      for (const [pid, pos] of ofAssignment) {
        sheet[inn][pid] = pos;
        const counts = posCounts.get(pid)!;
        counts.set(pos, (counts.get(pos) || 0) + 1);
      }
    }

    // Verify every active player was assigned — no silent fallbacks
    for (const p of activePlayers) {
      if (!sheet[inn][p.id]) {
        throw new Error(
          `Failed to assign ${p.name} (rank ${p.rank}) in inning ${inn + 1}. ` +
          `The current constraints cannot be satisfied. Try adjusting player ranks or disabling a constraint.`
        );
      }
    }
  }

  return sheet;
}

/**
 * Validate a game sheet against all constraints.
 */
export function validateGameSheet(
  sheet: GameSheet,
  presentPlayers: Player[]
): string[] {
  const violations: string[] = [];

  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    const active = presentPlayers.filter((p) => sheet[inn][p.id] && sheet[inn][p.id] !== "Bench");

    if (active.length !== 10) {
      violations.push(`Inning ${inn + 1}: ${active.length} on field (expected 10)`);
    }

    // Unassigned
    for (const p of presentPlayers) {
      if (!sheet[inn][p.id]) {
        violations.push(`Inning ${inn + 1}: ${p.name} has no assignment`);
      }
    }

    // Duplicate positions
    const positions = active.map((p) => sheet[inn][p.id]);
    const posSet = new Set(positions);
    if (posSet.size !== positions.length) {
      violations.push(`Inning ${inn + 1}: duplicate positions`);
    }

    // Eligibility
    for (const player of active) {
      const pos = sheet[inn][player.id];
      if (pos === "1B" && player.rank > 4) {
        violations.push(`Inning ${inn + 1}: ${player.name} at 1B (needs top 4)`);
      }
      if (pos === "P" && player.rank > 6) {
        violations.push(`Inning ${inn + 1}: ${player.name} at P (needs top 6)`);
      }
    }
  }

  for (const player of presentPlayers) {
    let ofCount = 0;
    let consecutiveOF = 0;
    let maxConsecutiveOF = 0;
    let consecutiveBench = 0;
    const posCounts = new Map<string, number>();

    for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
      const assignment = sheet[inn][player.id];
      if (!assignment) continue;

      if (assignment === "Bench") {
        consecutiveBench++;
        consecutiveOF = 0;
        if (consecutiveBench > 1) {
          violations.push(`${player.name}: consecutive bench in innings ${inn} and ${inn + 1}`);
        }
      } else {
        consecutiveBench = 0;
        posCounts.set(assignment, (posCounts.get(assignment) || 0) + 1);

        if (isOutfield(assignment)) {
          ofCount++;
          consecutiveOF++;
          maxConsecutiveOF = Math.max(maxConsecutiveOF, consecutiveOF);
        } else {
          consecutiveOF = 0;
        }
      }

      // Same position consecutive (skip if either is bench)
      if (
        inn > 0 &&
        assignment !== "Bench" &&
        sheet[inn - 1][player.id] &&
        sheet[inn - 1][player.id] !== "Bench" &&
        sheet[inn - 1][player.id] === assignment
      ) {
        violations.push(`${player.name}: same position (${assignment}) in innings ${inn} and ${inn + 1}`);
      }

      // OF adjacency
      if (isOutfield(assignment)) {
        if (inn > 0 && sheet[inn - 1][player.id] === "Bench") {
          violations.push(`${player.name}: OF in inning ${inn + 1} immediately after bench`);
        }
        if (inn < TOTAL_INNINGS - 1 && sheet[inn + 1]?.[player.id] === "Bench") {
          violations.push(`${player.name}: OF in inning ${inn + 1} immediately before bench`);
        }
      }
    }

    if (maxConsecutiveOF >= 3) {
      violations.push(`${player.name}: ${maxConsecutiveOF} consecutive OF innings`);
    }

    // Position played 3+ times
    for (const [pos, count] of posCounts) {
      if (count >= 3) {
        violations.push(`${player.name}: plays ${pos} ${count} times (max 2)`);
      }
    }

    const benchCount = Array.from({ length: TOTAL_INNINGS }).filter(
      (_, i) => sheet[i][player.id] === "Bench"
    ).length;
    const activeInnings = TOTAL_INNINGS - benchCount;
    if (activeInnings > 0 && ofCount === 0) {
      violations.push(`${player.name}: no outfield inning`);
    }
  }

  return violations;
}
