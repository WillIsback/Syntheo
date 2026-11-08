// Injecté dans chaque webview de la version publiée, à côté de
// tauri-plugin-prevent-default (issue 376). Le plugin ne bloque plus le clic
// droit : ce script garde le menu natif seulement dans les champs de saisie et
// dans l'éditeur de notes (Copier / Coller) et l'annule partout ailleurs.
// Phase de capture : il décide avant les écouteurs de l'app, qui reçoivent
// quand même l'événement (preventDefault n'arrête pas la propagation).
(() => {
  const TEXT_INPUT_TYPES = new Set([
    "",
    "text",
    "search",
    "email",
    "url",
    "tel",
    "password",
    "number",
  ]);

  const isEditable = (target) => {
    const element =
      target instanceof Element ? target : (target?.parentElement ?? null);
    if (!element) {
      return false;
    }

    if (element instanceof HTMLTextAreaElement) {
      return !element.disabled;
    }

    if (element instanceof HTMLInputElement) {
      return (
        !element.disabled &&
        TEXT_INPUT_TYPES.has((element.getAttribute("type") ?? "").toLowerCase())
      );
    }

    // L'ancêtre le plus proche qui porte l'attribut décide, comme le
    // navigateur : un îlot contenteditable="false" dans l'éditeur reste bloqué.
    const host = element.closest("[contenteditable]");
    return (
      host !== null &&
      host.getAttribute("contenteditable")?.toLowerCase() !== "false"
    );
  };

  window.addEventListener(
    "contextmenu",
    (event) => {
      if (!isEditable(event.target)) {
        event.preventDefault();
      }
    },
    { capture: true },
  );
})();
