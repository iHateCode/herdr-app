import { test, expect } from "bun:test";
import { readFile } from "node:fs/promises";

const source = (await readFile(new URL("../defaults/mods/menu/main.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "").replace("export default class Menu", "class Menu").replace(/^export /gm, "");

// items() and menuIcon() only read what the mod API gives them.
function load(tabs: { id: string; home: boolean }[]) {
  const api = new Function("View", "run", "props", "closeOverlay", "openOverlay", "theme", "keys", "terminals", "spaces", "panes", "exec",
    `${source}; return { items, menuIcon };`)(
    class {}, () => {}, () => ({}), () => {}, () => {}, () => ({}), () => [], () => [], () => [{ id: "s", tabs }], () => [], async () => ({ code: 1 }));
  return api;
}

const labels = (rows: any[][]) => rows.map(r => r[0]);

test("the tab menu offers Unpin on the home tab and Pin on any other", () => {
  const { items } = load([{ id: "a", home: true }, { id: "b", home: false }]);
  const on = (id: string) => items({ tab: "tab", target: { id, space: "s" } }, null);
  expect(labels(on("a"))).toContain("Unpin home tab");
  expect(labels(on("a"))).not.toContain("Pin as home tab");
  expect(labels(on("b"))).toContain("Pin as home tab");
  expect(on("a").find(r => r[1] === "tab.pin")[2]).toEqual({ id: "a", pinned: false });
  expect(on("b").find(r => r[1] === "tab.pin")[2]).toEqual({ id: "b", pinned: true });
});

test("the pin item has the pin icon, not the terminal one", () => {
  const { menuIcon } = load([]);
  expect(menuIcon("tab.pin", { pinned: true })).toBe("mods/workspace-chrome/pin.svg");
  expect(menuIcon("tab.pin", { pinned: false })).toBe("mods/workspace-chrome/pin-off.svg");
  expect(menuIcon("tab.close")).toBe("mods/workspace-chrome/x.svg");
});
