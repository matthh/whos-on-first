import {
  Player,
  Position,
  Assignment,
  GameSheet,
  OUTFIELD_POSITIONS,
  TOTAL_INNINGS,
} from "./types";

const BENCH_SCHEDULE_13: number[][] = [
  [12, 13, 2], [10, 8, 6], [11, 5, 4], [9, 3, 7], [13, 11, 1], [10, 9, 12],
];

const ALL_POSITIONS: Position[] = ["1B", "P", "2B", "SS", "3B", "C", "RF", "LF", "Rover", "CF"];
const OF_SET = new Set<Position>(["RF", "LF", "Rover", "CF"]);

function isOutfield(pos: Assignment): boolean {
  return OF_SET.has(pos as Position);
}

function isEligible(rank: number, pos: Position): boolean {
  if (pos === "1B" && rank > 4) return false;
  if (pos === "P" && rank > 6) return false;
  return true;
}

function buildBenchSchedule(presentPlayers: Player[]): Set<string>[] {
  const count = presentPlayers.length;
  const byRank = [...presentPlayers].sort((a, b) => a.rank - b.rank);

  if (count === 10) return Array.from({ length: TOTAL_INNINGS }, () => new Set<string>());
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

/**
 * For a player, determine which innings they CANNOT play outfield
 * (benched, or adjacent to a bench inning).
 */
function getOFBlocked(playerId: string, benchSchedule: Set<string>[]): Set<number> {
  const blocked = new Set<number>();
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    if (benchSchedule[inn].has(playerId)) { blocked.add(inn); continue; }
    if (inn > 0 && benchSchedule[inn - 1].has(playerId)) blocked.add(inn);
    if (inn < TOTAL_INNINGS - 1 && benchSchedule[inn + 1].has(playerId)) blocked.add(inn);
  }
  return blocked;
}

/**
 * Assign all 10 positions for one inning using backtracking.
 * Players are sorted by rank (best first), positions by priority.
 * Constraints checked:
 * - Eligibility (1B top 4, P top 6)
 * - No same position as previous active inning
 * - Max 2x per position per game
 * - OF blocked innings (bench adjacency)
 * - Exactly 4 OF positions assigned
 */
function assignInning(
  activePlayers: Player[],
  inn: number,
  sheet: GameSheet,
  posCounts: Map<string, Map<string, number>>,
  ofBlocked: Map<string, Set<number>>,
  ofCounts: Map<string, number>,
  totalActiveInnings: Map<string, number>
): Map<string, Position> | null {
  const n = activePlayers.length; // should be 10
  const result: (Position | null)[] = new Array(n).fill(null);
  const usedPositions = new Set<Position>();

  // For the "every player gets at least 1 OF" constraint:
  // Check if this is a player's last chance to get OF
  function needsOFNow(player: Player, posIsOF: boolean): boolean {
    if (posIsOF) return false; // they're getting it
    const currentOF = ofCounts.get(player.id) || 0;
    if (currentOF > 0) return false; // already has OF

    // Count remaining active innings where OF is allowed
    let futureOFChances = 0;
    for (let futureInn = inn + 1; futureInn < TOTAL_INNINGS; futureInn++) {
      if (!sheet[futureInn]) continue; // not yet processed
      if (sheet[futureInn][player.id] === "Bench") continue;
      if (ofBlocked.get(player.id)!.has(futureInn)) continue;
      futureOFChances++;
    }
    return futureOFChances === 0; // this is their last chance
  }

  function backtrack(idx: number, ofCount: number): boolean {
    if (idx === n) return ofCount === 4; // must have exactly 4 OF

    const player = activePlayers[idx];
    const remaining = n - idx;
    const ofNeeded = 4 - ofCount;
    const ifNeeded = (remaining - ofNeeded);

    // Pruning: can we still fill exactly 4 OF?
    if (ofNeeded > remaining) return false;
    if (ofNeeded < 0) return false;

    for (const pos of ALL_POSITIONS) {
      if (usedPositions.has(pos)) continue;
      if (!isEligible(player.rank, pos)) continue;

      const posIsOF = OF_SET.has(pos);

      // OF blocked check
      if (posIsOF && ofBlocked.get(player.id)!.has(inn)) continue;

      // No same position in consecutive active innings
      if (inn > 0) {
        const prev = sheet[inn - 1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }

      // Max 2 per position per game
      const currentPosCount = posCounts.get(player.id)!.get(pos) || 0;
      if (currentPosCount >= 2) continue;

      // Check OF count feasibility
      const newOFCount = ofCount + (posIsOF ? 1 : 0);
      const remainingAfter = n - idx - 1;
      const ofStillNeeded = 4 - newOFCount;
      if (ofStillNeeded > remainingAfter) continue; // can't fill enough OF
      if (ofStillNeeded < 0) continue; // too many OF

      // If player needs OF now (last chance) and this isn't OF, skip
      if (needsOFNow(player, posIsOF)) continue;

      result[idx] = pos;
      usedPositions.add(pos);

      if (backtrack(idx + 1, newOFCount)) return true;

      result[idx] = null;
      usedPositions.delete(pos);
    }

    return false;
  }

  if (backtrack(0, 0)) {
    const map = new Map<string, Position>();
    for (let i = 0; i < n; i++) {
      map.set(activePlayers[i].id, result[i]!);
    }
    return map;
  }

  // Relax max-2 constraint but keep eligibility + OF count
  const result2: (Position | null)[] = new Array(n).fill(null);
  const usedPositions2 = new Set<Position>();

  function backtrack2(idx: number, ofCount: number): boolean {
    if (idx === n) return ofCount === 4;
    const player = activePlayers[idx];
    const remaining = n - idx;
    const ofNeeded = 4 - ofCount;
    if (ofNeeded > remaining || ofNeeded < 0) return false;

    for (const pos of ALL_POSITIONS) {
      if (usedPositions2.has(pos)) continue;
      if (!isEligible(player.rank, pos)) continue;
      const posIsOF = OF_SET.has(pos);
      if (posIsOF && ofBlocked.get(player.id)!.has(inn)) continue;
      if (inn > 0) {
        const prev = sheet[inn - 1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }
      const newOFCount = ofCount + (posIsOF ? 1 : 0);
      if (4 - newOFCount > remaining - 1) continue;
      if (4 - newOFCount < 0) continue;

      result2[idx] = pos;
      usedPositions2.add(pos);
      if (backtrack2(idx + 1, newOFCount)) return true;
      result2[idx] = null;
      usedPositions2.delete(pos);
    }
    return false;
  }

  if (backtrack2(0, 0)) {
    const map = new Map<string, Position>();
    for (let i = 0; i < n; i++) {
      map.set(activePlayers[i].id, result2[i]!);
    }
    return map;
  }

  return null;
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

  // Pre-compute OF blocked innings and total active innings per player
  const ofBlocked = new Map<string, Set<number>>();
  const totalActiveInnings = new Map<string, number>();
  const ofCounts = new Map<string, number>();
  for (const p of presentPlayers) {
    ofBlocked.set(p.id, getOFBlocked(p.id, benchSchedule));
    ofCounts.set(p.id, 0);
    let active = 0;
    for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
      if (!benchSchedule[inn].has(p.id)) active++;
    }
    totalActiveInnings.set(p.id, active);
  }

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

    if (activePlayers.length !== 10) {
      throw new Error(`Inning ${inn + 1}: expected 10 active players, got ${activePlayers.length}`);
    }

    const assignment = assignInning(
      activePlayers, inn, sheet, posCounts, ofBlocked, ofCounts, totalActiveInnings
    );

    if (!assignment) {
      throw new Error(
        `Cannot satisfy all constraints for inning ${inn + 1}. ` +
        `Try adjusting player ranks or disabling a constraint.`
      );
    }

    for (const [pid, pos] of assignment) {
      sheet[inn][pid] = pos;
      const counts = posCounts.get(pid)!;
      counts.set(pos, (counts.get(pos) || 0) + 1);
      if (isOutfield(pos)) {
        ofCounts.set(pid, (ofCounts.get(pid) || 0) + 1);
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

    for (const p of presentPlayers) {
      if (!sheet[inn][p.id]) {
        violations.push(`Inning ${inn + 1}: ${p.name} has no assignment`);
      }
    }

    const positions = active.map((p) => sheet[inn][p.id]);
    if (new Set(positions).size !== positions.length) {
      violations.push(`Inning ${inn + 1}: duplicate positions`);
    }

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
    const posCts = new Map<string, number>();

    for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
      const a = sheet[inn][player.id];
      if (!a) continue;

      if (a === "Bench") {
        consecutiveBench++;
        consecutiveOF = 0;
        if (consecutiveBench > 1) {
          violations.push(`${player.name}: consecutive bench in innings ${inn} and ${inn + 1}`);
        }
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

      if (inn > 0 && a !== "Bench" && sheet[inn - 1][player.id] !== "Bench" &&
          sheet[inn - 1][player.id] === a) {
        violations.push(`${player.name}: same position (${a}) in innings ${inn} and ${inn + 1}`);
      }

      if (isOutfield(a)) {
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

    for (const [pos, c] of posCts) {
      if (c >= 3) {
        violations.push(`${player.name}: plays ${pos} ${c} times (max 2)`);
      }
    }

    const benchCount = Array.from({ length: TOTAL_INNINGS }).filter(
      (_, i) => sheet[i][player.id] === "Bench"
    ).length;
    if (TOTAL_INNINGS - benchCount > 0 && ofCount === 0) {
      violations.push(`${player.name}: no outfield inning`);
    }
  }

  return violations;
}
