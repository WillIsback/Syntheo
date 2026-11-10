// Barre latérale : sections repliables. Mintlify garde toujours dépliés les
// groupes de premier niveau ; ce script rend leur titre cliquable (souris et
// clavier), mémorise les sections repliées et rouvre toujours celle de la page
// affichée. Idempotent : relancé à chaque navigation interne.
(() => {
  if (window.syntheoSidebarCollapse) return;
  window.syntheoSidebarCollapse = true;

  const STORAGE_KEY = "syntheo-docs:collapsed-sections";
  const HEADER = "#sidebar .sidebar-group-header";

  const readCollapsed = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
      return new Set();
    }
  };
  const writeCollapsed = (collapsed) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Stockage indisponible (navigation privée) : l'état n'est pas gardé.
    }
  };

  const listOf = (header) => {
    const next = header.nextElementSibling;
    return next && next.matches("ul.sidebar-group") ? next : null;
  };
  const labelOf = (header) => header.textContent.trim();

  const setExpanded = (header, expanded) => {
    const list = listOf(header);
    if (!list) return;
    header.setAttribute("aria-expanded", String(expanded));
    list.hidden = !expanded;
  };

  const apply = () => {
    const collapsed = readCollapsed();
    document.querySelectorAll(HEADER).forEach((header) => {
      const list = listOf(header);
      if (!list) return;
      if (!header.hasAttribute("role")) {
        header.setAttribute("role", "button");
        header.setAttribute("tabindex", "0");
        header.classList.add("syntheo-collapsible");
      }
      // La section de la page affichée reste toujours ouverte.
      const hasActive = Boolean(list.querySelector("li[data-active]"));
      setExpanded(header, hasActive || !collapsed.has(labelOf(header)));
    });
  };

  const toggle = (header) => {
    const list = listOf(header);
    if (!list) return;
    const expanded = header.getAttribute("aria-expanded") !== "false";
    setExpanded(header, !expanded);
    const collapsed = readCollapsed();
    if (expanded) collapsed.add(labelOf(header));
    else collapsed.delete(labelOf(header));
    writeCollapsed(collapsed);
  };

  document.addEventListener("click", (event) => {
    const header = event.target.closest?.(HEADER);
    if (header) toggle(header);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const header = event.target.closest?.(HEADER);
    if (!header) return;
    event.preventDefault();
    toggle(header);
  });

  apply();
  window.addEventListener("mintlify:navigate", apply);
})();
