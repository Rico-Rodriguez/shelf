import { ReactNode } from "react";
import { Text, View, ViewStyle } from "react-native";
import { shelfColor } from "./format";

type Mark = { size: number; color: string; filled: boolean };

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
  if (name === "chevron") return <StrokeIcon size={size}>{lines(size, color, [[9, 6, 15, 12], [15, 12, 9, 18]])}</StrokeIcon>;
  if (name === "search") {
    return (
      <StrokeIcon size={size}>
        <Ring size={size} cx={11} cy={11} r={6} color={color} />
        {lines(size, color, [[16.2, 16.2, 20, 20]])}
      </StrokeIcon>
    );
  }
  if (name === "gear") {
    return (
      <StrokeIcon size={size}>
        <Ring size={size} cx={12} cy={12} r={3} color={color} />
        {lines(size, color, [
          [12, 3, 12, 5],
          [12, 19, 12, 21],
          [3, 12, 5, 12],
          [19, 12, 21, 12],
          [6.2, 6.2, 7.6, 7.6],
          [16.4, 16.4, 17.8, 17.8],
          [17.8, 6.2, 16.4, 7.6],
          [7.6, 16.4, 6.2, 17.8],
        ])}
      </StrokeIcon>
    );
  }
  if (name === "bell") {
    return (
      <StrokeIcon size={size}>
        <View style={frame(size, 6, 4, 12, 12, color, { borderTopLeftRadius: size * 0.28, borderTopRightRadius: size * 0.28, borderBottomWidth: 0 })} />
        {lines(size, color, [[4, 16, 20, 16]])}
        <View style={frame(size, 10, 17.2, 4, 2.4, color, { borderRadius: size })} />
      </StrokeIcon>
    );
  }
  if (name === "calendar") {
    return (
      <StrokeIcon size={size}>
        <View style={frame(size, 4, 6, 16, 14, color, { borderRadius: size * 0.08 })} />
        {lines(size, color, [
          [7, 4, 7, 7],
          [17, 4, 17, 7],
          [4, 10, 20, 10],
        ])}
      </StrokeIcon>
    );
  }
  if (name === "flag") {
    return <StrokeIcon size={size}>{lines(size, color, [[6, 21, 6, 4], [6, 4, 17, 4], [17, 4, 14.5, 8], [14.5, 8, 17, 12], [17, 12, 6, 12]])}</StrokeIcon>;
  }
  if (name === "spark") return <StrokeIcon size={size}>{lines(size, color, [[4, 16.5, 9, 11], [9, 11, 12.2, 14], [12.2, 14, 20, 6.5]])}</StrokeIcon>;
  if (name === "flow") {
    return (
      <StrokeIcon size={size}>
        {lines(size, color, [
          [4, 8, 15, 8],
          [4, 16, 15, 16],
          [15, 8, 18, 5],
          [18, 5, 21, 8],
          [15, 16, 18, 19],
          [18, 19, 21, 16],
        ])}
      </StrokeIcon>
    );
  }
  return <Ring size={size} cx={12} cy={12} r={8} color={color} />;
}

function StrokeIcon({ size, children }: { size: number; children: ReactNode }) {
  return <View style={{ width: size, height: size }}>{children}</View>;
}

function lines(size: number, color: string, segments: number[][]) {
  return segments.map(([x1, y1, x2, y2], index) => <View key={index} style={stroke(size, x1, y1, x2, y2, color)} />);
}

function stroke(size: number, x1: number, y1: number, x2: number, y2: number, color: string): ViewStyle {
  const scale = size / 24;
  const dx = (x2 - x1) * scale;
  const dy = (y2 - y1) * scale;
  const length = Math.hypot(dx, dy);
  const weight = Math.max(1.6, size * 0.075);
  return {
    position: "absolute",
    left: ((x1 + x2) / 2) * scale - length / 2,
    top: ((y1 + y2) / 2) * scale - weight / 2,
    width: length,
    height: weight,
    borderRadius: weight,
    backgroundColor: color,
    transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
  };
}

function Ring({ size, cx, cy, r, color, fill = false }: { size: number; cx: number; cy: number; r: number; color: string; fill?: boolean }) {
  const scale = size / 24;
  const diameter = r * 2 * scale;
  const weight = Math.max(1.6, size * 0.075);
  return (
    <View
      style={{
        position: "absolute",
        left: (cx - r) * scale,
        top: (cy - r) * scale,
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        borderWidth: fill ? 0 : weight,
        borderColor: color,
        backgroundColor: fill ? color : "transparent",
      }}
    />
  );
}

function frame(size: number, x: number, y: number, width: number, height: number, color: string, extra: ViewStyle): ViewStyle {
  const scale = size / 24;
  const weight = Math.max(1.6, size * 0.075);
  return {
    position: "absolute",
    left: x * scale,
    top: y * scale,
    width: width * scale,
    height: height * scale,
    borderWidth: weight,
    borderColor: color,
    backgroundColor: "transparent",
    ...extra,
  };
}

function Home({ size, color, filled }: Mark) {
  if (!filled) {
    return (
      <StrokeIcon size={size}>
        {lines(size, color, [
          [4, 10.5, 12, 4],
          [12, 4, 20, 10.5],
          [20, 10.5, 20, 20],
          [20, 20, 14, 20],
          [14, 20, 14, 14],
          [14, 14, 10, 14],
          [10, 14, 10, 20],
          [10, 20, 4, 20],
          [4, 20, 4, 10.5],
        ])}
      </StrokeIcon>
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "flex-end" }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.42,
          borderRightWidth: size * 0.42,
          borderBottomWidth: size * 0.32,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: color,
        }}
      />
      <View style={{ width: size * 0.62, height: size * 0.4, marginTop: -1, backgroundColor: color }} />
    </View>
  );
}

function List({ size, color, filled }: Mark) {
  return (
    <View style={{ width: size, height: size, justifyContent: "center", gap: size * 0.16 }}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={{ flexDirection: "row", alignItems: "center", gap: size * 0.14 }}>
          <View style={{ width: size * 0.12, height: size * 0.12, borderRadius: size, backgroundColor: color }} />
          <View style={{ flex: 1, height: filled ? size * 0.1 : 1.7, borderRadius: 2, backgroundColor: color }} />
        </View>
      ))}
    </View>
  );
}

function Chart({ size, color, filled }: Mark) {
  const heights = [0.45, 0.78, 0.58];
  return (
    <View style={{ width: size, height: size, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
      {heights.map((height, index) => (
        <View
          key={index}
          style={{
            width: size * 0.2,
            height: size * height,
            borderRadius: 2,
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
        borderRadius: size * 0.16,
        borderWidth: filled ? 0 : 1.6,
        borderColor: color,
        backgroundColor: filled ? color : "transparent",
        justifyContent: "center",
        alignItems: "flex-end",
        paddingRight: size * 0.16,
      }}
    >
      <View style={{ width: size * 0.14, height: size * 0.14, borderRadius: size, backgroundColor: filled ? "#fff" : color }} />
    </View>
  );
}

function More({ size, color, filled }: Mark) {
  return (
    <View style={{ width: size, height: size, flexDirection: "row", flexWrap: "wrap", gap: size * 0.1, alignContent: "center", justifyContent: "center" }}>
      {[0, 1, 2, 3].map((cell) => (
        <View
          key={cell}
          style={{
            width: size * 0.36,
            height: size * 0.36,
            borderRadius: size * 0.1,
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
