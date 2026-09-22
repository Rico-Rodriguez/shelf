const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Icon({
  name,
  size = 22,
  title,
  filled = false,
}: {
  name: string;
  size?: number;
  title?: string;
  filled?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {glyph(name, filled)}
    </svg>
  );
}

function glyph(name: string, filled: boolean) {
  if (filled) {
    switch (name) {
      case "home":
        return <path fill="currentColor" d="M12 3.15 3 10.35V20.2c0 .72.58 1.3 1.3 1.3h5.15v-6.15h5.1V21.5H19.7c.72 0 1.3-.58 1.3-1.3V10.35L12 3.15Z" />;
      case "list":
        return (
          <>
            <path fill="currentColor" d="M8 6h12.2a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2Zm0 5h12.2a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2Zm0 5h12.2a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2Z" />
            <circle cx="4.4" cy="7" r="1.45" fill="currentColor" />
            <circle cx="4.4" cy="12" r="1.45" fill="currentColor" />
            <circle cx="4.4" cy="17" r="1.45" fill="currentColor" />
          </>
        );
      case "chart":
        return <path fill="currentColor" d="M3 20.2a1 1 0 0 1 1-1h16.2a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1ZM5.2 10.2a1.2 1.2 0 0 1 1.2-1.2h1.2A1.2 1.2 0 0 1 8.8 10.2V18H5.2v-7.8Zm5.2-5a1.2 1.2 0 0 1 1.2-1.2h1.2a1.2 1.2 0 0 1 1.2 1.2V18h-3.6V5.2Zm5.2 4.2a1.2 1.2 0 0 1 1.2-1.2h1.2a1.2 1.2 0 0 1 1.2 1.2V18h-3.6V9.4Z" />;
      case "wallet":
        return (
          <>
            <path fill="currentColor" d="M5.4 5.5h12.2A2.4 2.4 0 0 1 20 7.9v1.15H5.6A2.1 2.1 0 0 1 3.5 6.95 1.45 1.45 0 0 1 4.95 5.5h.45Zm-1.9 4.7h16.1c.72 0 1.3.58 1.3 1.3v7.2c0 .72-.58 1.3-1.3 1.3H5.4A2.4 2.4 0 0 1 3 17.6V10.2h.5Z" />
            <circle cx="16.4" cy="14.6" r="1.15" fill="var(--paper)" />
          </>
        );
      case "gear":
        return <path fill="currentColor" d="M10.2 2.8h3.6l.45 2.05a6.2 6.2 0 0 1 1.55.9l1.95-.85 1.8 3.1-1.5 1.4a6.4 6.4 0 0 1 0 1.8l1.5 1.4-1.8 3.1-1.95-.85a6.2 6.2 0 0 1-1.55.9l-.45 2.05h-3.6l-.45-2.05a6.2 6.2 0 0 1-1.55-.9l-1.95.85-1.8-3.1 1.5-1.4a6.4 6.4 0 0 1 0-1.8l-1.5-1.4 1.8-3.1 1.95.85a6.2 6.2 0 0 1 1.55-.9l.45-2.05ZM12 9.1A2.9 2.9 0 1 0 12 14.9 2.9 2.9 0 0 0 12 9.1Z" />;
      case "more":
        return (
          <>
            <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" fill="currentColor" />
            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" fill="currentColor" />
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" fill="currentColor" />
            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" fill="currentColor" />
          </>
        );
      default:
        break;
    }
  }
  switch (name) {
    case "home":
      return <path {...stroke} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />;
    case "list":
      return (
        <>
          <path {...stroke} d="M8 7h12M8 12h12M8 17h12" />
          <circle cx="4.5" cy="7" r="1.2" fill="currentColor" />
          <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
          <circle cx="4.5" cy="17" r="1.2" fill="currentColor" />
        </>
      );
    case "chart":
      return <path {...stroke} d="M4 19V9m6 10V5m6 14v-7m6 7H3" />;
    case "wallet":
      return (
        <>
          <path {...stroke} d="M3 8.5A2.5 2.5 0 0 1 5.5 6H19v3M3 8.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9H5.5A2.5 2.5 0 0 1 3 8.5Z" />
          <circle cx="16.5" cy="14.5" r="1.1" fill="currentColor" />
        </>
      );
    case "more":
      return (
        <>
          <rect {...stroke} x="4" y="4" width="6.5" height="6.5" rx="1.4" />
          <rect {...stroke} x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
          <rect {...stroke} x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
          <rect {...stroke} x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
        </>
      );
    case "calendar":
      return <path {...stroke} d="M7 4v3M17 4v3M4 9h16M6 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />;
    case "flow":
      return <path {...stroke} d="M4 8h11M4 16h11M15 8l3-3 3 3M15 16l3 3 3-3" />;
    case "leaf":
      return <path {...stroke} d="M5 19c8-1 13-8 14-15-7 1-14 6-14 15Z M8 12c3 2 6 3 9 3" />;
    case "flag":
      return <path {...stroke} d="M6 21V4m0 0h11l-2.5 4L17 12H6" />;
    case "gear":
      return (
        <>
          <circle {...stroke} cx="12" cy="12" r="3" />
          <path {...stroke} d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4 6.2 17.8" />
        </>
      );
    case "lock":
      return (
        <>
          <rect {...stroke} x="6" y="11" width="12" height="9" rx="2" />
          <path {...stroke} d="M9 11V8a3 3 0 0 1 6 0v3" />
        </>
      );
    case "check":
      return <path {...stroke} d="M5 12.5 9.5 17 19 7.5" />;
    case "chevron":
      return <path {...stroke} d="m9 6 6 6-6 6" />;
    case "info":
      return (
        <>
          <circle {...stroke} cx="12" cy="12" r="8" />
          <path {...stroke} d="M12 11v5" />
          <circle cx="12" cy="8" r="0.9" fill="currentColor" />
        </>
      );
    case "search":
      return (
        <>
          <circle {...stroke} cx="11" cy="11" r="6" />
          <path {...stroke} d="m20 20-3.5-3.5" />
        </>
      );
    case "filter":
      return <path {...stroke} d="M4 6h16M7 12h10M10 18h4" />;
    case "spark":
      return <path {...stroke} d="M4 16.5 9 11l3.2 3L20 6.5" />;
    case "bell":
      return (
        <>
          <path {...stroke} d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 7H4s2 0 2-7" />
          <path {...stroke} d="M10 19a2 2 0 0 0 4 0" />
        </>
      );
    default:
      return <circle {...stroke} cx="12" cy="12" r="8" />;
  }
}
