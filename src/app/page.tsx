"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Player, GameSheet } from "@/lib/types";
import { generateGameSheet, validateGameSheet } from "@/lib/scheduler";
import { loadRoster, saveRoster, addHistoryEntry, clearAbsences } from "@/lib/storage";
import { generatePDF } from "@/lib/pdf";
import { Constraint, loadConstraints, saveConstraints } from "@/lib/constraints";
import RosterList from "@/components/RosterList";
import GameSheetPreview from "@/components/GameSheetPreview";
import History from "@/components/History";
import ConstraintsPanel from "@/components/ConstraintsPanel";
import { RosterData, HistoryEntry } from "@/lib/types";

type Tab = "roster" | "preview" | "history";

export default function Home() {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("roster");
  const [gameSheet, setGameSheet] = useState<GameSheet | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("Astros");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [showConstraints, setShowConstraints] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setRoster(loadRoster());
    const savedName = localStorage.getItem("whos-on-first-team-name");
    if (savedName) setTeamName(savedName);
    const savedLogo = localStorage.getItem("whos-on-first-logo");
    if (savedLogo) setLogoDataUrl(savedLogo);
    setConstraints(loadConstraints());
  }, []);

  // Auto-save
  useEffect(() => {
    if (roster) saveRoster(roster);
  }, [roster]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("whos-on-first-team-name", teamName);
    }
  }, [teamName]);

  const updatePlayers = useCallback(
    (updater: (players: Player[]) => Player[]) => {
      setRoster((prev) => {
        if (!prev) return prev;
        return { ...prev, players: updater(prev.players) };
      });
    },
    []
  );

  const handleReorder = useCallback((players: Player[]) => {
    setRoster((prev) => (prev ? { ...prev, players } : prev));
  }, []);

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
      const maxRank = players.length > 0 ? Math.max(...players.map((p) => p.rank)) : 0;
      const maxId = players.length > 0 ? Math.max(...players.map((p) => parseInt(p.id))) : 0;
      return [
        ...players,
        { id: String(maxId + 1), name: "", rank: maxRank + 1, absent: false },
      ];
    });
  }, [updatePlayers]);

  const handleRemovePlayer = useCallback(
    (id: string) => {
      updatePlayers((players) => {
        const filtered = players.filter((p) => p.id !== id);
        const sorted = [...filtered].sort((a, b) => a.rank - b.rank);
        return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
      });
    },
    [updatePlayers]
  );

  const handleTeamNameChange = useCallback((name: string) => {
    setTeamName(name);
  }, []);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoDataUrl(dataUrl);
      localStorage.setItem("whos-on-first-logo", dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveLogo = useCallback(() => {
    setLogoDataUrl(null);
    localStorage.removeItem("whos-on-first-logo");
    if (logoInputRef.current) logoInputRef.current.value = "";
  }, []);

  const handleToggleConstraint = useCallback((id: string) => {
    setConstraints((prev) => {
      const updated = prev.map((c) =>
        c.id === id && c.editable ? { ...c, enabled: !c.enabled } : c
      );
      saveConstraints(updated);
      return updated;
    });
  }, []);

  const runGenerate = useCallback(
    (saveHistory: boolean) => {
      if (!roster) return;
      setError(null);
      try {
        const sheet = generateGameSheet(roster.players);
        const present = roster.players.filter((p) => !p.absent);
        const v = validateGameSheet(sheet, present);
        setGameSheet(sheet);
        setViolations(v);

        if (saveHistory) {
          const today = new Date().toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const updated = addHistoryEntry(roster, today);
          const cleared = clearAbsences(updated);
          setRoster(cleared);
        }

        setActiveTab("preview");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate schedule");
      }
    },
    [roster]
  );

  const handleGenerate = useCallback(() => runGenerate(true), [runGenerate]);
  const handleRerun = useCallback(() => runGenerate(false), [runGenerate]);

  const handleStartOver = useCallback(() => {
    setGameSheet(null);
    setViolations([]);
    setActiveTab("roster");
  }, []);

  const handleExportPDF = useCallback(() => {
    if (!roster || !gameSheet) return;
    const doc = generatePDF(roster.players, gameSheet, teamName, logoDataUrl);
    doc.save(`game-sheet-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [roster, gameSheet, teamName, logoDataUrl]);

  if (!roster) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const presentCount = roster.players.filter((p) => !p.absent).length;
  const canGenerate = presentCount >= 10 && presentCount <= 13;
  const hasPlayers = roster.players.length > 0;

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        {logoDataUrl && (
          <img src={logoDataUrl} alt="Team logo" className="w-10 h-10 object-contain" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-[#002d62]">
            Who&apos;s On First
          </h1>
          <p className="text-sm text-gray-500">
            Game Day Defensive Roster Calculator
          </p>
        </div>
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
          {/* Team name & logo */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Team:</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => handleTeamNameChange(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
                placeholder="Team name"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Logo:</label>
              {logoDataUrl ? (
                <div className="flex items-center gap-1">
                  <img src={logoDataUrl} alt="Logo" className="w-6 h-6 object-contain" />
                  <button
                    onClick={handleRemoveLogo}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="text-xs w-28"
                />
              )}
            </div>
          </div>

          {/* Constraints toggle */}
          <button
            onClick={() => setShowConstraints(!showConstraints)}
            className="text-xs text-gray-400 hover:text-[#002d62] transition-colors"
          >
            {showConstraints ? "Hide" : "View"} Scheduling Constraints
          </button>
          {showConstraints && (
            <ConstraintsPanel
              constraints={constraints}
              onToggle={handleToggleConstraint}
              onClose={() => setShowConstraints(false)}
            />
          )}

          {/* Empty roster: setup flow */}
          {!hasPlayers ? (
            <div className="text-center py-12 space-y-4">
              <h2 className="text-lg font-bold text-gray-600">Set Up Your Roster</h2>
              <p className="text-sm text-gray-400">
                Add 10-13 players to get started. Drag to rank them — best player at top.
              </p>
              <button
                onClick={handleAddPlayer}
                className="px-6 py-3 rounded-lg font-bold text-white text-sm bg-[#002d62] hover:bg-[#003d82] transition-colors"
              >
                Add First Player
              </button>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {activeTab === "preview" && gameSheet && (
        <GameSheetPreview
          players={roster.players}
          sheet={gameSheet}
          violations={violations}
          teamName={teamName}
          logoDataUrl={logoDataUrl}
          onExportPDF={handleExportPDF}
          onRerun={handleRerun}
          onStartOver={handleStartOver}
        />
      )}

      {activeTab === "history" && <History entries={roster.history} />}

      {/* Version */}
      <div className="text-center text-[10px] text-gray-300 mt-8">
        v1.0 · Built{" "}
        {process.env.BUILD_TIMESTAMP
          ? new Date(process.env.BUILD_TIMESTAMP).toLocaleString("en-US", {
              timeZone: "America/Los_Angeles",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "dev"}
      </div>
    </div>
  );
}
