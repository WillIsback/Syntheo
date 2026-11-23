import { useLingui } from "@lingui/react/macro";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { BrandLoadingView } from "~/shared/brand-loading-view";
import type { Context } from "~/types";

const MainAppLayout = lazy(() => import("~/shared/main-app-layout"));

export const Route = createRootRouteWithContext<Partial<Context>>()({
  component: Component,
});

// Rendu sous AppI18nProvider (main.tsx) : le texte d'attente suit la langue
// de l'interface.
function Component() {
  const { t } = useLingui();
  return (
    <Suspense
      fallback={
        <BrandLoadingView
          detail={t`Loading your workspace. This should only take a moment.`}
        />
      }
    >
      <MainAppLayout />
    </Suspense>
  );
}
