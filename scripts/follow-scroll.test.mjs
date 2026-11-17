import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Use the existing compiler so tests work on the same Node versions as Vite.
const source = readFileSync(new URL("../src/components/subtitles/lib/followScroll.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } });
const { nextFollowScrollTop } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

function followFor(milliseconds, hz) {
  let position = 0;
  for (let frame = 0; frame < milliseconds * hz / 1000; frame++) {
    position = nextFollowScrollTop(position, 600, 2000, 1000 / hz, true, 600);
  }
  return position;
}

test("equal elapsed time produces the same position at 60/120/144/240 Hz", () => {
  const expected = followFor(250, 60);
  assert.ok(expected > 0 && expected < 600);
  for (const hz of [120, 144, 240]) assert.ok(Math.abs(followFor(250, hz) - expected) < 1e-8);
});

test("following converges without overshoot in either direction", () => {
  for (const [start, target] of [[0, 600], [600, 0]]) {
    let position = start;
    for (let frame = 0; frame < 120; frame++) {
      const next = nextFollowScrollTop(position, target, 2000, 1000 / 144, true, 600);
      assert.ok(next >= Math.min(position, target) && next <= Math.max(position, target));
      position = next;
    }
    assert.equal(position, target);
  }
});

test("off/reduced reaches the destination in one update regardless of frame duration", () => {
  assert.equal(nextFollowScrollTop(10, 400, 1000, 0, false, 600), 400);
});

test("a distant seek reveals its destination without scrolling through intermediate lines", () => {
  assert.equal(nextFollowScrollTop(0, 10000, 20000, 16, true, 500), 10000);
});

test("viewport boundaries settle even if the requested line cannot be centred", () => {
  assert.equal(nextFollowScrollTop(300, 500, 300, 16, true, 600), 300);
  assert.equal(nextFollowScrollTop(0, -500, 300, 16, true, 600), 0);
  assert.equal(nextFollowScrollTop(100, 500, 300, 16, false, 600), 300);
});

test("an empty scroll range and small final differences settle exactly", () => {
  assert.equal(nextFollowScrollTop(0, 500, 0, 16, true, 600), 0);
  assert.equal(nextFollowScrollTop(99, 100, 300, 16, true, 600), 100);
});
