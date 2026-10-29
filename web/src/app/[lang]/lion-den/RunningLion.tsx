/**
 * Original running lion for Löwensprung, side view facing right. Every body part is its own group
 * so CSS can animate the gait: legs swing around hip and shoulder, the body bobs, tail and mane
 * flutter. `mode` switches between waiting (idle), running and the crash tumble.
 * The paws touch the ground at about (90, 100) of the 180 × 110 view box.
 */

const GOLD = "#f2b53c";
const GOLD_DARK = "#c47c14";
const GOLD_LIGHT = "#f8d68a";
const RUST = "#9c3a12";
const INK = "#2a160b";

// Mane: two star-shaped layers around the head.
function star(cx: number, cy: number, outer: number, inner: number, points: number, turn = 0) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((i / (points * 2)) * 360 + turn) * (Math.PI / 180);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const MANE_BACK = star(126, 40, 30, 19, 15, 6);
const MANE_FRONT = star(127, 40, 23, 15, 13);

function Leg({ x, y, far, phase }: { x: number; y: number; far: boolean; phase: "a" | "b" }) {
  const fill = far ? GOLD_DARK : GOLD;
  return (
    <g className={`lion-leg lion-leg-${phase}`} style={{ transformOrigin: `${x}px ${y}px` }}>
      <path d={`M${x - 7} ${y - 2} Q${x - 9} ${y + 18} ${x - 5} ${y + 34} L${x + 5} ${y + 34} Q${x + 6} ${y + 18} ${x + 7} ${y - 2} Z`} fill={fill} />
      <ellipse cx={x + 1} cy={y + 35} rx="8" ry="4" fill={far ? RUST : GOLD_DARK} />
    </g>
  );
}

export function RunningLion({ mode, width }: { mode: "idle" | "run" | "crash"; width: number }) {
  return (
    <svg
      viewBox="0 0 180 110"
      width={width}
      height={(width * 110) / 180}
      className={`lion-figure lion-${mode} overflow-visible`}
      aria-hidden
    >
      <defs>
        <radialGradient id="lion-mane" cx="0.4" cy="0.45" r="0.7">
          <stop offset="0" stopColor="#f4a22a" />
          <stop offset="0.6" stopColor="#d96b1c" />
          <stop offset="1" stopColor={RUST} />
        </radialGradient>
        <linearGradient id="lion-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7c457" />
          <stop offset="1" stopColor={GOLD_DARK} />
        </linearGradient>
        <radialGradient id="lion-glow">
          <stop offset="0" stopColor="#ffd36b" stopOpacity=".9" />
          <stop offset="1" stopColor="#ffd36b" stopOpacity="0" />
        </radialGradient>
      </defs>

      {mode !== "crash" && <ellipse className="lion-glow" cx="90" cy="101" rx="62" ry="9" fill="url(#lion-glow)" />}

      <g className="lion-bob">
        {/* far legs and tail behind the body */}
        <Leg x={64} y={62} far phase="b" />
        <Leg x={116} y={60} far phase="a" />
        <g className="lion-tail" style={{ transformOrigin: "50px 54px" }}>
          <path d="M50 54 C36 52 26 42 16 30" fill="none" stroke={GOLD_DARK} strokeWidth="5" strokeLinecap="round" />
          <path d="M18 33 C10 30 6 22 10 16 C16 18 20 24 18 33 Z" fill={RUST} />
        </g>

        {/* body */}
        <path d="M48 52 C50 34 100 28 124 38 C135 44 133 66 118 70 C100 75 70 75 56 70 C45 67 43 60 48 52 Z" fill="url(#lion-body)" />
        <path d="M60 67 C80 74 104 73 120 66 C112 72 80 76 60 67 Z" fill={GOLD_LIGHT} opacity=".7" />

        {/* near legs in front of the body */}
        <Leg x={60} y={62} far={false} phase="a" />
        <Leg x={112} y={60} far={false} phase="b" />

        {/* mane, then head */}
        <g className="lion-mane" style={{ transformOrigin: "126px 40px" }}>
          <polygon points={MANE_BACK} fill={RUST} />
          <polygon points={MANE_FRONT} fill="url(#lion-mane)" />
        </g>
        <g className="lion-head" style={{ transformOrigin: "130px 40px" }}>
          <path d="M131 24 L136 15 L141 26 Z" fill={GOLD_DARK} />
          <path d="M120 32 C128 22 145 24 151 34 C156 41 154 50 146 53 C137 56 125 52 120 45 Z" fill={GOLD} />
          <ellipse cx="150" cy="45" rx="7" ry="5.5" fill={GOLD_LIGHT} />
          <path d="M154 40 C157 40 158 42 156 44 C154 44 153 42 154 40 Z" fill={INK} />
          <path d="M146 49 Q150 52 154 49" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          <path className="lion-eye" d="M137 34 Q141 31 145 34 Q141 36 137 34 Z" fill={INK} />
          <path d="M135 30 L146 31" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
