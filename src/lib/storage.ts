import { RosterData, DEFAULT_ROSTER, HistoryEntry } from "./types";

const STORAGE_KEY = "whos-on-first-roster";

export function loadRoster(): RosterData {
  if (typeof window === "undefined") return DEFAULT_ROSTER;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ROSTER;
    return JSON.parse(raw) as RosterData;
  } catch {
    return DEFAULT_ROSTER;
  }
}

export function saveRoster(data: RosterData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function addHistoryEntry(
  roster: RosterData,
  date: string
): RosterData {
  const entry: HistoryEntry = {
    date,
    players: roster.players.map((p) => ({
      id: p.id,
      name: p.name,
      rank: p.rank,
      absent: p.absent,
    })),
  };
  return {
    ...roster,
    history: [entry, ...roster.history],
  };
}

export function clearAbsences(roster: RosterData): RosterData {
  return {
    ...roster,
    players: roster.players.map((p) => ({ ...p, absent: false })),
  };
}
