// CSP de l'application : tauri.conf.json (`app.security.csp`). Tauri ajoute
// d'office un nonce et les empreintes des <style> de index.html à `style-src`,
// ce qui fait ignorer 'unsafe-inline' : toute balise <style> injectée à
// l'exécution par une bibliothèque (verrouillage du défilement des boîtes de
// dialogue Radix, animations de motion, react-colorful…) serait bloquée.
// `dangerousDisableAssetCspModification: ["style-src"]` laisse `style-src`
// tel qu'écrit ('self' 'unsafe-inline'). Le risque d'un style injecté (mise en
// page, au pire un leurre visuel) est sans commune mesure avec celui d'un
// script : `script-src` garde ses nonces et empreintes, sans 'unsafe-inline'.
//
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
