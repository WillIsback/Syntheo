/**
 * Le gestionnaire de dépôt natif de Tauri est désactivé (pour le glisser-déposer
 * HTML5 des notes) : un fichier lâché hors d'une zone de dépôt fait alors
 * naviguer la webview vers ce fichier (WebKitGTK, WebView2), ce qui ressemble à
 * un rafraîchissement et fait perdre l'app (issue 464). Les zones de dépôt
 * (note, éditeur) gèrent le fichier avant ce garde, qui n'agit qu'en dernier.
 */
export function preventFileDropNavigation(target: Window = window) {
  const onDragOver = (event: DragEvent) => {
    if (event.defaultPrevented || !carriesFiles(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "none";
    }
  };
  const onDrop = (event: DragEvent) => {
    if (event.defaultPrevented || !carriesFiles(event)) {
      return;
    }
    event.preventDefault();
  };

  target.addEventListener("dragover", onDragOver);
  target.addEventListener("drop", onDrop);
  return () => {
    target.removeEventListener("dragover", onDragOver);
    target.removeEventListener("drop", onDrop);
  };
}

function carriesFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}
