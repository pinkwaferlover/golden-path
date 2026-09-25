// The all-clear scene: a minimalist room (or garden) whose window is the calendar.
import { solvePoses, G } from "./figure.mjs";

const M = {
  line: "#6B665B", fill: "#E4DCCB", fill2: "#D9CFBC", sky: "#EDE6D6", hill: "#DCD2BC", ground: "#FFFDF8",
  L1: "#C9A36A", L2: "#B26B3F", L3: "#9C8F5A", pink: "#D9A7A7", gold: "#B08A2E",
};

const DRINKS = {
  whisky: { glass: "M84.4 32.4 L85 45.6 L95 45.6 L95.6 32.4 Z", liquid: "#C08A3E", vessel: "bottle", extra: "" },
  whiskyIce: {
    glass: "M84.4 32.4 L85 45.6 L95 45.6 L95.6 32.4 Z", liquid: "#C08A3E", vessel: "bottle",
    extra: `<rect x="86.6" y="38.8" width="3.2" height="3.2" fill="#FFFFFF" stroke="${M.line}" stroke-width="0.5"></rect><rect x="90.4" y="40" width="3" height="3" fill="#FFFFFF" stroke="${M.line}" stroke-width="0.5"></rect>`,
  },
  chai: {
    glass: "M84.4 34 L85.4 45.6 L94.6 45.6 L95.6 34 Z", liquid: "#C8A27A", vessel: "teapot",
    extra: `<path d="M95.4 37 q 4 0 4 3 q 0 3 -4 3" fill="none" stroke="${M.line}" stroke-width="1.2"></path>`,
  },
  mint: {
    glass: "M85.6 30.5 L86.6 45.6 L93.4 45.6 L94.4 30.5 Z", liquid: "#B8A15A", vessel: "teapot",
    extra: `<path d="M92.5 30.5 q 3 -4 6 -3 q -2 3 -6 3 z" fill="#8FA36A" stroke="${M.line}" stroke-width="0.5"></path>`,
  },
};

// Vessels drawn in grip coordinates (grip at 0,0; base at y = +12; neck tip at y = -22).
const VESSEL = {
  bottle: `<path d="M -6 12 V -4 Q -6 -9, -2 -11 V -22 H 2 V -11 Q 6 -9, 6 -4 V 12 Z" fill="${M.fill2}" stroke="${M.line}" stroke-width="1.3"></path><rect x="-4.5" y="0" width="9" height="7" fill="${M.ground}" stroke="${M.line}" stroke-width="0.7"></rect>`,
  teapot: `<path d="M -8 12 Q -10 -2, 0 -4 Q 10 -2, 8 12 Z" fill="${M.fill}" stroke="${M.line}" stroke-width="1.3"></path><path d="M -7 2 L -12 -8 L -2 -22" fill="none" stroke="${M.line}" stroke-width="1.5" stroke-linecap="round"></path><path d="M 8 0 q 6 2 3 8" fill="none" stroke="${M.line}" stroke-width="1.3"></path><path d="M -3 -4 q 3 -4 6 0" fill="none" stroke="${M.line}" stroke-width="1.3"></path>`,
};

// Timeline for a 150-second loop: five slow sips, looking and nosing between them, then a small top-up.
// [percent, pose, level]. Level is the fraction of the glass filled; never above a third.
const TL = [
  [0, "rest", 0.3], [3, "hold", 0.3], [5, "rockL", 0.3], [6.4, "rockR", 0.3], [7.8, "rockL", 0.3], [9.2, "hold", 0.3],
  [11, "nose", 0.3], [14.5, "nose", 0.3], [16.2, "raise", 0.3], [17.4, "sip", 0.3], [18.6, "sip", 0.25], [19.8, "raise", 0.25], [22, "rest", 0.25],
  [30, "rest", 0.25], [32, "hold", 0.25], [33.6, "rockR", 0.25], [35, "rockL", 0.25], [36.4, "hold", 0.25],
  [38.2, "raise", 0.25], [39.4, "sip", 0.25], [40.6, "sip", 0.2], [41.8, "raise", 0.2], [44, "rest", 0.2],
  [51, "rest", 0.2], [53, "nose", 0.2], [56.5, "nose", 0.2], [58.2, "raise", 0.2], [59.4, "sip", 0.2], [60.6, "sip", 0.14], [61.8, "raise", 0.14], [64, "rest", 0.14],
  [69, "rest", 0.14], [71, "hold", 0.14], [72.6, "rockL", 0.14], [74, "rockR", 0.14], [75.4, "hold", 0.14],
  [77.2, "raise", 0.14], [78.4, "sip", 0.14], [79.6, "sip", 0.08], [80.8, "raise", 0.08], [83, "rest", 0.08],
  [85.5, "raise", 0.08], [86.7, "sip", 0.08], [87.9, "sip", 0.03], [89.1, "raise", 0.03], [90.5, "low", 0.03],
  [92, "reach", 0.03], [92.4, "grab", 0.03], [94.4, "pour", 0.03], [94.8, "pourOn", 0.03], [97, "pourOn", 0.3], [97.3, "pour", 0.3],
  [98.6, "grab", 0.3], [98.9, "reach", 0.3], [100, "rest", 0.3],
];

function figure(id, drinkName, recline, legs) {
  const S = solvePoses({ recline });
  const d = DRINKS[drinkName];
  const P = {
    ...S.P,
    reach: { ...S.P.low, f: S.fPick },
    grab: { ...S.P.low, f: S.fPick, tableOp: 0, heldOp: 1 },
    pour: { ...S.P.low, f: S.pour.f, t: S.pour.t, tableOp: 0, heldOp: 1 },
  };
  P.pourOn = { ...P.pour, stream: 1 };
  const def = { T: 0, a: 0, b: 0, g: 0, head: 0, f: 0, t: 0, tableOp: 1, heldOp: 0, stream: 0 };
  const pose = (n) => ({ ...def, ...P[n] });
  const kf = (name, fn) => `@keyframes ${name}${id}{${TL.map(([pc, n, lv]) => `${pc}%{${fn(pose(n), lv)}}`).join("")}}`;
  const dur = 150;
  const anim = (cls, name, origin, timing = "ease-in-out") => `.a${id} .${cls}{transform-box:view-box;transform-origin:${origin};animation:${name}${id} ${dur}s ${timing} infinite}`;
  const css = [
    kf("T", (p) => `transform:rotate(${p.T}deg)`), kf("A", (p) => `transform:rotate(${p.a}deg)`), kf("B", (p) => `transform:rotate(${p.b}deg)`),
    kf("Gl", (p) => `transform:rotate(${p.g}deg)`), kf("H", (p) => `transform:rotate(${p.head}deg)`), kf("F", (p) => `transform:rotate(${p.f}deg)`),
    kf("Ti", (p) => `transform:rotate(${p.t}deg)`), kf("Lv", (p, lv) => `transform:scaleY(${lv})`),
    kf("To", (p) => `opacity:${p.tableOp}`), kf("Ho", (p) => `opacity:${p.heldOp}`), kf("St", (p) => `opacity:${p.stream}`),
    anim("torso", "T", `${G.hip[0]}px ${G.hip[1]}px`), anim("arm", "A", `${G.shoulder[0]}px ${G.shoulder[1]}px`), anim("fore", "B", `${G.elbow[0]}px ${G.elbow[1]}px`),
    anim("glass", "Gl", `${G.glassPivot[0]}px ${G.glassPivot[1]}px`), anim("head", "H", `${G.neck[0]}px ${G.neck[1]}px`), anim("farm", "F", `${G.farShoulder[0]}px ${G.farShoulder[1]}px`),
    anim("tilt", "Ti", `${G.farHand[0]}px ${G.farHand[1]}px`), anim("liquid", "Lv", "90px 45.6px"),
    `.a${id} .table-vessel{animation:To${id} ${dur}s steps(1,end) infinite}.a${id} .held{animation:Ho${id} ${dur}s steps(1,end) infinite}.a${id} .pour{animation:St${id} ${dur}s linear infinite}`,
    `@media (prefers-reduced-motion: reduce){.a${id} *{animation:none !important}.a${id} .liquid{transform:scaleY(0.2)}.a${id} .held,.a${id} .pour{opacity:0}}`,
  ].join("\n");

  const L = M.line;
  const [gx, gy] = S.grip;
  const floor = 108;
  const table = `<g stroke="${L}" stroke-width="1.5" fill="none"><path d="M ${gx - 13} ${gy + 12} H ${gx + 14} M ${gx - 9} ${gy + 12} V ${floor} M ${gx + 10} ${gy + 12} V ${floor}"></path></g>`;
  const tableVessel = `<g class="table-vessel" transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)})">${VESSEL[d.vessel]}</g>`;
  const legPaths = legs === "reclined"
    ? `<path d="M 52 70 L 98 80 L 140 100 M 50 72 L 94 86 L 132 104"></path><path d="M 140 100 l 8 -2 M 132 104 l 8 -2"></path>`
    : `<path d="M 52 70 L 96 66 L 104 100 M 50 72 L 92 72 L 98 102"></path><path d="M 104 100 h 9 M 98 102 h 9"></path>`;
  const [nx, ny] = S.pour.neckWorld, [rx, ry] = S.lowRim;
  const svg = `<g class="a${id}">
${table}${tableVessel}
<g fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${legPaths}</g>
<g transform="rotate(${recline} ${G.hip[0]} ${G.hip[1]})"><g class="torso">
<g class="farm"><path d="M 46 30 L 60 54 L 84 62" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
<g class="held" opacity="0"><g class="tilt"><g transform="translate(${G.farHand[0]} ${G.farHand[1]}) rotate(${S.heldBase})">${VESSEL[d.vessel]}</g></g></g></g>
<path d="M 52 70 C 44 56, 42 40, 48 24" fill="none" stroke="${L}" stroke-width="2.2" stroke-linecap="round"></path>
<g class="head"><circle cx="54" cy="8" r="11" fill="${M.ground}" stroke="${L}" stroke-width="2"></circle><path d="M 44 4 C 46 -6, 62 -6, 64 4" fill="none" stroke="${L}" stroke-width="2.6" stroke-linecap="round"></path></g>
<g class="arm"><path d="M 50 30 L 66 52" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round"></path><g class="fore"><path d="M 66 52 L 88 47" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round"></path>
<g class="glass"><defs><clipPath id="gl${id}"><path d="${d.glass}"></path></clipPath></defs><path d="${d.glass}" fill="${M.ground}" stroke="${L}" stroke-width="1.2" stroke-linejoin="round"></path>
<g clip-path="url(#gl${id})"><rect class="liquid" x="83" y="30" width="14" height="15.6" fill="${d.liquid}" style="transform-origin: 90px 45.6px; transform: scaleY(0.3)"></rect></g>${d.extra}</g></g></g>
</g></g>
<path class="pour" opacity="0" d="M ${nx.toFixed(1)} ${ny.toFixed(1)} Q ${(nx - 1).toFixed(1)} ${((ny + ry) / 2).toFixed(1)}, ${(rx + 0.5).toFixed(1)} ${(ry + 3).toFixed(1)}" stroke="${d.liquid}" stroke-width="1.4" fill="none"></path>
</g>`;
  return { svg, css, solved: S };
}

/* ---- seats ---- */
const SEAT = {
  armchair: `<g stroke="${M.line}" stroke-width="2" stroke-linejoin="round"><path d="M 8 78 C 2 30, 14 10, 40 12 C 48 13, 50 20, 48 30 L 46 84 Z" fill="${M.fill}"></path><rect x="24" y="72" width="80" height="18" rx="6" fill="${M.fill}"></rect><path d="M 14 90 H 104 V 100 H 14 Z" fill="${M.fill}"></path><path d="M 18 100 v 8 M 100 100 v 8" stroke-width="2.4"></path></g>`,
  sofa: `<g stroke="${M.line}" stroke-width="2" stroke-linejoin="round"><path d="M -110 30 Q -110 16, -96 16 H 38 Q 50 16, 50 28 V 80 H -110 Z" fill="${M.fill}"></path><rect x="-106" y="72" width="182" height="18" rx="6" fill="${M.fill}"></rect><path d="M -130 40 Q -130 30, -120 30 H -106 V 96 H -130 Z" fill="${M.fill2}"></path><path d="M -130 90 H 104 V 100 H -130 Z" fill="${M.fill}"></path><path d="M -124 100 v 8 M 98 100 v 8" stroke-width="2.4"></path></g>`,
  deckchair: `<g stroke="${M.line}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 4 108 L 30 12 M 96 108 L 40 74 M 30 12 L 44 10 M 22 108 L 60 74"></path><path d="M 30 14 C 26 50, 36 76, 90 84" stroke="${M.L1}" stroke-width="7" opacity="0.55"></path><path d="M 36 74 H 100"></path></g>`,
};

/* ---- window and weather ---- */
function falling(kind, x, y, w, n) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const px = x + ((i * 53 + 17) % (w + 20)), d = -((i * 1.37) % 9).toFixed(2);
    if (kind === "leaf") s += `<g class="leaf" style="animation-delay:${d}s;animation-duration:${(6 + (i % 3) * 1.5).toFixed(1)}s"><path d="M ${px} ${y} q 5 -5 10 0 q -5 5 -10 0 z" fill="${[M.L1, M.L2, M.L3][i % 3]}"></path></g>`;
    if (kind === "snow") s += `<circle class="snow" style="animation-delay:${d}s;animation-duration:${(9 + (i % 4) * 1.6).toFixed(1)}s" cx="${px}" cy="${y + (i % 5) * 5}" r="${(1.6 + (i % 3) * 0.6).toFixed(1)}" fill="#FFFFFF" stroke="#CFC8BA" stroke-width="0.6"></circle>`;
    if (kind === "petal") s += `<g class="petal" style="animation-delay:${d}s"><ellipse cx="${px - 20}" cy="${y}" rx="3" ry="2" fill="${M.pink}"></ellipse></g>`;
    if (kind === "rain") s += `<line class="rain" style="animation-delay:${(-(i * 0.23) % 1.6).toFixed(2)}s" x1="${px}" y1="${y}" x2="${px - 3}" y2="${y + 9}" stroke="#A9B3BC" stroke-width="1.2" stroke-linecap="round"></line>`;
  }
  return s;
}
function windowView(x, y, w, h, id, view, extra = "") {
  const night = view === "night";
  const tree = `<path d="M ${x + w + 5} ${y + 20} C ${x + w * 0.7} ${y + 30}, ${x + w * 0.5} ${y + 22}, ${x + w * 0.35} ${y + 40} M ${x + w * 0.62} ${y + 27} l -12 -14 M ${x + w * 0.5} ${y + 30} l -4 16" stroke="${night ? "#8A8F99" : M.line}" stroke-width="2" fill="none" stroke-linecap="round"></path>`;
  const dots = (cols) => [[0.4, 36], [0.56, 14], [0.47, 47], [0.72, 26], [0.64, 40]].map(([fx, fy], i) => `<circle cx="${x + w * fx}" cy="${y + fy}" r="4" fill="${cols[i % cols.length]}"></circle>`).join("");
  const hill = `<path d="M ${x - 10} ${y + h - 30} C ${x + w * 0.3} ${y + h - 55}, ${x + w * 0.6} ${y + h - 20}, ${x + w + 10} ${y + h - 45} L ${x + w + 10} ${y + h} L ${x - 10} ${y + h} Z" fill="${night ? "#4A4F5A" : view === "winter" ? "#F7F4EE" : M.hill}"></path>`;
  let inside = (night ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#5C6270"></rect>` : "") + hill + tree;
  if (view === "autumn") inside += dots([M.L2, M.L1]) + falling("leaf", x + 10, y, w + 30, 9);
  if (view === "winter") inside += `<path d="M ${x + w * 0.4} ${y + 38} l 14 -3 M ${x + w * 0.6} ${y + 24} l 12 -2" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"></path>` + falling("snow", x, y, w + 20, 24);
  if (view === "spring") inside += dots([M.pink, "#E9C9C9"]) + falling("petal", x + 30, y + 10, w, 6) + falling("rain", x, y, w + 10, 16);
  return `<defs><clipPath id="w${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"></rect></clipPath></defs>
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${view === "winter" ? "#E3DED3" : M.sky}"></rect>
<g clip-path="url(#w${id})">${inside}${extra}</g>
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${M.line}" stroke-width="3"></rect>
<path d="M ${x + w / 2} ${y} V ${y + h} M ${x} ${y + h / 2} H ${x + w}" stroke="${M.line}" stroke-width="2"></path>
<rect x="${x - 8}" y="${y + h}" width="${w + 16}" height="7" fill="${M.fill}" stroke="${M.line}" stroke-width="2"></rect>`;
}
const lamp = (x, fy) => `<path d="M ${x} ${fy} V ${fy - 140} M ${x - 14} ${fy - 140} H ${x + 14} L ${x + 9} ${fy - 164} H ${x - 9} Z" fill="#F3EAD2" stroke="${M.line}" stroke-width="2" stroke-linejoin="round"></path>`;

/* ---- holiday props (sill top is at y = 277 in scene coordinates) ---- */
const SILL = 277;
const HOLIDAY = {
  bonfire: {
    view: "night", drink: "whisky",
    windowExtra: [[500, 110, M.L2], [600, 90, M.L1], [640, 150, "#9FB0C4"]].map(([cx, cy, c], i) => `<g class="burst" style="animation-delay:${-i * 0.9}s">${Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * Math.PI * 2; return `<line x1="${(cx + Math.cos(a) * 6).toFixed(1)}" y1="${(cy + Math.sin(a) * 6).toFixed(1)}" x2="${(cx + Math.cos(a) * 22).toFixed(1)}" y2="${(cy + Math.sin(a) * 22).toFixed(1)}" stroke="${c}" stroke-width="2" stroke-linecap="round"></line>`; }).join("")}</g>`).join(""),
    props: `<g transform="translate(600 ${SILL})"><path d="M -10 0 V -20 H 10 V 0 Z" fill="${M.ground}" stroke="${M.line}" stroke-width="1.6"></path><path d="M -4 -20 L -8 -44 M 2 -20 L 4 -46 M 6 -20 L 12 -40" stroke="${M.line}" stroke-width="1.4"></path><g class="flame"><circle cx="-8" cy="-46" r="3" fill="${M.L1}"></circle><circle cx="4" cy="-48" r="3" fill="${M.L1}"></circle></g></g>`,
    label: "Bonfire Night",
  },
  diwali: {
    view: "autumn", drink: "chai",
    props: [500, 560, 620].map((x) => `<g transform="translate(${x} ${SILL})"><path d="M -10 0 Q 0 8, 10 0 Q 0 -2, -10 0 Z" fill="${M.L2}" stroke="${M.line}" stroke-width="1.2"></path><path class="flame" d="M 0 -1 q -3 -5 0 -10 q 3 5 0 10 z" fill="#E7B65A"></path></g>`).join("")
      + `<g transform="translate(560 388)">${Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return `<ellipse cx="${(Math.cos(a) * 14).toFixed(1)}" cy="${(Math.sin(a) * 5).toFixed(1)}" rx="5" ry="2.4" fill="${[M.L2, M.L1, M.pink, M.L3][k % 4]}"></ellipse>`; }).join("")}<circle r="3" fill="${M.L1}"></circle></g>`,
    label: "Diwali",
  },
  eid: {
    view: "night", drink: "mint",
    windowExtra: `<path d="M 610 96 a 18 18 0 1 0 14 30 a 14 14 0 1 1 -14 -30 z" fill="#F0D9A0"></path><circle cx="580" cy="100" r="2" fill="#F0D9A0"></circle><circle cx="520" cy="120" r="1.6" fill="#F0D9A0"></circle>`,
    props: `<g transform="translate(470 ${SILL})"><path d="M 0 -52 V -44 M -10 -44 H 10 L 8 -8 H -8 Z" fill="${M.ground}" stroke="${M.line}" stroke-width="1.5"></path><path d="M -6 -40 L 6 -12 M 6 -40 L -6 -12" stroke="${M.line}" stroke-width="0.8"></path><ellipse class="flame" cx="0" cy="-22" rx="3" ry="5" fill="#E7B65A"></ellipse><path d="M -10 -8 H 10 V 0 H -10 Z" fill="${M.fill}" stroke="${M.line}" stroke-width="1.5"></path></g>`
      + `<g transform="translate(560 ${SILL})"><path d="M -16 -8 Q 0 6, 16 -8 Z" fill="${M.fill}" stroke="${M.line}" stroke-width="1.5"></path>${[-9, -3, 3, 9, -6, 0, 6].map((dx, i) => `<ellipse cx="${dx}" cy="${i < 4 ? -10 : -14}" rx="3.2" ry="2" fill="#7A4A2A"></ellipse>`).join("")}</g>`,
    label: "Eid al-Fitr",
  },
};

export const SCENE_CSS = `
@keyframes gpLeaf{0%{transform:translate(0,-30px) rotate(0deg);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translate(-40px,230px) rotate(260deg);opacity:0}}
.leaf{animation:gpLeaf 7s linear infinite;transform-box:fill-box;transform-origin:center}
@keyframes gpSnow{0%{transform:translate(0,-20px);opacity:0}10%{opacity:1}100%{transform:translate(-14px,220px);opacity:.9}}
.snow{animation:gpSnow 11s linear infinite}
@keyframes gpPetal{0%{transform:translate(0,-20px) rotate(0);opacity:0}10%{opacity:1}100%{transform:translate(30px,220px) rotate(200deg);opacity:0}}
.petal{animation:gpPetal 9s linear infinite;transform-box:fill-box;transform-origin:center}
@keyframes gpRain{0%{transform:translate(0,-30px);opacity:0}15%{opacity:.6}100%{transform:translate(-8px,200px);opacity:0}}
.rain{animation:gpRain 1.6s linear infinite}
@keyframes gpDrift{from{transform:translateX(-60px)}to{transform:translateX(560px)}}
.cloud{animation:gpDrift 80s linear infinite}
@keyframes gpBurst{0%{transform:scale(.1);opacity:0}15%{opacity:1}70%{opacity:.8}100%{transform:scale(1);opacity:0}}
.burst{animation:gpBurst 2.6s ease-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes gpFlame{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.18)}}
.flame{animation:gpFlame 1.3s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom}
@media (prefers-reduced-motion: reduce){.leaf,.snow,.petal,.rain,.cloud,.burst,.flame{animation:none}}
`;

export function seasonFor(date) {
  const m = date.getMonth() + 1;
  return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
}
// Fixed-date holidays only. Moving dates (Diwali, Eid) need a sourced date list; until then they show only when asked for.
export function holidayFor(date) {
  const m = date.getMonth() + 1, d = date.getDate();
  if (m === 11 && d >= 1 && d <= 5) return "bonfire";
  return null;
}

// Render the whole scene. `scene` may force a season or holiday (for previews).
export function renderScene({ date = new Date(), scene = null, id = "s" } = {}) {
  const W = 800, H = 420, F = 400;
  const holidayKey = scene && HOLIDAY[scene] ? scene : scene ? null : holidayFor(date);
  const season = scene && !HOLIDAY[scene] ? scene : seasonFor(date);
  const h = holidayKey ? HOLIDAY[holidayKey] : null;
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  let inner;
  if (!h && season === "summer") {
    const fig = figure(id, "whiskyIce", -16, "reclined");
    inner = `<circle cx="640" cy="90" r="30" fill="#F0D9A0"></circle>
<g class="cloud"><path d="M 80 110 q 10 -22 34 -14 q 14 -18 36 -4 q 22 -2 20 18 z" fill="${M.ground}" stroke="${M.line}" stroke-width="1.6"></path></g>
<path d="M 30 ${F - 110} H ${W - 30}" stroke="${M.gold}" stroke-width="3"></path>
<path d="M 30 ${F - 110} C 200 ${F - 125}, 420 ${F - 100}, ${W - 30} ${F - 118} L ${W - 30} ${F} L 30 ${F} Z" fill="${M.hill}" opacity="0.6"></path>
<path d="M 30 ${F} H ${W - 30}" stroke="${M.line}" stroke-width="1.5" opacity="0.5"></path>
<g transform="translate(250 ${F - 216}) scale(2)">${SEAT.deckchair}<g transform="translate(-4 0)">${fig.svg}</g></g>`;
    return { svg: `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A figure relaxing in a deckchair on a summer day, sipping a drink">${inner}</svg>`, css: SCENE_CSS + fig.css, label: "Summer" };
  }
  const seat = dayOfYear % 2 === 0 ? "armchair" : "sofa";
  const fig = figure(id, h ? h.drink : "whisky", 0, "seated");
  const view = h ? h.view : season;
  inner = `<path d="M 30 ${F} H ${W - 30}" stroke="${M.line}" stroke-width="1.5" opacity="0.5"></path>`
    + windowView(440, 70, 240, 200, id, view, h ? h.windowExtra || "" : "") + lamp(170, F)
    + `<g transform="translate(${seat === "sofa" ? 300 : 215} ${F - 216}) scale(2)">${SEAT[seat]}<g transform="translate(-4 0)">${fig.svg}</g></g>`
    + (h ? h.props : "");
  const label = h ? h.label : season[0].toUpperCase() + season.slice(1);
  return { svg: `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A figure relaxing in a ${seat} by the window, ${label.toLowerCase()} outside, sipping a drink">${inner}</svg>`, css: SCENE_CSS + fig.css, label };
}

// The tiny corner vignette: the same figure, working at a desk by the same window.
export function renderVignette() {
  const c = "#BDB6A6";
  let leaves = "";
  for (let i = 0; i < 3; i++) leaves += `<g class="leaf" style="animation-delay:${-i * 2.3}s;animation-duration:8s"><path d="M ${96 + i * 14} 14 q 3 -3 6 0 q -3 3 -6 0 z" fill="${[M.L1, M.L2, M.L3][i]}" opacity="0.6"></path></g>`;
  return `<svg viewBox="0 0 150 92" width="150" height="92" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><clipPath id="vw"><rect x="92" y="10" width="46" height="42"></rect></clipPath></defs>
<rect x="92" y="10" width="46" height="42" fill="none" stroke="${c}" stroke-width="1.4"></rect><path d="M 115 10 V 52 M 92 31 H 138" stroke="${c}" stroke-width="1"></path>
<g clip-path="url(#vw)">${leaves}</g>
<g fill="none" stroke="${c}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
<path d="M 20 86 H 138 M 44 60 H 110 M 50 60 V 86 M 104 60 V 86"></path><path d="M 74 60 L 78 46 H 96 L 94 60"></path>
<circle cx="30" cy="30" r="7"></circle><path d="M 29 37 C 26 46, 27 54, 30 62 L 46 62 L 48 84"></path>
<g class="typeA"><path d="M 30 43 L 46 50 L 66 56"></path></g><g class="typeB"><path d="M 29 45 L 44 53 L 62 58"></path></g>
<path d="M 16 86 V 58 Q 16 52, 22 52 H 36"></path></g></svg>`;
}
