export interface Constraint {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  editable: boolean; // some constraints are core and can't be disabled
}

export const DEFAULT_CONSTRAINTS: Constraint[] = [
  {
    id: "field-size",
    label: "10 players on field every inning",
    description: "6 infield + 4 outfield positions filled each inning",
    enabled: true,
    editable: false,
  },
  {
    id: "no-consecutive-position",
    label: "No same position in consecutive innings",
    description: "A player cannot play the same position in two consecutive active innings",
    enabled: true,
    editable: true,
  },
  {
    id: "min-outfield",
    label: "Every player gets at least 1 outfield inning",
    description: "Ensures every player spends time in the outfield during the game",
    enabled: true,
    editable: true,
  },
  {
    id: "max-consecutive-of",
    label: "No 3+ consecutive outfield innings",
    description: "Prevents a player from being stuck in the outfield for too many innings in a row",
    enabled: true,
    editable: true,
  },
  {
    id: "of-bench-adjacency",
    label: "No outfield immediately before or after bench",
    description: "Players transition through infield between bench and outfield assignments",
    enabled: true,
    editable: true,
  },
  {
    id: "no-consecutive-bench",
    label: "No consecutive bench innings",
    description: "A player cannot sit on the bench two innings in a row",
    enabled: true,
    editable: true,
  },
  {
    id: "fairness",
    label: "Fairness: no double-sit before everyone sits once",
    description: "No player sits twice until every player has sat at least once (protects against shortened games)",
    enabled: true,
    editable: true,
  },
  {
    id: "max-top4-benched",
    label: "Max 1 top-4 player benched per inning",
    description: "Keeps strong players distributed across innings",
    enabled: true,
    editable: true,
  },
  {
    id: "top4-bench-late",
    label: "Top-4 players bench as late as possible",
    description: "Best players sit in later innings to maximize early-game competitiveness",
    enabled: true,
    editable: true,
  },
  {
    id: "1b-eligibility",
    label: "1B: only top 4 players eligible",
    description: "First base requires a strong, reliable fielder",
    enabled: true,
    editable: true,
  },
  {
    id: "pitcher-eligibility",
    label: "Pitcher: only top 6 players eligible",
    description: "Pitching requires skill — limited to the top half of the roster",
    enabled: true,
    editable: true,
  },
];

const STORAGE_KEY = "whos-on-first-constraints";

export function loadConstraints(): Constraint[] {
  if (typeof window === "undefined") return DEFAULT_CONSTRAINTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONSTRAINTS;
    const saved = JSON.parse(raw) as Constraint[];
    // Merge with defaults to pick up any new constraints
    return DEFAULT_CONSTRAINTS.map((def) => {
      const override = saved.find((s) => s.id === def.id);
      return override ? { ...def, enabled: override.enabled } : def;
    });
  } catch {
    return DEFAULT_CONSTRAINTS;
  }
}

export function saveConstraints(constraints: Constraint[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(constraints));
}
