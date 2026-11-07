import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";

import type { EventParticipant } from "@syntheo/store";

import { useSessionEventParticipants } from "~/calendar/queries";
import { createHuman, useHumans } from "~/contacts/queries";
import {
  addSessionParticipant,
  useSession,
  useSessionParticipants,
} from "~/session/queries";

// Choix d'un intervenant pour un locuteur : participants de la réunion,
// invités de l'événement, contacts, et création à la volée. Partagé par la
// fenêtre de la transcription et le panneau « Nommer les intervenants »
// (issue 321).

export type SpeakerParticipantOption = {
  id: string;
  name: string;
  email?: string;
  additionalEmails?: string[];
  avatarDataUrl?: string;
  isSessionParticipant: boolean;
  isNew?: boolean;
  isCreateOption?: boolean;
};

export function buildSpeakerParticipantGroups({
  sessionParticipants,
  eventParticipants = [],
  contacts,
  query,
}: {
  sessionParticipants: SpeakerParticipantOption[];
  eventParticipants?: SpeakerParticipantOption[];
  contacts: SpeakerParticipantOption[];
  query: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (option: SpeakerParticipantOption) => {
    if (!normalizedQuery) {
      return true;
    }

    return [
      option.name,
      option.email ?? "",
      ...(option.additionalEmails ?? []),
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
  };

  const participantKeys = new Set<string>();
  const participantOptions = [...sessionParticipants, ...eventParticipants]
    .filter((option) => {
      const keys = getSpeakerParticipantDedupeKeys(option);
      if (keys.some((key) => participantKeys.has(key))) {
        return false;
      }

      keys.forEach((key) => participantKeys.add(key));
      return true;
    })
    .filter(matches);
  const matchingContacts = contacts
    .filter((option) =>
      getSpeakerParticipantDedupeKeys(option).every(
        (key) => !participantKeys.has(key),
      ),
    )
    .filter(matches);

  return [
    ...(participantOptions.length > 0
      ? [
          {
            title: "Participants",
            options: participantOptions,
          },
        ]
      : []),
    ...(matchingContacts.length > 0
      ? [
          {
            title: "People",
            options: matchingContacts,
          },
        ]
      : []),
  ];
}

export function buildCreateSpeakerParticipantOption({
  query,
  existingOptions,
}: {
  query: string;
  existingOptions: SpeakerParticipantOption[];
}): SpeakerParticipantOption | null {
  const name = query.trim();
  if (!name) {
    return null;
  }

  const normalizedName = name.toLowerCase();
  const alreadyExists = existingOptions.some((option) =>
    [option.name, option.email ?? "", ...(option.additionalEmails ?? [])].some(
      (value) => value.toLowerCase() === normalizedName,
    ),
  );
  if (alreadyExists) {
    return null;
  }

  return {
    id: "new",
    name,
    isSessionParticipant: false,
    isNew: true,
    isCreateOption: true,
  };
}

export function buildEventSpeakerParticipantOptions({
  eventParticipants,
  contacts,
}: {
  eventParticipants: EventParticipant[];
  contacts: SpeakerParticipantOption[];
}): SpeakerParticipantOption[] {
  const contactByEmail = new Map(
    contacts.flatMap((contact) =>
      [contact.email, ...(contact.additionalEmails ?? [])]
        .filter((email): email is string => Boolean(email))
        .map((email) => [email.toLowerCase(), contact] as const),
    ),
  );
  const contactByName = new Map(
    contacts.map((contact) => [contact.name.toLowerCase(), contact]),
  );

  return eventParticipants
    .map((participant, index): SpeakerParticipantOption | null => {
      const name = (participant.name ?? "").trim();
      const email = (participant.email ?? "").trim();
      if (!name && !email) {
        return null;
      }

      const contact = email
        ? contactByEmail.get(email.toLowerCase())
        : name
          ? contactByName.get(name.toLowerCase())
          : undefined;

      if (contact) {
        return {
          ...contact,
          name: name || contact.name,
          email: email || contact.email,
          isSessionParticipant: true,
        };
      }

      const pendingId = email ? `event:${email}` : `event:${name}:${index}`;

      return {
        id: pendingId,
        name: name || email,
        email: email || undefined,
        isSessionParticipant: true,
        isNew: true,
      };
    })
    .filter((option): option is SpeakerParticipantOption => option !== null);
}

export function getSpeakerParticipantDedupeKeys(
  option: SpeakerParticipantOption,
): string[] {
  return [
    `id:${option.id}`,
    option.email ? `email:${option.email.toLowerCase()}` : null,
  ].filter((key): key is string => key !== null);
}

/**
 * Les intervenants proposables pour une note, et `resolveHumanId` qui crée
 * le contact si besoin puis l'ajoute aux participants de la note.
 */
export function useSpeakerParticipants(sessionId: string | undefined) {
  const { t } = useLingui();
  const ownerUserId = useSession(sessionId ?? "")?.user_id;
  const participantRecords = useSessionParticipants(sessionId ?? "");
  const humanRecords = useHumans();
  const attachedEventParticipants = useSessionEventParticipants(
    sessionId ?? "",
  );

  const avatarByHumanId = useMemo(
    () =>
      new Map(
        humanRecords.map((human) => [human.id, human.avatarDataUrl] as const),
      ),
    [humanRecords],
  );
  const participants = useMemo(
    () =>
      participantRecords
        .map((participant): SpeakerParticipantOption | null => {
          if (!participant.humanId) return null;
          const name = participant.name.trim();
          const email = participant.email.trim();
          return {
            id: participant.humanId,
            name: name || email || t`Unknown`,
            email: email || undefined,
            avatarDataUrl:
              avatarByHumanId.get(participant.humanId) ?? undefined,
            isSessionParticipant: true,
          };
        })
        .filter((participant): participant is SpeakerParticipantOption =>
          Boolean(participant),
        ),
    [avatarByHumanId, participantRecords, t],
  );

  const contacts = useMemo(
    () =>
      humanRecords
        .map((human): SpeakerParticipantOption | null => {
          const name = human.name.trim();
          const email = human.email.trim();
          if (!name && !email) return null;

          return {
            id: human.id,
            name: name || email,
            email: email || undefined,
            additionalEmails: human.additionalEmails,
            avatarDataUrl: human.avatarDataUrl ?? undefined,
            isSessionParticipant: false,
          };
        })
        .filter((contact): contact is SpeakerParticipantOption =>
          Boolean(contact),
        ),
    [humanRecords],
  );

  const eventParticipants = useMemo(
    () =>
      buildEventSpeakerParticipantOptions({
        eventParticipants: attachedEventParticipants,
        contacts,
      }),
    [attachedEventParticipants, contacts],
  );

  const participantIds = useMemo(
    () => new Set(participants.map((participant) => participant.id)),
    [participants],
  );

  const linkHumanToSession = useCallback(
    async (humanId: string) => {
      if (!sessionId || participantIds.has(humanId)) {
        return;
      }

      await addSessionParticipant(sessionId, humanId);
    },
    [participantIds, sessionId],
  );

  const getCurrentHumanId = useCallback(
    async (option: SpeakerParticipantOption) => {
      if (!option.isNew) {
        return option.id;
      }

      const email = option.email?.trim().toLowerCase();
      const name = option.name.trim().toLowerCase();
      const existingContact = email
        ? contacts.find((contact) =>
            [contact.email, ...(contact.additionalEmails ?? [])].some(
              (value) => value?.trim().toLowerCase() === email,
            ),
          )
        : contacts.find(
            (contact) => contact.name.trim().toLowerCase() === name,
          );

      if (existingContact) return existingContact.id;
      if (!ownerUserId) return null;

      return createHuman({
        ownerUserId,
        name: option.name,
        email: option.email,
        entryPoint: "speaker_assignment",
      });
    },
    [contacts, ownerUserId],
  );

  const resolveHumanId = useCallback(
    async (option: SpeakerParticipantOption) => {
      const humanId = await getCurrentHumanId(option);
      if (!humanId) return null;
      await linkHumanToSession(humanId);
      return humanId;
    },
    [getCurrentHumanId, linkHumanToSession],
  );

  return { participants, eventParticipants, contacts, resolveHumanId };
}
