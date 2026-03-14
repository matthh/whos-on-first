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

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3">
          <h3 className="font-bold text-sm text-gray-700 mb-2">
            {entry.date}
          </h3>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {entry.players
              .sort((a, b) => a.rank - b.rank)
              .map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 ${
                    p.absent ? "text-gray-300 line-through" : "text-gray-600"
                  }`}
                >
                  <span className="font-bold w-6 text-right">#{p.rank}</span>
                  <span>{p.name}</span>
                  {p.absent && (
                    <span className="text-red-400 text-[10px]">absent</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
