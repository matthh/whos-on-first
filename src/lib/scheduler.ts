/**
 * Who's On First — Defensive Position Scheduler
 *
 * Constraints (configurable via ConstraintConfig):
 *  1. N on field per inning (IF + OF) — required
 *  2. No same position in consecutive active innings — configurable
 *  3. Every player gets at least 1 OF inning per game — configurable
 *  4. No 3+ consecutive OF innings — configurable
 *  5. No OF immediately before or after a bench inning — configurable
 *  6. No consecutive bench innings — required
 *  7. Fairness: no double-sit before everyone sits once — required
 *  8. Max 2 of any single position per player per game — configurable
 *  9. Position restrictions (e.g., 1B top 4, P top 6) — configurable
 * 10. Top player priority for infield — configurable
 * 11. Top restricted players bench as late as possible — configurable
 * 12. Max innings pitched per player — configurable
 */

import { Player, Position, GameSheet } from "./types";
import { ConstraintConfig, PositionRestriction, DEFAULT_CONFIG, isOutfieldPosition } from "./constraints";

// ── Position helpers ────────────────────────────────────────────────

function isOF(p: string): boolean { return isOutfieldPosition(p); }

function canPlay(
  rank: number,
  pos: Position,
  restrictions: PositionRestriction[]
): boolean {
  for (const r of restrictions) {
    if (r.enabled && r.position === pos && rank > r.topN) return false;
  }
  return true;
}

/** Count how many OF innings a player has been assigned so far. */
function countOFInnings(playerId: string, sheet: Record<string, string | undefined>[], upToInning: number): number {
  let count = 0;
  for (let i = 0; i < upToInning; i++) {
    const pos = sheet[i][playerId];
    if (pos && pos !== "Bench" && isOF(pos)) count++;
  }
  return count;
}

/** Build position ordering lists from the config's fieldPositions. */
function buildPositionOrders(fieldPositions: string[], restrictions: PositionRestriction[] = []) {
  const allPos = [...fieldPositions] as Position[];
  const ifPositions = fieldPositions.filter(p => !isOF(p));
  const ofPositions = fieldPositions.filter(p => isOF(p));

  // Premium IF: most-gated restricted positions first (lowest topN = most exclusive),
  // then remaining IF positions (excluding C), then OF, then C last.
  // C is not a premium position — top players should rarely play it.
  const enabledRestrictions = restrictions.filter(r => r.enabled);
  const restrictedIF = enabledRestrictions
    .filter(r => ifPositions.includes(r.position))
    .sort((a, b) => a.topN - b.topN)
    .map(r => r.position);
  const unrestrictedIF = ifPositions.filter(p => !restrictedIF.includes(p) && p !== "C");
  const catcher = ifPositions.includes("C") ? ["C"] : [];
  const premiumIF = [...restrictedIF, ...unrestrictedIF, ...ofPositions, ...catcher] as Position[];

  // OF first: outfield positions first, then C, then infield in reverse priority
  const ofFirst = [...ofPositions, ...catcher, ...unrestrictedIF.slice().reverse(), ...restrictedIF.slice().reverse()] as Position[];
  return { allPos, premiumIF, ofFirst, ofPositions };
}

// ── Bench schedules ─────────────────────────────────────────────────
// Hardcoded schedules for 6-inning games (proven to work well).
// Top restricted players bench as late as possible when enabled.
// Double-sitters are the bottom players.

/**
 * Bench schedules for 6-inning, 10-field games.
 * Designed so that every inning has enough OF-eligible players (≥4)
 * AND enough top-ranked IF players for restricted positions (1B, P).
 *
 * Key insight: bench adjacency (OF blocked in innings before/after bench)
 * means we must spread bench assignments to avoid blocking too many
 * top-6 players from the same inning's IF pool.
 *
 * 13-player double-sitters: ranks 9,10,11,12,13
 */
const BENCH_6INN: Record<number, number[][]> = {
  10: [[], [], [], [], [], []],
  11: [[11], [10], [9], [8], [7], [6]],
  12: [[12,11], [10,9], [8,7], [6,5], [4,3], [1,2]],
  13: [
    [13, 8, 5],      // Inn 1: 0 top-4
    [4, 12, 7],      // Inn 2: rank 4 first top-4
    [3, 11, 6],      // Inn 3: rank 3
    [2, 10, 9],      // Inn 4: rank 2
    [1, 13, 11],     // Inn 5: rank 1 last; 2 double-sitters
    [9, 10, 12],     // Inn 6: 3 double-sitters
  ],
};

/**
 * Alternate 13-player schedule when prioritizeInfieldOverLateBench is on.
 * Minimal change from the default: swap r1 (top-1) into inning 4 and r4
 * (top-4) into inning 5. r1 benches in the second half but not last, so his
 * free-choice innings are 1, 2, 6 — only inning 2 forces OF (math), giving
 * him 4 IF + 1 OF. r4 (worst of top-4) takes the inning-5 slot and absorbs
 * the 2-forced-OF hit (3 IF + 2 OF). All top-4 still bench in innings 2-5
 * and fairness is preserved.
 *
 * 13-player double-sitters: ranks 9, 10, 11, 12, 13.
 */
const BENCH_6INN_IF_PRIORITY: Record<number, number[][]> = {
  13: [
    [13, 8, 5],      // Inn 1: 0 top-4 (same as default)
    [2, 12, 7],      // Inn 2: rank 2 (was rank 4)
    [3, 11, 6],      // Inn 3: rank 3 (same)
    [1, 10, 9],      // Inn 4: rank 1 (was rank 2) — Cam, latest while still 4 IF
    [4, 13, 11],     // Inn 5: rank 4 (was rank 1) — Seamus takes the OF hit
    [9, 10, 12],     // Inn 6: 3 double-sitters (same)
  ],
};

/**
 * Playoff-mode bench schedules. Override BENCH_6INN / BENCH_6INN_IF_PRIORITY
 * when config.playoffMode is set. Two extra constraints on top of the
 * standard rules:
 *   - No top-6 player on bench in the final inning (lifted 5-run cap means
 *     we want our best fielders in for the closer).
 *   - Stagger top-6 across innings so no two adjacent-ranked top-6 (#1+#2,
 *     #3+#4, #5+#6) bench together — they get separated to avoid
 *     compounding a fielding gap.
 *
 * The math is tight: with 12 players there are 6 top-6 to fit across 5
 * non-final innings, so the last available pair (#5 and #6) must double
 * up somewhere — we put them in inning 1 (earliest, least costly).
 *
 * 11-player playoff: the default schedule sat #6 in inning 6. Swap so
 * #6 sits in inning 5 and #7 (bottom-6) sits inning 6 instead.
 *
 * 13-player playoff: the default schedule already keeps top-6 out of
 * inning 6 (which has ranks 9, 10, 12 — all bottom-6) AND already
 * staggers — top-6 ranks 1-6 each sit in exactly one of innings 1-5
 * with at most one top-6 per inning. So we reuse BENCH_6INN[13]. The
 * IF-priority variant also satisfies both rules, so playoff mode is a
 * no-op for 13-player teams.
 */
const BENCH_6INN_PLAYOFF: Record<number, number[][]> = {
  11: [
    [11],            // Inn 1
    [10],            // Inn 2
    [9],             // Inn 3
    [8],             // Inn 4
    [6],             // Inn 5: rank 6 (top-6) — latest possible slot
    [7],             // Inn 6: rank 7 (bottom-6) — keeps top-6 off the bench
  ],
  12: [
    [5, 6],          // Inn 1: ranks 5 & 6 double up — last-resort pair
    [4, 12],         // Inn 2: rank 4 (top-6) + rank 12 (bottom-6)
    [3, 11],         // Inn 3: rank 3 + rank 11
    [2, 10],         // Inn 4: rank 2 + rank 10
    [1, 9],          // Inn 5: rank 1 (best) sits latest of the top-6
    [8, 7],          // Inn 6: ranks 7 & 8 (both bottom-6) — no top-6 on bench
  ],
};

/**
 * Dynamically generate bench schedules for non-6-inning games.
 * - benchPerInning = playerCount - fieldSize
 * - totalBenchSlots = innings * benchPerInning
 * - Distribute bench slots as evenly as possible among players
 * - Bottom-ranked players sit first, top-4 sit as late as possible
 * - Respect no-consecutive-bench constraint
 */
function generateDynamicBench(
  players: Player[],
  innings: number,
  fieldSize: number,
): Set<string>[] {
  const n = players.length;
  const benchPerInning = n - fieldSize;
  if (benchPerInning <= 0) {
    return Array.from({ length: innings }, () => new Set<string>());
  }

  const byRank = [...players].sort((a, b) => a.rank - b.rank);
  const totalBenchSlots = innings * benchPerInning;

  // How many times each player sits
  const baseSits = Math.floor(totalBenchSlots / n);
  let extra = totalBenchSlots - baseSits * n;

  // Bottom players get extra sits first
  const sitsNeeded = new Map<string, number>();
  for (let i = n - 1; i >= 0; i--) {
    const player = byRank[i];
    if (extra > 0) {
      sitsNeeded.set(player.id, baseSits + 1);
      extra--;
    } else {
      sitsNeeded.set(player.id, baseSits);
    }
  }

  const bench: Set<string>[] = Array.from({ length: innings }, () => new Set<string>());
  const sitsUsed = new Map<string, number>();
  byRank.forEach(p => sitsUsed.set(p.id, 0));

  // Assign bench slots inning by inning
  // Top-4 players should bench as late as possible, so we process bottom players first
  for (let inn = 0; inn < innings; inn++) {
    // Sort candidates: bottom-ranked first for early innings, top-ranked last
    // But also prioritize players who still need to sit the most relative to remaining innings
    const candidates = byRank
      .slice()
      .reverse() // bottom-ranked first
      .filter(p => {
        const used = sitsUsed.get(p.id)!;
        const needed = sitsNeeded.get(p.id)!;
        if (used >= needed) return false;
        // No consecutive bench
        if (inn > 0 && bench[inn - 1].has(p.id)) return false;
        return true;
      })
      .sort((a, b) => {
        // Prioritize players who have the most remaining sits
        const aRemain = sitsNeeded.get(a.id)! - sitsUsed.get(a.id)!;
        const bRemain = sitsNeeded.get(b.id)! - sitsUsed.get(b.id)!;
        if (bRemain !== aRemain) return bRemain - aRemain;
        // Bottom-ranked first (higher rank number = lower skill)
        return b.rank - a.rank;
      });

    for (const p of candidates) {
      if (bench[inn].size >= benchPerInning) break;
      bench[inn].add(p.id);
      sitsUsed.set(p.id, sitsUsed.get(p.id)! + 1);
    }
  }

  // If any inning is underfilled (due to consecutive-bench constraint), do a second pass
  for (let inn = 0; inn < innings; inn++) {
    if (bench[inn].size < benchPerInning) {
      for (const p of byRank.slice().reverse()) {
        if (bench[inn].size >= benchPerInning) break;
        if (bench[inn].has(p.id)) continue;
        if (inn > 0 && bench[inn - 1].has(p.id)) continue;
        if (inn < innings - 1 && bench[inn + 1]?.has(p.id)) continue;
        bench[inn].add(p.id);
        sitsUsed.set(p.id, sitsUsed.get(p.id)! + 1);
      }
    }
  }

  return bench;
}

function buildBench(
  players: Player[],
  innings: number,
  fieldSize: number,
  preferIFPrioritySchedule: boolean,
  playoffMode: boolean,
): Set<string>[] {
  const n = players.length;
  const byRank = [...players].sort((a, b) => a.rank - b.rank);

  // Use hardcoded schedules for 6-inning, 10-field-size games. Playoff mode
  // wins over the IF-priority variant — its constraints are strictly tighter
  // (no top-6 in final inning + stagger).
  if (innings === 6 && fieldSize === 10) {
    const playoffTemplate = playoffMode ? BENCH_6INN_PLAYOFF[n] : undefined;
    const altTemplate = preferIFPrioritySchedule ? BENCH_6INN_IF_PRIORITY[n] : undefined;
    const template = playoffTemplate ?? altTemplate ?? BENCH_6INN[n];
    if (template) {
      return template.map(ranks =>
        new Set(ranks.map(r => byRank[r - 1].id))
      );
    }
  }

  return generateDynamicBench(players, innings, fieldSize);
}

// ── OF eligibility ──────────────────────────────────────────────────

/** Compute which innings each player is BLOCKED from playing OF. */
function computeOFBlocked(
  players: Player[],
  bench: Set<string>[],
  ofBenchAdjacency: boolean,
  innings: number,
): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const p of players) {
    const blocked = new Set<number>();
    for (let i = 0; i < innings; i++) {
      if (bench[i].has(p.id)) { blocked.add(i); continue; }
      if (ofBenchAdjacency) {
        if (i > 0 && bench[i - 1].has(p.id)) blocked.add(i);
        if (i < innings - 1 && bench[i + 1].has(p.id)) blocked.add(i);
      }
    }
    map.set(p.id, blocked);
  }
  return map;
}

/**
 * Set of ranks that get top-infield priority — preferred for IF when the
 * solver has slack, but still subject to min-outfield and OF-bench-adjacency
 * (both league rules). Driven by the smallest enabled IF restriction's topN.
 */
function getTopInfieldRanks(config: ConstraintConfig): Set<number> {
  if (!config.prioritizeInfieldOverLateBench) return new Set();
  const restrictedIF = config.restrictions
    .filter(r => r.enabled && !isOF(r.position))
    .map(r => r.topN);
  if (restrictedIF.length === 0) return new Set();
  const threshold = Math.min(...restrictedIF);
  const ranks = new Set<number>();
  for (let r = 1; r <= threshold; r++) ranks.add(r);
  return ranks;
}

// ── Debug logging ───────────────────────────────────────────────────

function debugInning(
  active: Player[],
  inn: number,
  sheet: GameSheet,
  posCounts: Map<string, Map<string, number>>,
  blocked: Map<string, Set<number>>,
  config: ConstraintConfig,
  posOrders: ReturnType<typeof buildPositionOrders>,
  pitchCounts: Map<string, number>,
): string {
  const lines: string[] = [];
  lines.push(`\n=== INNING ${inn + 1} DEBUG ===`);
  lines.push(`Active players: ${active.map(p => `${p.name}(r${p.rank})`).join(', ')}`);

  const noConsecutivePos = config.positioning["no-consecutive-position"] ?? true;
  const max2PerPos = config.positioning["max-2-per-position"] ?? true;

  for (const p of active) {
    const ofBlocked = blocked.get(p.id)!.has(inn);
    const prevPos = inn > 0 ? sheet[inn - 1][p.id] : null;
    const validPositions: string[] = [];

    for (const pos of config.fieldPositions) {
      const reasons: string[] = [];
      if (!canPlay(p.rank, pos as Position, config.restrictions)) reasons.push(`rank ${p.rank} > restriction`);
      if (isOF(pos) && ofBlocked) reasons.push('OF-blocked(bench adj)');
      if (noConsecutivePos && prevPos && prevPos !== "Bench" && prevPos === pos) reasons.push(`consecutive(was ${prevPos})`);
      if (max2PerPos) {
        const cnt = posCounts.get(p.id)!.get(pos) || 0;
        if (cnt >= 2) reasons.push(`max2(played ${cnt}x)`);
      }
      if (pos === "P" && config.maxInningsPitched != null) {
        const pitched = pitchCounts.get(p.id) || 0;
        if (pitched >= config.maxInningsPitched) reasons.push(`maxPitch(${pitched}/${config.maxInningsPitched})`);
      }
      if (reasons.length === 0) {
        validPositions.push(pos);
      }
    }

    lines.push(`  ${p.name}(r${p.rank}): ${validPositions.length} valid [${validPositions.join(',')}]${ofBlocked ? ' OF-BLOCKED' : ''} prev=${prevPos || 'none'}`);
  }

  const ofEligible = active.filter(p => !blocked.get(p.id)!.has(inn));
  const ofNeeded = posOrders.ofPositions.length;
  lines.push(`OF slots needed: ${ofNeeded}, OF-eligible players: ${ofEligible.length} [${ofEligible.map(p => p.name).join(',')}]`);

  if (ofEligible.length < ofNeeded) {
    lines.push(`*** IMPOSSIBLE: Not enough OF-eligible players! ***`);
  }

  return lines.join('\n');
}

// ── Core solver ─────────────────────────────────────────────────────

function* solveInning(
  active: Player[],
  inn: number,
  sheet: GameSheet,
  posCounts: Map<string, Map<string, number>>,
  blocked: Map<string, Set<number>>,
  ofCounts: Map<string, number>,
  config: ConstraintConfig,
  topThreshold: number,
  posOrders: ReturnType<typeof buildPositionOrders>,
  pitchCounts: Map<string, number>,
  topInfieldRanks: Set<number>,
): Generator<Map<string, Position>> {
  const n = active.length;
  const ofCount_target = posOrders.ofPositions.length;

  // Pre-compute which players can play OF this inning
  const canPlayOF = new Set<string>();
  for (const p of active) {
    if (!blocked.get(p.id)!.has(inn)) canPlayOF.add(p.id);
  }

  // Sort: players who CAN'T play OF first (they must play IF),
  // then by rank (best first) for IF priority
  const ordered = [...active].sort((a, b) => {
    const aCanOF = canPlayOF.has(a.id);
    const bCanOF = canPlayOF.has(b.id);

    // If exactly ofCount_target players can play OF, those players must play OF.
    // Put OF-only-option players last so they naturally fill OF slots.
    // Actually: put players who CAN'T play OF first (they must play IF),
    // then top-ranked OF-eligible players (they get IF priority),
    // then lower-ranked OF-eligible players (they fill OF).
    if (!aCanOF && bCanOF) return -1; // a must play IF, assign first
    if (aCanOF && !bCanOF) return 1;  // b must play IF, assign first
    return a.rank - b.rank; // same OF eligibility: best rank first
  });

  const result = new Map<string, Position>();
  const used = new Set<Position>();
  const assignedToOF = new Set<string>(); // track who we put in OF
  let yieldCount = 0;
  const MAX_YIELDS = 50;

  const noConsecutivePos = config.positioning["no-consecutive-position"] ?? true;
  const maxConsecutiveOf = config.positioning["max-consecutive-of"] ?? true;
  const max2PerPos = config.positioning["max-2-per-position"] ?? true;

  function* bt(idx: number, ofCount: number): Generator<Map<string, Position>> {
    if (yieldCount >= MAX_YIELDS) return;

    if (idx === n) {
      if (ofCount === ofCount_target) {
        yieldCount++;
        yield new Map(result);
      }
      return;
    }

    const player = ordered[idx];
    const remaining = n - idx;
    const ofNeeded = ofCount_target - ofCount;

    if (ofNeeded > remaining || ofNeeded < 0) return;

    // Count how many remaining unassigned players can play OF
    let ofEligibleRemaining = 0;
    for (let j = idx; j < n; j++) {
      if (canPlayOF.has(ordered[j].id)) ofEligibleRemaining++;
    }

    // Position ordering based on config, rank, and OF innings played.
    // Most-restricted players (lowest rank) get strongest IF preference.
    // Players above topThreshold always try OF first.
    let posOrder: Position[];
    if (config.topPlayerPriority) {
      // Find the most restrictive topN this player qualifies for
      const qualifiesFor = config.restrictions
        .filter(r => r.enabled && player.rank <= r.topN)
        .sort((a, b) => a.topN - b.topN);
      const isRestricted = qualifiesFor.length > 0;

      if (isRestricted) {
        const ofPlayed = countOFInnings(player.id, sheet, inn);
        const minOF = (config.positioning["min-outfield"] ?? true) ? 1 : 0;
        // Count OF-eligible innings remaining INCLUDING this one. Using
        // raw "innings left" overstates slack when the player will be
        // OF-blocked in upcoming innings (bench-adjacency), and led to
        // top-restricted players starving for OF altogether (Jack ended
        // up with 1B/SS/2B/3B/P/Bench because his deadline really was
        // this inning, not 2 innings later).
        let ofEligibleFromHere = 0;
        for (let j = inn; j < config.innings; j++) {
          if (!blocked.get(player.id)!.has(j)) ofEligibleFromHere++;
        }
        const ofStillNeeded = minOF - ofPlayed;

        if (ofPlayed < minOF && ofEligibleFromHere <= ofStillNeeded) {
          // MUST get an OF inning here (or one of the few remaining
          // eligible innings) — try OF first.
          const ofOnly = posOrders.premiumIF.filter(p => isOF(p));
          const ifOnly = posOrders.premiumIF.filter(p => !isOF(p));
          posOrder = [...ofOnly, ...ifOnly];
        } else if (ofPlayed >= minOF) {
          // Already satisfied min-OF — strongly prefer IF
          const ifOnly = posOrders.premiumIF.filter(p => !isOF(p));
          const ofOnly = posOrders.premiumIF.filter(p => isOF(p));
          posOrder = [...ifOnly, ...ofOnly];
        } else {
          posOrder = posOrders.premiumIF;
        }
      } else {
        // Not restricted — try OF first to leave IF open for restricted players
        posOrder = posOrders.ofFirst;
      }
    } else {
      posOrder = posOrders.allPos;
    }

    // Spread restricted positions across all eligible players rather than
    // locking one player onto one slot. Sort positions so the ones this
    // player has played least this game come first; ties fall back to the
    // existing priority ordering. This turns a Cam/Jack 1B↔SS oscillation
    // into a 4-way rotation across the top-4 infield positions.
    const counts = posCounts.get(player.id)!;
    posOrder = posOrder
      .map((p, i) => ({ p, i, n: counts.get(p) || 0 }))
      .sort((a, b) => (a.n - b.n) || (a.i - b.i))
      .map((x) => x.p);

    for (const pos of posOrder) {
      if (yieldCount >= MAX_YIELDS) return;
      if (used.has(pos)) continue;

      const posIsOF = isOF(pos);

      if (ofNeeded === remaining && !posIsOF) continue;
      if (ofNeeded === 0 && posIsOF) continue;

      // Critical: if assigning this OF-eligible player to IF would leave
      // fewer OF-eligible players than OF slots still needed, force OF.
      // Top-infield-priority players are exempt: we'd rather fail this branch
      // and let the solver backtrack to a fillable arrangement than force a
      // top-restricted player into OF.
      if (!posIsOF && canPlayOF.has(player.id) && ofEligibleRemaining <= ofNeeded
          && !topInfieldRanks.has(player.rank)) continue;

      // Position restrictions
      if (!canPlay(player.rank, pos, config.restrictions)) continue;

      // Max innings pitched check
      if (pos === "P" && config.maxInningsPitched != null) {
        const pitched = pitchCounts.get(player.id) || 0;
        if (pitched >= config.maxInningsPitched) continue;
      }

      // OF blocked (bench adjacency)
      if (posIsOF && blocked.get(player.id)!.has(inn)) continue;

      // No same position as previous active inning
      if (noConsecutivePos && inn > 0) {
        const prev = sheet[inn - 1][player.id];
        if (prev && prev !== "Bench" && prev === pos) continue;
      }

      // Max 2 per position per game
      if (max2PerPos) {
        const cnt = posCounts.get(player.id)!.get(pos) || 0;
        if (cnt >= 2) continue;
      }

      // No 3+ consecutive OF
      if (maxConsecutiveOf && posIsOF && inn >= 2) {
        let consec = 0;
        for (let p = inn - 1; p >= 0; p--) {
          const pa = sheet[p][player.id];
          if (!pa || pa === "Bench") break;
          if (isOF(pa)) consec++; else break;
        }
        if (consec >= 2) continue;
      }

      const newOF = ofCount + (posIsOF ? 1 : 0);
      if (ofCount_target - newOF > remaining - 1) continue;

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

/** Fisher-Yates shuffle (in-place) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function enabledRestrictionsForFeasibility(config: ConstraintConfig) {
  return config.restrictions.filter(r => r.enabled);
}

// Total wall-clock budget across all retry attempts of generateGameSheet.
// The recursive backtracking solver can blow up combinatorially on
// pathological roster/constraint combos and lock up the browser tab.
// 10s leaves room for legitimately tricky-but-solvable rosters while
// surfacing infeasible configurations as a clean error instead of a hang.
const SOLVE_BUDGET_MS = 10_000;

export function generateGameSheet(
  allPlayers: Player[],
  config: ConstraintConfig = DEFAULT_CONFIG,
  randomize: boolean = false,
  _attempt: number = 0,
  _deadline: number = Date.now() + SOLVE_BUDGET_MS
): GameSheet {
  // "Effective rank" = position in the sorted-present list, ignoring
  // absent players. Mirrors the UI's eligibility-badge logic in
  // RosterList.tsx (effectiveRanks). With Cam (r1) + Seamus (r4) absent,
  // the present roster's effective ranks become 1..11 — so Conor
  // (originally r5) becomes effective r3 and qualifies for 1B (top-4),
  // matching what the UI shows. Without this, the solver evaluates
  // restrictions against absolute rank and reports "only 2 of top 4
  // present" even when 4 of the 11 present players ARE the top 4.
  const present = allPlayers
    .filter(p => !p.absent)
    .sort((a, b) => a.rank - b.rank)
    .map((p, i) => ({ ...p, rank: i + 1 }));
  const n = present.length;
  const fieldSize = config.fieldPositions.length;
  const innings = config.innings;

  if (n < fieldSize) throw new Error(`Need at least ${fieldSize} present players, got ${n}.`);
  if (n > fieldSize + 3) throw new Error(`Maximum ${fieldSize + 3} present players, got ${n}.`);

  // Feasibility pre-check: each enabled topN restriction caps how many
  // distinct players can fill that position. With max-2-per-position the
  // total coverage is (eligible × 2) which must be ≥ innings, otherwise
  // no valid lineup can exist and the solver would just thrash. Fail fast
  // with a specific message instead of letting it spin for the wall-clock
  // budget. (Concretely: with both r1 + r2 absent and 1B top-4, only 2
  // top-4 players are present → 2×2=4 < 6 innings → infeasible.)
  const max2PerPos = config.positioning["max-2-per-position"] ?? true;
  if (max2PerPos) {
    for (const r of enabledRestrictionsForFeasibility(config)) {
      const eligibleCount = present.filter(p => p.rank <= r.topN).length;
      const maxCoverage = eligibleCount * 2;
      if (maxCoverage < innings) {
        const missing = innings - maxCoverage;
        throw new Error(
          `Can't fill ${r.position} for all ${innings} innings: only ${eligibleCount} of the top ${r.topN} are present, ` +
          `which covers ${maxCoverage} innings under max-2-per-position. ` +
          `Need at least ${Math.ceil(innings / 2)} top-${r.topN} players present, or relax the ${r.position} restriction (topN > ${r.topN}), ` +
          `or disable max-2-per-position. Short by ${missing} ${r.position} inning${missing !== 1 ? 's' : ''}.`
        );
      }
    }
  }

  const bench = buildBench(present, innings, fieldSize, config.prioritizeInfieldOverLateBench, config.playoffMode);
  const posOrders = buildPositionOrders(config.fieldPositions, config.restrictions);

  const ofBenchAdjacency = config.positioning["of-bench-adjacency"] ?? true;
  const topInfieldRanks = getTopInfieldRanks(config);
  const blocked = computeOFBlocked(present, bench, ofBenchAdjacency, innings);
  const minOutfield = config.positioning["min-outfield"] ?? true;

  // Compute the top threshold: max topN across all enabled restrictions
  const enabledRestrictions = config.restrictions.filter((r) => r.enabled);
  const topThreshold =
    enabledRestrictions.length > 0
      ? Math.max(...enabledRestrictions.map((r) => r.topN))
      : 6; // fallback

  const sheet: GameSheet = Array.from({ length: innings }, () => ({}));
  const posCounts = new Map<string, Map<string, number>>();
  const ofCounts = new Map<string, number>();
  const pitchCounts = new Map<string, number>();
  present.forEach(p => {
    posCounts.set(p.id, new Map());
    ofCounts.set(p.id, 0);
    pitchCounts.set(p.id, 0);
  });

  // Mark bench
  for (let i = 0; i < innings; i++)
    for (const pid of bench[i]) sheet[i][pid] = "Bench";

  // Solve all innings with cross-inning backtracking.
  // If inning N fails, we backtrack to inning N-1 and try its next valid assignment.
  // The per-inning solver yields multiple solutions via generator.
  function solveAll(inn: number): boolean {
    if (Date.now() > _deadline) return false; // bail to surface as error
    if (inn >= innings) {
      // Hard min-OF check at the terminal node. Without this the solver
      // could happily produce a sheet where a top-restricted player
      // benches at the end and never picked up an OF inning (because
      // OF-bench-adjacency blocks the second-to-last inning) — Jack's
      // case in the user's screenshot. The per-inning heuristics try to
      // avoid this but only the terminal check guarantees correctness.
      if (minOutfield) {
        for (const p of present) {
          // Skip players who never played (somehow benched all innings)
          let played = false;
          for (let i = 0; i < innings; i++) {
            if (sheet[i][p.id] && sheet[i][p.id] !== "Bench") { played = true; break; }
          }
          if (played && (ofCounts.get(p.id) ?? 0) < 1) return false;
        }
      }
      return true;
    }

    const active = present.filter(p => !bench[inn].has(p.id));

    // When randomizing, shuffle only tiebreakers — not the restricted-first
    // ordering that gives 1B/SS/P priority to top players. A flat shuffle
    // here was letting top-ranked players pick LF/CF before 1B on reruns,
    // which is exactly the degradation the user complained about.
    function shuffledWithinGroups(positions: Position[]): Position[] {
      const restricted = new Set(
        config.restrictions.filter(r => r.enabled && !isOF(r.position)).map(r => r.position),
      );
      const tierOf = (p: Position): number =>
        restricted.has(p) ? 0 : (!isOF(p) && p !== "C") ? 1 : isOF(p) ? 2 : 3;
      const groups = new Map<number, Position[]>();
      positions.forEach((p) => {
        const t = tierOf(p);
        if (!groups.has(t)) groups.set(t, []);
        groups.get(t)!.push(p);
      });
      const out: Position[] = [];
      for (const t of [0, 1, 2, 3]) {
        const g = groups.get(t);
        if (g) out.push(...shuffle([...g]));
      }
      return out;
    }
    const innPosOrders = randomize ? {
      ...posOrders,
      premiumIF: shuffledWithinGroups(posOrders.premiumIF),
      ofFirst: shuffledWithinGroups(posOrders.ofFirst.slice().reverse()).reverse(),
      allPos: shuffle([...posOrders.allPos]),
    } : posOrders;

    const gen = solveInning(
      active, inn, sheet, posCounts, blocked, ofCounts,
      config, topThreshold, innPosOrders, pitchCounts, topInfieldRanks,
    );

    for (const assignment of gen) {
      // Apply assignment
      for (const [pid, pos] of assignment) {
        sheet[inn][pid] = pos;
        const counts = posCounts.get(pid)!;
        counts.set(pos, (counts.get(pos) || 0) + 1);
        if (isOF(pos)) ofCounts.set(pid, ofCounts.get(pid)! + 1);
        if (pos === "P") pitchCounts.set(pid, pitchCounts.get(pid)! + 1);
      }

      // Try to solve remaining innings
      if (solveAll(inn + 1)) return true;

      // Undo assignment and try next solution for this inning
      for (const [pid, pos] of assignment) {
        sheet[inn][pid] = "Bench";
        const counts = posCounts.get(pid)!;
        counts.set(pos, counts.get(pos)! - 1);
        if (isOF(pos)) ofCounts.set(pid, ofCounts.get(pid)! - 1);
        if (pos === "P") pitchCounts.set(pid, pitchCounts.get(pid)! - 1);
      }
    }

    return false; // all solutions for this inning exhausted, backtrack further
  }

  if (!solveAll(0)) {
    // If randomizing AND we still have time in the wall-clock budget, retry
    // with a different shuffle. Bail out into the user-visible error if the
    // overall budget is spent — better a clear error than a hung browser.
    if (randomize && _attempt < 10 && Date.now() < _deadline) {
      return generateGameSheet(allPlayers, config, true, _attempt + 1, _deadline);
    }
    const exhausted = Date.now() >= _deadline;
    throw new Error(
      exhausted
        ? `Couldn't find a valid lineup within ${SOLVE_BUDGET_MS / 1000} seconds. The constraints may be infeasible — try relaxing a position restriction or adjusting player ranks.`
        : "Cannot satisfy all constraints. Try adjusting player ranks or removing a constraint."
    );
  }

  // Re-mark bench
  for (let i = 0; i < innings; i++)
    for (const pid of bench[i]) sheet[i][pid] = "Bench";

  return sheet;
}

// ── Validation ──────────────────────────────────────────────────────

export function validateGameSheet(
  sheet: GameSheet,
  presentPlayers: Player[],
  config: ConstraintConfig = DEFAULT_CONFIG
): string[] {
  const v: string[] = [];
  const innings = config.innings;
  const fieldSize = config.fieldPositions.length;

  // Re-rank to effective ranks (1..n among present) so restriction checks
  // match the solver and the UI's eligibility badges. Without this, e.g.
  // Conor at absolute rank 5 would be flagged at 1B (top-4) even when r1
  // and r4 are absent and Conor is the effective r3.
  presentPlayers = [...presentPlayers]
    .sort((a, b) => a.rank - b.rank)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  for (let i = 0; i < innings; i++) {
    const active = presentPlayers.filter(p => sheet[i][p.id] && sheet[i][p.id] !== "Bench");

    if (active.length !== fieldSize)
      v.push(`Inning ${i+1}: ${active.length} on field (expected ${fieldSize})`);

    for (const p of presentPlayers)
      if (!sheet[i][p.id]) v.push(`Inning ${i+1}: ${p.name} unassigned`);

    const poss = active.map(p => sheet[i][p.id]);
    if (new Set(poss).size !== poss.length)
      v.push(`Inning ${i+1}: duplicate positions`);

    for (const p of active) {
      for (const r of config.restrictions) {
        if (r.enabled && sheet[i][p.id] === r.position && p.rank > r.topN)
          v.push(`Inning ${i+1}: ${p.name} at ${r.position} (top ${r.topN} only)`);
      }
    }
  }

  // Track pitch counts for max innings pitched validation
  const pitchCounts = new Map<string, number>();

  for (const p of presentPlayers) {
    let of = 0, cof = 0, mof = 0, cb = 0;
    const pc = new Map<string, number>();

    for (let i = 0; i < innings; i++) {
      const a = sheet[i][p.id];
      if (!a) continue;

      if (a === "Bench") {
        cb++; cof = 0;
        if (cb > 1) v.push(`${p.name}: consecutive bench innings ${i} & ${i+1}`);
      } else {
        cb = 0;
        pc.set(a, (pc.get(a) || 0) + 1);
        if (a === "P") pitchCounts.set(p.id, (pitchCounts.get(p.id) || 0) + 1);
        if (isOF(a)) { of++; cof++; mof = Math.max(mof, cof); }
        else cof = 0;
      }

      if (i > 0 && a !== "Bench" && sheet[i-1][p.id] !== "Bench" && sheet[i-1][p.id] === a)
        v.push(`${p.name}: same position (${a}) in innings ${i} & ${i+1}`);

      if (isOF(a)) {
        if (i > 0 && sheet[i-1][p.id] === "Bench")
          v.push(`${p.name}: OF in inning ${i+1} after bench`);
        if (i < innings - 1 && sheet[i+1]?.[p.id] === "Bench")
          v.push(`${p.name}: OF in inning ${i+1} before bench`);
      }
    }

    if (mof >= 3) v.push(`${p.name}: ${mof} consecutive OF innings`);
    for (const [pos, c] of pc)
      if (c >= 3) v.push(`${p.name}: plays ${pos} ${c} times (max 2)`);

    const bc = Array.from({length: innings}).filter((_, i) => sheet[i][p.id] === "Bench").length;
    if (innings - bc > 0 && of === 0)
      v.push(`${p.name}: no outfield inning`);
  }

  // Validate max innings pitched
  if (config.maxInningsPitched != null) {
    for (const p of presentPlayers) {
      const pitched = pitchCounts.get(p.id) || 0;
      if (pitched > config.maxInningsPitched) {
        v.push(`${p.name}: pitched ${pitched} innings (max ${config.maxInningsPitched})`);
      }
    }
  }

  return v;
}

// ── Avoid-position post-pass ────────────────────────────────────────
//
// Soft preferences only. We never break an existing constraint to honor an
// avoid preference. Algorithm: for each (player, inning) where the player
// is currently at one of their avoided positions, try swapping with every
// other player in that inning. Keep the swap iff:
//   1. The resulting sheet still validates (no new violations).
//   2. The counterpart player isn't being moved INTO one of THEIR avoid
//      positions (don't trade one violation for another).
//   3. The counterpart's current spot is not also avoided by the original
//      player (avoid swapping into the same problem).
//
// Greedy single pass — keeps it simple and predictable.
export function applyAvoidPositionsPostPass(
  sheet: GameSheet,
  presentPlayers: Player[],
  config: ConstraintConfig = DEFAULT_CONFIG
): GameSheet {
  const innings = config.innings;
  const playersById = new Map(presentPlayers.map(p => [p.id, p]));
  const next: GameSheet = sheet.map(inning => ({ ...inning }));

  for (let i = 0; i < innings; i++) {
    for (const player of presentPlayers) {
      const avoid = player.avoidPositions;
      if (!avoid || avoid.length === 0) continue;
      const myPos = next[i][player.id];
      if (!myPos || myPos === "Bench" || !avoid.includes(myPos)) continue;

      // Look for a swap candidate in the same inning
      for (const otherId of Object.keys(next[i])) {
        if (otherId === player.id) continue;
        const other = playersById.get(otherId);
        if (!other) continue;
        const theirPos = next[i][otherId];
        if (!theirPos || theirPos === "Bench") continue;
        // Don't swap into a position the original player also avoids.
        if (avoid.includes(theirPos)) continue;
        // Don't move the counterpart into one of THEIR avoid positions.
        if (other.avoidPositions?.includes(myPos)) continue;

        // Try the swap
        next[i][player.id] = theirPos;
        next[i][otherId] = myPos;
        const violations = validateGameSheet(next, presentPlayers, config);
        if (violations.length === 0) {
          break; // keep swap, move on to next player/inning
        }
        // Revert
        next[i][player.id] = myPos;
        next[i][otherId] = theirPos;
      }
    }
  }

  return next;
}
