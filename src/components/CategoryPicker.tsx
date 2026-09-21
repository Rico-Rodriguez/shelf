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
    <select className="pixel-input" value={value} onChange={(e) => onChange(e.target.value)}>
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
      <button type="button" className="pixel-input text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {current?.name ?? "Uncategorized"}
      </button>
      {open ? (
        <div className="mt-2 max-h-64 overflow-auto rounded-[16px] bg-white">
          <button
            type="button"
            className={`block w-full px-3 py-2 text-left text-[17px] ${value ? "" : "font-semibold text-[var(--terracotta)]"}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Uncategorized
          </button>
          {groups.map((group) => (
            <div key={group.id}>
              <div className="px-3 pt-3 text-[13px] text-[var(--muted)]">{group.name}</div>
              {group.categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-[17px] ${category.id === value ? "font-semibold text-[var(--terracotta)]" : ""}`}
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
