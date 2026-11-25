import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

/**
 * Tâches de démarrage de la fenêtre principale, lancées au montage, sous
 * `AppI18nProvider` (passe QA 0.8.1-1, issue 665) : le fournisseur ne rend
 * ses enfants qu'une fois le catalogue chargé et la langue active. Lancées
 * plus tôt (effet de montage de `ReadyApp`), les tâches qui traduisent un
 * message, comme l'invite des adresses HTTP héritées, levaient « Lingui:
 * Attempted to call a translation function without setting a locale ».
 */
export function StartupTasks({ run }: { run: () => void }) {
  useMountEffect(() => {
    run();
  });
  return null;
}
