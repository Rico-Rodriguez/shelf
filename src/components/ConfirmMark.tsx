"use client";

import { motion, useReducedMotion } from "motion/react";

export function ConfirmMark({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className={`confirm-mark ${className}`.trim()}
      initial={reduce ? false : { scale: 0.82, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 28 }}
    >
      <svg viewBox="0 0 52 52" aria-hidden>
        <circle className="confirm-ring" cx="26" cy="26" r="23" />
        <path className="confirm-tick" d="M15 27.5 22.5 35 37.5 18" />
      </svg>
    </motion.span>
  );
}
