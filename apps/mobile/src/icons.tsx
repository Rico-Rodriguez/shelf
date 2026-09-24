import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Text, View } from "react-native";
import { shelfColor } from "./format";

type Mark = { size: number; color: string; filled: boolean };

const STROKE = 1.75;

export function Icon({
  name,
  size = 22,
  color = "#14181f",
  filled = false,
}: {
  name: string;
  size?: number;
  color?: string;
  filled?: boolean;
}) {
  const mark = { size, color, filled };
  if (name === "home") return <Home {...mark} />;
  if (name === "list") return <List {...mark} />;
  if (name === "chart") return <Chart {...mark} />;
  if (name === "wallet") return <Wallet {...mark} />;
  if (name === "more") return <More {...mark} />;
  if (name === "chevron") return <Glyph size={size} color={color} d="M9 6.5 15 12 9 17.5" />;
  if (name === "search") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={11} cy={11} r={6.25} stroke={color} strokeWidth={STROKE} fill="none" />
        <Path d="M15.8 15.8 20 20" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      </Svg>
    );
  }
  if (name === "gear") return <Gear size={size} color={color} />;
  if (name === "bell") return <Bell size={size} color={color} />;
  if (name === "calendar") return <Calendar size={size} color={color} />;
  if (name === "flag") return <Glyph size={size} color={color} d="M6 20.5V4.5h11l-2.6 4 2.6 4H6" />;
  if (name === "spark") return <Glyph size={size} color={color} d="M4 16.5 9 11l3.2 3L20 6.5" />;
  if (name === "flow") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M4 8h11M15 8l3-3 3 3M4 16h11M15 16l3 3 3-3" stroke={color} strokeWidth={STROKE} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={STROKE} fill="none" />
    </Svg>
  );
}

function Glyph({ size, color, d }: { size: number; color: string; d: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} stroke={color} strokeWidth={STROKE} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Home({ size, color, filled }: Mark) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.4Z"
        stroke={filled ? "none" : color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
    </Svg>
  );
}

function List({ size, color, filled }: Mark) {
  const sw = filled ? 2.25 : STROKE;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 7h11M9 12h11M9 17h11" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Circle cx={5} cy={7} r={filled ? 1.5 : 1.15} fill={color} />
      <Circle cx={5} cy={12} r={filled ? 1.5 : 1.15} fill={color} />
      <Circle cx={5} cy={17} r={filled ? 1.5 : 1.15} fill={color} />
    </Svg>
  );
}

function Chart({ size, color, filled }: Mark) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={12} width={4} height={8} rx={1.2} fill={filled ? color : "none"} stroke={color} strokeWidth={filled ? 0 : STROKE} />
      <Rect x={10} y={6} width={4} height={14} rx={1.2} fill={filled ? color : "none"} stroke={color} strokeWidth={filled ? 0 : STROKE} />
      <Rect x={16} y={9} width={4} height={11} rx={1.2} fill={filled ? color : "none"} stroke={color} strokeWidth={filled ? 0 : STROKE} />
    </Svg>
  );
}

function Wallet({ size, color, filled }: Mark) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5v-9Z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={filled ? 0 : STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={16.5} cy={13} r={1.15} fill={filled ? "#fff" : color} />
    </Svg>
  );
}

function More({ size, color, filled }: Mark) {
  const cells = [
    [4, 4],
    [13, 4],
    [4, 13],
    [13, 13],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {cells.map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={7} height={7} rx={2} fill={filled ? color : "none"} stroke={color} strokeWidth={filled ? 0 : STROKE} />
      ))}
    </Svg>
  );
}

function Gear({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={STROKE} fill="none" />
      <Path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function Bell({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 16V11a6 6 0 1 1 12 0v5l1.2 1.6H4.8L6 16Z" stroke={color} strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <Path d="M10 19.2a2 2 0 0 0 4 0" stroke={color} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function Calendar({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={5.5} width={16} height={14.5} rx={2.5} stroke={color} strokeWidth={STROKE} fill="none" />
      <Path d="M8 3.8v3.2M16 3.8v3.2M4 10h16" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function MerchantMark({ name, color }: { name: string; color?: string | null }) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const tint = color ? shelfColor(color) : "";
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tint ? `${tint}22` : "#e8ecf0",
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", letterSpacing: -0.2, color: tint || "#14181f" }}>{initials || "?"}</Text>
    </View>
  );
}
