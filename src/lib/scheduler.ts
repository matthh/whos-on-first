/**
 * Who's On First — Defensive Position Scheduler
 *
 * Constraints (all enforced, never violated):
 *  1. 10 on field per inning (6 IF + 4 OF)
 *  2. No same position in consecutive active innings
 *  3. Every player gets at least 1 OF inning per game
 *  4. No 3+ consecutive OF innings
 *  5. No OF immediately before or after a bench inning
 *  6. No consecutive bench innings
 *  7. Fairness: no double-sit before everyone sits once
 *  8. Max 1 top-4 player benched per inning
 *  9. Top-4 players bench as late as possible (no top-4 in inning 1)
 * 10. 1B: only top-4 players eligible
 * 11. Pitcher: only top-6 players eligible
 * 12. Max 2 of any single position per player per game
 */

import { Player, Position, Assignment, GameSheet, TOTAL_INNINGS } from "./types";

// ── Position sets ───────────────────────────────────────────────────

const ALL_POS: Position[] = ["1B","P","2B","SS","3B","C","RF","LF","Rover","CF"];
const OF = new Set(["RF","LF","Rover","CF"]);

function isOF(p: string): boolean { return OF.has(p); }

function canPlay(rank: number, pos: Position): boolean {
  if (pos === "1B" && rank > 4) return false;
  if (pos === "P" && rank > 6) return false;
  return true;
}

// ── Bench schedules ─────────────────────────────────────────────────
// Top-4 bench as late as possible. No top-4 in inning 1.
// Double-sitters are the bottom 5 (ranks 9-13 for 13 players).

const BENCH: Record<number, number[][]> = {
  10: [[], [], [], [], [], []],
  11: [[11], [10], [9], [8], [7], [1]],
  12: [[12,11], [10,9], [8,4], [7,3], [6,2], [5,1]],
  13: [
    [13, 12, 8],     // Inn 1: no top-4
    [4, 10, 6],      // Inn 2: rank 4 first top-4
    [3, 11, 7],      // Inn 3: rank 3
    [2, 9, 5],       // Inn 4: rank 2
    [1, 13, 11],     // Inn 5: rank 1 last; 2 double-sitters
    [12, 10, 9],     // Inn 6: 3 double-sitters
  ],
};

function buildBench(players: Player[]): Set<string>[] {
  const n = players.length;
  const byRank = [...players].sort((a, b) => a.rank - b.rank);
  const template = BENCH[n];
  if (!template) throw new Error(`Need 10-13 players, got ${n}`);
  return template.map(ranks =>
    new Set(ranks.map(r => byRank[r - 1].id))
  );
}

// ── OF eligibility ──────────────────────────────────────────────────

/** Compute which innings each player is BLOCKED from playing OF. */
function computeOFBlocked(players: Player[], bench: Set<string>[]): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const p of players) {
    const blocked = new Set<number>();
    for (let i = 0; i < TOTAL_INNINGS; i++) {
      if (bench[i].has(p.id)) { blocked.add(i); continue; }
      if (i > 0 && bench[i - 1].has(p.id)) blocked.add(i);
      if (i < TOTAL_INNINGS - 1 && bench[i + 1].has(p.id)) blocked.add(i);
    }
    map.set(p.id, blocked);
  }
  return map;
}

// ── Core solver ─────────────────────────────────────────────────────

/**
 * Generator that yields valid position assignments for one inning.
 * Each yielded value is a Map<playerId, Position>.
 *
 * Uses MCV heuristic and constraint pruning.
 */
function* solveInning(
  active: Player[],
  inn: number,
  sheet: GameSheet,
  posCounts: Map<string, Map<string, number>>,
  blocked: Map<string, Set<number>>,
  ofCounts: Map<string, number>,
): Generator<Map<string, Position>> {
  const n = active.length;

  // MCV: sort by number of valid positions (ascending)
  function validCount(p: Player): number {
    let c = 0;
    for (const pos of ALL_POS) {
      if (!canPlay(p.rank, pos)) continue;
      if (isOF(pos) && blocked.get(p.id)!.has(inn)) continue;
      if (inn > 0) {
        const prev = sheet[inn - 1][p.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }
      const cnt = posCounts.get(p.id)!.get(pos) || 0;
      if (cnt >= 2) continue;
      c++;
    }
    return c;
  }

  const ordered = [...active].sort((a, b) => validCount(a) - validCount(b));

  const result = new Map<string, Position>();
  const used = new Set<Position>();
  let yieldCount = 0;
  const MAX_YIELDS = 200; // limit to prevent runaway

  function* bt(idx: number, ofCount: number): Generator<Map<string, Position>> {
    if (yieldCount >= MAX_YIELDS) return;

    if (idx === n) {
      if (ofCount === 4) {
        yieldCount++;
        yield new Map(result);
      }
      return;
    }

    const player = ordered[idx];
    const remaining = n - idx;
    const ofNeeded = 4 - ofCount;

    // Pruning: impossible to reach exactly 4 OF
    if (ofNeeded > remaining || ofNeeded < 0) return;

    for (const pos of ALL_POS) {
      if (yieldCount >= MAX_YIELDS) return;
      if (used.has(pos)) continue;

      const posIsOF = isOF(pos);

      // Must all remaining be OF? Or no more OF allowed?
      if (ofNeeded === remaining && !posIsOF) continue;
      if (ofNeeded === 0 && posIsOF) continue;

      // Eligibility
      if (!canPlay(player.rank, pos)) continue;

      // OF blocked (bench adjacency)
      if (posIsOF && blocked.get(player.id)!.has(inn)) continue;

      // No same position as previous active inning
      if (inn > 0) {
        const prev = sheet[inn - 1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }

      // Max 2 per position per game
      const cnt = posCounts.get(player.id)!.get(pos) || 0;
      if (cnt >= 2) continue;

      // No 3+ consecutive OF
      if (posIsOF && inn >= 2) {
        let consec = 0;
        for (let p = inn - 1; p >= 0; p--) {
          const pa = sheet[p][player.id];
          if (!pa || pa === "Bench") break;
          if (isOF(pa)) consec++; else break;
        }
        if (consec >= 2) continue;
      }

      // OF count feasibility after this
      const newOF = ofCount + (posIsOF ? 1 : 0);
      if (4 - newOF > remaining - 1) continue;

      result.set(player.id, pos);
      used.add(pos);
      yield* bt(idx + 1, newOF);
      result.delete(player.id);
      used.delete(pos);
    }
  }

  yield* bt(0, 0);
}

// ── Main entry point ────────────────────────────────────────────────

export function generateGameSheet(allPlayers: Player[]): GameSheet {
  const present = allPlayers.filter(p => !p.absent).sort((a, b) => a.rank - b.rank);
  const n = present.length;
  if (n < 10) throw new Error(`Need at least 10 present players, got ${n}.`);
  if (n > 13) throw new Error(`Maximum 13 present players, got ${n}.`);

  const bench = buildBench(present);
  const blocked = computeOFBlocked(present, bench);

  const sheet: GameSheet = Array.from({ length: TOTAL_INNINGS }, () => ({}));
  const posCounts = new Map<string, Map<string, number>>();
  const ofCounts = new Map<string, number>();
  present.forEach(p => { posCounts.set(p.id, new Map()); ofCounts.set(p.id, 0); });

  // Mark bench
  for (let i = 0; i < TOTAL_INNINGS; i++)
    for (const pid of bench[i]) sheet[i][pid] = "Bench";

  // Solve all innings with cross-inning backtracking
  function solveAll(inn: number): boolean {
    if (inn >= TOTAL_INNINGS) {
      // Final check: every player must have at least 1 OF
      for (const p of present) {
        const bc = Array.from({ length: TOTAL_INNINGS }).filter((_, i) =>
          bench[i].has(p.id)
        ).length;
        if (TOTAL_INNINGS - bc > 0 && ofCounts.get(p.id)! === 0) return false;
      }
      return true;
    }

    const active = present.filter(p => !bench[inn].has(p.id));
    const gen = solveInning(active, inn, sheet, posCounts, blocked, ofCounts);

    for (const assignment of gen) {
      // Apply
      for (const [pid, pos] of assignment) {
        sheet[inn][pid] = pos;
        const counts = posCounts.get(pid)!;
        counts.set(pos, (counts.get(pos) || 0) + 1);
        if (isOF(pos)) ofCounts.set(pid, ofCounts.get(pid)! + 1);
      }

      if (solveAll(inn + 1)) return true;

      // Undo
      for (const [pid, pos] of assignment) {
        sheet[inn][pid] = "Bench"; // will be re-marked or overwritten
        const counts = posCounts.get(pid)!;
        counts.set(pos, counts.get(pos)! - 1);
        if (isOF(pos)) ofCounts.set(pid, ofCounts.get(pid)! - 1);
      }
    }

    return false;
  }

  if (!solveAll(0)) {
    throw new Error(
      "Cannot satisfy all constraints. Try adjusting player ranks or removing a constraint."
    );
  }

  // Re-mark bench (undo may have cleared some)
  for (let i = 0; i < TOTAL_INNINGS; i++)
    for (const pid of bench[i]) sheet[i][pid] = "Bench";

  return sheet;
}

// ── Validation ──────────────────────────────────────────────────────

export function validateGameSheet(
  sheet: GameSheet,
  presentPlayers: Player[]
): string[] {
  const v: string[] = [];

  for (let i = 0; i < TOTAL_INNINGS; i++) {
    const active = presentPlayers.filter(p => sheet[i][p.id] && sheet[i][p.id] !== "Bench");

    if (active.length !== 10)
      v.push(`Inning ${i+1}: ${active.length} on field (expected 10)`);

    for (const p of presentPlayers)
      if (!sheet[i][p.id]) v.push(`Inning ${i+1}: ${p.name} unassigned`);

    const poss = active.map(p => sheet[i][p.id]);
    if (new Set(poss).size !== poss.length)
      v.push(`Inning ${i+1}: duplicate positions`);

    for (const p of active) {
      if (sheet[i][p.id] === "1B" && p.rank > 4)
        v.push(`Inning ${i+1}: ${p.name} at 1B (top 4 only)`);
      if (sheet[i][p.id] === "P" && p.rank > 6)
        v.push(`Inning ${i+1}: ${p.name} at P (top 6 only)`);
    }
  }

  for (const p of presentPlayers) {
    let of = 0, cof = 0, mof = 0, cb = 0;
    const pc = new Map<string, number>();

    for (let i = 0; i < TOTAL_INNINGS; i++) {
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
        if (i < TOTAL_INNINGS - 1 && sheet[i+1]?.[p.id] === "Bench")
          v.push(`${p.name}: OF in inning ${i+1} before bench`);
      }
    }

    if (mof >= 3) v.push(`${p.name}: ${mof} consecutive OF innings`);
    for (const [pos, c] of pc)
      if (c >= 3) v.push(`${p.name}: plays ${pos} ${c} times (max 2)`);

    const bc = Array.from({length: TOTAL_INNINGS}).filter((_, i) => sheet[i][p.id] === "Bench").length;
    if (TOTAL_INNINGS - bc > 0 && of === 0)
      v.push(`${p.name}: no outfield inning`);
  }

  return v;
}
