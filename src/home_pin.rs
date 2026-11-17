//! Fork: a home tab's pin follows its tab into another space, where the
//! moved tab becomes that space's home tab (replacing any it had).

use std::collections::{BTreeMap, HashSet};

use crate::model::Model;

/// After a sync: a pinned tab now found in another space pins it there.
pub fn follow(model: &mut Model, homes: &BTreeMap<String, String>) {
    for (space, tab) in homes {
        if !model.space(space).is_some_and(|s| s.tab(tab).is_some()) {
            model.pin_home(tab, true);
        }
    }
}

/// Before a pane is parked: remember the terminal if parking it closes its
/// space's home tab, so keeping it again can pin its new tab.
pub fn remember(model: &Model, pane: &str, address: &str, parked: &mut HashSet<String>) {
    let Some(space) = model.space_of(pane) else { return };
    let Some(home) = space.home_tab() else { return };
    if home.root.find(pane).is_some() && home.root.panes().len() == 1 {
        parked.insert(address.to_owned());
    }
}

/// After a parked terminal gets a tab of its own again: pin that tab.
pub fn restore(model: &mut Model, tab: &str, address: &str, parked: &mut HashSet<String>) {
    if parked.remove(address) {
        model.pin_home(tab, true);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Tab;

    fn two_spaces() -> Model {
        let mut m = Model::default();
        m.add_space("a", "a", "/a", Tab::new("ta", "a", "pa", "t1"));
        m.add_tab("a", Tab::new("tx", "x", "px", "t2"));
        m.add_space("b", "b", "/b", Tab::new("tb", "b", "pb", "t3"));
        m
    }

    #[test]
    fn a_pinned_tab_synced_into_another_space_is_home_there() {
        let mut m = two_spaces();
        m.pin_home("tb", true);
        let homes = BTreeMap::from([("a".to_owned(), "tx".to_owned()), ("b".to_owned(), "tb".to_owned())]);
        // The tab moves from a to b, as a document from another client says.
        let (_, _) = m.remove_tab("tx");
        m.add_tab("b", Tab::new("tx", "x", "px", "t2"));
        follow(&mut m, &homes);
        assert_eq!(m.space("b").unwrap().home.as_deref(), Some("tx"), "the moved tab takes over");
        assert_eq!(m.space("a").unwrap().home, None);
        // Gone tabs and tabs still at home change nothing.
        follow(&mut m, &BTreeMap::from([("a".to_owned(), "gone".to_owned())]));
        assert_eq!(m.space("b").unwrap().home.as_deref(), Some("tx"));
    }

    #[test]
    fn a_parked_home_tab_is_home_again_when_kept() {
        let mut m = two_spaces();
        let mut parked = HashSet::new();
        // Not home: nothing to remember.
        remember(&m, "pa", "t1", &mut parked);
        assert!(parked.is_empty());
        m.pin_home("tx", true);
        remember(&m, "px", "t2", &mut parked);
        m.remove_pane("px");
        m.add_tab("b", Tab::new("tn", "x", "pn", "t2"));
        restore(&mut m, "tn", "t2", &mut parked);
        assert_eq!(m.space("b").unwrap().home.as_deref(), Some("tn"));
        assert!(parked.is_empty());
        // A terminal that was never home stays unpinned.
        m.add_tab("a", Tab::new("to", "o", "po", "t9"));
        restore(&mut m, "to", "t9", &mut parked);
        assert_eq!(m.space("a").unwrap().home, None);
    }

    #[test]
    fn a_home_tab_that_keeps_other_panes_stays_home() {
        let mut m = two_spaces();
        m.pin_home("tx", true);
        m.split("px", crate::layout::Axis::Row, "py", "t5");
        let mut parked = HashSet::new();
        remember(&m, "px", "t2", &mut parked);
        assert!(parked.is_empty());
    }
}
