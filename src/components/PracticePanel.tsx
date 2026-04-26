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
  const [customDescription, setCustomDescription] = useState("");
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [editingStation, setEditingStation] = useState<string | null>(null);

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

  const fetchGuide = async (
    name: string,
    description: string,
  ): Promise<{ setup: string; drills: string[]; coachQuote: string } | null> => {
    try {
      const res = await fetch("/api/practice/generate-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, ageRange: practice.ageRange }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLlmError(data?.error || `Failed (${res.status})`);
        return null;
      }
      return data;
    } catch (err) {
      setLlmError(err instanceof Error ? err.message : "Network error");
      return null;
    }
  };

  const addCustomStation = async () => {
    const name = customStation.trim();
    if (!name) return;
    const exists = practice.stations.some(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) return;
    setLlmBusy(true);
    setLlmError(null);
    const guide = await fetchGuide(name, customDescription.trim());
    setLlmBusy(false);
    update({
      stations: [
        ...practice.stations,
        {
          name,
          description: customDescription.trim() || undefined,
          enabled: true,
          generated: guide
            ? { ...guide, generatedAt: new Date().toISOString() }
            : undefined,
        },
      ],
    });
    setCustomStation("");
    setCustomDescription("");
  };

  const regenerateStation = async (originalName: string, newName: string, newDescription: string) => {
    setLlmBusy(true);
    setLlmError(null);
    const guide = await fetchGuide(newName, newDescription);
    setLlmBusy(false);
    if (!guide) return;
    update({
      stations: practice.stations.map((s) =>
        s.name === originalName
          ? {
              ...s,
              name: newName,
              description: newDescription || undefined,
              generated: { ...guide, generatedAt: new Date().toISOString() },
            }
          : s
      ),
    });
    setEditingStation(newName);
  };

  const updateStationMeta = (originalName: string, newName: string, newDescription: string) => {
    update({
      stations: practice.stations.map((s) =>
        s.name === originalName
          ? { ...s, name: newName, description: newDescription || undefined }
          : s
      ),
    });
    setEditingStation(newName);
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
                <span
                  key={station.name}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                    station.enabled
                      ? "bg-[#002d62] text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  <button
                    onClick={() => toggleStation(station.name)}
                    title={station.description || (station.generated ? "Tap pencil to view drill instructions" : undefined)}
                    className="bg-transparent border-none p-0 m-0 font-inherit text-inherit cursor-pointer"
                  >
                    {station.name}
                    {station.generated && <span className="ml-1 opacity-70" title="Has custom drill instructions">✨</span>}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingStation(station.name); }}
                    className="ml-0.5 opacity-60 hover:opacity-100"
                    title="Edit station"
                    aria-label="Edit station"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>
                  {!isDefault && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeStation(station.name); }}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                      title="Remove station"
                      aria-label="Remove station"
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          {editingStation && (() => {
            const station = practice.stations.find((s) => s.name === editingStation);
            if (!station) return null;
            return (
              <StationEditor
                key={station.name}
                station={station}
                busy={llmBusy}
                error={llmError}
                onClose={() => { setEditingStation(null); setLlmError(null); }}
                onSaveMeta={(newName, newDescription) => updateStationMeta(station.name, newName, newDescription)}
                onRegenerate={(newName, newDescription) => regenerateStation(station.name, newName, newDescription)}
              />
            );
          })()}

          {/* Add custom station */}
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={customStation}
                onChange={(e) => setCustomStation(e.target.value)}
                placeholder="Station name..."
                disabled={llmBusy}
                className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-50"
              />
              <button
                onClick={addCustomStation}
                disabled={!customStation.trim() || llmBusy}
                className="px-2 py-1 text-xs font-bold rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
              >
                {llmBusy ? "Generating…" : "Add"}
              </button>
            </div>
            {customStation.trim() && (
              <textarea
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="What do you want to teach? (e.g. 'reading the ball off the bat', 'two-strike approach') — Claude will draft drills."
                rows={2}
                disabled={llmBusy}
                className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs resize-none disabled:bg-gray-50"
              />
            )}
            {llmError && !editingStation && (
              <div className="text-[11px] text-red-600">{llmError}</div>
            )}
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

function StationEditor({
  station,
  busy,
  error,
  onClose,
  onSaveMeta,
  onRegenerate,
}: {
  station: PracticeStation;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSaveMeta: (name: string, description: string) => void;
  onRegenerate: (name: string, description: string) => void;
}) {
  const [name, setName] = useState(station.name);
  const [description, setDescription] = useState(station.description || "");
  const generated = station.generated;
  const dirty = name !== station.name || description !== (station.description || "");

  return (
    <div className="mt-3 border border-gray-200 rounded-md p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Edit station</div>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-800" aria-label="Close">×</button>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-100"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">What to teach</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          disabled={busy}
          placeholder="e.g. 'reading the ball off the bat', 'fielding short hops'"
          className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs resize-none disabled:bg-gray-100"
        />
      </div>

      {generated && (
        <div className="border border-gray-200 rounded-md bg-white p-2 text-xs space-y-1.5">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Current drill instructions</div>
          <div><span className="font-semibold">Setup:</span> {generated.setup}</div>
          <div>
            <div className="font-semibold mb-0.5">Drills:</div>
            <ul className="list-disc list-inside space-y-0.5">
              {generated.drills.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
          <div className="italic text-gray-600">{generated.coachQuote}</div>
          <div className="text-[10px] text-gray-400">Last generated {new Date(generated.generatedAt).toLocaleString()}</div>
        </div>
      )}

      {error && <div className="text-[11px] text-red-600">{error}</div>}

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 disabled:opacity-50"
        >Close</button>
        {dirty && (
          <button
            type="button"
            onClick={() => onSaveMeta(name.trim(), description.trim())}
            disabled={busy || !name.trim()}
            className="text-xs font-bold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded px-2 py-1 disabled:opacity-50"
          >Save</button>
        )}
        <button
          type="button"
          onClick={() => onRegenerate(name.trim() || station.name, description.trim())}
          disabled={busy || !name.trim()}
          className="text-xs font-bold text-white bg-[#002d62] hover:bg-[#003d82] rounded px-2 py-1 disabled:opacity-50"
        >
          {busy ? "Generating…" : generated ? "Regenerate instructions" : "Generate instructions"}
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
