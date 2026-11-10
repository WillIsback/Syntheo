/// <reference types="vite/client" />

// Module virtuel du plugin Vite `plugins/changelog.ts` : journal de la ligne
// de version installée, de la plus récente à la plus ancienne (issue #536).
declare module "virtual:changelog" {
  export const entries: ReadonlyArray<{
    version: string;
    date: string | null;
    summary: string | null;
    content: string;
  }>;
}
