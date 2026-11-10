// Suggestions de dossier proposées après la réunion (issue 499), en mémoire
// seulement : rien n'est écrit en base pour se souvenir qu'une bannière a été
// vue. Une note ne reçoit qu'une proposition par lancement de l'application,
// même si elle est refermée, rouverte ou réécoutée.

import { useSyncExternalStore } from "react";

import type { FolderSuggestion } from "./rule.ts";

const offered = new Set<string>();
const pending = new Map<string, FolderSuggestion>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Réserve la proposition de la note ; faux si elle a déjà eu la sienne.
export function claimFolderSuggestion(sessionId: string): boolean {
  if (offered.has(sessionId)) return false;
  offered.add(sessionId);
  return true;
}

export function offerFolderSuggestion(
  sessionId: string,
  suggestion: FolderSuggestion,
) {
  pending.set(sessionId, suggestion);
  emit();
}

export function dismissFolderSuggestion(sessionId: string) {
  if (pending.delete(sessionId)) emit();
}

export function useFolderSuggestionOffer(
  sessionId: string,
): FolderSuggestion | null {
  return useSyncExternalStore(
    subscribe,
    () => pending.get(sessionId) ?? null,
    () => null,
  );
}

export function resetFolderSuggestionOffersForTests() {
  offered.clear();
  pending.clear();
  emit();
}
