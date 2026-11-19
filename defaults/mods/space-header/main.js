// The sidebar's top bar and footer, in place of Herdr's workspace-chrome there:
// the bar says where you are, the space's name and the tab (its agent) you're in,
// instead of the app's name. Search and the sidebar button as before. The footer
// is Herdr's, plus a way back from the rail: the agents list that used to open it
// is not in this fork's layout.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { theme, run, props, openOverlay, closeOverlay, window, shared, setShared, updates, layout, focused, spaces, nextCommand } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// The same colors and commander rule the sidebar's badge uses (space-folders).
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const commander = (name) => /^([a-z]+)-cmdr-/.exec(name ?? "")?.[1] ?? null;

// A tab's job without the name, role and model the pill already shows:
// "mona-cmdr-opus-pin-truncate" is "pin-truncate". Other names stay whole.
export const job = (name) => /^[a-z]+-(?:cmdr|dev|archy|vault|cursor|opencode|merger)-[a-z0-9.]+-(.+)$/.exec(name ?? "")?.[1] ?? name;

const icon = (name) => `mods/workspace-chrome/${name}.svg`;

// Where you are: the shown space and tab. Null before anything is shown.
export function here(f, all) {
  const space = f ? all.find((s) => s.id === f.space) : all.find((s) => s.active);
  if (!space) return null;
  const tab = (space.tabs ?? []).find((c) => c.id === f?.tab) ?? (space.tabs ?? []).find((c) => c.active);
  const lead = (space.tabs ?? []).map((c) => commander(c.name)).find(Boolean) ?? null;
  return { id: space.id, space: space.name, tab: tab?.name ?? null, who: commander(tab?.name) ?? lead };
}

// The spaces you've been in, newest first: { id: when last shown } in this mod's
// own storage. Spaces you haven't been in since this started come last, by name.
function visits() {
  try { return JSON.parse(localStorage.getItem("spaces.visited") ?? "{}"); } catch { return {}; }
}

export function recent(all, seen) {
  return [...all].sort((a, b) => (seen[b.id] ?? 0) - (seen[a.id] ?? 0) || String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase()));
}

// "now", "5m", "2h", "3d" since a visit; "" for none.
function ago(ms) {
  if (!ms) return "";
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// Back and forward through the spaces you've been in, as a browser does with
// pages: { list: [space ids, oldest first], i: where you are in it }. Moving to a
// space by any other way drops what was ahead and adds it at the end.
const TRAIL = 50;

export function push(trail, id) {
  if (trail.list[trail.i] === id) return trail;
  const list = [...trail.list.slice(0, trail.i + 1), id].slice(-TRAIL);
  return { list, i: list.length - 1 };
}

// The next place in that direction (-1 back, 1 forward) whose space still
// exists, as { id, i }, or null.
export function step(trail, dir, live) {
  for (let j = trail.i + dir; j >= 0 && j < trail.list.length; j += dir)
    if (live.has(trail.list[j])) return { id: trail.list[j], i: j };
  return null;
}

export default class SpaceHeader extends View {
  init(_props, cx) {
    this.scroll = ScrollHandle.new();
    try { this.trail = JSON.parse(localStorage.getItem("spaces.trail") ?? "null"); } catch {}
    if (!Array.isArray(this.trail?.list)) this.trail = { list: [], i: -1 };
    // The app sends "back" and "forward" for the mouse side buttons.
    cx.spawn((cx) => this.listen(cx, nextCommand));
  }

  // Takes commands one at a time. Only the top bar acts: the footer and the history
  // pop-up get every command too and must ignore them. After a step, waits for the next
  // render to land (visit() clears this.going), so quick presses queue and each steps once.
  async listen(cx, next) {
    for (;;) {
      const c = await next();
      if (props()?.footer || props()?.history) continue;
      if (c === "back") this.go(-1);
      else if (c === "forward") this.go(1);
      for (let waited = 0; this.going && waited < 1000; waited += 20) await cx.sleep(20);
    }
  }

  go(dir) {
    const to = step(this.trail, dir, new Set(spaces().map((s) => s.id)));
    if (!to) return;
    this.going = to;
    run("space.select", { id: to.id });
  }

  // Stamps the shown space when it changes, so the list knows the order you went in.
  visit(id) {
    if (!id || id === this.last) return;
    this.last = id;
    // A back or forward lands where it aimed; any other move starts a new branch.
    this.trail = this.going?.id === id ? { ...this.trail, i: this.going.i } : push(this.trail, id);
    this.going = null;
    try { localStorage.setItem("spaces.trail", JSON.stringify(this.trail)); } catch {}
    const seen = visits();
    seen[id] = Date.now();
    try { localStorage.setItem("spaces.visited", JSON.stringify(seen)); } catch {}
  }

  // The drop-down: every space, the one you were in most recently first.
  history(t) {
    // The visits come from the bar that opened this: a popup's copy of the
    // mod doesn't see what the bar's copy saved since it started.
    const { overlay, seen = {} } = props();
    const now = focused()?.space;
    const rows = recent(spaces(), seen).map((s) => {
      const tabs = s.tabs ?? [];
      const at = { id: s.id, who: tabs.map((c) => commander(c.name)).find(Boolean) ?? null };
      return h_flex().id(`visit-${s.id}`).h(30).px(8).gap(8).flex_none().items_center().rounded(6).cursor_pointer()
        .when(s.id === now, el => el.bg(t.selected))
        .hover(st => st.bg(t.hover))
        .on_click(() => { closeOverlay(overlay); run("space.select", { id: s.id }); })
        .child(this.pill(t, at))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(s.name ?? ""))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(s.id === now ? "here" : ago(seen[s.id])));
    });
    return v_flex().id("visit-list").size_full().p(5).gap(1).bg(t.popover).overflow_y_scroll().track_scroll(this.scroll).children(rows);
  }

  // Opens the drop-down under the bar's names.
  open() {
    const n = spaces().length;
    openOverlay({ mod: "space-header", kind: "popup", width: 320, height: Math.min(n, 12) * 31 + 12, props: { history: true, seen: visits() } });
  }

  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }

  footer(t, collapsed) {
    const row = (id, name, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
      .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
      .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
      .on_click(action).child(svg(icon(name)).size(14))
      .when(!collapsed, el => el.child(label));
    const ready = div().size(6).rounded_full().bg(t.accent);
    return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
      .when(collapsed, el => el.px(0).items_center())
      // On the macOS rail the top bar has no room for the sidebar button.
      .when(collapsed && window()?.platform === "macos", el => el.child(row("sidebar-open", "chevron-right", "Open sidebar", false, toggleSidebar)))
      .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
        .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
      // The footer is two rows high: on that rail, opening the sidebar takes Add machine's place.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" }))));
  }

  // A back (-1) or forward (1) arrow, faint when there's nowhere to go.
  nav(t, dir) {
    const can = Boolean(step(this.trail, dir, new Set(spaces().map((s) => s.id))));
    const name = dir < 0 ? "Back" : "Forward";
    return div().id(`nav-${dir < 0 ? "back" : "forward"}`).w(22).self_stretch().flex_none().flex().items_center().justify_center().rounded(8)
      .text_color(can ? t.muted : t.dim).opacity(can ? 1 : 0.45).tooltip(name)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .when(can, el => el.cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground)).on_click(() => this.go(dir)))
      .child(svg(icon(dir < 0 ? "chevron-left" : "chevron-right")).size(14));
  }

  // The space's colored badge, as the sidebar draws it: the commander's first name, or "-".
  pill(t, at) {
    const color = (shared("space.colors") ?? {})[at.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    return h_flex().w(32).h(18).flex_none().mr(4).rounded(5).bg(fill).items_center().justify_center()
      .text_size(10.5).font_bold().text_color("#ffffff").child(at.who ?? "-");
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) return this.footer(t, collapsed);
    if (props()?.history) return this.history(t);
    const at = here(focused(), spaces());
    this.visit(at?.id);
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center()
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      // The badge and the names sit together in the middle of the bar, like a window title.
      // Back, where you are, forward.
      .when(!collapsed, el => el.child(h_flex().flex_1().min_w(0).justify_center().items_center().gap(2)
        .child(this.nav(t, -1))
        .child(h_flex().id("where").min_w(0).mx(4).px(6).py(3).rounded(8).items_center().hover(s => s.bg(t.hover))
          .when(Boolean(at?.tab), el => el.tooltip(at.tab))
          .cursor_pointer().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => this.open())
          .when(Boolean(at), el => el.child(this.pill(t, at)))
          .child(v_flex().min_w(0)
            .child(div().min_w(0).truncate().text_size(13).font_semibold().text_color(t.foreground).child(at?.space ?? "Herdr"))
            .when(Boolean(at?.tab), el => el.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(job(at.tab))))))
        .child(this.nav(t, 1))))
      .when(!collapsed, el => el.child(this.button("search", svg(icon("search")).size(15), () => run("mod.open", { name: "picker" }))))
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg(icon("sidebar")).size(15), toggleSidebar)));
  }
}
