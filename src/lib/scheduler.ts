import {
  Player,
  Position,
  Assignment,
  GameSheet,
  TOTAL_INNINGS,
} from "./types";

// ── Constants ────────────────────────────────────────────────────────

const BENCH_SCHEDULE_13: number[][] = [
  [12, 13, 2], [10, 8, 6], [11, 5, 4], [9, 3, 7], [13, 11, 1], [10, 9, 12],
];

const ALL_POSITIONS: Position[] = [
  "1B", "P", "2B", "SS", "3B", "C", "RF", "LF", "Rover", "CF",
];
const IF_POSITIONS = new Set<Position>(["1B", "P", "2B", "SS", "3B", "C"]);
const OF_POSITIONS = new Set<Position>(["RF", "LF", "Rover", "CF"]);

function isOutfield(pos: Assignment): boolean {
  return OF_POSITIONS.has(pos as Position);
}

function isEligible(rank: number, pos: Position): boolean {
  if (pos === "1B" && rank > 4) return false;
  if (pos === "P" && rank > 6) return false;
  return true;
}

// ── Phase 1: Bench Schedule ─────────────────────────────────────────

function buildBenchSchedule(players: Player[]): Set<string>[] {
  const count = players.length;
  const byRank = [...players].sort((a, b) => a.rank - b.rank);

  if (count === 10) return Array.from({ length: TOTAL_INNINGS }, () => new Set());
  if (count === 11) {
    return [11, 10, 9, 8, 7, 1].map((r) => new Set([byRank[r - 1].id]));
  }
  if (count === 12) {
    return [[12, 2], [10, 8], [11, 4], [9, 6], [7, 1], [5, 3]].map((ranks) =>
      new Set(ranks.map((r) => byRank[r - 1].id))
    );
  }
  return BENCH_SCHEDULE_13.map((ranks) =>
    new Set(ranks.map((r) => byRank[r - 1].id))
  );
}

// ── Phase 2: OF Schedule ────────────────────────────────────────────

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

function wouldCreateConsecutiveOF(existing: Set<number>, newInn: number): boolean {
  let count = 1;
  let i = newInn - 1;
  while (i >= 0 && existing.has(i)) { count++; i--; }
  i = newInn + 1;
  while (i < TOTAL_INNINGS && existing.has(i)) { count++; i++; }
  return count >= 3;
}

function canSpareFromIF(
  player: Player,
  inn: number,
  allPlayers: Player[],
  bench: Set<string>[],
  ofSchedule: Map<string, Set<number>>
): boolean {
  let top4InIF = 0;
  let top6InIF = 0;
  for (const p of allPlayers) {
    if (bench[inn].has(p.id)) continue;
    if (p.id === player.id) continue;
    if (ofSchedule.get(p.id)!.has(inn)) continue;
    if (p.rank <= 4) top4InIF++;
    if (p.rank <= 6) top6InIF++;
  }
  return top4InIF >= 1 && top6InIF >= 2;
}

function buildOFSchedule(
  players: Player[],
  bench: Set<string>[]
): Map<string, Set<number>> {
  const ofEligibility = computeOFEligibility(players, bench);
  const ofSchedule = new Map<string, Set<number>>();
  players.forEach((p) => ofSchedule.set(p.id, new Set()));
  const ofPerInning = new Array(TOTAL_INNINGS).fill(0);

  // Most constrained first, lower-ranked to OF
  const sorted = [...players].sort((a, b) => {
    const diff = ofEligibility.get(a.id)!.size - ofEligibility.get(b.id)!.size;
    return diff !== 0 ? diff : b.rank - a.rank;
  });

  // Step 1: Every player gets at least 1 OF
  for (const player of sorted) {
    const eligible = ofEligibility.get(player.id)!;
    let bestInn = -1;
    let bestCount = Infinity;
    for (const inn of eligible) {
      if (ofPerInning[inn] >= 4) continue;
      if (wouldCreateConsecutiveOF(ofSchedule.get(player.id)!, inn)) continue;
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
  }

  // Step 2: Fill to exactly 4 per inning
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    while (ofPerInning[inn] < 4) {
      let best: Player | null = null;
      let bestScore = -Infinity;

      for (const player of players) {
        if (bench[inn].has(player.id)) continue;
        if (ofSchedule.get(player.id)!.has(inn)) continue;
        if (!ofEligibility.get(player.id)!.has(inn)) continue;
        if (wouldCreateConsecutiveOF(ofSchedule.get(player.id)!, inn)) continue;
        if (!canSpareFromIF(player, inn, players, bench, ofSchedule)) continue;

        const currentOF = ofSchedule.get(player.id)!.size;
        const score = -currentOF * 1000 + player.rank;
        if (score > bestScore) { bestScore = score; best = player; }
      }

      if (!best) {
        // Relax IF-sparing
        for (const player of players) {
          if (bench[inn].has(player.id)) continue;
          if (ofSchedule.get(player.id)!.has(inn)) continue;
          if (!ofEligibility.get(player.id)!.has(inn)) continue;
          if (wouldCreateConsecutiveOF(ofSchedule.get(player.id)!, inn)) continue;
          best = player;
          break;
        }
      }
      if (!best) break;
      ofSchedule.get(best.id)!.add(inn);
      ofPerInning[inn]++;
    }
  }

  // Step 3: Ensure everyone has at least 1 OF (swap if needed)
  for (const player of players) {
    if (ofSchedule.get(player.id)!.size > 0) continue;
    const eligible = ofEligibility.get(player.id)!;
    let bestInn = -1;
    let bestCount = Infinity;
    for (const inn of eligible) {
      if (ofPerInning[inn] < bestCount) {
        bestCount = ofPerInning[inn];
        bestInn = inn;
      }
    }
    if (bestInn >= 0 && ofPerInning[bestInn] >= 4) {
      // Swap out someone with the most OF
      const candidates = players.filter(
        (p) => ofSchedule.get(p.id)!.has(bestInn) && ofSchedule.get(p.id)!.size > 1
      );
      candidates.sort((a, b) => ofSchedule.get(b.id)!.size - ofSchedule.get(a.id)!.size);
      if (candidates.length > 0) {
        ofSchedule.get(candidates[0].id)!.delete(bestInn);
        ofPerInning[bestInn]--;
      }
    }
    if (bestInn >= 0) {
      ofSchedule.get(player.id)!.add(bestInn);
      ofPerInning[bestInn]++;
    }
  }

  return ofSchedule;
}

// ── Phase 3: Position Assignment (single 10-position solver) ────────

/**
 * Assign all 10 positions for one inning.
 * Players designated OF by the schedule MUST get an OF position.
 * Players designated IF MUST get an IF position.
 * All constraints checked inline.
 */
function solveInning(
  activePlayers: Player[],
  inn: number,
  sheet: GameSheet,
  posCounts: Map<string, Map<string, number>>,
  ofSet: Set<string> // player IDs that play OF this inning
): Position[] | null {
  const n = activePlayers.length;
  const result: Position[] = new Array(n);
  const used = new Set<Position>();

  function solve(idx: number): boolean {
    if (idx === n) return true;
    const player = activePlayers[idx];
    const mustOF = ofSet.has(player.id);
    const positions = mustOF ? ALL_POSITIONS.filter((p) => OF_POSITIONS.has(p))
                             : ALL_POSITIONS.filter((p) => IF_POSITIONS.has(p));

    for (const pos of positions) {
      if (used.has(pos)) continue;
      if (!isEligible(player.rank, pos)) continue;

      // No same position in consecutive active innings
      if (inn > 0) {
        const prev = sheet[inn - 1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }

      // Max 2 per position per game
      const cnt = posCounts.get(player.id)!.get(pos) || 0;
      if (cnt >= 2) continue;

      // No 3+ consecutive OF
      if (isOutfield(pos) && inn >= 2) {
        let consec = 0;
        for (let p = inn - 1; p >= 0; p--) {
          const pa = sheet[p][player.id];
          if (!pa || pa === "Bench") break;
          if (isOutfield(pa)) consec++;
          else break;
        }
        if (consec >= 2) continue;
      }

      result[idx] = pos;
      used.add(pos);
      if (solve(idx + 1)) return true;
      used.delete(pos);
    }
    return false;
  }

  // Try with all constraints
  if (solve(0)) return result;

  // Relax max-2 only
  used.clear();
  function solveRelaxed(idx: number): boolean {
    if (idx === n) return true;
    const player = activePlayers[idx];
    const mustOF = ofSet.has(player.id);
    const positions = mustOF ? ALL_POSITIONS.filter((p) => OF_POSITIONS.has(p))
                             : ALL_POSITIONS.filter((p) => IF_POSITIONS.has(p));

    for (const pos of positions) {
      if (used.has(pos)) continue;
      if (!isEligible(player.rank, pos)) continue;
      if (inn > 0) {
        const prev = sheet[inn - 1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }
      if (isOutfield(pos) && inn >= 2) {
        let consec = 0;
        for (let p = inn - 1; p >= 0; p--) {
          const pa = sheet[p][player.id];
          if (!pa || pa === "Bench") break;
          if (isOutfield(pa)) consec++;
          else break;
        }
        if (consec >= 2) continue;
      }
      result[idx] = pos;
      used.add(pos);
      if (solveRelaxed(idx + 1)) return true;
      used.delete(pos);
    }
    return false;
  }

  if (solveRelaxed(0)) return result;
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

  const bench = buildBenchSchedule(present);
  const ofSchedule = buildOFSchedule(present, bench);

  const sheet: GameSheet = Array.from({ length: TOTAL_INNINGS }, () => ({}));
  const posCounts = new Map<string, Map<string, number>>();
  present.forEach((p) => posCounts.set(p.id, new Map()));

  // Mark bench
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    for (const pid of bench[inn]) {
      sheet[inn][pid] = "Bench";
    }
  }

  // Assign each inning with the single solver
  for (let inn = 0; inn < TOTAL_INNINGS; inn++) {
    const active = present.filter((p) => !bench[inn].has(p.id));
    const ofPlayerIds = new Set(
      active.filter((p) => ofSchedule.get(p.id)!.has(inn)).map((p) => p.id)
    );

    // Sort: IF players by rank asc (best first), then OF players by rank desc
    const sorted = [
      ...active.filter((p) => !ofPlayerIds.has(p.id)).sort((a, b) => a.rank - b.rank),
      ...active.filter((p) => ofPlayerIds.has(p.id)).sort((a, b) => b.rank - a.rank),
    ];

    const assignment = solveInning(sorted, inn, sheet, posCounts, ofPlayerIds);

    if (!assignment) {
      // Try with different player ordering
      const altSorted = [
        ...active.filter((p) => !ofPlayerIds.has(p.id)).sort((a, b) => b.rank - a.rank),
        ...active.filter((p) => ofPlayerIds.has(p.id)).sort((a, b) => a.rank - b.rank),
      ];
      const altAssignment = solveInning(altSorted, inn, sheet, posCounts, ofPlayerIds);

      if (!altAssignment) {
        throw new Error(
          `Cannot satisfy constraints for inning ${inn + 1}. ` +
          `Try adjusting player ranks or disabling a constraint.`
        );
      }

      for (let i = 0; i < altSorted.length; i++) {
        sheet[inn][altSorted[i].id] = altAssignment[i];
        const counts = posCounts.get(altSorted[i].id)!;
        counts.set(altAssignment[i], (counts.get(altAssignment[i]) || 0) + 1);
      }
    } else {
      for (let i = 0; i < sorted.length; i++) {
        sheet[inn][sorted[i].id] = assignment[i];
        const counts = posCounts.get(sorted[i].id)!;
        counts.set(assignment[i], (counts.get(assignment[i]) || 0) + 1);
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

    if (active.length !== 10)
      violations.push(`Inning ${inn + 1}: ${active.length} on field (expected 10)`);

    for (const p of presentPlayers) {
      if (!sheet[inn][p.id])
        violations.push(`Inning ${inn + 1}: ${p.name} unassigned`);
    }

    const positions = active.map((p) => sheet[inn][p.id]);
    if (new Set(positions).size !== positions.length)
      violations.push(`Inning ${inn + 1}: duplicate positions`);

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

      if (inn > 0 && a !== "Bench" && sheet[inn - 1][player.id] !== "Bench" &&
          sheet[inn - 1][player.id] === a)
        violations.push(`${player.name}: same position (${a}) in innings ${inn} & ${inn + 1}`);

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
