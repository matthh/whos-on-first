"use client";

import { Player, GameSheet, POSITION_PRIORITY, TOTAL_INNINGS, OUTFIELD_POSITIONS } from "@/lib/types";

interface GameSheetPreviewProps {
  players: Player[];
  sheet: GameSheet;
  violations: string[];
}

function isOutfield(pos: string): boolean {
  return OUTFIELD_POSITIONS.includes(pos as typeof OUTFIELD_POSITIONS[number]);
}

export default function GameSheetPreview({
  players,
  sheet,
  violations,
}: GameSheetPreviewProps) {
  const present = players.filter((p) => !p.absent).sort((a, b) => a.rank - b.rank);

  return (
    <div className="space-y-6">
      {/* Violations */}
      {violations.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <h3 className="text-sm font-bold text-red-700 mb-1">
            Constraint Violations ({violations.length})
          </h3>
          <ul className="text-xs text-red-600 space-y-0.5">
            {violations.map((v, i) => (
              <li key={i}>- {v}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Player-centric view */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#002d62] text-white">
              <th className="px-2 py-2 text-left">Rank</th>
              <th className="px-2 py-2 text-left">Player</th>
              {Array.from({ length: TOTAL_INNINGS }, (_, i) => (
                <th key={i} className="px-2 py-2 text-center">
                  Inn {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {present.map((player) => (
              <tr key={player.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="px-2 py-1.5 text-center font-bold text-gray-500">
                  #{player.rank}
                </td>
                <td className="px-2 py-1.5 font-medium">{player.name}</td>
                {Array.from({ length: TOTAL_INNINGS }, (_, inn) => {
                  const assignment = sheet[inn][player.id] || "—";
                  let cellClass = "px-2 py-1.5 text-center text-xs font-medium ";
                  if (assignment === "Bench") {
                    cellClass += "bg-gray-100 text-gray-400 italic";
                  } else if (isOutfield(assignment)) {
                    cellClass += "bg-green-50 text-green-700";
                  } else if (assignment === "1B" || assignment === "P") {
                    cellClass += "bg-amber-50 text-amber-700 font-bold";
                  } else {
                    cellClass += "text-gray-700";
                  }
                  return (
                    <td key={inn} className={cellClass}>
                      {assignment}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Position-centric view */}
      <div className="overflow-x-auto">
        <h3 className="text-sm font-bold text-gray-600 mb-2">By Position</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#002d62] text-white">
              <th className="px-2 py-2 text-left">Position</th>
              {Array.from({ length: TOTAL_INNINGS }, (_, i) => (
                <th key={i} className="px-2 py-2 text-center">
                  Inn {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POSITION_PRIORITY.map((pos) => (
              <tr key={pos} className="border-b border-gray-200">
                <td className="px-2 py-1.5 font-bold text-gray-600">{pos}</td>
                {Array.from({ length: TOTAL_INNINGS }, (_, inn) => {
                  const player = present.find((p) => sheet[inn][p.id] === pos);
                  return (
                    <td key={inn} className="px-2 py-1.5 text-center text-xs">
                      {player ? player.name : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Bench row */}
            <tr className="bg-gray-50 border-b border-gray-200">
              <td className="px-2 py-1.5 font-bold text-gray-400 italic">Bench</td>
              {Array.from({ length: TOTAL_INNINGS }, (_, inn) => {
                const benched = present.filter((p) => sheet[inn][p.id] === "Bench");
                return (
                  <td key={inn} className="px-2 py-1.5 text-center text-xs text-gray-400">
                    {benched.map((p) => p.name).join(", ") || "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
