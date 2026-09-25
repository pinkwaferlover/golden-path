import { test } from "node:test";
import assert from "node:assert/strict";
import { solvePoses } from "../src/scene/figure.mjs";
import { renderScene, seasonFor, holidayFor } from "../src/scene/scene.mjs";

test("the glass meets the lips and nose, not the eyes, in both seats", () => {
  for (const recline of [0, -16]) {
    const { P } = solvePoses({ recline });
    for (const k of ["sip", "nose", "raise", "hold", "low"]) assert.ok(P[k].err < 0.5, `${k} (recline ${recline}) off by ${P[k].err}`);
  }
});

test("the pour lands over the glass", () => {
  const armchair = solvePoses({ recline: 0 });
  assert.ok(armchair.pour.d < 5, `pour misses by ${armchair.pour.d}`);
});

test("the glass is never more than a third full, and there are exactly five sips per refill", () => {
  const s = renderScene({ date: new Date("2026-10-10T20:00:00"), id: "t" });
  const lv = s.css.match(/@keyframes Lvt\{(.*?)\}\n/s)[1];
  const values = [...lv.matchAll(/scaleY\(([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...values) <= 1 / 3 + 1e-9, `max level ${Math.max(...values)}`);
  let drops = 0;
  for (let i = 1; i < values.length; i++) if (values[i] < values[i - 1]) drops++;
  assert.equal(drops, 5);
});

test("seasons and fixed-date holidays", () => {
  assert.equal(seasonFor(new Date("2026-09-25")), "autumn");
  assert.equal(seasonFor(new Date("2026-07-01")), "summer");
  assert.equal(holidayFor(new Date("2026-11-05")), "bonfire");
  assert.equal(holidayFor(new Date("2026-11-06")), null);
  assert.match(renderScene({ scene: "diwali", id: "d" }).css, /Lvd/);
});
