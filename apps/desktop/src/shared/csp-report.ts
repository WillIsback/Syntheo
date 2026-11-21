// Violations de la CSP (issue 642) écrites dans app.log, pour repérer une
// ressource bloquée à tort. Seuls la directive et l'origine bloquée sont
// gardés : jamais le chemin ni la requête de l'adresse, qui peuvent porter des
// données.

export function cspViolationMessage(event: {
  effectiveDirective: string;
  blockedURI: string;
}): string {
  let blocked = event.blockedURI;
  try {
    const url = new URL(event.blockedURI);
    blocked = url.origin !== "null" ? url.origin : `${url.protocol}`;
  } catch {
    // Mots-clés (« inline », « eval », « data », « blob ») : gardés tels quels.
    blocked = event.blockedURI.slice(0, 16);
  }
  return `[csp] ${event.effectiveDirective} ${blocked}`;
}

export function startCspViolationReport() {
  if (typeof document === "undefined") return;
  document.addEventListener("securitypolicyviolation", (event) => {
    console.warn(cspViolationMessage(event));
  });
}
