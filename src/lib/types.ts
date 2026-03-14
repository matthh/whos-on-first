export interface Player {
  id: string;
  name: string;
  rank: number; // 1 = best, higher = weaker
  absent: boolean;
}

export type Position =
  | "1B"
  | "P"
  | "2B"
  | "SS"
  | "3B"
  | "RF"
  | "LF"
  | "Rover"
  | "CF"
  | "C";

export type Assignment = Position | "Bench";

// Priority order for position assignment (index 0 = highest priority)
export const POSITION_PRIORITY: Position[] = [
  "1B",
  "P",
  "2B",
  "SS",
  "3B",
  "RF",
  "LF",
  "Rover",
  "CF",
  "C",
];

export const INFIELD_POSITIONS: Position[] = ["1B", "P", "2B", "SS", "3B", "C"];
export const OUTFIELD_POSITIONS: Position[] = ["RF", "LF", "Rover", "CF"];

export const TOTAL_INNINGS = 6;
export const FIELD_SIZE = 10;

// GameSheet: assignment[inning][playerId] = Position | "Bench"
export type GameSheet = Record<string, Assignment>[];

export interface RosterData {
  players: Player[];
  history: HistoryEntry[];
}

export interface HistoryEntry {
  date: string;
  players: { id: string; name: string; rank: number; absent: boolean }[];
}

export const DEFAULT_ROSTER: RosterData = {
  players: [],
  history: [],
};
