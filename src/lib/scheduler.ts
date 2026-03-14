import {
  Player,
  Position,
  Assignment,
  GameSheet,
  POSITION_PRIORITY,
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

function isOutfield(pos: Assignment): boolean {
  return OUTFIELD_POSITIONS.includes(pos as Position);
}

function isInfield(pos: Assignment): boolean {
  return pos !== "Bench" && !isOutfield(pos);
}

/**
 * Build bench schedule for 10-13 players.
 * Returns player IDs that sit each inning.
 */
function buildBenchSchedule(presentPlayers: Player[]): Set<string>[] {
  const count = presentPlayers.length;
  const byRank = [...presentPlayers].sort((a, b) => a.rank - b.rank);

  if (count === 10) {
    return Array.from({ length: TOTAL_INNINGS }, () => new Set<string>());
  }

  if (count === 11) {
    // 1 player sits per inning, 6 total sitters, 5 play all 6
    // Bottom players sit first, best player sits last
    const sitterRanks = [11, 10, 9, 8, 7, 1];
    return sitterRanks.map((r) => new Set([byRank[r - 1].id]));
  }

  if (count === 12) {
    // 2 per inning, everyone sits exactly once
    const schedule = [
      [12, 2], [10, 8], [11, 4], [9, 6], [7, 1], [5, 3],
    ];
    return schedule.map((ranks) =>
      new Set(ranks.map((r) => byRank[r - 1].id))
    );
  }

  // 13 players
  return BENCH_SCHEDULE_13.map((ranks) =>
    new Set(ranks.map((r) => byRank[r - 1].id))
  );
}

/**
 * Determine which innings each player CAN play outfield,
 * respecting the bench-adjacency rule.
 * A player cannot play OF in the inning immediately before or after a bench inning.
 */
function getOFEligibleInnings(
  playerId: string,
  benchSchedule: Set<string>[]
): Set<number> {
  const eligible = new Set<number>();
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    if (benchSchedule[inn].has(playerId)) continue; // benched this inning
    const benchBefore = inn > 0 && benchSchedule[inn - 1].has(playerId);
    const benchAfter = inn < TOTAL_INNINGS - 1 && benchSchedule[inn + 1].has(playerId);
    if (!benchBefore && !benchAfter) {
      eligible.add(inn);
    }
  }
  return eligible;
}

/**
 * Plan which innings each player plays outfield.
 * Ensures:
 * - Every player gets at least 1 OF inning
 * - No player plays OF 3+ innings in a row
 * - OF adjacency rule (no OF next to bench) is respected
 * - 4 OF slots filled per inning
 */
function planOutfieldAssignments(
  presentPlayers: Player[],
  benchSchedule: Set<string>[]
): Map<string, Set<number>> {
  const ofPlan = new Map<string, Set<number>>();
  presentPlayers.forEach((p) => ofPlan.set(p.id, new Set<number>()));

  // Get OF-eligible innings per player
  const eligibleMap = new Map<string, Set<number>>();
  for (const p of presentPlayers) {
    eligibleMap.set(p.id, getOFEligibleInnings(p.id, benchSchedule));
  }

  // We need exactly 4 OF players per inning
  // First, identify players with very limited OF windows — assign them first
  const playersByFlexibility = [...presentPlayers].sort((a, b) => {
    const aElig = eligibleMap.get(a.id)!.size;
    const bElig = eligibleMap.get(b.id)!.size;
    return aElig - bElig; // least flexible first
  });

  // Track OF counts per inning
  const ofCountPerInning = new Array(TOTAL_INNINGS).fill(0);
  const activePerInning: number[] = [];
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    activePerInning.push(
      presentPlayers.filter((p) => !benchSchedule[inn].has(p.id)).length
    );
  }

  // Phase 1: Guarantee every player gets at least 1 OF inning
  for (const player of playersByFlexibility) {
    const eligible = eligibleMap.get(player.id)!;
    if (eligible.size === 0) continue; // Can't play OF at all (shouldn't happen with good bench schedule)

    // Pick the inning with fewest OF assigned so far (among eligible)
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

  // Phase 2: Fill remaining OF slots (need exactly 4 per inning)
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    while (ofCountPerInning[inn] < 4) {
      // Find a player who can play OF this inning and doesn't already
      let bestCandidate: Player | null = null;
      let bestScore = -Infinity;

      for (const player of presentPlayers) {
        if (benchSchedule[inn].has(player.id)) continue;
        if (ofPlan.get(player.id)!.has(inn)) continue;
        if (!eligibleMap.get(player.id)!.has(inn)) continue;

        // Check no 3+ consecutive OF
        const playerOF = ofPlan.get(player.id)!;
        const wouldBeConsec = countConsecutiveOF(playerOF, inn);
        if (wouldBeConsec >= 3) continue;

        // Prefer players with fewer OF innings (spread it out)
        // And prefer lower-ranked players for OF (save better players for infield)
        const currentOFCount = playerOF.size;
        const score = -currentOFCount * 100 + player.rank;
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = player;
        }
      }

      if (!bestCandidate) break; // Can't fill this slot (shouldn't happen)
      ofPlan.get(bestCandidate.id)!.add(inn);
      ofCountPerInning[inn]++;
    }
  }

  // Phase 3: If any inning still has too many OF, remove extras
  // (This handles cases where phase 1 over-assigned some innings)
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    if (ofCountPerInning[inn] > 4) {
      // Remove OF from players who have the most OF innings and have other OF options
      const ofPlayersThisInning = presentPlayers.filter(
        (p) => ofPlan.get(p.id)!.has(inn)
      );
      ofPlayersThisInning.sort((a, b) => {
        const aCount = ofPlan.get(a.id)!.size;
        const bCount = ofPlan.get(b.id)!.size;
        return bCount - aCount; // most OF first (remove from them)
      });

      while (ofCountPerInning[inn] > 4 && ofPlayersThisInning.length > 4) {
        const toRemove = ofPlayersThisInning.shift()!;
        // Only remove if they have another OF inning
        if (ofPlan.get(toRemove.id)!.size > 1) {
          ofPlan.get(toRemove.id)!.delete(inn);
          ofCountPerInning[inn]--;
        }
      }
    }
  }

  return ofPlan;
}

/**
 * Count how many consecutive OF innings would result if we add `newInn` to the set.
 */
function countConsecutiveOF(ofInnings: Set<number>, newInn: number): number {
  let count = 1;
  let i = newInn - 1;
  while (i >= 0 && ofInnings.has(i)) { count++; i--; }
  i = newInn + 1;
  while (i < TOTAL_INNINGS && ofInnings.has(i)) { count++; i++; }
  return count;
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

  // Initialize game sheet
  const sheet: GameSheet = Array.from({ length: TOTAL_INNINGS }, () => ({}));

  // Mark bench
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    for (const playerId of benchSchedule[inn]) {
      sheet[inn][playerId] = "Bench";
    }
  }

  // For each inning, assign positions
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    const activePlayers = presentPlayers.filter(
      (p) => !benchSchedule[inn].has(p.id)
    );

    // Split into OF and IF for this inning based on OF plan
    const ofPlayers = activePlayers.filter((p) => ofPlan.get(p.id)!.has(inn));
    const ifPlayers = activePlayers.filter((p) => !ofPlan.get(p.id)!.has(inn));

    // Assign infield positions (priority order: 1B, P, 2B, SS, 3B, C)
    const infieldPositions: Position[] = ["1B", "P", "2B", "SS", "3B", "C"];
    const assignedIF = new Set<string>();
    const usedIFPos = new Set<Position>();

    for (const pos of infieldPositions) {
      // Find best candidate among ifPlayers
      let best: Player | null = null;
      let bestScore = -Infinity;

      for (const player of ifPlayers) {
        if (assignedIF.has(player.id)) continue;

        // Eligibility
        if (pos === "1B" && player.rank > 4) continue;
        if (pos === "P" && player.rank > 6) continue;

        // No same position in consecutive active innings
        if (inn > 0 && sheet[inn - 1][player.id] === pos) continue;

        // Score: prefer better-ranked players for higher-priority positions
        const score = -player.rank;
        if (score > bestScore) {
          bestScore = score;
          best = player;
        }
      }

      if (best) {
        sheet[inn][best.id] = pos;
        assignedIF.add(best.id);
        usedIFPos.add(pos);
      }
    }

    // If any IF players weren't assigned (shouldn't happen), put them somewhere
    for (const player of ifPlayers) {
      if (!assignedIF.has(player.id)) {
        const remaining = infieldPositions.find((p) => !usedIFPos.has(p));
        if (remaining) {
          sheet[inn][player.id] = remaining;
          usedIFPos.add(remaining);
        }
      }
    }

    // Assign outfield positions (priority order: RF, LF, Rover, CF)
    const outfieldPositions: Position[] = ["RF", "LF", "Rover", "CF"];
    const assignedOF = new Set<string>();
    const usedOFPos = new Set<Position>();

    for (const pos of outfieldPositions) {
      let best: Player | null = null;
      let bestScore = -Infinity;

      for (const player of ofPlayers) {
        if (assignedOF.has(player.id)) continue;

        // No same position in consecutive active innings
        if (inn > 0 && sheet[inn - 1][player.id] === pos) continue;

        // Prefer lower-ranked players for outfield
        const score = player.rank;
        if (score > bestScore) {
          bestScore = score;
          best = player;
        }
      }

      if (best) {
        sheet[inn][best.id] = pos;
        assignedOF.add(best.id);
        usedOFPos.add(pos);
      }
    }

    // Remaining OF players get remaining OF positions
    for (const player of ofPlayers) {
      if (!assignedOF.has(player.id)) {
        const remaining = outfieldPositions.find((p) => !usedOFPos.has(p));
        if (remaining) {
          sheet[inn][player.id] = remaining;
          usedOFPos.add(remaining);
        }
      }
    }
  }

  // Post-processing: fix any remaining consecutive-position violations via swaps
  fixConsecutivePositionViolations(sheet, presentPlayers, benchSchedule, ofPlan);

  return sheet;
}

/**
 * Fix cases where a player has the same position in consecutive active innings
 * by swapping with another player in the same category (IF/OF) in that inning.
 */
function fixConsecutivePositionViolations(
  sheet: GameSheet,
  presentPlayers: Player[],
  benchSchedule: Set<string>[],
  ofPlan: Map<string, Set<number>>
): void {
  for (let pass = 0; pass < 3; pass++) {
    let fixed = false;
    for (let inn = 1; inn < TOTAL_INNINGS; inn++) {
      for (const player of presentPlayers) {
        if (benchSchedule[inn].has(player.id)) continue;
        if (benchSchedule[inn - 1].has(player.id)) continue;

        const pos = sheet[inn][player.id];
        const prevPos = sheet[inn - 1][player.id];
        if (pos !== prevPos || pos === "Bench") continue;

        // Find a swap partner in the same inning, same category (IF/OF)
        const isOF = isOutfield(pos);
        for (const other of presentPlayers) {
          if (other.id === player.id) continue;
          if (benchSchedule[inn].has(other.id)) continue;

          const otherPos = sheet[inn][other.id];
          if (isOutfield(otherPos) !== isOF) continue; // must be same category

          // Check eligibility for swapped positions
          if (pos === "1B" && other.rank > 4) continue;
          if (pos === "P" && other.rank > 6) continue;
          if (otherPos === "1B" && player.rank > 4) continue;
          if (otherPos === "P" && player.rank > 6) continue;

          // Check that swap doesn't create a new consecutive violation
          const otherPrevPos = inn > 0 ? sheet[inn - 1][other.id] : undefined;
          if (otherPrevPos === pos) continue; // would give other a consecutive violation

          // Check next inning too
          if (inn < TOTAL_INNINGS - 1) {
            const playerNextPos = sheet[inn + 1][player.id];
            const otherNextPos = sheet[inn + 1][other.id];
            if (playerNextPos === otherPos) continue;
            if (otherNextPos === pos) continue;
          }

          // Do the swap
          sheet[inn][player.id] = otherPos;
          sheet[inn][other.id] = pos;
          fixed = true;
          break;
        }
      }
    }
    if (!fixed) break;
  }
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
    const active = presentPlayers.filter((p) => sheet[inn][p.id] !== "Bench");
    if (active.length !== 10) {
      violations.push(`Inning ${inn + 1}: ${active.length} on field (expected 10)`);
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
        violations.push(`Inning ${inn + 1}: ${player.name} (rank ${player.rank}) at 1B (needs top 4)`);
      }
      if (pos === "P" && player.rank > 6) {
        violations.push(`Inning ${inn + 1}: ${player.name} (rank ${player.rank}) at P (needs top 6)`);
      }
    }
  }

  for (const player of presentPlayers) {
    let ofCount = 0;
    let consecutiveOF = 0;
    let maxConsecutiveOF = 0;
    let consecutiveBench = 0;

    for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
      const assignment = sheet[inn][player.id];

      if (assignment === "Bench") {
        consecutiveBench++;
        consecutiveOF = 0;
        if (consecutiveBench > 1) {
          violations.push(`${player.name}: consecutive bench in innings ${inn} and ${inn + 1}`);
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

      // Same position consecutive
      if (inn > 0 && assignment !== "Bench" && sheet[inn - 1][player.id] !== "Bench" && sheet[inn - 1][player.id] === assignment) {
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

    const activeInnings = TOTAL_INNINGS - [...Array(TOTAL_INNINGS)].filter((_, i) => sheet[i][player.id] === "Bench").length;
    if (activeInnings > 0 && ofCount === 0) {
      violations.push(`${player.name}: no outfield inning`);
    }
  }

  return violations;
}
