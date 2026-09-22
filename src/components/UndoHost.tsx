"use client";

import { useEffect, useState } from "react";

type Offer = { label: string; undo: () => Promise<void> };

let pushOffer: (offer: Offer) => void = () => undefined;

export function offerUndo(label: string, undo: () => Promise<void>) {
  pushOffer({ label, undo });
}

export function UndoHost() {
  const [offer, setOffer] = useState<Offer | null>(null);

  useEffect(() => {
    pushOffer = setOffer;
    return () => {
      pushOffer = () => undefined;
    };
  }, []);

  useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(() => setOffer(null), 5000);
    return () => window.clearTimeout(timer);
  }, [offer]);

  if (!offer) return null;

  return (
    <div className="undo-bar" role="status">
      <span>{offer.label}</span>
      <button
        type="button"
        onClick={() => {
          const run = offer.undo;
          setOffer(null);
          void run();
        }}
      >
        Undo
      </button>
    </div>
  );
}
