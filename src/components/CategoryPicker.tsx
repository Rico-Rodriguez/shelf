"use client";

import { useState } from "react";

export type CatGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string }[];
};

export function CategorySelect({
  groups,
  value,
  onChange,
  emptyLabel,
}: {
  groups: CatGroup[];
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
}) {
  return (
    <select className="shelf-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {emptyLabel != null ? <option value="">{emptyLabel}</option> : null}
      {groups.map((group) => (
        <optgroup key={group.id} label={group.name}>
          {group.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function CategoryPicker({
  groups,
  value,
  onChange,
}: {
  groups: CatGroup[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = groups.flatMap((group) => group.categories).find((category) => category.id === value);

  return (
    <div>
      <button type="button" className="shelf-input text-left font-medium" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {current?.name ?? "Uncategorized"}
      </button>
      {open ? (
        <div className="mt-2 max-h-64 overflow-auto rounded-[12px] border border-[var(--line)] bg-[var(--paper)]">
          <button
            type="button"
            className={`block w-full px-3.5 py-2.5 text-left text-[15px] ${value ? "" : "font-semibold text-[var(--positive)]"}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Uncategorized
          </button>
          {groups.map((group) => (
            <div key={group.id}>
              <div className="px-3.5 pt-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--tertiary)]">{group.name}</div>
              {group.categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`block w-full px-3.5 py-2.5 text-left text-[15px] ${category.id === value ? "font-semibold text-[var(--positive)]" : ""}`}
                  onClick={() => {
                    onChange(category.id);
                    setOpen(false);
                  }}
                >
                  {category.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
