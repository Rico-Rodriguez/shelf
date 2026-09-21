const PAL: Record<string, string> = {
  k: "#3d2c29",
  w: "#fff8ee",
  c: "#f4e8d1",
  d: "#c4a484",
  s: "#7ba3a0",
  r: "#d4847c",
  m: "#e0a84a",
  n: "#4a6fa5",
  g: "#6b8f5e",
  o: "#8b6914",
  p: "#d4849a",
  x: "",
};

const SPRITES: Record<string, string[]> = {
  house: [
    "xxxxkkkkxxxx",
    "xxxkkwwkkxxx",
    "xxkkwmmwkkxx",
    "xkkwwmmwwkkx",
    "kkddddddddkk",
    "kddwwddwwddk",
    "kddwwddwwddk",
    "kddddooddddk",
    "kddddooddddk",
    "kkkkkkkkkkkk",
  ],
  coins: [
    "xxxxmmmmxxxx",
    "xxxmwwwwmxxx",
    "xxmwwkkwwmxx",
    "xxmwkkkkwmxx",
    "xxmwwkkwwmxx",
    "xxxmwwwwmxxx",
    "xxsmmmmmmxxx",
    "xswwwwwwmsxx",
    "xswwkkwwmsxx",
    "xxssssssxxxx",
  ],
  cart: [
    "xxxxxxxxxxkk",
    "kkkkkkkkkkrk",
    "kwwwwwwwwrk",
    "kwwgwwgwwrk",
    "kwwwwwwwwrk",
    "kkkkkkkkkxx",
    "xkxxkkxxkxx",
    "xkkxkkxkkxx",
    "xxxxxxxxxx",
  ],
  fork: [
    "xkxxkxxkx",
    "xkxxkxxkx",
    "xkkkkkkkx",
    "xxxkkkxxx",
    "xxxkkkxxx",
    "xxxkkkxxx",
    "xxxkkkxxx",
    "xxxwwwxxx",
    "xxxxwxxxx",
  ],
  mug: [
    "xxkkkkkkxx",
    "xkwwwwwwkxk",
    "xkwwdwwwkkwk",
    "xkwwwwwwkwwk",
    "xkwwwwwwkkxk",
    "xkkkkkkkkxx",
    "xxxxxxxxxxx",
  ],
  leaf: [
    "xxxxxggx",
    "xxxgggwx",
    "xxggwwwg",
    "xggwkgxg",
    "ggwkkxxg",
    "xgkkxxxx",
    "xxkxxxxx",
  ],
  plant: [
    "xxxggxxx",
    "xxgwwgxx",
    "xggwgggx",
    "xxxkkxxx",
    "xxkddkxx",
    "xkddddkx",
    "xkkkkkkx",
  ],
  car: [
    "xxnnnnnnxx",
    "xnnwwwwnnx",
    "nnnnnnnnnn",
    "nkknnnnnkkn",
    "xkkxxxxkkx",
  ],
  shirt: [
    "xkkxxxkkx",
    "kppkkkppk",
    "kpppppppk",
    "xkpppppkx",
    "xkpppppkx",
    "xkkkkkkkx",
  ],
  brush: [
    "xxxwwwxxx",
    "xxxpppxxx",
    "xxxxkxxxx",
    "xxxxkxxxx",
    "xxxxkxxxx",
    "xxxkkkxxx",
  ],
  plus: [
    "xxxrrxxx",
    "xxxrrxxx",
    "rrrrrrrr",
    "rrrrrrrr",
    "xxxrrxxx",
    "xxxrrxxx",
  ],
  paw: [
    "xkkxkkx",
    "xkkxkkx",
    "kkkkkdk",
    "kdddddk",
    "xkkkkkx",
  ],
  game: [
    "xkkkkkkkx",
    "knwwwnwnk",
    "knnnnnnnk",
    "kkrknknnk",
    "xkkkkkkkx",
  ],
  tv: [
    "xxkkkkkkxx",
    "xkwwwwwwkx",
    "xkwwnnwwkx",
    "xkwwwwwwkx",
    "xxkkkkkkxx",
    "xxxkxxkxxx",
  ],
  bag: [
    "xxxkkxxx",
    "xxkxxkxx",
    "xkkkkkkx",
    "kdwwwwdk",
    "kdwwwwdk",
    "xkkkkkkx",
  ],
  phone: [
    "xxkkkkxx",
    "xkwwwwkx",
    "xknnwnkx",
    "xkwwwwkx",
    "xkwwwwkx",
    "xxkkkkxx",
  ],
  plug: [
    "xxkxxkxx",
    "xxkxxkxx",
    "xkkkkkkx",
    "xkmmmmkx",
    "xxkkkkxx",
    "xxxkkxxx",
  ],
  shield: [
    "xxkkkkxx",
    "xknnwnkx",
    "xknnnnkx",
    "xxknnkxx",
    "xxxkkxxx",
  ],
  computer: [
    "xkkkkkkkx",
    "kwwwwwwwk",
    "kwnnnnnwk",
    "kwwwwwwwk",
    "xkkkkkkkx",
    "xxkwwwkxx",
    "xkkkkkkkx",
  ],
  paper: [
    "xkkkkkkx",
    "kwwwwwwk",
    "kwkkwwwk",
    "kwwwwwwk",
    "kwkkwwwk",
    "xkkkkkkx",
  ],
  gift: [
    "xxrxxrxx",
    "kkkkkkkk",
    "krrwwrrk",
    "krrrrrrk",
    "krrwwrrk",
    "kkkkkkkk",
  ],
  heart: [
    "xrrxrrx",
    "rrrrrrr",
    "rrrrrrr",
    "xrrrrrx",
    "xxrrrxx",
    "xxxrxxx",
  ],
  swap: [
    "xxnnnxxx",
    "xxxxnxxx",
    "ssssnnnn",
    "sxxxxnxx",
    "sssxxxxx",
  ],
  chart: [
    "xxxxxxkx",
    "xxxxkgkx",
    "xxkmgmkx",
    "xkmmgmkx",
    "kkkkkkkk",
  ],
  box: [
    "xxmmmmxx",
    "xmoooomx",
    "xmoooomx",
    "xmoooomx",
    "xxmmmmxx",
  ],
  lock: [
    "xxkkkkxx",
    "xkxxxxkx",
    "xkkkkkkx",
    "xkmmmmkx",
    "xkmwwmkx",
    "xkkkkkkx",
  ],
  tag: [
    "xxkkkkx",
    "xkmwwkx",
    "xkmwwkx",
    "xxkmkxx",
    "xxxkxxx",
  ],
  calendar: [
    "kkkkkkkk",
    "krrrrrrk",
    "kwwwwwwk",
    "kwkwkwwk",
    "kwwwwwwk",
    "kkkkkkkk",
  ],
  bank: [
    "xxxkkxxx",
    "xxkwwkxx",
    "kkkkkkkk",
    "kwwkwwkk",
    "kwwkwwkk",
    "kkkkkkkk",
  ],
  pig: [
    "xxppppxx",
    "xppwwppx",
    "pppkkppp",
    "xppppppx",
    "xkxxxxkx",
  ],
  shelf: [
    "kkkkkkkkkk",
    "kddwddwddk",
    "kkkkkkkkkk",
    "kmmwggwrrk",
    "kkkkkkkkkk",
  ],
};

export function PixelIcon({
  name,
  size = 24,
  title,
}: {
  name: string;
  size?: number;
  title?: string;
}) {
  const rows = SPRITES[name] ?? SPRITES.box;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) => {
          const fill = PAL[ch];
          if (!fill) return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />;
        }),
      )}
    </svg>
  );
}
