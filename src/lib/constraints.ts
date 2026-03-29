// ── Types ────────────────────────────────────────────────────────────

export interface Constraint {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  editable: boolean;
  category: "positioning" | "optimizing";
}

export interface PositionRestriction {
  position: string;
  topN: number;
  enabled: boolean;
}

export interface PracticeStation {
  name: string;
  description?: string;
  enabled: boolean;
}

export interface PracticeConfig {
  durationMinutes: number;
  ageRange: string;
  stationCount: number;
  stations: PracticeStation[];
  scrimmageMinutes: number;
  warmupMinutes: number;
}

export const DEFAULT_PRACTICE_STATIONS: PracticeStation[] = [
  { name: "Throwing Accuracy", enabled: true },
  { name: "Fielding Grounders", enabled: true },
  { name: "Fly Balls", enabled: true },
  { name: "Hitting / Tee Work", enabled: true },
  { name: "Base Running", enabled: true },
  { name: "Bunting", enabled: false },
  { name: "Catching / Blocking", enabled: false },
  { name: "Pitching Mechanics", enabled: false },
  { name: "Soft Toss", enabled: false },
];

export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
  durationMinutes: 90,
  ageRange: "7-8",
  stationCount: 4,
  stations: DEFAULT_PRACTICE_STATIONS,
  scrimmageMinutes: 30,
  warmupMinutes: 10,
};

export interface ConstraintConfig {
  positioning: Record<string, boolean>; // constraint id -> enabled
  restrictions: PositionRestriction[];
  topPlayerPriority: boolean;
  benchTopLate: boolean;
  onboardingComplete: boolean;
  teamName: string;
  logoDataUrl: string | null;
  innings: number;
  fieldPositions: string[];
  maxInningsPitched: number | null;
  practiceConfig?: PracticeConfig;
}

// ── Default constraints ──────────────────────────────────────────────

export const POSITIONING_CONSTRAINTS: Constraint[] = [
  {
    id: "field-size",
    label: "10 players on field every inning",
    description: "6 infield + 4 outfield positions filled each inning",
    enabled: true,
    editable: false,
    category: "positioning",
  },
  {
    id: "no-consecutive-position",
    label: "No same position in consecutive innings",
    description:
      "A player cannot play the same position in two consecutive active innings",
    enabled: true,
    editable: true,
    category: "positioning",
  },
  {
    id: "min-outfield",
    label: "Every player gets at least 1 outfield inning",
    description:
      "Ensures every player spends time in the outfield during the game",
    enabled: true,
    editable: true,
    category: "positioning",
  },
  {
    id: "max-consecutive-of",
    label: "No 3+ consecutive outfield innings",
    description:
      "Prevents a player from being stuck in the outfield for too many innings in a row",
    enabled: true,
    editable: true,
    category: "positioning",
  },
  {
    id: "of-bench-adjacency",
    label: "No outfield immediately before or after bench",
    description:
      "Players transition through infield between bench and outfield assignments",
    enabled: true,
    editable: true,
    category: "positioning",
  },
  {
    id: "no-consecutive-bench",
    label: "No consecutive bench innings",
    description: "A player cannot sit on the bench two innings in a row",
    enabled: true,
    editable: false,
    category: "positioning",
  },
  {
    id: "fairness",
    label: "Fairness: no double-sit before everyone sits once",
    description:
      "No player sits twice until every player has sat at least once (protects against shortened games)",
    enabled: true,
    editable: false,
    category: "positioning",
  },
  {
    id: "max-2-per-position",
    label: "No player plays same position more than 2x per game",
    description:
      "Ensures variety — each player plays any single position at most twice",
    enabled: true,
    editable: true,
    category: "positioning",
  },
];

export const OPTIMIZING_CONSTRAINTS: Constraint[] = [
  {
    id: "position-restrictions",
    label: "Position restrictions",
    description:
      "Limit certain positions to top-ranked players only",
    enabled: true,
    editable: true,
    category: "optimizing",
  },
  {
    id: "top-player-priority",
    label: "Prioritize top players for infield",
    description:
      "Top-ranked players get premium infield positions first",
    enabled: true,
    editable: true,
    category: "optimizing",
  },
  {
    id: "bench-top-late",
    label: "Top restricted players bench as late as possible",
    description:
      "Best players sit in later innings to maximize early-game competitiveness",
    enabled: true,
    editable: true,
    category: "optimizing",
  },
];

export const ALL_CONSTRAINTS: Constraint[] = [
  ...POSITIONING_CONSTRAINTS,
  ...OPTIMIZING_CONSTRAINTS,
];

// ── Field position presets ───────────────────────────────────────────

export const FIELD_POSITION_PRESETS: Record<string, string[]> = {
  "Standard 9": ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
  "Standard 10 / Coach Pitch": ["1B", "P", "2B", "SS", "3B", "C", "RF", "LF", "Rover", "CF"],
};

export const DEFAULT_FIELD_POSITIONS = FIELD_POSITION_PRESETS["Standard 10 / Coach Pitch"];

/** Well-known outfield position names. Anything else is infield. */
export const KNOWN_OF_POSITIONS = new Set([
  "RF", "LF", "CF", "Rover",
  "Right Center Field", "Left Center Field",
]);

export function isOutfieldPosition(pos: string): boolean {
  return KNOWN_OF_POSITIONS.has(pos);
}

// ── Default config ───────────────────────────────────────────────────

export const DEFAULT_RESTRICTIONS: PositionRestriction[] = [
  { position: "1B", topN: 4, enabled: true },
  { position: "P", topN: 6, enabled: true },
];

export const DEFAULT_CONFIG: ConstraintConfig = {
  positioning: Object.fromEntries(
    POSITIONING_CONSTRAINTS.map((c) => [c.id, c.enabled])
  ),
  restrictions: DEFAULT_RESTRICTIONS,
  topPlayerPriority: true,
  benchTopLate: true,
  onboardingComplete: false,
  teamName: "Astros",
  logoDataUrl: null,
  innings: 6,
  fieldPositions: DEFAULT_FIELD_POSITIONS,
  maxInningsPitched: null,
};

// ── Persistence ──────────────────────────────────────────────────────

const CONFIG_KEY = "whos-on-first-config";

export function loadConfig(): ConstraintConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const saved = JSON.parse(raw) as Partial<ConstraintConfig>;
    // Merge with defaults so new fields are picked up
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      positioning: {
        ...DEFAULT_CONFIG.positioning,
        ...(saved.positioning || {}),
      },
      restrictions: saved.restrictions || DEFAULT_CONFIG.restrictions,
      innings: saved.innings ?? DEFAULT_CONFIG.innings,
      fieldPositions: saved.fieldPositions || DEFAULT_CONFIG.fieldPositions,
      maxInningsPitched: saved.maxInningsPitched !== undefined ? saved.maxInningsPitched : DEFAULT_CONFIG.maxInningsPitched,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: ConstraintConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// ── Backward-compat re-exports ───────────────────────────────────────

/** @deprecated Use loadConfig() instead */
export function loadConstraints(): Constraint[] {
  const config = loadConfig();
  return ALL_CONSTRAINTS.map((c) => ({
    ...c,
    enabled:
      c.category === "positioning"
        ? config.positioning[c.id] ?? c.enabled
        : c.enabled,
  }));
}

/** @deprecated Use saveConfig() instead */
export function saveConstraints(constraints: Constraint[]): void {
  const config = loadConfig();
  for (const c of constraints) {
    if (c.category === "positioning") {
      config.positioning[c.id] = c.enabled;
    }
  }
  saveConfig(config);
}

// All available positions for adding new restrictions (superset across presets)
export const AVAILABLE_POSITIONS = [
  "1B",
  "P",
  "2B",
  "SS",
  "3B",
  "C",
  "RF",
  "LF",
  "Rover",
  "CF",
];
