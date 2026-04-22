"use client";

import { useEffect, useRef, useState } from "react";

type TeamSummary = { id: number; name: string };

interface Props {
  teams: TeamSummary[];
  activeTeamId: number | null;
  activeTeamName: string;
  onSwitch: (teamId: number) => void;
  onCreate: (name: string) => void;
  onOpenSettings: () => void;
}

export default function TeamSwitcher({
  teams,
  activeTeamId,
  activeTeamName,
  onSwitch,
  onCreate,
  onOpenSettings,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [open]);

  function submitCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewName("");
    setCreating(false);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Switch team"
        className="text-gray-500 hover:text-[#002d62] text-sm px-1 select-none"
        aria-label="Switch team"
      >
        ▾
      </button>

      {open && (
        <div
          className="absolute left-0 top-6 z-20 min-w-[180px] rounded-md border border-gray-200 bg-white shadow-lg py-1"
          role="menu"
        >
          {teams.length > 0 && (
            <div className="max-h-48 overflow-y-auto">
              {teams.map((t) => {
                const isActive = t.id === activeTeamId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (!isActive) onSwitch(t.id);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 hover:bg-gray-100 ${
                      isActive ? "text-[#002d62] font-semibold" : "text-gray-700"
                    }`}
                  >
                    <span className="truncate">{t.name || activeTeamName}</span>
                    {isActive && <span className="text-[#002d62]">✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-gray-100 my-1" />

          {creating ? (
            <div className="px-2 py-1.5 flex items-center gap-1">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="Team name"
                maxLength={60}
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#002d62]"
              />
              <button
                type="button"
                onClick={submitCreate}
                className="text-xs bg-[#002d62] text-white px-2 py-1 rounded hover:bg-[#00204a]"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              + New team
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            ⚙ Team settings
          </button>
        </div>
      )}
    </div>
  );
}
