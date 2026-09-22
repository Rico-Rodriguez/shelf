export function ConfirmMark({ className = "" }: { className?: string }) {
  return (
    <span className={`confirm-mark ${className}`.trim()}>
      <svg viewBox="0 0 52 52" aria-hidden>
        <circle className="confirm-ring" cx="26" cy="26" r="23" />
        <path className="confirm-tick" d="M15 27.5 22.5 35 37.5 18" />
      </svg>
    </span>
  );
}
