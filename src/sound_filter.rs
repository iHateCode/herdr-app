//! Fork addition: `sounds.only` in settings.json limits the attention sounds to
//! agents whose name contains that text (for example `-cmdr-` for commanders).
//! Absent or empty, every agent sounds, as upstream does.

/// Whether an alert for an agent known by `names` (its own name, its tab's
/// name) may play a sound. Matching is a plain, case-sensitive substring.
pub fn wanted(only: Option<&str>, names: &[&str]) -> bool {
    match only.filter(|s| !s.is_empty()) {
        None => true,
        Some(needle) => names.iter().any(|n| n.contains(needle)),
    }
}

#[cfg(test)]
mod tests {
    use super::wanted;

    #[test]
    fn unset_or_empty_allows_every_agent() {
        assert!(wanted(None, &["ben-dev-sonnet-x"]));
        assert!(wanted(Some(""), &["ben-dev-sonnet-x"]));
    }

    #[test]
    fn only_matching_names_sound() {
        assert!(wanted(Some("-cmdr-"), &["gus-cmdr-opus-boss"]));
        assert!(!wanted(Some("-cmdr-"), &["ben-dev-sonnet-x"]));
        assert!(!wanted(Some("-cmdr-"), &[]));
    }

    #[test]
    fn either_name_may_match() {
        assert!(wanted(Some("-cmdr-"), &["Claude Code", "amy-cmdr-opus-x"]));
    }
}
