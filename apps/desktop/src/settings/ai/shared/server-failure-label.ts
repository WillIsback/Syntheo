import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

import type { ServerFailure } from "./server-connection";

// Raison courte d'un échec de la sonde, commune à la pastille de la carte
// serveur et à la barre d'état du menu des paramètres (issue 786) : une clé
// refusée, une adresse invalide, une route absente ou une erreur du serveur
// ne sont pas un serveur injoignable.
export function useServerFailureLabel() {
  const { t } = useLingui();
  return useCallback(
    (failure: ServerFailure): string => {
      switch (failure.reason) {
        case "unauthorized":
          return t`Key refused`;
        case "invalid_url":
          return t`Invalid address`;
        case "not_found":
          return t`Route not found`;
        case "server_error":
          return t`Server error`;
        case "unreachable":
          return t`Unreachable`;
      }
    },
    [t],
  );
}
