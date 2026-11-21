// Violations de la CSP (issue 642) écrites dans app.log, pour repérer une
// ressource bloquée à tort. Seuls la directive et l'origine bloquée sont
// gardés : jamais le chemin ni la requête de l'adresse, qui peuvent porter des
// données.

export function cspViolationMessage(event: {
  effectiveDirective: string;
  blockedURI: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
}): string {
  let blocked = event.blockedURI;
  try {
    const url = new URL(event.blockedURI);
    blocked = url.origin !== "null" ? url.origin : `${url.protocol}`;
  } catch {
    // Mots-clés (« inline », « eval », « data », « blob ») : gardés tels quels.
    blocked = event.blockedURI.slice(0, 16);
  }
  // Emplacement du code en cause : nom du fichier de l'application seulement.
  const file = event.sourceFile?.split(/[?#]/)[0]?.split("/").pop();
  const where = file
    ? ` at ${file.slice(0, 48)}:${event.lineNumber ?? 0}:${event.columnNumber ?? 0}`
    : "";
  return `[csp] ${event.effectiveDirective} ${blocked}${where}`;
}

export function startCspViolationReport() {
  if (typeof document === "undefined") return;
  document.addEventListener("securitypolicyviolation", (event) => {
    console.warn(cspViolationMessage(event));
  });
}
