"use client";

import { Player, GameSheet, TOTAL_INNINGS } from "@/lib/types";

interface GameSheetPreviewProps {
  players: Player[];
  sheet: GameSheet;
  violations: string[];
  teamName: string;
  logoDataUrl?: string | null;
  onExportPDF: () => void;
  onRerun: () => void;
  onStartOver: () => void;
}

export default function GameSheetPreview({
  players,
  sheet,
  violations,
  teamName,
  logoDataUrl,
  onExportPDF,
  onRerun,
  onStartOver,
}: GameSheetPreviewProps) {
  const present = players.filter((p) => !p.absent).sort((a, b) => a.rank - b.rank);

  return (
    <div className="space-y-4">
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

      {/* Title matching PDF style */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          {logoDataUrl && (
            <img src={logoDataUrl} alt="Logo" className="w-8 h-8 object-contain" />
          )}
          <h2 className="text-lg font-bold text-gray-600 tracking-wide whitespace-nowrap">
            {teamName.toUpperCase()} — DEFENSIVE POSITIONS
          </h2>
        </div>
        <div className="h-0.5 bg-amber-500 mx-8 mt-1" />
      </div>

      {/* Game sheet table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-200">
              <th className="px-3 py-2 text-left font-bold text-gray-600 border border-gray-300 whitespace-nowrap">
                PLAYER
              </th>
              {Array.from({ length: TOTAL_INNINGS }, (_, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-center font-bold text-gray-600 border border-gray-300 whitespace-nowrap"
                >
                  INN {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {present.map((player) => (
              <tr key={player.id} className="border border-gray-300">
                <td className="px-3 py-2 font-bold text-gray-700 border border-gray-300 whitespace-nowrap">
                  {player.name.toUpperCase()}
                </td>
                {Array.from({ length: TOTAL_INNINGS }, (_, inn) => {
                  const assignment = sheet[inn][player.id] || "—";
                  const display = assignment === "Rover" ? "ROV" : assignment === "Bench" ? "BENCH" : assignment;
                  const isBench = assignment === "Bench";
                  return (
                    <td
                      key={inn}
                      className={`px-3 py-2 text-center font-bold border border-gray-300 whitespace-nowrap ${
                        isBench
                          ? "bg-gray-300 text-gray-500"
                          : "text-gray-700"
                      }`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onExportPDF}
          className="flex-1 py-3 rounded-lg font-bold text-white text-sm bg-[#002d62] hover:bg-[#003d82] active:bg-[#001d42] transition-colors whitespace-nowrap"
        >
          Export to PDF
        </button>
        <button
          onClick={onRerun}
          className="flex-1 py-3 rounded-lg font-bold text-sm border-2 border-[#002d62] text-[#002d62] hover:bg-[#002d62] hover:text-white transition-colors whitespace-nowrap"
        >
          Rerun Schedule
        </button>
        <button
          onClick={onStartOver}
          className="flex-1 py-3 rounded-lg font-bold text-sm border-2 border-gray-400 text-gray-500 hover:bg-gray-100 transition-colors whitespace-nowrap"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
