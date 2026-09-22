"use client";

import { motion, useReducedMotion } from "motion/react";

export function DismissRow({ leaving, children }: { leaving: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={false}
      animate={leaving ? { height: 0, opacity: 0 } : { height: "auto", opacity: 1 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }}
      style={{ overflow: "hidden" }}
    >
      {children}
    </motion.div>
  );
}
