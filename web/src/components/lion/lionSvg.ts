/**
 * The lion mascot as one SVG string, so the React component and the icon script
 * (scripts/build-icons.mjs) draw exactly the same picture.
 *
 * Frontal head, mane of flame-shaped strands, face split into a gold and a rust half: you vs. your
 * friend. Own design and own colours (no club crest, no club colours).
 */

const C = {
  ink: "#231a14",
  cream: "#f6e4c3",
  eye: "#ffe3a1",
  // gold side
  gold: "#f0a73a",
  goldLight: "#f6c868",
  goldDeep: "#c27a1c",
  goldDark: "#8a4d12",
  // rust side
  rust: "#c4472b",
  rustLight: "#e2774a",
  rustDeep: "#93301c",
  rustDark: "#5f1d12",
};

const CX = 100;
const CY = 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Point at `radius` and `deg` degrees clockwise from straight up. */
function at(radius: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return `${r1(CX + radius * Math.sin(a))} ${r1(CY - radius * Math.cos(a))}`;
}

/** A flame-shaped mane strand that curls slightly clockwise. */
function strand(deg: number, inner: number, outer: number, halfWidth: number, curl: number) {
  const mid = (inner + outer) / 2;
  return [
    `M${at(inner, deg - halfWidth)}`,
    `Q${at(mid, deg - halfWidth + curl * 0.2)} ${at(outer, deg + curl)}`,
    `Q${at(mid + 4, deg + halfWidth + curl * 0.8)} ${at(inner, deg + halfWidth)}`,
    "Z",
  ].join(" ");
}

function mane(count: number, offset: number, inner: number, outer: (deg: number, i: number) => number, halfWidth: number, curl: number, left: string[], right: string[]) {
  const step = 360 / count;
  let out = "";
  for (let i = 0; i < count; i++) {
    const deg = offset + i * step;
    const side = Math.sin((deg * Math.PI) / 180) < 0 ? left : right;
    out += `<path d="${strand(deg, inner, outer(deg, i), halfWidth, curl)}" fill="${side[i % side.length]}" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
  }
  return out;
}

// Longer at the bottom like a real mane, with uneven tips so it reads as hair, not petals.
const bottomBias = (deg: number) => (1 - Math.cos((deg * Math.PI) / 180)) / 2;
const backLength = (deg: number, i: number) => 84 + 10 * bottomBias(deg) + [0, 6, -3, 4][i % 4];
const frontLength = (deg: number, i: number) => 66 + 12 * bottomBias(deg) + [0, -5, 4, -2][i % 4];

const FACE =
  "M100 44 C124 44 138 62 138 90 C138 116 128 136 114 150 L100 166 L86 150 C72 136 62 116 62 90 C62 62 76 44 100 44 Z";

export function lionSvg({ id, size = 64, animated = false, title = "" }: { id: string; size?: number; animated?: boolean; title?: string }) {
  const clip = `${id}-right`;
  const style = animated
    ? `<style>
#${id} .mane-back{transform-origin:${CX}px ${CY}px;animation:lion-sway 8s ease-in-out infinite}
#${id} .mane-front{transform-origin:${CX}px ${CY}px;animation:lion-sway 8s ease-in-out infinite reverse}
#${id} .head{transform-origin:${CX}px 112px;animation:lion-breathe 5s ease-in-out infinite}
#${id} .eyes{transform-box:fill-box;transform-origin:center;animation:lion-blink 7s infinite}
@keyframes lion-sway{0%,100%{transform:rotate(-1.8deg)}50%{transform:rotate(1.8deg)}}
@keyframes lion-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.018)}}
@keyframes lion-blink{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}
@media (prefers-reduced-motion:reduce){#${id} *{animation:none!important}}
</style>`
    : "";

  return `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" role="${title ? "img" : "presentation"}"${title ? ` aria-label="${title}"` : ' aria-hidden="true"'}>
${title ? `<title>${title}</title>` : ""}${style}
<defs><clipPath id="${clip}"><rect x="100" y="0" width="100" height="200"/></clipPath></defs>
<g class="mane-back">${mane(30, 0, 40, backLength, 6.5, 19, [C.goldDeep, C.goldDark, C.gold], [C.rustDeep, C.rustDark, C.rust])}</g>
<g class="mane-front">${mane(26, 6, 40, frontLength, 6, 22, [C.gold, C.goldLight, C.goldDeep, C.gold, C.cream], [C.rust, C.rustLight, C.rustDeep, C.rust, C.cream])}</g>
<g class="head">
  <circle cx="73" cy="54" r="9.5" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.4"/>
  <circle cx="73" cy="54" r="4.5" fill="${C.goldDark}"/>
  <circle cx="127" cy="54" r="9.5" fill="${C.rust}" stroke="${C.ink}" stroke-width="2.4"/>
  <circle cx="127" cy="54" r="4.5" fill="${C.rustDark}"/>
  <path d="${FACE}" fill="${C.gold}"/>
  <path d="${FACE}" fill="${C.rust}" clip-path="url(#${clip})"/>
  <path d="M96.5 56 Q100 52 103.5 56 L106 108 L94 108 Z" fill="${C.cream}" opacity=".9"/>
  <path d="M74 100 Q78 114 76 128" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" opacity=".35"/>
  <path d="M126 100 Q122 114 124 128" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" opacity=".35"/>
  <path d="M92 154 Q100 172 108 154 Z" fill="${C.cream}" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M100 108 C114 108 121 119 120 133 C119 147 110 155 100 155 C90 155 81 147 80 133 C79 119 86 108 100 108 Z" fill="${C.cream}" stroke="${C.ink}" stroke-width="2"/>
  <path d="${FACE}" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M66 81 Q80 78 94 86" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>
  <path d="M134 81 Q120 78 106 86" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>
  <g class="eyes">
    <path d="M70 91 Q81 85 93 90 Q81 95 70 91 Z" fill="${C.eye}" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="83" cy="90.2" r="2.9" fill="${C.ink}"/>
    <path d="M130 91 Q119 85 107 90 Q119 95 130 91 Z" fill="${C.eye}" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="117" cy="90.2" r="2.9" fill="${C.ink}"/>
  </g>
  <path d="M87 111 Q100 104 113 111 Q108 123 100 125 Q92 123 87 111 Z" fill="${C.ink}"/>
  <path d="M100 125 V133 M100 133 Q93 139 87 135 M100 133 Q107 139 113 135" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="${C.ink}" opacity=".55"><circle cx="89" cy="143" r="1.4"/><circle cx="85" cy="138" r="1.4"/><circle cx="91" cy="137" r="1.4"/><circle cx="111" cy="143" r="1.4"/><circle cx="115" cy="138" r="1.4"/><circle cx="109" cy="137" r="1.4"/></g>
</g>
</svg>`;
}
