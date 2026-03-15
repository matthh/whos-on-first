"use client";

import { useState, useRef, useCallback } from "react";
import { Player } from "@/lib/types";
import {
  ConstraintConfig,
  DEFAULT_CONFIG,
  POSITIONING_CONSTRAINTS,
  PositionRestriction,
  AVAILABLE_POSITIONS,
  FIELD_POSITION_PRESETS,
  DEFAULT_FIELD_POSITIONS,
  isOutfieldPosition,
} from "@/lib/constraints";
import RosterList from "./RosterList";

interface OnboardingProps {
  onComplete: (config: {
    teamName: string;
    logoDataUrl: string | null;
    players: Player[];
    constraints: ConstraintConfig;
  }) => void;
  initialPlayers?: Player[];
  initialConfig?: ConstraintConfig;
}

const TOTAL_STEPS = 4;

export default function Onboarding({
  onComplete,
  initialPlayers,
  initialConfig,
}: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [teamName, setTeamName] = useState(
    initialConfig?.teamName || DEFAULT_CONFIG.teamName
  );
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(
    initialConfig?.logoDataUrl || null
  );
  const [players, setPlayers] = useState<Player[]>(initialPlayers || []);
  const [positioning, setPositioning] = useState<Record<string, boolean>>(
    initialConfig?.positioning || { ...DEFAULT_CONFIG.positioning }
  );
  const [restrictions, setRestrictions] = useState<PositionRestriction[]>(
    initialConfig?.restrictions || [...DEFAULT_CONFIG.restrictions.map((r) => ({ ...r }))]
  );
  const [topPlayerPriority, setTopPlayerPriority] = useState(
    initialConfig?.topPlayerPriority ?? DEFAULT_CONFIG.topPlayerPriority
  );
  const [benchTopLate, setBenchTopLate] = useState(
    initialConfig?.benchTopLate ?? DEFAULT_CONFIG.benchTopLate
  );
  const [newRestrictionPos, setNewRestrictionPos] = useState("");

  // League Rules state
  const [innings, setInnings] = useState(
    initialConfig?.innings ?? DEFAULT_CONFIG.innings
  );
  const [fieldPositions, setFieldPositions] = useState<string[]>(
    initialConfig?.fieldPositions || [...DEFAULT_FIELD_POSITIONS]
  );
  const [maxInningsPitched, setMaxInningsPitched] = useState<number | null>(
    initialConfig?.maxInningsPitched ?? DEFAULT_CONFIG.maxInningsPitched
  );

  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setLogoDataUrl(reader.result as string);
      reader.readAsDataURL(file);
    },
    []
  );

  const handleReorder = useCallback((updated: Player[]) => {
    setPlayers(updated);
  }, []);

  const handleToggleAbsent = useCallback((id: string) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, absent: !p.absent } : p))
    );
  }, []);

  const handleRename = useCallback((id: string, name: string) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
  }, []);

  const [focusPlayerId, setFocusPlayerId] = useState<string | null>(null);

  const handleAddPlayer = useCallback(() => {
    setPlayers((prev) => {
      const maxRank = prev.length > 0 ? Math.max(...prev.map((p) => p.rank)) : 0;
      const maxId = prev.length > 0 ? Math.max(...prev.map((p) => parseInt(p.id))) : 0;
      const newId = String(maxId + 1);
      // Set focus to the new player after render
      setTimeout(() => setFocusPlayerId(newId), 0);
      return [
        ...prev,
        { id: newId, name: "", rank: maxRank + 1, absent: false },
      ];
    });
  }, []);

  /** Remove empty-named players from the end of the list */
  const cleanupEmptyPlayers = useCallback(() => {
    setPlayers((prev) => {
      const cleaned = prev.filter((p) => p.name.trim() !== "");
      if (cleaned.length === prev.length) return prev;
      // Reassign ranks
      const sorted = [...cleaned].sort((a, b) => a.rank - b.rank);
      return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
    });
  }, []);

  const handleRemovePlayer = useCallback((id: string) => {
    setPlayers((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      const sorted = [...filtered].sort((a, b) => a.rank - b.rank);
      return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
    });
  }, []);

  const handleFinish = () => {
    const config: ConstraintConfig = {
      positioning,
      restrictions,
      topPlayerPriority,
      benchTopLate,
      onboardingComplete: true,
      teamName,
      logoDataUrl,
      innings,
      fieldPositions,
      maxInningsPitched,
    };
    onComplete({ teamName, logoDataUrl, players, constraints: config });
  };

  const availableForNewRestriction = AVAILABLE_POSITIONS.filter(
    (pos) => !restrictions.some((r) => r.position === pos)
  );

  const handleAddRestriction = () => {
    if (!newRestrictionPos) return;
    setRestrictions((prev) => [
      ...prev,
      { position: newRestrictionPos, topN: 4, enabled: true },
    ]);
    setNewRestrictionPos("");
  };

  const handleRemoveRestriction = (idx: number) => {
    setRestrictions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRestrictionTopN = (idx: number, topN: number) => {
    setRestrictions((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, topN } : r))
    );
  };

  const handleRestrictionToggle = (idx: number) => {
    setRestrictions((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, enabled: !r.enabled } : r))
    );
  };

  // Determine which preset is active (if any)
  const activePreset = Object.entries(FIELD_POSITION_PRESETS).find(
    ([, positions]) =>
      positions.length === fieldPositions.length &&
      positions.every((p) => fieldPositions.includes(p))
  )?.[0] || null;

  const handleSelectPreset = (presetName: string) => {
    setFieldPositions([...FIELD_POSITION_PRESETS[presetName]]);
  };

  const handleTogglePosition = (pos: string) => {
    setFieldPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  // All possible positions across all presets
  const allKnownPositions = Array.from(
    new Set(Object.values(FIELD_POSITION_PRESETS).flat())
  );
  const infieldPositions = allKnownPositions.filter((p) => !isOutfieldPosition(p));
  const outfieldPositions = allKnownPositions.filter((p) => isOutfieldPosition(p));

  const fieldSize = fieldPositions.length;

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-8">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                s === step
                  ? "bg-[#002d62] text-white"
                  : s < step
                  ? "bg-amber-500 text-white"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {s}
            </div>
            {s < TOTAL_STEPS && (
              <div
                className={`w-12 h-0.5 ${
                  s < step ? "bg-amber-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: League Rules */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center mb-4">
            <div className="flex justify-center mb-4">
              <img
                src="/logo.png"
                alt="Who's On First"
                className="h-28 object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-[#002d62] mb-2">
              League Rules
            </h1>
            <p className="text-gray-500 text-sm">
              Configure your league&apos;s format before building your roster.
            </p>
          </div>

          {/* Number of Innings */}
          <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-4">
            <h3 className="font-bold text-sm text-[#002d62] mb-3">
              Number of Innings
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={9}
                value={innings}
                onChange={(e) =>
                  setInnings(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))
                }
                className="w-20 text-center text-lg font-bold border border-gray-300 rounded-lg py-2 outline-none focus:border-[#002d62] text-[#002d62]"
              />
              <span className="text-sm text-gray-500">innings per game</span>
            </div>
          </div>

          {/* Field Positions */}
          <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-4">
            <h3 className="font-bold text-sm text-[#002d62] mb-3">
              Field Positions
            </h3>

            {/* Preset buttons */}
            <div className="flex gap-2 mb-4">
              {Object.keys(FIELD_POSITION_PRESETS).map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activePreset === preset
                      ? "bg-[#002d62] text-white"
                      : "border border-gray-300 text-gray-600 hover:border-[#002d62] hover:text-[#002d62]"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Position toggles */}
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Infield
                </div>
                <div className="flex flex-wrap gap-2">
                  {infieldPositions.map((pos) => (
                    <button
                      key={pos}
                      onClick={() => handleTogglePosition(pos)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        fieldPositions.includes(pos)
                          ? "bg-[#002d62] text-white"
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Outfield
                </div>
                <div className="flex flex-wrap gap-2">
                  {outfieldPositions.map((pos) => (
                    <button
                      key={pos}
                      onClick={() => handleTogglePosition(pos)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        fieldPositions.includes(pos)
                          ? "bg-amber-500 text-white"
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-400">
              {fieldPositions.length} positions on field ({fieldPositions.filter(p => !isOutfieldPosition(p)).length} IF + {fieldPositions.filter(p => isOutfieldPosition(p)).length} OF)
            </div>
          </div>

          {/* Max Innings Pitched */}
          <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-4">
            <h3 className="font-bold text-sm text-[#002d62] mb-3">
              Max Innings Pitched Per Player
            </h3>
            <select
              value={maxInningsPitched === null ? "" : maxInningsPitched}
              onChange={(e) => {
                const val = e.target.value;
                setMaxInningsPitched(val === "" ? null : parseInt(val));
              }}
              className="text-sm border border-gray-300 rounded-lg py-2 px-3 outline-none focus:border-[#002d62] text-gray-700"
            >
              <option value="">No Maximum</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} inning{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={fieldPositions.length < 1}
            className={`w-full px-8 py-3 rounded-lg font-bold text-white text-sm transition-colors ${
              fieldPositions.length >= 1
                ? "bg-[#002d62] hover:bg-[#003d82]"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            Next
          </button>
        </div>
      )}

      {/* Step 2: Team Setup */}
      {step === 2 && (
        <div className="text-center space-y-8">
          <div>
            <div className="flex justify-center mb-4">
              <img
                src="/logo.png"
                alt="Who's On First"
                className="h-28 object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-[#002d62] mb-2">
              Welcome to Who&apos;s On First
            </h1>
            <p className="text-gray-500 text-sm">
              Let&apos;s set up your team.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Team Name
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="text-2xl font-bold text-[#002d62] bg-transparent border-b-2 border-gray-300 focus:border-[#002d62] outline-none text-center w-full max-w-xs mx-auto block py-2 transition-colors"
                placeholder="Enter team name"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Team Logo (optional)
              </label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                onClick={() => logoInputRef.current?.click()}
                className="mx-auto w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-[#002d62] transition-colors overflow-hidden"
              >
                {logoDataUrl ? (
                  <img
                    src={logoDataUrl}
                    alt="Team logo"
                    className="w-20 h-20 object-contain"
                  />
                ) : (
                  <span className="text-gray-400 text-sm">+ Logo</span>
                )}
              </button>
              {logoDataUrl && (
                <button
                  onClick={() => setLogoDataUrl(null)}
                  className="text-xs text-gray-400 hover:text-red-500 mt-2 transition-colors"
                >
                  Remove logo
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => setStep(3)}
            disabled={!teamName.trim()}
            className={`px-8 py-3 rounded-lg font-bold text-white text-sm transition-colors ${
              teamName.trim()
                ? "bg-[#002d62] hover:bg-[#003d82]"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            Next
          </button>

          <div>
            <button
              onClick={() => setStep(1)}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Build Roster */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-[#002d62] mb-2">
              Build Your Roster
            </h1>
            <p className="text-sm text-gray-500">
              Add your players and drag to rank them -- best player at top,
              weakest at bottom.
            </p>
          </div>

          <div className="text-center mb-2">
            <span
              className={`text-sm font-medium ${
                players.length >= fieldSize ? "text-green-600" : "text-amber-600"
              }`}
            >
              {players.length} players (need {fieldSize}-{fieldSize + 3})
            </span>
          </div>

          {players.length === 0 ? (
            <div className="text-center py-12">
              <button
                onClick={handleAddPlayer}
                className="px-6 py-3 rounded-lg font-bold text-white text-sm bg-[#002d62] hover:bg-[#003d82] transition-colors"
              >
                Add First Player
              </button>
            </div>
          ) : (
            <RosterList
              players={players}
              onReorder={handleReorder}
              onToggleAbsent={handleToggleAbsent}
              onRename={handleRename}
              onAddPlayer={handleAddPlayer}
              onRemovePlayer={handleRemovePlayer}
              focusPlayerId={focusPlayerId}
              maxPlayers={fieldSize + 3}
            />
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => { cleanupEmptyPlayers(); setStep(2); }}
              className="px-6 py-3 rounded-lg font-bold text-sm text-gray-500 border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => { cleanupEmptyPlayers(); setStep(4); }}
              disabled={players.filter(p => p.name.trim()).length < fieldSize}
              className={`flex-1 py-3 rounded-lg font-bold text-white text-sm transition-colors ${
                players.length >= fieldSize
                  ? "bg-[#002d62] hover:bg-[#003d82]"
                  : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Constraints */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="text-center mb-4">
            <h1 className="text-xl font-bold text-[#002d62] mb-2">
              Choose Your Constraints
            </h1>
            <p className="text-sm text-gray-500">
              Configure the rules that govern position assignments.
            </p>
          </div>

          {/* Defensive Positioning */}
          <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h3 className="font-bold text-sm text-[#002d62]">
                Defensive Positioning (League Rules)
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              {POSITIONING_CONSTRAINTS.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    !(positioning[c.id] ?? c.enabled) ? "opacity-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={positioning[c.id] ?? c.enabled}
                    onChange={() =>
                      c.editable &&
                      setPositioning((prev) => ({
                        ...prev,
                        [c.id]: !(prev[c.id] ?? c.enabled),
                      }))
                    }
                    disabled={!c.editable}
                    className="mt-0.5 accent-[#002d62]"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-700">
                      {c.label}
                      {!c.editable && (
                        <span className="ml-2 text-[10px] text-gray-400 font-normal">
                          (required)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{c.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Defensive Optimizing */}
          <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h3 className="font-bold text-sm text-[#002d62]">
                Defensive Optimizing (Coach Preferences)
              </h3>
            </div>
            <div className="p-4 space-y-6">
              {/* Position Restrictions */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Position Restrictions
                </h4>

                {/* Visual example */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-[11px] text-gray-500 mb-2 font-medium">
                    How it works: restrict positions to your top-ranked players
                  </p>
                  <div className="flex gap-4 items-start">
                    <div className="space-y-0.5">
                      {Array.from({ length: Math.min(players.length, 13) || 13 }, (_, i) => (
                        <div
                          key={i}
                          className={`text-[10px] px-2 py-0.5 rounded text-center font-medium ${
                            i < 4
                              ? "bg-amber-100 text-amber-800"
                              : i < 6
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          Player {i + 1}
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-[52px] bg-amber-400 rounded-full" />
                        <span className="text-[10px] text-amber-700 font-bold">
                          1B eligible (top 4)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-[78px] bg-blue-400 rounded-full" />
                        <span className="text-[10px] text-blue-700 font-bold">
                          P eligible (top 6)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Restriction rows */}
                <div className="space-y-2">
                  {restrictions.map((r, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-white"
                    >
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={() => handleRestrictionToggle(idx)}
                        className="accent-[#002d62]"
                      />
                      <span className="text-sm font-semibold text-gray-700 w-12">
                        {r.position}
                      </span>
                      <span className="text-xs text-gray-500">Top</span>
                      <input
                        type="number"
                        min={1}
                        max={13}
                        value={r.topN}
                        onChange={(e) =>
                          handleRestrictionTopN(
                            idx,
                            Math.max(1, Math.min(13, parseInt(e.target.value) || 1))
                          )
                        }
                        className="w-14 text-sm text-center border border-gray-300 rounded py-1 outline-none focus:border-[#002d62]"
                      />
                      <span className="text-xs text-gray-500">players</span>
                      <button
                        onClick={() => handleRemoveRestriction(idx)}
                        className="ml-auto text-gray-300 hover:text-red-500 transition-colors"
                        title="Remove restriction"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <line x1="3" y1="3" x2="11" y2="11" />
                          <line x1="11" y1="3" x2="3" y2="11" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add restriction */}
                {availableForNewRestriction.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <select
                      value={newRestrictionPos}
                      onChange={(e) => setNewRestrictionPos(e.target.value)}
                      className="text-sm border border-gray-300 rounded py-1.5 px-2 outline-none focus:border-[#002d62]"
                    >
                      <option value="">Select position...</option>
                      {availableForNewRestriction.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddRestriction}
                      disabled={!newRestrictionPos}
                      className={`text-sm px-3 py-1.5 rounded font-medium transition-colors ${
                        newRestrictionPos
                          ? "bg-[#002d62] text-white hover:bg-[#003d82]"
                          : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      Add Restriction
                    </button>
                  </div>
                )}
              </div>

              {/* Top player priority toggle */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={topPlayerPriority}
                  onChange={() => setTopPlayerPriority((v) => !v)}
                  className="mt-0.5 accent-[#002d62]"
                />
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    Prioritize top players for infield
                  </div>
                  <div className="text-xs text-gray-400">
                    Top-ranked players get premium infield positions first
                  </div>
                </div>
              </div>

              {/* Bench top late toggle */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={benchTopLate}
                  onChange={() => setBenchTopLate((v) => !v)}
                  className="mt-0.5 accent-[#002d62]"
                />
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    Top restricted players bench as late as possible
                  </div>
                  <div className="text-xs text-gray-400">
                    Best players sit in later innings to maximize early-game
                    competitiveness
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep(3)}
              className="px-6 py-3 rounded-lg font-bold text-sm text-gray-500 border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleFinish}
              className="flex-1 py-3 rounded-lg font-bold text-white text-sm bg-amber-500 hover:bg-amber-600 transition-colors"
            >
              Finish Setup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
