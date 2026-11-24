import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/motion/motionPresets.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
});
const { surfacePose, surfaceTransition } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("settings move on entry and exit without changing glass group opacity", () => {
  const entry = surfacePose("settingsDialog", "initial", true);
  const visible = surfacePose("settingsDialog", "visible", true);
  const exit = surfacePose("settingsDialog", "exit", true);
  for (const pose of [entry, visible, exit]) {
    assert.equal(pose.opacity, 1);
    assert.equal(pose.transform, undefined);
    assert.equal(pose.x, undefined);
    assert.equal(pose.y, undefined);
  }
  assert.ok(Number.parseFloat(entry["--surface-y"]) > 0);
  assert.equal(Number.parseFloat(visible["--surface-y"]), 0);
  assert.ok(Number.parseFloat(exit["--surface-y"]) > 0);
  assert.ok(surfaceTransition("settingsDialog", "enter", true).duration > 0);
  assert.ok(surfaceTransition("settingsDialog", "exit", true).duration > 0);
});

test("off/reduced settings have no residual movement or removal delay", () => {
  for (const phase of ["initial", "visible", "exit"]) {
    const pose = surfacePose("settingsDialog", phase, false);
    assert.equal(pose.opacity, 1);
    assert.equal(Number.parseFloat(pose["--surface-y"]), 0);
  }
  for (const phase of ["enter", "exit"]) {
    assert.equal(surfaceTransition("settingsDialog", phase, false).duration, 0);
    assert.equal(surfaceTransition("settingsBackdrop", phase, false).duration, 0);
  }
});

test("the settings backdrop changes its shade without fading its descendants", () => {
  const entry = surfacePose("settingsBackdrop", "initial", true);
  const visible = surfacePose("settingsBackdrop", "visible", true);
  const exit = surfacePose("settingsBackdrop", "exit", true);
  for (const pose of [entry, visible, exit]) assert.equal(pose.opacity, 1);
  assert.notEqual(entry.backgroundColor, visible.backgroundColor);
  assert.equal(exit.backgroundColor, entry.backgroundColor);
});

test("fadeOnly mode in Liquid Glass removes all positional offsets across surfaces", () => {
  for (const kind of ["popover", "panel", "dialog", "sidebar", "settingsDialog"]) {
    const entry = surfacePose(kind, "initial", true, true);
    const visible = surfacePose(kind, "visible", true, true);
    const exit = surfacePose(kind, "exit", true, true);
    assert.equal(entry.opacity, 0);
    assert.equal(visible.opacity, 1);
    assert.equal(exit.opacity, 0);
    if (kind === "dialog") {
      assert.equal(entry.y, 0);
      assert.equal(exit.y, 0);
    } else if (kind === "sidebar") {
      assert.equal(entry.x, 0);
      assert.equal(exit.x, 0);
    } else {
      assert.equal(entry["--surface-y"], "0px");
      assert.equal(exit["--surface-y"], "0px");
    }
  }
});
