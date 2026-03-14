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
  players: [
    { id: "1", name: "Player 1", rank: 1, absent: false },
    { id: "2", name: "Player 2", rank: 2, absent: false },
    { id: "3", name: "Player 3", rank: 3, absent: false },
    { id: "4", name: "Player 4", rank: 4, absent: false },
    { id: "5", name: "Player 5", rank: 5, absent: false },
    { id: "6", name: "Player 6", rank: 6, absent: false },
    { id: "7", name: "Player 7", rank: 7, absent: false },
    { id: "8", name: "Player 8", rank: 8, absent: false },
    { id: "9", name: "Player 9", rank: 9, absent: false },
    { id: "10", name: "Player 10", rank: 10, absent: false },
    { id: "11", name: "Player 11", rank: 11, absent: false },
    { id: "12", name: "Player 12", rank: 12, absent: false },
    { id: "13", name: "Player 13", rank: 13, absent: false },
  ],
  history: [],
};
