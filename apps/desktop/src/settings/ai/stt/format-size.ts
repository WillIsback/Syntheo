// Taille dans la langue de l'interface (QA 0.8.0-4) : « 1,1 Go » en
// français, « 1.1 GB » en anglais. Une taille non nulle n'est jamais affichée
// « 0 Mo » : les Mo sont arrondis au-dessus.
export function formatSize(bytes: number, locale: string): string {
  const french = locale.toLowerCase().startsWith("fr");
  const gb = bytes / 1e9;
  if (gb >= 1) {
    const value = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(gb);
    return `${value} ${french ? "Go" : "GB"}`;
  }
  return `${Math.ceil(bytes / 1e6)} ${french ? "Mo" : "MB"}`;
}
