"use client";

import { useState, useCallback } from "react";
import { Player } from "@/lib/types";
import {
  PracticeConfig,
  DEFAULT_PRACTICE_CONFIG,
  DEFAULT_PRACTICE_STATIONS,
  PracticeStation,
  ConstraintConfig,
} from "@/lib/constraints";
import { generatePracticePDF } from "@/lib/practice-pdf";
import { extractColorsFromDataUrl } from "@/lib/colors";

interface PracticePanelProps {
  config: ConstraintConfig;
  players: Player[];
  onConfigChange: (config: ConstraintConfig) => void;
}

export default function PracticePanel({
  config,
  players,
  onConfigChange,
}: PracticePanelProps) {
  const practice = config.practiceConfig || DEFAULT_PRACTICE_CONFIG;
  const [generating, setGenerating] = useState(false);
  const [customStation, setCustomStation] = useState("");

  const update = useCallback(
    (partial: Partial<PracticeConfig>) => {
      const updated = { ...practice, ...partial };
      onConfigChange({ ...config, practiceConfig: updated });
    },
    [config, practice, onConfigChange]
  );

  const enabledStations = practice.stations.filter((s) => s.enabled);
  const presentPlayers = players
    .filter((p) => !p.absent)
    .sort((a, b) => a.rank - b.rank);

  const stationMinutes = Math.max(
    0,
    practice.durationMinutes -
      practice.warmupMinutes -
      practice.scrimmageMinutes -
      5 // cooldown
  );
  const perStationMinutes =
    practice.stationCount > 0
      ? Math.floor(stationMinutes / practice.stationCount)
      : 0;

  const toggleStation = (name: string) => {
    const updated = practice.stations.map((s) =>
      s.name === name ? { ...s, enabled: !s.enabled } : s
    );
    update({ stations: updated });
  };

  const addCustomStation = () => {
    if (!customStation.trim()) return;
    const exists = practice.stations.some(
      (s) => s.name.toLowerCase() === customStation.trim().toLowerCase()
    );
    if (exists) return;
    update({
      stations: [
        ...practice.stations,
        { name: customStation.trim(), enabled: true },
      ],
    });
    setCustomStation("");
  };

  const removeStation = (name: string) => {
    // Only allow removing custom stations (not defaults)
    if (DEFAULT_PRACTICE_STATIONS.some((s) => s.name === name)) return;
    update({ stations: practice.stations.filter((s) => s.name !== name) });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const colors = await extractColorsFromDataUrl(config.logoDataUrl);
      const doc = await generatePracticePDF(
        presentPlayers,
        practice,
        config.teamName,
        config.logoDataUrl,
        colors
      );
      const ts = new Date()
        .toISOString()
        .replace(/[:.]/g, "")
        .slice(0, 15);
      const name = config.teamName.toLowerCase().replace(/\s+/g, "_");
      doc.save(`${name}_practice_${ts}.pdf`);
    } catch (err) {
      console.error("Practice PDF error:", err);
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate =
    presentPlayers.length >= 4 &&
    enabledStations.length >= practice.stationCount &&
    practice.stationCount > 0;

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
      <div className="p-4 space-y-4">
        {/* Duration & Age */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
              Practice Duration
            </label>
            <select
              value={practice.durationMinutes}
              onChange={(e) =>
                update({
                  durationMinutes: Number(e.target.value),
                  scrimmageMinutes: Math.min(
                    practice.scrimmageMinutes,
                    Math.floor(Number(e.target.value) / 2)
                  ),
                })
              }
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
            >
              {[60, 75, 90, 105, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
              Age Range
            </label>
            <select
              value={practice.ageRange}
              onChange={(e) => update({ ageRange: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
            >
              {["5-6", "7-8", "9-10", "11-12", "13-14"].map((r) => (
                <option key={r} value={r}>
                  {r} years
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Time Allocation */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
              Warm-up
            </label>
            <select
              value={practice.warmupMinutes}
              onChange={(e) =>
                update({ warmupMinutes: Number(e.target.value) })
              }
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
            >
              {[5, 10, 15].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
              Scrimmage
            </label>
            <select
              value={practice.scrimmageMinutes}
              onChange={(e) =>
                update({ scrimmageMinutes: Number(e.target.value) })
              }
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
            >
              {[0, 15, 20, 25, 30, 35, 40, 45].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "None" : `${m} min`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
              Drills Time
            </label>
            <div className="border border-gray-100 rounded-md px-2 py-1.5 text-sm bg-gray-50 text-gray-500 font-medium">
              {stationMinutes} min
            </div>
          </div>
        </div>

        {/* Station Count */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
            Number of Stations ({perStationMinutes} min each)
          </label>
          <div className="flex gap-1">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => update({ stationCount: n })}
                className={`flex-1 py-1.5 rounded text-sm font-bold transition-colors ${
                  practice.stationCount === n
                    ? "bg-[#002d62] text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Station Selection */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
            Drill Stations (select {practice.stationCount})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {practice.stations.map((station) => {
              const isDefault = DEFAULT_PRACTICE_STATIONS.some(
                (s) => s.name === station.name
              );
              return (
                <button
                  key={station.name}
                  onClick={() => toggleStation(station.name)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                    station.enabled
                      ? "bg-[#002d62] text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {station.name}
                  {!isDefault && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        removeStation(station.name);
                      }}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                    >
                      x
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Add custom station */}
          <div className="flex gap-1.5 mt-2">
            <input
              type="text"
              value={customStation}
              onChange={(e) => setCustomStation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomStation()}
              placeholder="Add custom station..."
              className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs"
            />
            <button
              onClick={addCustomStation}
              disabled={!customStation.trim()}
              className="px-2 py-1 text-xs font-bold rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
            >
              Add
            </button>
          </div>
        </div>

        {/* Enabled stations vs needed warning */}
        {enabledStations.length < practice.stationCount && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Select at least {practice.stationCount} stations (
            {enabledStations.length} selected)
          </div>
        )}

        {/* Player groups preview */}
        {presentPlayers.length > 0 && enabledStations.length >= practice.stationCount && (
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
              Player Groups Preview ({presentPlayers.length} players, {practice.stationCount} groups)
            </label>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(practice.stationCount, 3)}, 1fr)` }}>
              {splitIntoGroups(presentPlayers, practice.stationCount).map(
                (group, i) => (
                  <div
                    key={i}
                    className="bg-gray-50 border border-gray-100 rounded-md px-2 py-1.5"
                  >
                    <div className="text-[10px] font-bold text-gray-400 mb-0.5">
                      Group {i + 1}
                    </div>
                    {group.map((p) => (
                      <div key={p.id} className="text-xs text-gray-700">
                        {p.name}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Generate */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className={`w-full py-2.5 rounded-lg font-bold text-white text-sm transition-colors ${
            canGenerate && !generating
              ? "bg-[#002d62] hover:bg-[#003d82] active:bg-[#001d42]"
              : "bg-gray-300 cursor-not-allowed"
          }`}
        >
          {generating ? "Generating..." : "Generate Practice Plan PDF"}
        </button>
      </div>
    </div>
  );
}

/** Split players into N balanced groups using serpentine/snake draft by rank */
export function splitIntoGroups(
  players: Player[],
  groupCount: number
): Player[][] {
  const groups: Player[][] = Array.from({ length: groupCount }, () => []);
  const sorted = [...players].sort((a, b) => a.rank - b.rank);

  // Snake draft: 0,1,2,3,3,2,1,0,0,1,2,3,...
  sorted.forEach((player, i) => {
    const round = Math.floor(i / groupCount);
    const pos = i % groupCount;
    const groupIdx = round % 2 === 0 ? pos : groupCount - 1 - pos;
    groups[groupIdx].push(player);
  });

  return groups;
}
