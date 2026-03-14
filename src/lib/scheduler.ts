import {
  Player,
  Position,
  Assignment,
  GameSheet,
  POSITION_PRIORITY,
  OUTFIELD_POSITIONS,
  TOTAL_INNINGS,
  FIELD_SIZE,
} from "./types";

/**
 * 13-player bench schedule expressed as rank positions.
 * Each inner array lists the ranks that sit that inning.
 */
const BENCH_SCHEDULE_13: number[][] = [
  [12, 13, 2],   // Inn 1: bottom-2 + 1 top-4
  [10, 8, 6],    // Inn 2: mid/lower, 0 top-4
  [11, 5, 4],    // Inn 3: 1 top-4
  [9, 3, 7],     // Inn 4: 1 top-4
  [13, 11, 1],   // Inn 5: rank-1 last + 2 double-sitters' 2nd sit
  [10, 9, 12],   // Inn 6: 3 double-sitters' 2nd sit
];

/**
 * Build the bench schedule for any player count (10-13).
 * Returns an array of 6 arrays, each containing Player objects that sit that inning.
 */
function buildBenchSchedule(presentPlayers: Player[]): Player[][] {
  const count = presentPlayers.length;
  // Players sorted by rank (1=best)
  const byRank = [...presentPlayers].sort((a, b) => a.rank - b.rank);

  if (count < 10 || count > 13) {
    throw new Error(`Unsupported player count: ${count}. Need 10-13 present players.`);
  }

  if (count === 10) {
    // Nobody sits
    return Array.from({ length: TOTAL_INNINGS }, () => []);
  }

  if (count === 11) {
    // 1 bench per inning, 6 players sit once, 5 play all 6
    // Bottom-ranked players sit first, top player sits last
    // Ranks 8-13 map to ranks 8,9,10,11 (4 players) but we only have 11
    // Actually: 6 players must sit (one per inning). Spread across ranks.
    // Sit bottom 5 first (ranks 7-11), then rank 1 in inning 6 for fairness
    const sitters = [
      [byRank[10]], // rank 11
      [byRank[9]],  // rank 10
      [byRank[8]],  // rank 9
      [byRank[7]],  // rank 8
      [byRank[6]],  // rank 7
      [byRank[0]],  // rank 1 (best player sits last)
    ];
    return sitters;
  }

  if (count === 12) {
    // 2 bench per inning, every player sits exactly once (12 sits across 6 innings)
    // Spread top-4 across different innings, lower ranks sit earlier
    const sitters = [
      [byRank[11], byRank[1]],  // ranks 12, 2
      [byRank[9], byRank[7]],   // ranks 10, 8
      [byRank[10], byRank[3]],  // ranks 11, 4
      [byRank[8], byRank[5]],   // ranks 9, 6
      [byRank[6], byRank[0]],   // ranks 7, 1
      [byRank[4], byRank[2]],   // ranks 5, 3
    ];
    return sitters;
  }

  // count === 13: use the hardcoded bench schedule
  return BENCH_SCHEDULE_13.map((ranks) =>
    ranks.map((r) => byRank[r - 1]) // rank is 1-indexed, array is 0-indexed
  );
}

function isOutfield(pos: Assignment): boolean {
  return OUTFIELD_POSITIONS.includes(pos as Position);
}

/**
 * Main scheduling algorithm.
 * Takes present players (sorted by rank) and produces a 6-inning game sheet.
 */
export function generateGameSheet(allPlayers: Player[]): GameSheet {
  const presentPlayers = allPlayers
    .filter((p) => !p.absent)
    .sort((a, b) => a.rank - b.rank);

  const count = presentPlayers.length;
  if (count < 10) {
    throw new Error(`Need at least 10 present players, got ${count}.`);
  }
  if (count > 13) {
    throw new Error(`Maximum 13 present players supported, got ${count}.`);
  }

  const benchSchedule = buildBenchSchedule(presentPlayers);

  // Initialize game sheet: 6 innings
  const sheet: GameSheet = Array.from({ length: TOTAL_INNINGS }, () => ({}));

  // Mark bench assignments
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    for (const player of benchSchedule[inn]) {
      sheet[inn][player.id] = "Bench";
    }
  }

  // For each inning, determine active players and assign positions
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    const activePlayers = presentPlayers.filter(
      (p) => sheet[inn][p.id] !== "Bench"
    );

    // Sort active players by rank (best first)
    activePlayers.sort((a, b) => a.rank - b.rank);

    // Assign positions in priority order
    const assigned = new Set<string>();
    const usedPositions = new Set<Position>();

    for (const pos of POSITION_PRIORITY) {
      const candidate = findBestCandidate(
        activePlayers,
        pos,
        inn,
        sheet,
        assigned,
        usedPositions,
        presentPlayers,
        benchSchedule
      );
      if (candidate) {
        sheet[inn][candidate.id] = pos;
        assigned.add(candidate.id);
        usedPositions.add(pos);
      }
    }

    // Safety: any unassigned active player gets remaining position
    for (const player of activePlayers) {
      if (!assigned.has(player.id)) {
        const remaining = POSITION_PRIORITY.find((p) => !usedPositions.has(p));
        if (remaining) {
          sheet[inn][player.id] = remaining;
          assigned.add(player.id);
          usedPositions.add(remaining);
        }
      }
    }
  }

  // Post-processing: validate and fix constraint violations
  fixConstraintViolations(sheet, presentPlayers, benchSchedule);

  return sheet;
}

function findBestCandidate(
  activePlayers: Player[],
  position: Position,
  inning: number,
  sheet: GameSheet,
  assigned: Set<string>,
  usedPositions: Set<Position>,
  allPresent: Player[],
  benchSchedule: Player[][]
): Player | null {
  const candidates = activePlayers.filter((p) => {
    if (assigned.has(p.id)) return false;

    // Eligibility constraints
    if (position === "1B" && p.rank > 4) return false;
    if (position === "P" && p.rank > 6) return false;

    // No same position in consecutive active innings
    if (inning > 0 && sheet[inning - 1][p.id] === position) return false;

    // Outfield adjacency rule: no OF immediately before or after bench
    if (isOutfield(position)) {
      // Check if player is benched in adjacent innings
      if (inning > 0 && sheet[inning - 1][p.id] === "Bench") return false;
      if (
        inning < TOTAL_INNINGS - 1 &&
        benchSchedule[inning + 1]?.some((bp) => bp.id === p.id)
      )
        return false;
    }

    // No 3+ consecutive outfield innings
    if (isOutfield(position) && inning >= 2) {
      if (isOutfield(sheet[inning - 1][p.id]) && isOutfield(sheet[inning - 2][p.id])) {
        return false;
      }
    }

    return true;
  });

  if (candidates.length === 0) return null;

  // Prefer candidates by rank (best first for important positions)
  candidates.sort((a, b) => a.rank - b.rank);

  // For outfield positions, prefer players who haven't had OF yet
  // to satisfy "every player gets at least 1 OF inning"
  if (isOutfield(position)) {
    const needsOF = candidates.filter((p) => {
      for (let i = 0; i < inning; i++) {
        if (isOutfield(sheet[i][p.id])) return false;
      }
      // Check remaining innings — can they get OF later?
      let futureOFChance = false;
      for (let i = inning + 1; i < TOTAL_INNINGS; i++) {
        if (sheet[i][p.id] !== "Bench") futureOFChance = true;
      }
      // If this is their last chance for OF, prioritize them
      return !futureOFChance || inning >= TOTAL_INNINGS - 2;
    });
    if (needsOF.length > 0) {
      // Among those needing OF, prefer lower-ranked (save best for infield)
      needsOF.sort((a, b) => b.rank - a.rank);
      return needsOF[0];
    }

    // For outfield, prefer lower-ranked players
    candidates.sort((a, b) => b.rank - a.rank);
  }

  return candidates[0];
}

/**
 * Post-processing pass to fix constraint violations.
 * Swaps assignments to satisfy:
 * - Every player gets at least 1 OF inning
 * - No 3+ consecutive OF innings
 * - No same position in consecutive active innings
 */
function fixConstraintViolations(
  sheet: GameSheet,
  presentPlayers: Player[],
  benchSchedule: Player[][]
): void {
  // Fix: ensure every player gets at least 1 OF inning
  for (const player of presentPlayers) {
    let hasOF = false;
    for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
      if (isOutfield(sheet[inn][player.id])) {
        hasOF = true;
        break;
      }
    }
    if (hasOF) continue;

    // Find an inning where we can swap this player to OF
    for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
      if (sheet[inn][player.id] === "Bench") continue;

      // Check OF adjacency: not adjacent to bench
      const benchBefore = inn > 0 && sheet[inn - 1][player.id] === "Bench";
      const benchAfter =
        inn < TOTAL_INNINGS - 1 && sheet[inn + 1][player.id] === "Bench";
      if (benchBefore || benchAfter) continue;

      const currentPos = sheet[inn][player.id] as Position;
      if (isOutfield(currentPos)) continue;

      // Find an OF player in this inning to swap with
      for (const other of presentPlayers) {
        if (other.id === player.id) continue;
        if (!isOutfield(sheet[inn][other.id] as Position)) continue;

        const otherPos = sheet[inn][other.id] as Position;

        // Check if swap is valid for the other player
        // Other player can play currentPos?
        if (currentPos === "1B" && other.rank > 4) continue;
        if (currentPos === "P" && other.rank > 6) continue;

        // Check consecutive position constraint for both
        if (inn > 0) {
          if (sheet[inn - 1][player.id] === otherPos) continue;
          if (sheet[inn - 1][other.id] === currentPos) continue;
        }
        if (inn < TOTAL_INNINGS - 1) {
          if (sheet[inn + 1][player.id] === otherPos) continue;
          if (sheet[inn + 1][other.id] === currentPos) continue;
        }

        // Check OF adjacency for other player at new infield position — fine, infield has no adjacency rule
        // Check that other player doesn't violate 3-consecutive-OF
        // (they're moving to infield so that's fine)

        // Do the swap
        sheet[inn][player.id] = otherPos;
        sheet[inn][other.id] = currentPos;
        hasOF = true;
        break;
      }
      if (hasOF) break;
    }
  }
}

/**
 * Validate a game sheet against all constraints.
 * Returns an array of violation descriptions (empty = valid).
 */
export function validateGameSheet(
  sheet: GameSheet,
  presentPlayers: Player[]
): string[] {
  const violations: string[] = [];
  const playerMap = new Map(presentPlayers.map((p) => [p.id, p]));

  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    // Check 10 on field
    const active = presentPlayers.filter(
      (p) => sheet[inn][p.id] !== "Bench"
    );
    if (active.length !== FIELD_SIZE) {
      violations.push(
        `Inning ${inn + 1}: ${active.length} on field (expected ${FIELD_SIZE})`
      );
    }

    // Check position uniqueness
    const positions = active.map((p) => sheet[inn][p.id]);
    const posSet = new Set(positions);
    if (posSet.size !== positions.length) {
      violations.push(`Inning ${inn + 1}: duplicate positions`);
    }

    // Check eligibility
    for (const player of active) {
      const pos = sheet[inn][player.id];
      if (pos === "1B" && player.rank > 4) {
        violations.push(
          `Inning ${inn + 1}: ${player.name} (rank ${player.rank}) at 1B (needs top 4)`
        );
      }
      if (pos === "P" && player.rank > 6) {
        violations.push(
          `Inning ${inn + 1}: ${player.name} (rank ${player.rank}) at P (needs top 6)`
        );
      }
    }
  }

  // Check per-player constraints
  for (const player of presentPlayers) {
    let ofCount = 0;
    let consecutiveOF = 0;
    let maxConsecutiveOF = 0;
    let benchCount = 0;
    let consecutiveBench = 0;

    for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
      const assignment = sheet[inn][player.id];

      if (assignment === "Bench") {
        benchCount++;
        consecutiveBench++;
        consecutiveOF = 0;
        if (consecutiveBench > 1) {
          violations.push(
            `${player.name}: consecutive bench in innings ${inn} and ${inn + 1}`
          );
        }
      } else {
        consecutiveBench = 0;
        if (isOutfield(assignment)) {
          ofCount++;
          consecutiveOF++;
          maxConsecutiveOF = Math.max(maxConsecutiveOF, consecutiveOF);
        } else {
          consecutiveOF = 0;
        }
      }

      // No same position in consecutive active innings
      if (inn > 0 && assignment !== "Bench" && sheet[inn - 1][player.id] === assignment) {
        violations.push(
          `${player.name}: same position (${assignment}) in innings ${inn} and ${inn + 1}`
        );
      }

      // OF adjacency rule
      if (isOutfield(assignment)) {
        if (inn > 0 && sheet[inn - 1][player.id] === "Bench") {
          violations.push(
            `${player.name}: OF in inning ${inn + 1} immediately after bench`
          );
        }
        if (inn < TOTAL_INNINGS - 1 && sheet[inn + 1]?.[player.id] === "Bench") {
          violations.push(
            `${player.name}: OF in inning ${inn + 1} immediately before bench`
          );
        }
      }
    }

    if (maxConsecutiveOF >= 3) {
      violations.push(`${player.name}: ${maxConsecutiveOF} consecutive OF innings`);
    }

    // Every active player needs at least 1 OF inning
    const activeInnings = TOTAL_INNINGS - benchCount;
    if (activeInnings > 0 && ofCount === 0) {
      violations.push(`${player.name}: no outfield inning`);
    }
  }

  return violations;
}
