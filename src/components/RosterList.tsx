"use client";

import { useEffect, useRef, useState } from "react";
import { Player, WalkOnSong } from "@/lib/types";
import { PositionRestriction } from "@/lib/constraints";
import PlayerEditModal from "./PlayerEditModal";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Color palette for restriction groups — indexed by unique topN values
const RESTRICTION_COLORS = [
  { bg: "bg-amber-100", text: "text-amber-700", badge: "bg-amber-500" },   // most restrictive
  { bg: "bg-blue-100", text: "text-blue-700", badge: "bg-blue-500" },
  { bg: "bg-rose-100", text: "text-rose-700", badge: "bg-rose-500" },
  { bg: "bg-emerald-100", text: "text-emerald-700", badge: "bg-emerald-500" },
  { bg: "bg-purple-100", text: "text-purple-700", badge: "bg-purple-500" },
  { bg: "bg-cyan-100", text: "text-cyan-700", badge: "bg-cyan-500" },
];

/** Map each unique topN to a color index. Lower topN (more restrictive) gets first color. */
function buildColorMap(restrictions: PositionRestriction[]): Map<number, number> {
  const uniqueTopN = [...new Set(restrictions.filter(r => r.enabled).map(r => r.topN))].sort((a, b) => a - b);
  const map = new Map<number, number>();
  uniqueTopN.forEach((topN, i) => map.set(topN, i % RESTRICTION_COLORS.length));
  return map;
}

interface RosterListProps {
  players: Player[];
  onReorder: (players: Player[]) => void;
  onToggleAbsent: (id: string) => void;
  onToggleRecognized?: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onAddPlayer: () => void;
  onRemovePlayer: (id: string) => void;
  onSetAvoidPositions?: (id: string, positions: string[]) => void;
  onSetWalkOnSong?: (id: string, song: WalkOnSong | null) => void;
  /** ID of player whose name input should be focused */
  focusPlayerId?: string | null;
  trackRecognition?: boolean;
  /** Hide the Add Player button (e.g. when parent shows its own) */
  hideAddButton?: boolean;
  /** Max players allowed */
  maxPlayers?: number;
  /** Position restrictions to show as eligibility badges */
  restrictions?: PositionRestriction[];
}

function SortablePlayer({
  player,
  onToggleAbsent,
  onRename,
  onRemovePlayer,
  onToggleRecognized,
  onOpenEdit,
  onEnter,
  canRemove,
  shouldFocus,
  restrictions,
  colorMap,
  effectiveRank,
  trackRecognition,
  showEditButton,
}: {
  player: Player;
  onToggleAbsent: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemovePlayer: (id: string) => void;
  onToggleRecognized: (id: string) => void;
  onOpenEdit?: (id: string) => void;
  onEnter: () => void;
  canRemove: boolean;
  shouldFocus: boolean;
  restrictions: PositionRestriction[];
  colorMap: Map<number, number>;
  trackRecognition: boolean;
  effectiveRank: number;
  showEditButton: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: player.id });
  const inputRef = useRef<HTMLInputElement>(null);
  const avoid = player.avoidPositions || [];
  const hasWalkOn = !!player.walkOnSong;

  useEffect(() => {
    if (shouldFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [shouldFocus]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Use effective rank for eligibility (absent players don't count)
  const eligibleFor = player.absent ? [] : restrictions.filter(r => r.enabled && effectiveRank <= r.topN).sort((a, b) => a.topN - b.topN);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        player.absent
          ? "bg-gray-100 border-gray-200 opacity-60"
          : "bg-white border-gray-300 hover:border-blue-400"
      } ${isDragging ? "shadow-lg z-10" : ""}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none"
        title="Drag to reorder"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="3" r="1.5" />
          <circle cx="11" cy="3" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="13" r="1.5" />
          <circle cx="11" cy="13" r="1.5" />
        </svg>
      </button>

      {/* Rank badge — colored by most restrictive eligible group */}
      <span
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
          player.absent
            ? "bg-gray-300"
            : eligibleFor.length > 0
            ? RESTRICTION_COLORS[colorMap.get(Math.min(...eligibleFor.map(r => r.topN))) ?? 0]?.badge || "bg-amber-500"
            : "bg-gray-400"
        }`}
      >
        {player.rank}
      </span>

      {/* Name input */}
      <input
        ref={inputRef}
        type="text"
        value={player.name}
        onChange={(e) => onRename(player.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder="Player name"
        className={`flex-1 bg-transparent border-none outline-none text-sm font-medium ${
          player.absent ? "line-through text-gray-400" : "text-gray-800"
        }`}
      />

      {/* Eligibility badges — colored by restriction group */}
      {eligibleFor.map((r) => {
        const colorIdx = colorMap.get(r.topN) ?? 0;
        const colors = RESTRICTION_COLORS[colorIdx] || RESTRICTION_COLORS[0];
        return (
          <span
            key={r.position}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}
          >
            {r.position}
          </span>
        );
      })}

      {/* Recognition toggle */}
      {trackRecognition && (
        <button
          onClick={() => onToggleRecognized(player.id)}
          className={`text-sm transition-colors ${
            player.recognized
              ? "text-yellow-500 hover:text-yellow-600"
              : "text-gray-300 hover:text-yellow-400"
          }`}
          title={player.recognized ? "Recognized this season" : "Not yet recognized"}
        >
          {player.recognized ? "\u2605" : "\u2606"}
        </button>
      )}

      {/* Absent toggle */}
      <button
        onClick={() => onToggleAbsent(player.id)}
        className={`text-xs px-2 py-1 rounded transition-colors ${
          player.absent
            ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
        }`}
      >
        {player.absent ? "Absent" : "Present"}
      </button>

      {/* Edit button — opens player detail modal */}
      {showEditButton && onOpenEdit && (
        <button
          onClick={() => onOpenEdit(player.id)}
          className={`text-xs px-1.5 py-1 rounded transition-colors flex items-center gap-1 ${
            avoid.length > 0 || hasWalkOn
              ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
          title="Edit player details"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          {hasWalkOn && <span title="Walk-on song set">♪</span>}
          {avoid.length > 0 && <span className="font-bold" title={`Avoiding: ${avoid.join(", ")}`}>{avoid.length}</span>}
        </button>
      )}

      {/* Remove button */}
      {canRemove && (
        <button
          onClick={() => {
            if (confirm(`Remove ${player.name || 'this player'} from the roster? This cannot be undone.`)) {
              onRemovePlayer(player.id);
            }
          }}
          className="text-gray-300 hover:text-red-500 transition-colors"
          title="Remove player"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="3" x2="11" y2="11" />
            <line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function RosterList({
  players,
  onReorder,
  onToggleAbsent,
  onToggleRecognized,
  onRename,
  onAddPlayer,
  onRemovePlayer,
  onSetAvoidPositions,
  onSetWalkOnSong,
  focusPlayerId,
  hideAddButton,
  maxPlayers = 13,
  restrictions = [],
  trackRecognition = false,
}: RosterListProps) {
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const showEditButton = !!(onSetAvoidPositions || onSetWalkOnSong);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sorted = [...players].sort((a, b) => a.rank - b.rank);
  const presentCount = sorted.filter((p) => !p.absent).length;
  const colorMap = buildColorMap(restrictions);

  // Compute effective rank: skip absent players when counting eligibility
  const effectiveRanks = new Map<string, number>();
  let effectiveCounter = 0;
  for (const p of sorted) {
    if (!p.absent) {
      effectiveCounter++;
      effectiveRanks.set(p.id, effectiveCounter);
    } else {
      effectiveRanks.set(p.id, Infinity); // absent = not eligible for anything
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sorted.findIndex((p) => p.id === active.id);
    const newIndex = sorted.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(sorted, oldIndex, newIndex);

    // Reassign ranks
    const updated = reordered.map((p, i) => ({ ...p, rank: i + 1 }));
    onReorder(updated);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-500">
          {presentCount} present / {sorted.length} total
          {presentCount < 10 && (
            <span className="text-red-500 font-medium ml-2">
              (need at least 10)
            </span>
          )}
          {presentCount > 13 && (
            <span className="text-red-500 font-medium ml-2">
              (max 13)
            </span>
          )}
        </div>
        {restrictions.filter(r => r.enabled).length > 0 && (
          <div className="flex gap-2 text-[10px] flex-wrap">
            {[...restrictions.filter(r => r.enabled)].sort((a, b) => a.topN - b.topN).map((r) => {
              const colorIdx = colorMap.get(r.topN) ?? 0;
              const colors = RESTRICTION_COLORS[colorIdx] || RESTRICTION_COLORS[0];
              return (
                <span key={r.position} className={`px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} font-bold whitespace-nowrap`}>
                  {r.position} eligible (top {r.topN})
                </span>
              );
            })}
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sorted.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {sorted.map((player) => (
              <SortablePlayer
                key={player.id}
                player={player}
                onToggleAbsent={onToggleAbsent}
                onToggleRecognized={onToggleRecognized || (() => {})}
                onRename={onRename}
                onRemovePlayer={onRemovePlayer}
                onOpenEdit={(id) => setEditingPlayerId(id)}
                showEditButton={showEditButton}
                onEnter={() => {
                  if (sorted.length < maxPlayers) {
                    onAddPlayer();
                  }
                }}
                canRemove={sorted.length > 10}
                shouldFocus={player.id === focusPlayerId}
                restrictions={restrictions}
                colorMap={colorMap}
                effectiveRank={effectiveRanks.get(player.id) ?? player.rank}
                trackRecognition={trackRecognition}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {!hideAddButton && sorted.length < maxPlayers && (
        <button
          onClick={onAddPlayer}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
        >
          + Add Player
        </button>
      )}

      {editingPlayerId && (() => {
        const editing = sorted.find((p) => p.id === editingPlayerId);
        if (!editing) return null;
        return (
          <PlayerEditModal
            player={editing}
            onClose={() => setEditingPlayerId(null)}
            onRename={onRename}
            onSetAvoidPositions={onSetAvoidPositions || (() => {})}
            onSetWalkOnSong={onSetWalkOnSong || (() => {})}
          />
        );
      })()}
    </div>
  );
}
