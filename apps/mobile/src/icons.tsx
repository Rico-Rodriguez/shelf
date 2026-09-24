import { Text, View } from "react-native";
import { shelfColor } from "./format";

type Mark = { size: number; color: string; filled: boolean };

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
  const mark = { size, color, filled };
  if (name === "home") return <Home {...mark} />;
  if (name === "list") return <List {...mark} />;
  if (name === "chart") return <Chart {...mark} />;
  if (name === "wallet") return <Wallet {...mark} />;
  if (name === "more") return <More {...mark} />;
  if (name === "chevron") return <Glyph size={size} color={color} text="›" />;
  if (name === "bell") return <Glyph size={size} color={color} text="◌" />;
  if (name === "gear") return <Glyph size={size} color={color} text="⚙" />;
  if (name === "search") return <Glyph size={size} color={color} text="⌕" />;
  if (name === "spark") return <Glyph size={size} color={color} text="↗" />;
  if (name === "calendar") return <Glyph size={size} color={color} text="▦" />;
  if (name === "flag") return <Glyph size={size} color={color} text="⚑" />;
  if (name === "flow") return <Glyph size={size} color={color} text="↕" />;
  return <Glyph size={size} color={color} text="•" />;
}

function Glyph({ size, color, text }: { size: number; color: string; text: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color, fontSize: size * 0.85, lineHeight: size }}>{text}</Text>
    </View>
  );
}

function Home({ size, color, filled }: Mark) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "flex-end" }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.38,
          borderRightWidth: size * 0.38,
          borderBottomWidth: size * 0.28,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.58,
          height: size * 0.38,
          marginTop: -1,
          backgroundColor: filled ? color : "transparent",
          borderWidth: filled ? 0 : 1.6,
          borderColor: color,
        }}
      />
    </View>
  );
}

function List({ size, color }: Mark) {
  return (
    <View style={{ width: size, height: size, justifyContent: "center", gap: size * 0.14 }}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={{ flexDirection: "row", alignItems: "center", gap: size * 0.12 }}>
          <View style={{ width: size * 0.14, height: size * 0.14, borderRadius: size, backgroundColor: color }} />
          <View style={{ flex: 1, height: 1.6, backgroundColor: color }} />
        </View>
      ))}
    </View>
  );
}

function Chart({ size, color, filled }: Mark) {
  const heights = [0.42, 0.72, 0.54];
  return (
    <View style={{ width: size, height: size, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
      {heights.map((height, index) => (
        <View
          key={index}
          style={{
            width: size * 0.22,
            height: size * height,
            backgroundColor: filled ? color : "transparent",
            borderWidth: filled ? 0 : 1.6,
            borderColor: color,
          }}
        />
      ))}
    </View>
  );
}

function Wallet({ size, color, filled }: Mark) {
  return (
    <View
      style={{
        width: size,
        height: size * 0.72,
        marginTop: size * 0.14,
        borderRadius: 4,
        borderWidth: filled ? 0 : 1.6,
        borderColor: color,
        backgroundColor: filled ? color : "transparent",
        justifyContent: "center",
        alignItems: "flex-end",
        paddingRight: size * 0.12,
      }}
    >
      <View style={{ width: size * 0.16, height: size * 0.16, borderRadius: size, backgroundColor: filled ? "#fff" : color }} />
    </View>
  );
}

function More({ size, color, filled }: Mark) {
  return (
    <View style={{ width: size, height: size, flexDirection: "row", flexWrap: "wrap", gap: size * 0.12 }}>
      {[0, 1, 2, 3].map((cell) => (
        <View
          key={cell}
          style={{
            width: size * 0.38,
            height: size * 0.38,
            borderRadius: 3,
            borderWidth: filled ? 0 : 1.6,
            borderColor: color,
            backgroundColor: filled ? color : "transparent",
          }}
        />
      ))}
    </View>
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
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tint ? `${tint}22` : "#e8ecf0",
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", letterSpacing: -0.2, color: tint || "#14181f" }}>{initials || "?"}</Text>
    </View>
  );
}
