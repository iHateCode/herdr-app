// Fork test, pulled into `window::tests` by `include!`: the helpers it uses are private there.
#[test]
fn mouse_side_buttons_send_back_and_forward_to_space_header() {
    in_own_process("side_buttons_reach_space_header");
}

/// A `space-header` mod beside a terminal pane records every command it
/// gets in the shared key `sidebtn`. Back over the terminal and forward
/// elsewhere reach it; a left click and a middle click do not.
#[gpui::test]
fn side_buttons_reach_space_header(cx: &mut gpui::TestAppContext) {
    use serde_json::json;
    if !running_alone("side_buttons_reach_space_header") {
        return;
    }
    let main_js = r#"
        import { div } from "gpui-kit";
        import { nextCommand, setShared } from "herdr";
        export default class SpaceHeader {
          init(_p, cx) {
            const got = [];
            cx.spawn(async (cx) => {
              for (;;) {
                got.push(await nextCommand());
                setShared("sidebtn", got.slice());
                cx.notify();
              }
            });
          }
          render() { return div().size_full(); }
        }
    "#;
    let (_view, cx) = open_window(cx, "space-header", main_js, json!({
        "id": "root", "type": "row", "children": [
            { "id": "terminal", "type": "block", "content": { "terminal": "t1" } },
            { "id": "header", "type": "block", "content": { "mod": "space-header" } }
        ]
    }));
    cx.run_until_parked();
    let viewport = cx.update(|window, _| window.viewport_size());
    let over_terminal = gpui::point(viewport.width * 0.25, viewport.height * 0.5);
    let over_header = gpui::point(viewport.width * 0.75, viewport.height * 0.5);
    let received = || crate::mods::shared("sidebtn").unwrap_or(json!([]));
    let press = |cx: &mut gpui::VisualTestContext, at, button| {
        cx.simulate_mouse_move(at, None, gpui::Modifiers::default());
        cx.simulate_mouse_down(at, button, gpui::Modifiers::default());
        cx.simulate_mouse_up(at, button, gpui::Modifiers::default());
        cx.run_until_parked();
    };

    // The mod listens: a command sent straight to it arrives.
    assert!(crate::mods::send_command("space-header", "probe"));
    cx.run_until_parked();
    assert_eq!(received(), json!(["probe"]), "the test mod receives commands");

    press(cx, over_terminal, gpui::MouseButton::Left);
    press(cx, over_header, gpui::MouseButton::Left);
    press(cx, over_terminal, gpui::MouseButton::Middle);
    assert_eq!(received(), json!(["probe"]), "other buttons send nothing to space-header");

    press(cx, over_terminal, gpui::MouseButton::Navigate(gpui::NavigationDirection::Back));
    assert_eq!(received(), json!(["probe", "back"]), "back over a terminal pane");

    press(cx, over_header, gpui::MouseButton::Navigate(gpui::NavigationDirection::Forward));
    assert_eq!(received(), json!(["probe", "back", "forward"]), "forward elsewhere in the window");

    press(cx, over_terminal, gpui::MouseButton::Left);
    assert_eq!(received(), json!(["probe", "back", "forward"]), "a later left click adds nothing");
}
