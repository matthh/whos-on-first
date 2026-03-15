"use client";

import { HistoryEntry } from "@/lib/types";

interface HistoryProps {
  entries: HistoryEntry[];
}

export default function History({ entries }: HistoryProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No game history yet. Generate your first game sheet to start tracking.
      </div>
    );
  }

  // Most recent entry first — its players define the rows
  // Each column is a point in time (newest on left, oldest on right)
  const current = entries[0];
  const players = [...current.players].sort((a, b) => a.rank - b.rank);

  // Build a lookup: for each entry, map player id -> rank
  const rankMaps = entries.map((entry) => {
    const map = new Map<string, number>();
    for (const p of entry.players) {
      map.set(p.id, p.rank);
    }
    return map;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-2 py-2 text-left font-bold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
              Player
            </th>
            {entries.map((entry, i) => (
              <th
                key={i}
                className={`px-3 py-2 text-center font-medium whitespace-nowrap ${
                  i === 0 ? "text-[#002d62]" : "text-gray-400"
                }`}
              >
                <div className="text-[10px]">{entry.date}</div>
                {i === 0 && <div className="text-[9px] text-gray-400">Current</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-2 py-1.5 font-medium text-gray-700 whitespace-nowrap sticky left-0 bg-white z-10">
                {player.name}
              </td>
              {entries.map((_, colIdx) => {
                const rank = rankMaps[colIdx].get(player.id);
                const prevRank = colIdx < entries.length - 1
                  ? rankMaps[colIdx + 1].get(player.id)
                  : null;

                if (rank == null) {
                  // Player wasn't on roster for this game
                  return (
                    <td key={colIdx} className="px-3 py-1.5 text-center text-gray-300 text-xs">
                      --
                    </td>
                  );
                }

                // Determine movement vs previous (older) entry
                let bgClass = "";
                let indicator = "";
                if (prevRank != null && prevRank !== rank) {
                  if (rank < prevRank) {
                    // Moved UP (lower rank number = better)
                    bgClass = "bg-green-50";
                    indicator = "text-green-600";
                  } else {
                    // Moved DOWN
                    bgClass = "bg-red-50";
                    indicator = "text-red-500";
                  }
                }

                return (
                  <td
                    key={colIdx}
                    className={`px-3 py-1.5 text-center ${bgClass} ${
                      colIdx === 0 ? "font-bold text-gray-800" : "text-gray-500"
                    }`}
                  >
                    <span>{rank}</span>
                    {indicator && (
                      <span className={`ml-1 text-[10px] ${indicator}`}>
                        {rank < (prevRank ?? rank) ? "\u25B2" : "\u25BC"}
                      </span>
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
