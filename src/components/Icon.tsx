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
}: {
  name: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {glyph(name)}
    </svg>
  );
}

function glyph(name: string) {
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
