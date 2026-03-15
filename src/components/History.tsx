"use client";

import { HistoryEntry } from "@/lib/types";

interface HistoryProps {
  entries: HistoryEntry[];
  onDeleteEntry?: (index: number) => void;
}

export default function History({ entries, onDeleteEntry }: HistoryProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No game history yet. Generate your first game sheet to start tracking.
      </div>
    );
  }

  // Find the max roster size across all entries
  const maxPlayers = Math.max(...entries.map((e) => e.players.length));

  // For each entry, sort players by rank to get the ordered list for that column
  const columns = entries.map((entry) =>
    [...entry.players].sort((a, b) => a.rank - b.rank)
  );

  // Build rank lookup for movement comparison: entry index -> player id -> rank
  const rankMaps = entries.map((entry) => {
    const map = new Map<string, number>();
    for (const p of entry.players) map.set(p.id, p.rank);
    return map;
  });

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-2 py-2 text-left font-bold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
              Rank
            </th>
            {entries.map((entry, colIdx) => (
              <th
                key={colIdx}
                className={`px-3 py-1 text-center whitespace-nowrap ${
                  colIdx === 0 ? "text-[#002d62]" : "text-gray-400"
                }`}
              >
                <div className="text-[10px] font-medium">{entry.date}</div>
                {colIdx === 0 && (
                  <div className="text-[9px] text-gray-400 font-normal">Current</div>
                )}
                {onDeleteEntry && (
                  <button
                    onClick={() => onDeleteEntry(colIdx)}
                    className="text-[9px] text-gray-300 hover:text-red-500 transition-colors mt-0.5"
                    title="Remove this entry"
                  >
                    remove
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxPlayers }, (_, rowIdx) => (
            <tr key={rowIdx} className="border-b border-gray-100">
              {/* Rank number */}
              <td className="px-2 py-1.5 font-bold text-gray-400 text-center whitespace-nowrap sticky left-0 bg-white z-10">
                {rowIdx + 1}
              </td>
              {columns.map((col, colIdx) => {
                const player = col[rowIdx];
                if (!player) {
                  return (
                    <td key={colIdx} className="px-3 py-1.5 text-center text-gray-200 text-xs">
                      --
                    </td>
                  );
                }

                // Compare to the next column (older entry)
                const prevRankMap = colIdx < entries.length - 1 ? rankMaps[colIdx + 1] : null;
                const prevRank = prevRankMap?.get(player.id) ?? null;
                const currentRank = player.rank;

                let bgClass = "";
                let indicator = "";
                if (prevRank != null && prevRank !== currentRank) {
                  if (currentRank < prevRank) {
                    bgClass = "bg-green-50";
                    indicator = "green";
                  } else {
                    bgClass = "bg-red-50";
                    indicator = "red";
                  }
                }

                return (
                  <td
                    key={colIdx}
                    className={`px-3 py-1.5 text-center whitespace-nowrap ${bgClass} ${
                      colIdx === 0 ? "font-medium text-gray-800" : "text-gray-500"
                    }`}
                  >
                    <span>{player.name}</span>
                    {player.absent && (
                      <span className="ml-1 text-[9px] text-red-400">out</span>
                    )}
                    {indicator === "green" && (
                      <span className="ml-1 text-[10px] text-green-600">{"\u25B2"}</span>
                    )}
                    {indicator === "red" && (
                      <span className="ml-1 text-[10px] text-red-500">{"\u25BC"}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
