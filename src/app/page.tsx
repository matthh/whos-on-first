"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Player, GameSheet } from "@/lib/types";
import { generateGameSheet, validateGameSheet } from "@/lib/scheduler";
import { loadRoster, saveRoster, addHistoryEntry, clearAbsences } from "@/lib/storage";
import { generatePDF } from "@/lib/pdf";
import {
  ConstraintConfig,
  loadConfig,
  saveConfig,
} from "@/lib/constraints";
import RosterList from "@/components/RosterList";
import GameSheetPreview from "@/components/GameSheetPreview";
import History from "@/components/History";
import ConstraintsPanel from "@/components/ConstraintsPanel";
import Onboarding from "@/components/Onboarding";
import { RosterData } from "@/lib/types";

type Tab = "roster" | "preview" | "history";

export default function Home() {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("roster");
  const [gameSheet, setGameSheet] = useState<GameSheet | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConstraintConfig | null>(null);
  const [showConstraints, setShowConstraints] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const savedConfig = loadConfig();
    setConfig(savedConfig);
    setRoster(loadRoster());
    setShowOnboarding(!savedConfig.onboardingComplete);
    setLoaded(true);
  }, []);

  // Auto-save roster
  useEffect(() => {
    if (roster) saveRoster(roster);
  }, [roster]);

  // Auto-save config
  useEffect(() => {
    if (config) saveConfig(config);
  }, [config]);

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

  const handleConfigChange = useCallback((newConfig: ConstraintConfig) => {
    setConfig(newConfig);
  }, []);

  const handleOnboardingComplete = useCallback(
    (result: {
      teamName: string;
      logoDataUrl: string | null;
      players: Player[];
      constraints: ConstraintConfig;
    }) => {
      const newConfig = {
        ...result.constraints,
        onboardingComplete: true,
        teamName: result.teamName,
        logoDataUrl: result.logoDataUrl,
      };
      setConfig(newConfig);
      saveConfig(newConfig);
      setRoster((prev) => ({
        players: result.players,
        history: prev?.history || [],
      }));
      setShowOnboarding(false);
    },
    []
  );

  const [generating, setGenerating] = useState(false);

  const runGenerate = useCallback(
    (saveHistory: boolean, randomize: boolean = false) => {
      if (!roster || !config) return;
      setError(null);
      setGenerating(true);

      // Use setTimeout to let the UI update before the solver runs
      setTimeout(() => {
        try {
          const sheet = generateGameSheet(roster.players, config, randomize);
          const present = roster.players.filter((p) => !p.absent);
          const v = validateGameSheet(sheet, present, config);
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
            // Don't clear absences — keep them for Rerun.
            // Absences are cleared when the user goes back to the roster tab.
            setRoster(updated);
          }

          setActiveTab("preview");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to generate schedule");
        } finally {
          setGenerating(false);
        }
      }, 50);
    },
    [roster, config]
  );

  const handleGenerate = useCallback(() => runGenerate(true, false), [runGenerate]);
  const handleRerun = useCallback(() => runGenerate(false, true), [runGenerate]);

  const handleStartOver = useCallback(() => {
    setGameSheet(null);
    setViolations([]);
    setActiveTab("roster");
  }, []);

  const handleExportPDF = useCallback(async () => {
    if (!roster || !gameSheet || !config) return;
    const doc = await generatePDF(
      roster.players,
      gameSheet,
      config.teamName,
      config.logoDataUrl,
      config.innings
    );
    doc.save(`game-sheet-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [roster, gameSheet, config]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (showOnboarding && config) {
    return (
      <Onboarding
        onComplete={handleOnboardingComplete}
        initialPlayers={roster?.players}
        initialConfig={config}
      />
    );
  }

  if (!roster || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const presentCount = roster.players.filter((p) => !p.absent).length;
  const fieldSize = config.fieldPositions.length;
  const canGenerate = presentCount >= fieldSize && presentCount <= fieldSize + 3;
  const hasPlayers = roster.players.length > 0;

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <header className="mb-6 text-center">
        <div className="flex justify-center mb-2">
          <img src="/logo.png" alt="Who's On First" className="h-28 object-contain" />
        </div>
        <p className="text-sm text-gray-500 mb-2">
          Game Day Defensive Roster
        </p>
        <div className="flex items-center gap-2 justify-center">
          {config.logoDataUrl && (
            <img
              src={config.logoDataUrl}
              alt="Team logo"
              className="w-6 h-6 object-contain"
            />
          )}
          <span className="text-lg font-bold text-[#002d62]">
            {config.teamName}
          </span>
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
          {/* Constraints toggle */}
          <button
            onClick={() => setShowConstraints(!showConstraints)}
            className="text-xs text-gray-400 hover:text-[#002d62] transition-colors"
          >
            {showConstraints ? "Hide" : "View"} Scheduling Constraints
          </button>
          {showConstraints && (
            <ConstraintsPanel
              config={config}
              onChange={handleConfigChange}
              onClose={() => setShowConstraints(false)}
            />
          )}

          {/* Empty roster: setup flow */}
          {!hasPlayers ? (
            <div className="text-center py-12 space-y-4">
              <h2 className="text-lg font-bold text-gray-600">Set Up Your Roster</h2>
              <p className="text-sm text-gray-400">
                Add 10-13 players to get started. Drag to rank them -- best player at top.
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
                disabled={!canGenerate || generating}
                className={`w-full py-3 rounded-lg font-bold text-white text-sm transition-colors ${
                  canGenerate && !generating
                    ? "bg-[#002d62] hover:bg-[#003d82] active:bg-[#001d42]"
                    : "bg-gray-300 cursor-not-allowed"
                }`}
              >
                {generating ? "Generating..." : "Generate Game Sheet"}
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
          teamName={config.teamName}
          logoDataUrl={config.logoDataUrl}
          innings={config.innings}
          onExportPDF={handleExportPDF}
          onRerun={handleRerun}
          onStartOver={handleStartOver}
        />
      )}

      {activeTab === "history" && <History entries={roster.history} />}

      {/* Version */}
      <div className="text-center text-[10px] text-gray-500 mt-8">
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
