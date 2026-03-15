"use client";

import { useEffect, useRef } from "react";
import { Player } from "@/lib/types";
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

interface RosterListProps {
  players: Player[];
  onReorder: (players: Player[]) => void;
  onToggleAbsent: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onAddPlayer: () => void;
  onRemovePlayer: (id: string) => void;
  /** ID of player whose name input should be focused */
  focusPlayerId?: string | null;
  /** Hide the Add Player button (e.g. when parent shows its own) */
  hideAddButton?: boolean;
  /** Max players allowed */
  maxPlayers?: number;
}

function SortablePlayer({
  player,
  onToggleAbsent,
  onRename,
  onRemovePlayer,
  onEnter,
  canRemove,
  shouldFocus,
}: {
  player: Player;
  onToggleAbsent: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemovePlayer: (id: string) => void;
  onEnter: () => void;
  canRemove: boolean;
  shouldFocus: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: player.id });
  const inputRef = useRef<HTMLInputElement>(null);

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

  const isTop4 = player.rank <= 4;
  const isTop6 = player.rank <= 6;

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

      {/* Rank badge */}
      <span
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
          isTop4
            ? "bg-amber-500"
            : isTop6
            ? "bg-blue-500"
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

      {/* Eligibility badges */}
      {isTop4 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
          1B
        </span>
      )}
      {isTop6 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
          P
        </span>
      )}

      {/* Absent toggle */}
      <button
        onClick={() => onToggleAbsent(player.id)}
        className={`text-xs px-2 py-1 rounded transition-colors ${
          player.absent
            ? "bg-red-100 text-red-700 hover:bg-red-200"
            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
        }`}
      >
        {player.absent ? "Absent" : "Present"}
      </button>

      {/* Remove button */}
      {canRemove && (
        <button
          onClick={() => onRemovePlayer(player.id)}
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
  onRename,
  onAddPlayer,
  onRemovePlayer,
  focusPlayerId,
  hideAddButton,
  maxPlayers = 13,
}: RosterListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sorted = [...players].sort((a, b) => a.rank - b.rank);
  const presentCount = sorted.filter((p) => !p.absent).length;

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
        <div className="flex gap-2 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">
            1B eligible (top 4)
          </span>
          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">
            P eligible (top 6)
          </span>
        </div>
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
                onRename={onRename}
                onRemovePlayer={onRemovePlayer}
                onEnter={() => {
                  if (sorted.length < maxPlayers) {
                    onAddPlayer();
                  }
                }}
                canRemove={sorted.length > 10}
                shouldFocus={player.id === focusPlayerId}
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
    </div>
  );
}
