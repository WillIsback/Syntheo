//! Accès au gestionnaire depuis le `wndproc`, sans panique en cas de réentrance.
//!
//! Le menu « Options » (`TrackPopupMenu`) tourne dans une boucle modale ouverte
//! pendant que le gestionnaire est déjà emprunté (clic → `handle_click` →
//! `show_options_menu`). Cette boucle distribue les `WM_TIMER`, `WM_MOUSEMOVE`,
//! `WM_MOUSELEAVE`… au même `wndproc` : un second `borrow_mut()` du `RefCell`
//! paniquerait et ferait planter l'application. Risque identifié par lecture du
//! code, non reproduit (issue 410).
//!
//! Deux façons d'accéder au gestionnaire :
//! - [`Reentrant::try_with`] ignore l'événement si le gestionnaire est déjà
//!   emprunté (tick du timer, mouvement de souris : le suivant fera le travail) ;
//! - [`Reentrant::with_or_defer`] met l'événement en file s'il ne doit pas être
//!   perdu ; il s'exécute dès que l'emprunt en cours se termine.

use std::cell::RefCell;
use std::collections::VecDeque;

type Deferred<T> = Box<dyn FnOnce(&mut T)>;

pub(crate) struct Reentrant<T> {
    value: RefCell<T>,
    deferred: RefCell<VecDeque<Deferred<T>>>,
}

impl<T> Reentrant<T> {
    pub(crate) fn new(value: T) -> Self {
        Self {
            value: RefCell::new(value),
            deferred: RefCell::new(VecDeque::new()),
        }
    }

    /// Exécute `f` si la valeur est libre, sinon renvoie `None` sans paniquer.
    pub(crate) fn try_with<R>(&self, f: impl FnOnce(&mut T) -> R) -> Option<R> {
        let result = {
            let mut value = self.value.try_borrow_mut().ok()?;
            f(&mut value)
        };
        self.run_deferred();
        Some(result)
    }

    /// Exécute `f` tout de suite si la valeur est libre, sinon à la fin de
    /// l'emprunt en cours.
    pub(crate) fn with_or_defer(&self, f: impl FnOnce(&mut T) + 'static) {
        match self.value.try_borrow_mut() {
            Ok(mut value) => {
                f(&mut value);
                drop(value);
                self.run_deferred();
            }
            Err(_) => self.deferred.borrow_mut().push_back(Box::new(f)),
        }
    }

    /// Exécute la file, y compris ce qui y est ajouté pendant son exécution.
    fn run_deferred(&self) {
        loop {
            let Some(next) = self.deferred.borrow_mut().pop_front() else {
                return;
            };
            let Ok(mut value) = self.value.try_borrow_mut() else {
                // Appel imbriqué : l'emprunt le plus externe videra la file.
                self.deferred.borrow_mut().push_front(next);
                return;
            };
            next(&mut value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::rc::Rc;

    #[test]
    fn try_with_runs_when_free() {
        let cell = Reentrant::new(1);
        assert_eq!(cell.try_with(|value| *value + 1), Some(2));
    }

    #[test]
    fn nested_try_with_is_skipped_without_panic() {
        let cell = Reentrant::new(0);
        let inner = cell.try_with(|value| {
            *value += 1;
            // Simule un `WM_TIMER` distribué par la boucle modale du menu.
            cell.try_with(|value| *value += 100)
        });
        assert_eq!(inner, Some(None));
        assert_eq!(cell.try_with(|value| *value), Some(1));
    }

    #[test]
    fn with_or_defer_runs_immediately_when_free() {
        let cell = Reentrant::new(Vec::new());
        cell.with_or_defer(|value: &mut Vec<u32>| value.push(1));
        assert_eq!(cell.try_with(|value| value.clone()), Some(vec![1]));
    }

    #[test]
    fn nested_with_or_defer_runs_after_outer_borrow_in_order() {
        let cell = Rc::new(Reentrant::new(Vec::new()));
        let inner = Rc::clone(&cell);
        cell.try_with(move |value: &mut Vec<u32>| {
            value.push(1);
            // Simule un `WM_MOUSELEAVE` pendant le menu : il ne doit pas être perdu.
            inner.with_or_defer(|value| value.push(3));
            inner.with_or_defer(|value| value.push(4));
            value.push(2);
        });
        assert_eq!(cell.try_with(|value| value.clone()), Some(vec![1, 2, 3, 4]));
    }

    #[test]
    fn deferred_work_can_defer_more_work() {
        let cell = Rc::new(Reentrant::new(Vec::new()));
        let first = Rc::clone(&cell);
        let second = Rc::clone(&cell);
        cell.try_with(move |_: &mut Vec<u32>| {
            first.with_or_defer(move |value| {
                value.push(1);
                second.with_or_defer(|value| value.push(2));
            });
        });
        assert_eq!(cell.try_with(|value| value.clone()), Some(vec![1, 2]));
    }
}
