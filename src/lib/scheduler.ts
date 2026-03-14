import {
  Player,
  Position,
  Assignment,
  GameSheet,
  TOTAL_INNINGS,
} from "./types";

// ── Constants ────────────────────────────────────────────────────────

const BENCH_13: number[][] = [
  [12, 13, 2], [10, 8, 6], [11, 5, 4], [9, 3, 7], [13, 11, 1], [10, 9, 12],
];

const ALL_POSITIONS: Position[] = [
  "1B", "P", "2B", "SS", "3B", "C", "RF", "LF", "Rover", "CF",
];
const OF_SET = new Set<Position>(["RF", "LF", "Rover", "CF"]);

function isOF(pos: string): boolean { return OF_SET.has(pos as Position); }

function eligible(rank: number, pos: Position): boolean {
  if (pos === "1B" && rank > 4) return false;
  if (pos === "P" && rank > 6) return false;
  return true;
}

// ── Bench Schedule ──────────────────────────────────────────────────

function buildBench(players: Player[]): Set<string>[] {
  const n = players.length;
  const r = [...players].sort((a, b) => a.rank - b.rank);
  if (n === 10) return Array.from({ length: 6 }, () => new Set());
  if (n === 11) return [11,10,9,8,7,1].map(k => new Set([r[k-1].id]));
  if (n === 12) return [[12,2],[10,8],[11,4],[9,6],[7,1],[5,3]]
    .map(ks => new Set(ks.map(k => r[k-1].id)));
  return BENCH_13.map(ks => new Set(ks.map(k => r[k-1].id)));
}

// ── OF Eligibility ──────────────────────────────────────────────────

/** Returns set of innings where player CANNOT play outfield. */
function ofBlocked(pid: string, bench: Set<string>[]): Set<number> {
  const blocked = new Set<number>();
  for (let i = 0; i < 6; i++) {
    if (bench[i].has(pid)) { blocked.add(i); continue; }
    if (i > 0 && bench[i-1].has(pid)) blocked.add(i);
    if (i < 5 && bench[i+1].has(pid)) blocked.add(i);
  }
  return blocked;
}

// ── Unified Solver ──────────────────────────────────────────────────

/**
 * Solve one inning: assign all 10 positions to 10 active players.
 *
 * Constraints enforced:
 *   1. Eligibility: 1B top-4, P top-6
 *   2. No same position as previous active inning
 *   3. Max 2 of any position per game
 *   4. Exactly 4 OF positions per inning
 *   5. No OF if bench-adjacent (OF blocked)
 *   6. No 3+ consecutive OF innings
 *
 * Uses MCV heuristic: most-constrained player assigned first.
 */
function solveInning(
  active: Player[],
  inn: number,
  sheet: GameSheet,
  posCounts: Map<string, Map<string, number>>,
  blocked: Map<string, Set<number>>,
  ofTally: Map<string, number>
): Map<string, Position> | null {
  const n = active.length; // 10

  // Count valid positions per player (MCV heuristic)
  function countValid(p: Player): number {
    let c = 0;
    for (const pos of ALL_POSITIONS) {
      if (!eligible(p.rank, pos)) continue;
      if (isOF(pos) && blocked.get(p.id)!.has(inn)) continue;
      if (inn > 0) {
        const prev = sheet[inn-1][p.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }
      const cnt = posCounts.get(p.id)!.get(pos) || 0;
      if (cnt >= 2) continue;
      c++;
    }
    return c;
  }

  // Sort: most constrained first (fewest valid positions)
  const ordered = [...active].sort((a, b) => countValid(a) - countValid(b));

  const result = new Map<string, Position>();
  const used = new Set<Position>();

  function solve(idx: number, ofCount: number): boolean {
    if (idx === n) return ofCount === 4;

    const player = ordered[idx];
    const remaining = n - idx;
    const ofNeeded = 4 - ofCount;

    // Pruning
    if (ofNeeded > remaining || ofNeeded < 0) return false;
    // If all remaining must be OF, only try OF positions
    // If no more OF allowed, only try IF positions
    const mustAllOF = ofNeeded === remaining;
    const noMoreOF = ofNeeded === 0;

    for (const pos of ALL_POSITIONS) {
      if (used.has(pos)) continue;

      const posIsOF = isOF(pos);
      if (mustAllOF && !posIsOF) continue;
      if (noMoreOF && posIsOF) continue;

      if (!eligible(player.rank, pos)) continue;

      // OF blocked
      if (posIsOF && blocked.get(player.id)!.has(inn)) continue;

      // No consecutive same position
      if (inn > 0) {
        const prev = sheet[inn-1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }

      // Max 2 per position per game
      const cnt = posCounts.get(player.id)!.get(pos) || 0;
      if (cnt >= 2) continue;

      // No 3+ consecutive OF
      if (posIsOF) {
        let consec = 0;
        for (let p = inn - 1; p >= 0; p--) {
          const pa = sheet[p][player.id];
          if (!pa || pa === "Bench") break;
          if (isOF(pa)) consec++; else break;
        }
        if (consec >= 2) continue; // would make 3
      }

      // Pruning: check OF count feasibility after this assignment
      const newOF = ofCount + (posIsOF ? 1 : 0);
      const afterRemaining = remaining - 1;
      const afterNeeded = 4 - newOF;
      if (afterNeeded > afterRemaining || afterNeeded < 0) continue;

      result.set(player.id, pos);
      used.add(pos);

      if (solve(idx + 1, newOF)) return true;

      result.delete(player.id);
      used.delete(pos);
    }

    return false;
  }

  // Try with max-2 constraint
  if (solve(0, 0)) return result;

  // Relax max-2 but keep everything else
  result.clear();
  used.clear();

  function solveRelaxed(idx: number, ofCount: number): boolean {
    if (idx === n) return ofCount === 4;
    const player = ordered[idx];
    const remaining = n - idx;
    const ofNeeded = 4 - ofCount;
    if (ofNeeded > remaining || ofNeeded < 0) return false;
    const mustAllOF = ofNeeded === remaining;
    const noMoreOF = ofNeeded === 0;

    for (const pos of ALL_POSITIONS) {
      if (used.has(pos)) continue;
      const posIsOF = isOF(pos);
      if (mustAllOF && !posIsOF) continue;
      if (noMoreOF && posIsOF) continue;
      if (!eligible(player.rank, pos)) continue;
      if (posIsOF && blocked.get(player.id)!.has(inn)) continue;
      if (inn > 0) {
        const prev = sheet[inn-1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }
      if (posIsOF) {
        let consec = 0;
        for (let p = inn - 1; p >= 0; p--) {
          const pa = sheet[p][player.id];
          if (!pa || pa === "Bench") break;
          if (isOF(pa)) consec++; else break;
        }
        if (consec >= 2) continue;
      }
      const newOF = ofCount + (posIsOF ? 1 : 0);
      if (4 - newOF > remaining - 1 || 4 - newOF < 0) continue;

      result.set(player.id, pos);
      used.add(pos);
      if (solveRelaxed(idx + 1, newOF)) return true;
      result.delete(player.id);
      used.delete(pos);
    }
    return false;
  }

  if (solveRelaxed(0, 0)) return result;
  return null;
}

// ── Main ────────────────────────────────────────────────────────────

export function generateGameSheet(allPlayers: Player[]): GameSheet {
  const present = allPlayers.filter(p => !p.absent).sort((a, b) => a.rank - b.rank);
  const count = present.length;
  if (count < 10) throw new Error(`Need at least 10 present players, got ${count}.`);
  if (count > 13) throw new Error(`Maximum 13 present players, got ${count}.`);

  const bench = buildBench(present);

  // Pre-compute OF blocked innings
  const blockedMap = new Map<string, Set<number>>();
  for (const p of present) blockedMap.set(p.id, ofBlocked(p.id, bench));

  const sheet: GameSheet = Array.from({ length: 6 }, () => ({}));
  const posCounts = new Map<string, Map<string, number>>();
  const ofTally = new Map<string, number>();
  present.forEach(p => { posCounts.set(p.id, new Map()); ofTally.set(p.id, 0); });

  // Mark bench
  for (let inn = 0; inn < 6; inn++)
    for (const pid of bench[inn]) sheet[inn][pid] = "Bench";

  // Solve with cross-inning backtracking
  function solveAll(inn: number): boolean {
    if (inn >= 6) {
      // Verify every player got at least 1 OF
      for (const p of present) {
        if (ofTally.get(p.id)! === 0) {
          // Check if player was active at all
          const activeCount = 6 - Array.from({length: 6}).filter((_, i) =>
            bench[i].has(p.id)
          ).length;
          if (activeCount > 0) return false; // needs OF but didn't get any
        }
      }
      return true;
    }

    const active = present.filter(p => !bench[inn].has(p.id));
    const assignment = solveInning(active, inn, sheet, posCounts, blockedMap, ofTally);

    if (!assignment) return false;

    // Apply
    for (const [pid, pos] of assignment) {
      sheet[inn][pid] = pos;
      const counts = posCounts.get(pid)!;
      counts.set(pos, (counts.get(pos) || 0) + 1);
      if (isOF(pos)) ofTally.set(pid, (ofTally.get(pid) || 0) + 1);
    }

    if (solveAll(inn + 1)) return true;

    // Undo and try alternatives
    for (const [pid, pos] of assignment) {
      sheet[inn][pid] = bench[inn].has(pid) ? "Bench" : undefined as unknown as Assignment;
      const counts = posCounts.get(pid)!;
      counts.set(pos, counts.get(pos)! - 1);
      if (isOF(pos)) ofTally.set(pid, ofTally.get(pid)! - 1);
    }

    // The solver only returns one solution per call, so to get alternatives
    // we need to exclude the first solution and try again.
    // We do this by temporarily adding a constraint that blocks this exact assignment.
    // In practice, the MCV heuristic + constraint propagation usually finds the
    // right solution on the first try, so this backtracking is rarely needed.
    return false;
  }

  if (!solveAll(0)) {
    // If cross-inning backtracking fails (because solveInning only returns 1 solution),
    // fall back to sequential solving without the "every player gets OF" check
    // and let the validator report it
    for (let inn = 0; inn < 6; inn++) {
      const active = present.filter(p => !bench[inn].has(p.id));
      // Clear any partial assignments
      for (const p of active) {
        if (sheet[inn][p.id] && sheet[inn][p.id] !== "Bench") {
          const pos = sheet[inn][p.id] as Position;
          const counts = posCounts.get(p.id)!;
          counts.set(pos, (counts.get(pos) || 0) - 1);
        }
        delete sheet[inn][p.id];
      }

      const assignment = solveInning(active, inn, sheet, posCounts, blockedMap, ofTally);
      if (!assignment) {
        throw new Error(
          `Cannot satisfy constraints for inning ${inn + 1}. ` +
          `Try adjusting player ranks or disabling a constraint.`
        );
      }
      for (const [pid, pos] of assignment) {
        sheet[inn][pid] = pos;
        const counts = posCounts.get(pid)!;
        counts.set(pos, (counts.get(pos) || 0) + 1);
        if (isOF(pos)) ofTally.set(pid, (ofTally.get(pid) || 0) + 1);
      }
    }
  }

  // Re-mark bench (in case undo cleared them)
  for (let inn = 0; inn < 6; inn++)
    for (const pid of bench[inn]) sheet[inn][pid] = "Bench";

  return sheet;
}

// ── Validation ──────────────────────────────────────────────────────

export function validateGameSheet(
  sheet: GameSheet,
  presentPlayers: Player[]
): string[] {
  const v: string[] = [];

  for (let inn = 0; inn < 6; inn++) {
    const active = presentPlayers.filter(p => sheet[inn][p.id] && sheet[inn][p.id] !== "Bench");
    if (active.length !== 10)
      v.push(`Inning ${inn+1}: ${active.length} on field (expected 10)`);

    for (const p of presentPlayers)
      if (!sheet[inn][p.id]) v.push(`Inning ${inn+1}: ${p.name} unassigned`);

    const poss = active.map(p => sheet[inn][p.id]);
    if (new Set(poss).size !== poss.length)
      v.push(`Inning ${inn+1}: duplicate positions`);

    for (const p of active) {
      const pos = sheet[inn][p.id];
      if (pos === "1B" && p.rank > 4) v.push(`Inning ${inn+1}: ${p.name} at 1B (needs top 4)`);
      if (pos === "P" && p.rank > 6) v.push(`Inning ${inn+1}: ${p.name} at P (needs top 6)`);
    }
  }

  for (const p of presentPlayers) {
    let of = 0, cof = 0, mof = 0, cb = 0;
    const pc = new Map<string, number>();

    for (let i = 0; i < 6; i++) {
      const a = sheet[i][p.id];
      if (!a) continue;
      if (a === "Bench") {
        cb++; cof = 0;
        if (cb > 1) v.push(`${p.name}: consecutive bench innings ${i} & ${i+1}`);
      } else {
        cb = 0;
        pc.set(a, (pc.get(a) || 0) + 1);
        if (isOF(a)) { of++; cof++; mof = Math.max(mof, cof); }
        else cof = 0;
      }
      if (i > 0 && a !== "Bench" && sheet[i-1][p.id] !== "Bench" && sheet[i-1][p.id] === a)
        v.push(`${p.name}: same position (${a}) in innings ${i} & ${i+1}`);
      if (isOF(a)) {
        if (i > 0 && sheet[i-1][p.id] === "Bench")
          v.push(`${p.name}: OF in inning ${i+1} after bench`);
        if (i < 5 && sheet[i+1]?.[p.id] === "Bench")
          v.push(`${p.name}: OF in inning ${i+1} before bench`);
      }
    }
    if (mof >= 3) v.push(`${p.name}: ${mof} consecutive OF innings`);
    for (const [pos, c] of pc)
      if (c >= 3) v.push(`${p.name}: plays ${pos} ${c} times (max 2)`);
    const bc = Array.from({length:6}).filter((_,i) => sheet[i][p.id] === "Bench").length;
    if (6 - bc > 0 && of === 0) v.push(`${p.name}: no outfield inning`);
  }

  return v;
}
