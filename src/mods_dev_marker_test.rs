// Fork test, pulled into `mods::tests` by `include!`: `sync_defaults` is private there.

/// A bundled mod's folder with a `.dev` file is left exactly as it is: not
/// renamed to -edited, not rewritten, no toast, not deleted when dropped.
/// Without the file, an edited copy still moves aside and an untouched one
/// is still replaced.
#[test]
fn a_dev_marker_keeps_a_bundled_mod_folder_untouched() {
    let root = std::env::temp_dir().join(format!("herdr-app-dev-marker-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let (mods, record) = (root.join("mods"), root.join("installed.json"));
    let read = |p: &str| std::fs::read_to_string(mods.join(p)).unwrap_or_default();

    let v1: &[(&str, &[u8])] = &[("devmark-own/main.js", b"o1"), ("devmark-edit/main.js", b"e1"), ("devmark-same/main.js", b"s1")];
    super::sync_defaults(&mods, &record, v1).unwrap();

    std::fs::write(mods.join("devmark-own/main.js"), "my dev code").unwrap();
    std::fs::write(mods.join("devmark-own/.dev"), "").unwrap();
    std::fs::write(mods.join("devmark-edit/main.js"), "mine").unwrap();
    let v2: &[(&str, &[u8])] = &[("devmark-own/main.js", b"o2"), ("devmark-own/new.js", b"n"), ("devmark-edit/main.js", b"e2"), ("devmark-same/main.js", b"s2")];
    super::sync_defaults(&mods, &record, v2).unwrap();

    assert_eq!(read("devmark-own/main.js"), "my dev code", "a marked copy is not rewritten");
    assert!(!mods.join("devmark-own/new.js").exists(), "nothing is added to a marked copy");
    assert!(!mods.join("devmark-own-edited").exists(), "a marked copy is not moved aside");
    assert!(!super::take_sync_notes().iter().any(|n| n.starts_with("devmark-own")), "no toast for a marked copy");

    assert_eq!(read("devmark-edit/main.js"), "e2", "without a marker, an edited copy is replaced");
    assert_eq!(read("devmark-edit-edited/main.js"), "mine", "and the edits move to -edited");
    assert_eq!(read("devmark-same/main.js"), "s2", "without a marker, an untouched copy is updated");

    // No longer shipped: a marked copy that matches the record still stays.
    std::fs::write(mods.join("devmark-same/.dev"), "").unwrap();
    super::sync_defaults(&mods, &record, &[("devmark-edit/main.js", b"e2")]).unwrap();
    assert_eq!(read("devmark-same/main.js"), "s2", "a marked copy is not deleted when dropped");

    std::fs::remove_dir_all(&root).unwrap();
}
