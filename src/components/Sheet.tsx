"use client";

import { Drawer } from "./ui/Drawer";

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Drawer title={title} onClose={onClose}>
      {children}
    </Drawer>
  );
}
