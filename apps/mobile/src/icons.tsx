import { Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

const stroke = {
  fill: "none" as const,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Icon({
  name,
  size = 22,
  color = "#1c1f24",
  filled = false,
}: {
  name: string;
  size?: number;
  color?: string;
  filled?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {glyph(name, filled, color)}
    </Svg>
  );
}

function glyph(name: string, filled: boolean, color: string) {
  if (filled) {
    if (name === "home") return <Path fill={color} d="M12 3.15 3 10.35V20.2c0 .72.58 1.3 1.3 1.3h5.15v-6.15h5.1V21.5H19.7c.72 0 1.3-.58 1.3-1.3V10.35L12 3.15Z" />;
    if (name === "list") {
      return (
        <>
          <Path fill={color} d="M8 6h12.2a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2Zm0 5h12.2a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2Zm0 5h12.2a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2Z" />
          <Circle cx="4.4" cy="7" r="1.45" fill={color} />
          <Circle cx="4.4" cy="12" r="1.45" fill={color} />
          <Circle cx="4.4" cy="17" r="1.45" fill={color} />
        </>
      );
    }
    if (name === "chart") return <Path fill={color} d="M3 20.2a1 1 0 0 1 1-1h16.2a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1ZM5.2 10.2a1.2 1.2 0 0 1 1.2-1.2h1.2A1.2 1.2 0 0 1 8.8 10.2V18H5.2v-7.8Zm5.2-5a1.2 1.2 0 0 1 1.2-1.2h1.2a1.2 1.2 0 0 1 1.2 1.2V18h-3.6V5.2Zm5.2 4.2a1.2 1.2 0 0 1 1.2-1.2h1.2a1.2 1.2 0 0 1 1.2 1.2V18h-3.6V9.4Z" />;
    if (name === "wallet") {
      return (
        <>
          <Path fill={color} d="M5.4 5.5h12.2A2.4 2.4 0 0 1 20 7.9v1.15H5.6A2.1 2.1 0 0 1 3.5 6.95 1.45 1.45 0 0 1 4.95 5.5h.45Zm-1.9 4.7h16.1c.72 0 1.3.58 1.3 1.3v7.2c0 .72-.58 1.3-1.3 1.3H5.4A2.4 2.4 0 0 1 3 17.6V10.2h.5Z" />
          <Circle cx="16.4" cy="14.6" r="1.15" fill="#ffffff" />
        </>
      );
    }
    if (name === "more") {
      return (
        <>
          <Rect x="4" y="4" width="6.5" height="6.5" rx="1.6" fill={color} />
          <Rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" fill={color} />
          <Rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" fill={color} />
          <Rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" fill={color} />
        </>
      );
    }
  }
  const pen = { ...stroke, stroke: color };
  if (name === "home") return <Path {...pen} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />;
  if (name === "list") {
    return (
      <>
        <Path {...pen} d="M8 7h12M8 12h12M8 17h12" />
        <Circle cx="4.5" cy="7" r="1.2" fill={color} />
        <Circle cx="4.5" cy="12" r="1.2" fill={color} />
        <Circle cx="4.5" cy="17" r="1.2" fill={color} />
      </>
    );
  }
  if (name === "chart") return <Path {...pen} d="M4 19V9m6 10V5m6 14v-7m6 7H3" />;
  if (name === "wallet") {
    return (
      <>
        <Path {...pen} d="M3 8.5A2.5 2.5 0 0 1 5.5 6H19v3M3 8.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9H5.5A2.5 2.5 0 0 1 3 8.5Z" />
        <Circle cx="16.5" cy="14.5" r="1.1" fill={color} />
      </>
    );
  }
  if (name === "more") {
    return (
      <>
        <Rect {...pen} x="4" y="4" width="6.5" height="6.5" rx="1.4" />
        <Rect {...pen} x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
        <Rect {...pen} x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
        <Rect {...pen} x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
      </>
    );
  }
  if (name === "chevron") return <Path {...pen} d="m9 6 6 6-6 6" />;
  if (name === "bell") {
    return (
      <>
        <Path {...pen} d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 7H4s2 0 2-7" />
        <Path {...pen} d="M10 19a2 2 0 0 0 4 0" />
      </>
    );
  }
  if (name === "gear") {
    return (
      <>
        <Circle {...pen} cx="12" cy="12" r="3" />
        <Path {...pen} d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4 6.2 17.8" />
      </>
    );
  }
  if (name === "spark") return <Path {...pen} d="M4 16.5 9 11l3.2 3L20 6.5" />;
  if (name === "flow") return <Path {...pen} d="M4 8h11M4 16h11M15 8l3-3 3 3M15 16l3 3 3-3" />;
  if (name === "calendar") return <Path {...pen} d="M7 4v3M17 4v3M4 9h16M6 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />;
  if (name === "flag") return <Path {...pen} d="M6 21V4m0 0h11l-2.5 4L17 12H6" />;
  return <Circle {...pen} cx="12" cy="12" r="8" />;
}

export function MerchantMark({ name, color }: { name: string; color?: string | null }) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#e7eaee" }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: color || "#1c1f24" }}>{initials || "?"}</Text>
    </View>
  );
}
