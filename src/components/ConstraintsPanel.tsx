"use client";

import { useState } from "react";
import {
  ConstraintConfig,
  POSITIONING_CONSTRAINTS,
  PositionRestriction,
  AVAILABLE_POSITIONS,
} from "@/lib/constraints";

interface ConstraintsPanelProps {
  config: ConstraintConfig;
  onChange: (config: ConstraintConfig) => void;
  onClose: () => void;
}

export default function ConstraintsPanel({
  config,
  onChange,
  onClose,
}: ConstraintsPanelProps) {
  const [newRestrictionPos, setNewRestrictionPos] = useState("");

  const availableForNewRestriction = AVAILABLE_POSITIONS.filter(
    (pos) => !config.restrictions.some((r) => r.position === pos)
  );

  const updatePositioning = (id: string) => {
    const constraint = POSITIONING_CONSTRAINTS.find((c) => c.id === id);
    if (!constraint || !constraint.editable) return;
    onChange({
      ...config,
      positioning: {
        ...config.positioning,
        [id]: !(config.positioning[id] ?? true),
      },
    });
  };

  const updateRestrictions = (restrictions: PositionRestriction[]) => {
    onChange({ ...config, restrictions });
  };

  const handleAddRestriction = () => {
    if (!newRestrictionPos) return;
    updateRestrictions([
      ...config.restrictions,
      { position: newRestrictionPos, topN: 4, enabled: true },
    ]);
    setNewRestrictionPos("");
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-bold text-sm text-[#002d62]">
          Scheduling Constraints
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          Close
        </button>
      </div>

      {/* Defensive Positioning */}
      <div>
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            Defensive Positioning (League Rules)
          </h4>
        </div>
        <div className="divide-y divide-gray-100">
          {POSITIONING_CONSTRAINTS.map((c) => (
            <div
              key={c.id}
              className={`flex items-start gap-3 px-4 py-3 ${
                !(config.positioning[c.id] ?? c.enabled) ? "opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={config.positioning[c.id] ?? c.enabled}
                onChange={() => updatePositioning(c.id)}
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
      <div>
        <div className="px-4 py-2 bg-gray-50 border-b border-t border-gray-200">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            Defensive Optimizing (Coach Preferences)
          </h4>
        </div>
        <div className="p-4 space-y-5">
          {/* Position Restrictions */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Position Restrictions
            </h4>

            {/* Visual example — dynamic from current restrictions */}
            {(() => {
              const enabled = config.restrictions.filter(r => r.enabled);
              // Sort by topN ascending (most restrictive first)
              const sorted = [...enabled].sort((a, b) => a.topN - b.topN);
              // Unique topN values for coloring
              const uniqueTopN = [...new Set(sorted.map(r => r.topN))].sort((a, b) => a - b);
              const COLORS = [
                { bg: "bg-amber-100", text: "text-amber-800", bar: "bg-amber-400", label: "text-amber-700" },
                { bg: "bg-blue-100", text: "text-blue-800", bar: "bg-blue-400", label: "text-blue-700" },
                { bg: "bg-rose-100", text: "text-rose-800", bar: "bg-rose-400", label: "text-rose-700" },
                { bg: "bg-emerald-100", text: "text-emerald-800", bar: "bg-emerald-400", label: "text-emerald-700" },
                { bg: "bg-purple-100", text: "text-purple-800", bar: "bg-purple-400", label: "text-purple-700" },
              ];
              const colorMap = new Map(uniqueTopN.map((topN, i) => [topN, i % COLORS.length]));
              const maxTopN = sorted.length > 0 ? Math.max(...sorted.map(r => r.topN)) : 0;
              const playerCount = Math.max(13, maxTopN + 2);
              // Group restrictions by topN for bracket labels
              const groups = new Map<number, string[]>();
              for (const r of sorted) {
                if (!groups.has(r.topN)) groups.set(r.topN, []);
                groups.get(r.topN)!.push(r.position);
              }

              return (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-[11px] text-gray-500 mb-2 font-medium">
                    How it works: restrict positions to your top-ranked players
                  </p>
                  <div className="flex gap-4 items-start">
                    <div className="space-y-0.5">
                      {Array.from({ length: playerCount }, (_, i) => {
                        // Find the most restrictive group this player belongs to
                        let colorIdx = -1;
                        for (const [topN, idx] of colorMap) {
                          if (i < topN) { colorIdx = idx; break; }
                        }
                        return (
                          <div
                            key={i}
                            className={`text-[10px] px-2 py-0.5 rounded text-center font-medium ${
                              colorIdx >= 0
                                ? `${COLORS[colorIdx].bg} ${COLORS[colorIdx].text}`
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            Player {i + 1}
                          </div>
                        );
                      })}
                    </div>
                    <div className="space-y-1 pt-0.5">
                      {[...groups.entries()].map(([topN, positions]) => {
                        const cidx = colorMap.get(topN) ?? 0;
                        const c = COLORS[cidx];
                        const heightPx = topN * 22; // ~22px per player row
                        return (
                          <div key={topN} className="flex items-center gap-1.5">
                            <div className={`w-1 rounded-full ${c.bar}`} style={{ height: `${heightPx}px` }} />
                            <span className={`text-[10px] font-bold ${c.label}`}>
                              {positions.join(", ")} eligible (top {topN})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Restriction rows */}
            <div className="space-y-2">
              {config.restrictions.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-white"
                >
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={() => {
                      const updated = [...config.restrictions];
                      updated[idx] = { ...r, enabled: !r.enabled };
                      updateRestrictions(updated);
                    }}
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
                    onChange={(e) => {
                      const updated = [...config.restrictions];
                      updated[idx] = {
                        ...r,
                        topN: Math.max(
                          1,
                          Math.min(13, parseInt(e.target.value) || 1)
                        ),
                      };
                      updateRestrictions(updated);
                    }}
                    className="w-14 text-sm text-center border border-gray-300 rounded py-1 outline-none focus:border-[#002d62]"
                  />
                  <span className="text-xs text-gray-500">players</span>
                  <button
                    onClick={() => {
                      updateRestrictions(
                        config.restrictions.filter((_, i) => i !== idx)
                      );
                    }}
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

          {/* Top player priority */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={config.topPlayerPriority}
              onChange={() =>
                onChange({
                  ...config,
                  topPlayerPriority: !config.topPlayerPriority,
                })
              }
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

          {/* Bench top late */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={config.benchTopLate}
              onChange={() =>
                onChange({ ...config, benchTopLate: !config.benchTopLate })
              }
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
    </div>
  );
}
