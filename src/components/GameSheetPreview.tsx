"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Player, GameSheet } from "@/lib/types";
import { validateGameSheet } from "@/lib/scheduler";
import { ConstraintConfig } from "@/lib/constraints";

interface GameSheetPreviewProps {
  players: Player[];
  sheet: GameSheet;
  violations: string[];
  teamName: string;
  logoDataUrl?: string | null;
  innings: number;
  config: ConstraintConfig;
  onExportPDF: (opposingTeam: string, isHome: boolean, gameDate: string) => void;
  onExportWalkUpSheet?: (opposingTeam: string, isHome: boolean, gameDate: string) => void;
  onRerun: () => void;
  onStartOver: () => void;
  onSheetChange: (sheet: GameSheet, violations: string[]) => void;
}

// ── Draggable cell ──

function DraggableCell({
  id,
  playerId,
  inning,
  assignment,
  isSwapSource,
  isSwapTarget,
  isDragSource,
}: {
  id: string;
  playerId: string;
  inning: number;
  assignment: string;
  isSwapSource: boolean;
  isSwapTarget: boolean;
  isDragSource: boolean;
}) {
  const isBench = assignment === "Bench";
  const display =
    assignment === "Rover" ? "ROV" : assignment === "Bench" ? "BENCH" : assignment;

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    data: { playerId, inning, assignment },
    disabled: isBench,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${id}`,
    data: { playerId, inning, assignment },
    disabled: isBench,
  });

  return (
    <td
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      {...attributes}
      {...listeners}
      className={`px-3 py-2 text-center font-bold border border-gray-300 whitespace-nowrap select-none transition-colors ${
        isBench
          ? "bg-gray-300 text-gray-500"
          : isDragging
            ? "opacity-30"
            : isOver && !isBench
              ? "bg-blue-100 ring-2 ring-blue-400"
              : isDragSource
                ? "bg-amber-100"
                : "text-gray-700"
      } ${!isBench ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ touchAction: "none" }}
    >
      {display}
    </td>
  );
}

// ── Player name cell (for full swap) ──

function PlayerNameCell({
  player,
  isSelected,
  onClick,
}: {
  player: Player;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <td
      onClick={onClick}
      className={`px-3 py-2 font-bold border border-gray-300 whitespace-nowrap cursor-pointer select-none transition-colors ${
        isSelected
          ? "bg-[#002d62] text-white"
          : "text-gray-700 hover:bg-blue-50"
      }`}
      title="Click two players to swap all their positions"
    >
      {player.name.toUpperCase()}
    </td>
  );
}

// ── Main component ──

export default function GameSheetPreview({
  players,
  sheet: initialSheet,
  violations: initialViolations,
  teamName,
  logoDataUrl,
  innings,
  config,
  onExportPDF,
  onExportWalkUpSheet,
  onRerun,
  onStartOver,
  onSheetChange,
}: GameSheetPreviewProps) {
  const present = players.filter((p) => !p.absent).sort((a, b) => a.rank - b.rank);
  const absent = players.filter((p) => p.absent).sort((a, b) => a.rank - b.rank);

  // Mutable sheet state
  const [editedSheet, setEditedSheet] = useState<GameSheet>(() =>
    initialSheet.map((inn) => ({ ...inn }))
  );
  const [currentViolations, setCurrentViolations] = useState<string[]>(initialViolations);
  const [editCount, setEditCount] = useState(0);

  // Reset when parent provides a new sheet (e.g., rerun)
  useEffect(() => {
    setEditedSheet(initialSheet.map((inn) => ({ ...inn })));
    setCurrentViolations(initialViolations);
    setEditCount(0);
    setSelectedPlayer(null);
  }, [initialSheet, initialViolations]);

  // Full-player swap state
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // Opposing team + home/away for the PDF scorecard
  const [opposingTeam, setOpposingTeam] = useState("");
  const [isHome, setIsHome] = useState(true);
  const [gameDate, setGameDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  const formatGameDate = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y.slice(-2)}`;
  };

  const opponentLabel = opposingTeam.trim().toUpperCase();
  const usLabel = teamName.toUpperCase();
  const dateLabel = formatGameDate(gameDate);
  const matchupLabel = opponentLabel
    ? isHome
      ? `${opponentLabel} AT ${usLabel}`
      : `${usLabel} AT ${opponentLabel}`
    : usLabel;
  const headerTitle = opponentLabel && dateLabel
    ? `${matchupLabel} ${dateLabel} - DEFENSIVE POSITIONS`
    : `${matchupLabel} - DEFENSIVE POSITIONS`;

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<{
    playerId: string;
    inning: number;
    assignment: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Validate and propagate changes
  const applyEdit = useCallback(
    (newSheet: GameSheet) => {
      const v = validateGameSheet(newSheet, present, config);
      setEditedSheet(newSheet);
      setCurrentViolations(v);
      setEditCount((c) => c + 1);
      onSheetChange(newSheet, v);
    },
    [present, config, onSheetChange]
  );

  // Full player swap: click two names
  const handlePlayerClick = useCallback(
    (playerId: string) => {
      if (selectedPlayer === null) {
        setSelectedPlayer(playerId);
        return;
      }

      if (selectedPlayer === playerId) {
        setSelectedPlayer(null);
        return;
      }

      // Swap ALL assignments between the two players
      const newSheet = editedSheet.map((inn) => {
        const copy = { ...inn };
        const a = copy[selectedPlayer];
        const b = copy[playerId];
        copy[selectedPlayer] = b;
        copy[playerId] = a;
        return copy;
      });

      setSelectedPlayer(null);
      applyEdit(newSheet);
    },
    [selectedPlayer, editedSheet, applyEdit]
  );

  // Drag handlers for single-cell swap
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as {
      playerId: string;
      inning: number;
      assignment: string;
    };
    setActiveDragId(event.active.id as string);
    setActiveDragData(data);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      setActiveDragData(null);

      const { active, over } = event;
      if (!over || !active.data.current || !over.data.current) return;

      const source = active.data.current as {
        playerId: string;
        inning: number;
        assignment: string;
      };
      const target = over.data.current as {
        playerId: string;
        inning: number;
        assignment: string;
      };

      // Only swap within the same inning
      if (source.inning !== target.inning) return;
      // Don't swap with self
      if (source.playerId === target.playerId) return;
      // Don't swap with bench
      if (target.assignment === "Bench" || source.assignment === "Bench") return;

      // Swap positions for this inning
      const newSheet = editedSheet.map((inn, i) => {
        if (i !== source.inning) return inn;
        const copy = { ...inn };
        copy[source.playerId] = target.assignment;
        copy[target.playerId] = source.assignment;
        return copy;
      });

      applyEdit(newSheet);
    },
    [editedSheet, applyEdit]
  );

  // Undo: reset to original
  const handleReset = useCallback(() => {
    setEditedSheet(initialSheet.map((inn) => ({ ...inn })));
    setCurrentViolations(initialViolations);
    setEditCount(0);
    setSelectedPlayer(null);
  }, [initialSheet, initialViolations]);

  return (
    <div className="space-y-4">
      {/* Violations */}
      {currentViolations.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <h3 className="text-sm font-bold text-red-700 mb-1">
            Constraint Violations ({currentViolations.length})
          </h3>
          <ul className="text-xs text-red-600 space-y-0.5">
            {currentViolations.map((v, i) => (
              <li key={i}>- {v}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Title matching PDF style */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          {logoDataUrl && (
            <img
              src={logoDataUrl}
              alt="Logo"
              className="w-8 h-8 object-contain"
            />
          )}
          <h2 className="text-lg font-bold text-gray-600 tracking-wide whitespace-nowrap">
            {headerTitle}
          </h2>
        </div>
        <div className="h-0.5 bg-amber-500 mx-8 mt-1" />
      </div>

      {/* Edit hint */}
      <div className="text-center text-[10px] text-gray-400">
        Click two player names to swap all positions &middot; Drag a position cell to swap within an inning
        {selectedPlayer && (
          <span className="ml-2 text-[#002d62] font-bold">
            Select second player to swap with{" "}
            {present.find((p) => p.id === selectedPlayer)?.name.toUpperCase()}
            {" "}
            <button
              onClick={() => setSelectedPlayer(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              (cancel)
            </button>
          </span>
        )}
      </div>

      {/* Game sheet table with drag-and-drop */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-200">
                <th className="px-3 py-2 text-left font-bold text-gray-600 border border-gray-300 whitespace-nowrap">
                  PLAYER
                </th>
                {Array.from({ length: innings }, (_, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-center font-bold text-gray-600 border border-gray-300 whitespace-nowrap"
                  >
                    INN {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {present.map((player) => (
                <tr key={player.id} className="border border-gray-300">
                  <PlayerNameCell
                    player={player}
                    isSelected={selectedPlayer === player.id}
                    onClick={() => handlePlayerClick(player.id)}
                  />
                  {Array.from({ length: innings }, (_, inn) => {
                    const assignment =
                      editedSheet[inn][player.id] || "—";
                    const cellId = `${player.id}-${inn}`;
                    return (
                      <DraggableCell
                        key={cellId}
                        id={cellId}
                        playerId={player.id}
                        inning={inn}
                        assignment={assignment}
                        isSwapSource={selectedPlayer === player.id}
                        isSwapTarget={
                          selectedPlayer !== null &&
                          selectedPlayer !== player.id
                        }
                        isDragSource={activeDragId === cellId}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeDragData && (
            <div className="bg-[#002d62] text-white px-3 py-2 rounded font-bold text-sm shadow-lg">
              {activeDragData.assignment === "Rover"
                ? "ROV"
                : activeDragData.assignment}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Absent players */}
      {absent.length > 0 && (
        <div className="text-sm text-gray-400">
          <span className="font-medium">Absent: </span>
          {absent.map((p) => p.name).join(", ")}
        </div>
      )}

      {/* Game matchup — populates the scorecard TEAM rows in the PDF */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end pt-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Opposing team
          <input
            type="text"
            value={opposingTeam}
            onChange={(e) => setOpposingTeam(e.target.value)}
            placeholder="e.g., Tigers"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#002d62]/30"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Game date
          <input
            type="date"
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#002d62]/30"
          />
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          We are
          <div className="inline-flex rounded-md overflow-hidden border border-gray-300 text-sm font-bold">
            <button
              type="button"
              onClick={() => setIsHome(true)}
              className={`px-4 py-2 transition-colors ${
                isHome ? "bg-[#002d62] text-white" : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => setIsHome(false)}
              className={`px-4 py-2 transition-colors ${
                !isHome ? "bg-[#002d62] text-white" : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Away
            </button>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onExportPDF(opposingTeam.trim(), isHome, gameDate)}
          className="flex-1 py-3 rounded-lg font-bold text-white text-sm bg-[#002d62] hover:bg-[#003d82] active:bg-[#001d42] transition-colors whitespace-nowrap"
        >
          Export to PDF
        </button>
        {onExportWalkUpSheet && (
          <button
            onClick={() => onExportWalkUpSheet(opposingTeam.trim(), isHome, gameDate)}
            className="flex-1 py-3 rounded-lg font-bold text-sm border-2 border-[#002d62] text-[#002d62] hover:bg-[#002d62] hover:text-white transition-colors whitespace-nowrap"
            title="Printable list of players + walk-on songs to share with parents"
          >
            Walk-on Song Sheet
          </button>
        )}
        <button
          onClick={onRerun}
          className="flex-1 py-3 rounded-lg font-bold text-sm border-2 border-[#002d62] text-[#002d62] hover:bg-[#002d62] hover:text-white transition-colors whitespace-nowrap"
        >
          Rerun Schedule
        </button>
        {editCount > 0 && (
          <button
            onClick={handleReset}
            className="py-3 px-4 rounded-lg font-bold text-sm border-2 border-amber-400 text-amber-600 hover:bg-amber-50 transition-colors whitespace-nowrap"
          >
            Reset Edits ({editCount})
          </button>
        )}
        <button
          onClick={onStartOver}
          className="flex-1 py-3 rounded-lg font-bold text-sm border-2 border-gray-400 text-gray-500 hover:bg-gray-100 transition-colors whitespace-nowrap"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
