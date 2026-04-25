"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Player, GameSheet, HistoryEntry } from "@/lib/types";
import { generateGameSheet, validateGameSheet, applyAvoidPositionsPostPass } from "@/lib/scheduler";
import { addHistoryEntry } from "@/lib/storage";
import { generatePDF } from "@/lib/pdf";
import { extractColorsFromDataUrl } from "@/lib/colors";
import {
  ConstraintConfig,
  DEFAULT_CONFIG,
  migrateRestrictions,
} from "@/lib/constraints";
import RosterList from "@/components/RosterList";
import GameSheetPreview from "@/components/GameSheetPreview";
import History from "@/components/History";
import PracticePanel from "@/components/PracticePanel";
import Onboarding from "@/components/Onboarding";
import TeamSwitcher from "@/components/TeamSwitcher";
import { RosterData } from "@/lib/types";

type Tab = "roster" | "preview" | "history";

export default function Home() {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("roster");
  const [gameSheet, setGameSheet] = useState<GameSheet | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConstraintConfig | null>(null);
  const [showPractice, setShowPractice] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced save to DB
  const saveToDb = useCallback((players: Player[], cfg: ConstraintConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch("/api/roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players, config: cfg }),
      }).catch(() => {});
    }, 500);
  }, []);

  // Load data from APIs on mount
  useEffect(() => {
    async function loadData() {
      try {
        // Fetch auth status, roster, and history in parallel
        const [authRes, rosterRes, historyRes] = await Promise.all([
          fetch("/api/auth/status").then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch("/api/roster").then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch("/api/history").then((r) => r.ok ? r.json() : null).catch(() => null),
        ]);

        if (authRes?.user) {
          setUserStatus(authRes.user.status);
          setIsAdmin(authRes.user.role === "admin");
          setUserEmail(authRes.user.email);
          setActiveTeamId(authRes.user.activeTeamId ?? null);
        }
        if (Array.isArray(authRes?.teams)) setTeams(authRes.teams);

        // Clear absences on fresh session
        const players = (rosterRes?.players || []).map(
          (p: Player) => ({ ...p, absent: false })
        );
        const savedConfig = rosterRes?.config || null;

        // Merge saved config with defaults so new fields are picked up
        const mergedConfig: ConstraintConfig = savedConfig
          ? {
              ...DEFAULT_CONFIG,
              ...savedConfig,
              positioning: {
                ...DEFAULT_CONFIG.positioning,
                ...(savedConfig.positioning || {}),
              },
              restrictions: migrateRestrictions(savedConfig.restrictions),
              innings: savedConfig.innings ?? DEFAULT_CONFIG.innings,
              fieldPositions: savedConfig.fieldPositions || DEFAULT_CONFIG.fieldPositions,
              maxInningsPitched: savedConfig.maxInningsPitched !== undefined
                ? savedConfig.maxInningsPitched
                : DEFAULT_CONFIG.maxInningsPitched,
              trackRecognition: savedConfig.trackRecognition ?? DEFAULT_CONFIG.trackRecognition,
            }
          : DEFAULT_CONFIG;

        setConfig(mergedConfig);
        setRoster({ players, history: [] });

        const entries = historyRes?.entries || [];
        setHistoryEntries(entries.map((e: { date: string; players: HistoryEntry["players"] }) => ({
          date: e.date,
          players: e.players,
        })));

        setShowOnboarding(!mergedConfig.onboardingComplete);
      } catch {
        // Fallback to defaults
        setConfig(DEFAULT_CONFIG);
        setRoster({ players: [], history: [] });
        setShowOnboarding(true);
      }
      setLoaded(true);
    }
    loadData();
  }, []);

  // Auto-save roster and config to DB when they change (skip initial load)
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!roster || !config) return;
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      return;
    }
    saveToDb(roster.players, config);
  }, [roster, config, saveToDb]);

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

  const handleToggleRecognized = useCallback(
    (id: string) => {
      updatePlayers((players) =>
        players.map((p) => (p.id === id ? { ...p, recognized: !p.recognized } : p))
      );
    },
    [updatePlayers]
  );

  const [focusPlayerId, setFocusPlayerId] = useState<string | null>(null);

  const handleAddPlayer = useCallback(() => {
    updatePlayers((players) => {
      const maxRank = players.length > 0 ? Math.max(...players.map((p) => p.rank)) : 0;
      const maxId = players.length > 0 ? Math.max(...players.map((p) => parseInt(p.id))) : 0;
      const newId = String(maxId + 1);
      setTimeout(() => setFocusPlayerId(newId), 0);
      return [
        ...players,
        { id: newId, name: "", rank: maxRank + 1, absent: false },
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

  const handleSetAvoidPositions = useCallback(
    (id: string, positions: string[]) => {
      updatePlayers((players) =>
        players.map((p) => (p.id === id ? { ...p, avoidPositions: positions } : p))
      );
    },
    [updatePlayers]
  );

  const handleSetWalkOnSong = useCallback(
    (id: string, song: import("@/lib/types").WalkOnSong | null) => {
      updatePlayers((players) =>
        players.map((p) => {
          if (p.id !== id) return p;
          if (song) return { ...p, walkOnSong: song };
          // Removing — drop the field
          const next = { ...p } as typeof p;
          delete (next as { walkOnSong?: unknown }).walkOnSong;
          return next;
        })
      );
    },
    [updatePlayers]
  );

  const handleConfigChange = useCallback((newConfig: ConstraintConfig) => {
    setConfig(newConfig);
  }, []);

  const switchTeam = useCallback(async (teamId: number) => {
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "POST" });
      if (!res.ok) return;
      // Full reload so all team-scoped data (roster, history, config) refetches
      window.location.reload();
    } catch {
      /* ignore */
    }
  }, []);

  const createTeam = useCallback(async (name: string) => {
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Could not create team");
        return;
      }
      // Newly-created team is auto-switched server-side; reload for a clean slate
      window.location.reload();
    } catch {
      /* ignore */
    }
  }, []);

  const handleOnboardingComplete = useCallback(
    (result: {
      coachName: string;
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
      const newPlayers = result.players;
      setRoster({ players: newPlayers, history: [] });

      // Save to DB immediately (don't wait for debounce)
      fetch("/api/roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: newPlayers,
          config: newConfig,
          coachName: result.coachName,
        }),
      }).catch(() => {});

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
          const rawSheet = generateGameSheet(roster.players, config, randomize);
          const present = roster.players.filter((p) => !p.absent);
          // Honor per-player avoid-position preferences via valid swaps only.
          const sheet = applyAvoidPositionsPostPass(rawSheet, present, config);
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
            setRoster(updated);

            // Save history entry to DB
            const entry = updated.history[0];
            fetch("/api/history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ date: entry.date, players: entry.players }),
            })
              .then((r) => r.json())
              .then((data) => {
                setHistoryEntries((prev) => [{ ...entry, id: data.id }, ...prev]);
              })
              .catch(() => {});
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
    setError(null);
    // Clear all absences
    setRoster((prev) => {
      if (!prev) return prev;
      return { ...prev, players: prev.players.map((p) => ({ ...p, absent: false })) };
    });
    setActiveTab("roster");
  }, []);

  const handleExportPDF = useCallback(async (opposingTeam: string, isHome: boolean) => {
    if (!roster || !gameSheet || !config) return;
    const colors = await extractColorsFromDataUrl(config.logoDataUrl);
    const doc = await generatePDF(
      roster.players,
      gameSheet,
      config.teamName,
      config.logoDataUrl,
      config.innings,
      colors,
      { opposingTeam, isHome }
    );
    const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
    doc.save(`game-sheet-${ts}.pdf`);
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
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-2">
      {/* Top bar: version + logout */}
      <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
        <span>
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
        </span>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <a href="/admin" className="text-[#002d62] hover:underline text-xs">Admin</a>
          )}
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="hover:text-gray-600"
          >
            {userEmail || "Logout"}
          </button>
        </div>
      </div>

      {/* Pennant logo — centered */}
      <div className="flex justify-center mb-2">
        <img src="/logo.png" alt="Who's On First" className="h-20 object-contain" />
      </div>

      {/* Pending user gate */}
      {userStatus === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-bold text-amber-800 mb-2">Account Pending Approval</h2>
          <p className="text-sm text-amber-700">
            Your account is waiting for admin approval. You&apos;ll receive an email once approved.
          </p>
        </div>
      )}

      {userStatus === "suspended" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-bold text-red-800 mb-2">Account Suspended</h2>
          <p className="text-sm text-red-700">
            Your account has been suspended. Contact the administrator for assistance.
          </p>
        </div>
      )}

      {/* Tabs — only show for approved users (or if auth status not loaded yet) */}
      {(userStatus === "approved" || userStatus === null) && (<>

      {/* Tabs row: team logo+name on left, tabs on right */}
      <div className="flex items-center justify-between border-b border-gray-200 mb-3">
        <div className="flex items-center gap-2">
          {config.logoDataUrl && (
            <img src={config.logoDataUrl} alt="Team logo" className="w-6 h-6 object-contain" />
          )}
          <span className="text-sm font-bold text-[#002d62]">{config.teamName}</span>
          <TeamSwitcher
            teams={teams}
            activeTeamId={activeTeamId}
            activeTeamName={config.teamName}
            onSwitch={switchTeam}
            onCreate={createTeam}
            onOpenSettings={() => { window.location.href = "/settings"; }}
          />
          <a
            href="/settings"
            className="text-xs text-gray-500 hover:text-[#002d62] hover:underline ml-1"
            title="Edit team name, logo, and game rules"
          >
            ⚙ Settings
          </a>
        </div>
        <div className="flex gap-1">
          {(["roster", "preview", "history"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-[#002d62] border-b-2 border-[#002d62]"
                  : "text-gray-400 hover:text-gray-600"
              } ${tab === "preview" && !gameSheet ? "opacity-40 pointer-events-none" : ""}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tab content */}
      {activeTab === "roster" && (
        <div className="space-y-3">

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
                onToggleRecognized={handleToggleRecognized}
                onRename={handleRename}
                onAddPlayer={handleAddPlayer}
                onRemovePlayer={handleRemovePlayer}
                onSetAvoidPositions={handleSetAvoidPositions}
                onSetWalkOnSong={handleSetWalkOnSong}
                focusPlayerId={focusPlayerId}
                restrictions={config.restrictions}
                trackRecognition={config.trackRecognition}
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
                {generating ? "Generating..." : "Generate Roster"}
              </button>
            </>
          )}

          {/* Practice Plan — primary action, same visual weight as Generate Roster */}
          <button
            onClick={() => { setShowPractice(!showPractice); }}
            className="w-full py-3 rounded-lg font-bold text-white text-sm transition-colors bg-[#002d62] hover:bg-[#003d82] active:bg-[#001d42]"
          >
            {showPractice ? "Hide Practice Plan" : "Create Practice Plan"}
          </button>
          {showPractice && (
            <PracticePanel
              config={config}
              players={roster.players}
              onConfigChange={handleConfigChange}
            />
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
          config={config}
          onExportPDF={handleExportPDF}
          onRerun={handleRerun}
          onStartOver={handleStartOver}
          onSheetChange={(newSheet, newViolations) => {
            setGameSheet(newSheet);
            setViolations(newViolations);
          }}
        />
      )}

      {activeTab === "history" && (
        <History
          entries={historyEntries}
          onDeleteEntry={(index) => {
            const entry = historyEntries[index];
            setHistoryEntries((prev) => prev.filter((_, i) => i !== index));
            // Delete from DB if it has an ID
            if (entry && ((entry as unknown) as Record<string, unknown>).id) {
              fetch(`/api/history?id=${((entry as unknown) as Record<string, unknown>).id}`, {
                method: "DELETE",
              }).catch(() => {});
            }
          }}
        />
      )}

      </>)}
    </div>
  );
}
