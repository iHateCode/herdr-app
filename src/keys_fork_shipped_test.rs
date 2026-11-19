// Fork test, pulled into `keys::tests` by `include!`: the shipped lists are private there.

/// The fork's default keys file differs from upstream's (it adds
/// `layout:main-folders`). An untouched copy of it must still count as a
/// shipped original, so it upgrades when the defaults next change (for
/// example after an upstream sync). Without the fork snapshots in the
/// shipped lists, it would be kept as a hand-edited file for good.
#[test]
fn an_untouched_fork_keys_file_still_upgrades() {
    let dir = std::env::temp_dir().join(format!("herdr-keys-fork-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("keys.json");
    for (fork, originals) in [
        (include_str!("keys/shipped/fork-v0.1.16-keys.json"), super::SHIPPED_KEYS),
        (include_str!("keys/shipped/fork-v0.1.16-keys.macos.json"), super::SHIPPED_MACOS_KEYS),
    ] {
        let newer = "{ \"global\": {} }\n";
        std::fs::write(&path, fork).unwrap();
        assert_eq!(super::load_text(&path, newer, originals).unwrap(), newer, "an untouched fork keys file is a shipped default");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), newer);
    }
    std::fs::remove_dir_all(dir).unwrap();
}
