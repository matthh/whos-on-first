"use client";

import { Constraint } from "@/lib/constraints";

interface ConstraintsPanelProps {
  constraints: Constraint[];
  onToggle: (id: string) => void;
  onClose: () => void;
}

export default function ConstraintsPanel({
  constraints,
  onToggle,
  onClose,
}: ConstraintsPanelProps) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-bold text-sm text-gray-700">Scheduling Constraints</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          Close
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {constraints.map((c) => (
          <div
            key={c.id}
            className={`flex items-start gap-3 px-4 py-3 ${
              !c.enabled ? "opacity-50" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={c.enabled}
              onChange={() => onToggle(c.id)}
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
  );
}
