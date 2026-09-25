// The all-clear figure: a seated person, facing right, savouring a drink.
// Every pose is solved from where the glass (or bottle) must end up, so the
// glass meets the lips and the hand really holds the bottle it lifts.

const rad = (d) => (d * Math.PI) / 180;
const rot = (c, deg, p) => {
  const s = Math.sin(rad(deg)), k = Math.cos(rad(deg));
  const x = p[0] - c[0], y = p[1] - c[1];
  return [c[0] + x * k - y * s, c[1] + x * s + y * k];
};

// Figure geometry, in the figure's own drawing coordinates.
export const G = {
  hip: [52, 70],
  shoulder: [50, 30],
  elbow: [66, 52],
  glassPivot: [90, 46],
  rimLeft: [84.4, 32.4],
  rimCentre: [90, 32.4],
  farShoulder: [46, 30],
  farHand: [84, 62],
  neck: [50, 19],
  bottleNeckTip: [0, -22], // bottle frame: grip at 0,0, upright
};

// World position of a point carried by the glass, for a given pose.
function glassPoint(p, { recline = 0, T = 0, a = 0, b = 0, g = 0 }) {
  let q = rot(G.glassPivot, g, p);
  q = rot(G.elbow, b, q);
  q = rot(G.shoulder, a, q);
  return rot(G.hip, recline + T, q);
}

// Find arm (a), forearm (b) and glass (g) angles that put the glass rim at
// `target` with the glass tilted `tilt` degrees in the world.
function solveGlass(target, tilt, recline = 0, T = 0) {
  let best = null;
  const tryAt = (a, b) => {
    const g = tilt - recline - T - a - b;
    const q = glassPoint(G.rimLeft, { recline, T, a, b, g });
    const d = Math.hypot(q[0] - target[0], q[1] - target[1]);
    if (!best || d < best.d) best = { a, b, g, d };
  };
  for (let a = -110; a <= 30; a += 1) for (let b = -130; b <= 40; b += 1) tryAt(a, b);
  const { a: a0, b: b0 } = best;
  for (let a = a0 - 1; a <= a0 + 1; a += 0.05) for (let b = b0 - 1; b <= b0 + 1; b += 0.05) tryAt(a, b);
  return { a: +best.a.toFixed(2), b: +best.b.toFixed(2), g: +best.g.toFixed(2), err: +best.d.toFixed(2) };
}

const farPoint = (p, { recline = 0, T = 0, f = 0 }) => rot(G.hip, recline + T, rot(G.farShoulder, f, p));

// Solve every pose for one seat. `recline` leans the whole upper body back (deckchair).
export function solvePoses({ recline = 0 } = {}) {
  const T = 12; // lean forward to reach the table
  const r = recline;
  const shiftFor = (pt) => rot(G.hip, r, pt); // targets move with a reclined head
  const lips = shiftFor([64.5, 11.5]);
  const P = {
    rest: { T: 0, a: 0, b: 0, g: 0, head: 0 },
    hold: { T: 0, head: 11, ...solveGlass(shiftFor([79, 25]), r, r) },
    raise: { T: 0, head: 0, ...solveGlass(shiftFor([67, 14]), r, r) },
    sip: { T: 0, head: -3, ...solveGlass(lips, r - 24, r) },
    nose: { T: 0, head: 4, ...solveGlass(shiftFor([63.5, 14]), r - 3, r) },
    low: { T, head: 7, ...solveGlass(shiftFor([80, 40]), r, r, T) },
  };
  P.rockL = { ...P.hold, g: P.hold.g + 5 };
  P.rockR = { ...P.hold, g: P.hold.g - 5 };

  // Refill: the far hand reaches forward-down; the table goes where it lands.
  const fPick = -30;
  const grip = farPoint(G.farHand, { recline: r, T, f: fPick });
  const heldBase = -(r + T + fPick); // held bottle drawn so it looks upright at pick-up
  // Pour: neck tip just above the glass rim, bottle tipped ~110 degrees.
  const lowRim = glassPoint(G.rimCentre, { recline: r, ...P.low });
  const target = [lowRim[0] + 1.5, lowRim[1] - 5];
  let pour = null;
  for (let f = -120; f <= 20; f += 0.25) {
    const t = -110 - (f - fPick);
    const tip = farPoint([G.farHand[0], G.farHand[1]], { recline: r, T, f });
    const local = rot([0, 0], heldBase + t, G.bottleNeckTip);
    const neckWorld = farPoint([G.farHand[0] + local[0], G.farHand[1] + local[1]], { recline: r, T, f });
    const d = Math.hypot(neckWorld[0] - target[0], neckWorld[1] - target[1]);
    if (!pour || d < pour.d) pour = { f, t, d, neckWorld, tip };
  }
  return { P, fPick, grip, heldBase, pour, lowRim, recline: r, T };
}
