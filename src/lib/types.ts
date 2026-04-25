export interface Player {
  id: string;
  name: string;
  rank: number; // 1 = best, higher = weaker
  absent: boolean;
  recognized?: boolean; // player has been recognized this season
  /**
   * Soft preferences — positions this player would rather not play.
   * The scheduler may still assign them here if respecting the preference
   * would require breaking other constraints (fairness, eligibility,
   * defensive optimization). Enforced via a post-pass swap attempt only.
   */
  avoidPositions?: string[];
  /** Spotify walk-on song. Used to assemble the team playlist on roster generate. */
  walkOnSong?: WalkOnSong;
}

export interface WalkOnSong {
  /** Spotify track id, e.g. "3n3Ppam7vgaVa1iaRUc9Lp" */
  spotifyId: string;
  /** Spotify URI, e.g. "spotify:track:3n3Ppam7vgaVa1iaRUc9Lp" — used for playlist add */
  uri: string;
  title: string;
  artist: string;
  /** Small album art (~64px) URL, may be null */
  albumArtUrl: string | null;
  /** 30-second preview mp3 URL, may be null since Spotify reduced preview coverage in late 2024 */
  previewUrl: string | null;
}

export type Position = string;

export type Assignment = Position | "Bench";

// Default position priority order (index 0 = highest priority)
export const POSITION_PRIORITY: string[] = [
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

export const INFIELD_POSITIONS: string[] = ["1B", "P", "2B", "SS", "3B", "C"];
export const OUTFIELD_POSITIONS: string[] = ["RF", "LF", "Rover", "CF"];

/** Default number of innings. Overridable via ConstraintConfig.innings. */
export const DEFAULT_INNINGS = 6;
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
