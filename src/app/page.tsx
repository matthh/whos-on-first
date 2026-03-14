"use client";

import { useState, useEffect, useCallback } from "react";
import { Player, GameSheet, RosterData } from "@/lib/types";
import { generateGameSheet, validateGameSheet } from "@/lib/scheduler";
import { loadRoster, saveRoster, addHistoryEntry, clearAbsences } from "@/lib/storage";
import { generatePDF } from "@/lib/pdf";
import RosterList from "@/components/RosterList";
import GameSheetPreview from "@/components/GameSheetPreview";
import History from "@/components/History";

type Tab = "roster" | "preview" | "history";

export default function Home() {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("roster");
  const [gameSheet, setGameSheet] = useState<GameSheet | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load roster from localStorage on mount
  useEffect(() => {
    setRoster(loadRoster());
  }, []);

  // Auto-save roster changes
  useEffect(() => {
    if (roster) saveRoster(roster);
  }, [roster]);

  const updatePlayers = useCallback(
    (updater: (players: Player[]) => Player[]) => {
      setRoster((prev) => {
        if (!prev) return prev;
        return { ...prev, players: updater(prev.players) };
      });
    },
    []
  );

  const handleReorder = useCallback(
    (players: Player[]) => {
      setRoster((prev) => (prev ? { ...prev, players } : prev));
    },
    []
  );

  const handleToggleAbsent = useCallback(
    (id: string) => {
      updatePlayers((players) =>
        players.map((p) => (p.id === id ? { ...p, absent: !p.absent } : p))
      );
    },
    [updatePlayers]
  );

  const handleRename = useCallback(
    (id: string, name: string) => {
      updatePlayers((players) =>
        players.map((p) => (p.id === id ? { ...p, name } : p))
      );
    },
    [updatePlayers]
  );

  const handleAddPlayer = useCallback(() => {
    updatePlayers((players) => {
      const maxRank = Math.max(...players.map((p) => p.rank), 0);
      const maxId = Math.max(...players.map((p) => parseInt(p.id)), 0);
      return [
        ...players,
        {
          id: String(maxId + 1),
          name: `Player ${maxId + 1}`,
          rank: maxRank + 1,
          absent: false,
        },
      ];
    });
  }, [updatePlayers]);

  const handleRemovePlayer = useCallback(
    (id: string) => {
      updatePlayers((players) => {
        const filtered = players.filter((p) => p.id !== id);
        // Reassign ranks
        const sorted = [...filtered].sort((a, b) => a.rank - b.rank);
        return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
      });
    },
    [updatePlayers]
  );

  const handleGenerate = useCallback(() => {
    if (!roster) return;
    setError(null);

    try {
      const sheet = generateGameSheet(roster.players);
      const present = roster.players.filter((p) => !p.absent);
      const v = validateGameSheet(sheet, present);
      setGameSheet(sheet);
      setViolations(v);

      // Save history entry
      const today = new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const updated = addHistoryEntry(roster, today);
      // Clear absences for next week
      const cleared = clearAbsences(updated);
      setRoster(cleared);

      setActiveTab("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate schedule");
    }
  }, [roster]);

  const handleDownloadPDF = useCallback(() => {
    if (!roster || !gameSheet) return;

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const doc = generatePDF(roster.players, gameSheet, today);
    doc.save(`game-sheet-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [roster, gameSheet]);

  if (!roster) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const presentCount = roster.players.filter((p) => !p.absent).length;
  const canGenerate = presentCount >= 10 && presentCount <= 13;

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#002d62]">
          Who&apos;s On First
        </h1>
        <p className="text-sm text-gray-500">
          Game Day Defensive Roster Calculator
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(["roster", "preview", "history"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "text-[#002d62] border-b-2 border-[#002d62]"
                : "text-gray-400 hover:text-gray-600"
            } ${tab === "preview" && !gameSheet ? "opacity-40 pointer-events-none" : ""}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tab content */}
      {activeTab === "roster" && (
        <div className="space-y-4">
          <RosterList
            players={roster.players}
            onReorder={handleReorder}
            onToggleAbsent={handleToggleAbsent}
            onRename={handleRename}
            onAddPlayer={handleAddPlayer}
            onRemovePlayer={handleRemovePlayer}
          />

          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`w-full py-3 rounded-lg font-bold text-white text-sm transition-colors ${
              canGenerate
                ? "bg-[#002d62] hover:bg-[#003d82] active:bg-[#001d42]"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            Generate Game Sheet
          </button>
        </div>
      )}

      {activeTab === "preview" && gameSheet && (
        <div className="space-y-4">
          <GameSheetPreview
            players={roster.players}
            sheet={gameSheet}
            violations={violations}
          />

          <button
            onClick={handleDownloadPDF}
            className="w-full py-3 rounded-lg font-bold text-white text-sm bg-[#002d62] hover:bg-[#003d82] active:bg-[#001d42] transition-colors"
          >
            Download PDF
          </button>
        </div>
      )}

      {activeTab === "history" && <History entries={roster.history} />}
    </div>
  );
}
