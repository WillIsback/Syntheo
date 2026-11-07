import { plural, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMemo } from "react";

import {
  commands as trayCommands,
  type TrayScheduleEvent,
  type TrayScheduleLabels,
} from "@syntheo/plugin-tray";
import { getCurrentWebviewWindowLabel } from "@syntheo/plugin-windows";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";
import { addDays, parseEventInstant, startOfDay, TZDate } from "@syntheo/utils";

import { useIgnoredEvents } from "~/calendar/ignored-events";
import { useTimelineEventsTable } from "~/calendar/queries";
import { useConfigValue } from "~/shared/config";
import { useCurrentDay } from "~/shared/hooks/useCurrentDay";
import type { TimelineEventRow } from "~/sidebar/timeline/utils";

const PUBLISHED_SCHEDULE_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

// Le titre de la barre de menus est recalculé par le Rust à chaque minute :
// on lui envoie des gabarits traduits dont il remplace les jetons.
const DURATION_TOKEN = "{duration}";
const COUNT_TOKEN = "{count}";
const HOURS_TOKEN = "{hours}";
const MINUTES_TOKEN = "{minutes}";

function remainingLabel(count: number): string {
  const duration = DURATION_TOKEN;
  return plural(count, {
    one: `${duration} left`,
    other: `${duration} left`,
  });
}

export function buildTrayScheduleLabels(): TrayScheduleLabels {
  const duration = DURATION_TOKEN;
  const count = COUNT_TOKEN;
  const hours = HOURS_TOKEN;
  const minutes = MINUTES_TOKEN;

  return {
    untitledEvent: t`Untitled event`,
    startsIn: t`in ${duration}`,
    remainingOne: remainingLabel(1),
    remainingOther: remainingLabel(2),
    seconds: t`${count}s`,
    minutes: t`${count}m`,
    hours: t`${count}h`,
    hoursMinutes: t`${hours}h ${minutes}m`,
  };
}

export function buildTrayScheduleEvents(
  rows: Record<string, TimelineEventRow> | null | undefined,
  isIgnored: (
    trackingId: string | null | undefined,
    recurrenceSeriesId: string | null | undefined,
  ) => boolean,
  nowMs = Date.now(),
  timezone?: string,
  locale?: string,
  use24HourTime = false,
  untitledTitle = t`Untitled event`,
): TrayScheduleEvent[] {
  const upperBoundMs = nowMs + PUBLISHED_SCHEDULE_HORIZON_MS;
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    ...(use24HourTime ? { hourCycle: "h23" as const } : {}),
  });

  return Object.entries(rows ?? {})
    .flatMap(([eventId, row]): TrayScheduleEvent[] => {
      if (
        row.is_all_day ||
        isIgnored(row.tracking_id_event, row.recurrence_series_id)
      ) {
        return [];
      }

      const start = parseEventInstant(row.started_at);
      if (!start) {
        return [];
      }

      const startsAtMs = start.getTime();
      if (startsAtMs > upperBoundMs) {
        return [];
      }

      const parsedEnd = parseEventInstant(row.ended_at);
      const endsAtMs =
        parsedEnd && parsedEnd.getTime() > startsAtMs
          ? parsedEnd.getTime()
          : null;
      if (
        (endsAtMs !== null && endsAtMs <= nowMs) ||
        (endsAtMs === null && startsAtMs <= nowMs)
      ) {
        return [];
      }

      const dayStart = startOfDay(toTimezone(start, timezone));
      const previousDayStart = startOfDay(addDays(dayStart, -1));
      const timeLabel = endsAtMs
        ? `${timeFormatter.format(start)} – ${timeFormatter.format(endsAtMs)}`
        : timeFormatter.format(start);

      return [
        {
          id: eventId,
          title: row.title?.trim() || untitledTitle,
          meetingLink: row.meeting_link || null,
          startsAtMs,
          endsAtMs,
          dayStartMs: dayStart.getTime(),
          previousDayStartMs: previousDayStart.getTime(),
          timeLabel,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.startsAtMs - right.startsAtMs ||
        left.title.localeCompare(right.title),
    );
}

export function TrayScheduleSync() {
  const timelineEventsTable = useTimelineEventsTable();
  const { isIgnored } = useIgnoredEvents();
  const timezone = useConfigValue("timezone") || undefined;
  const currentDay = useCurrentDay(timezone);
  const use24HourTime = useConfigValue("use_24_hour_time");
  // S'abonne au changement de langue : les libellés envoyés au menu en
  // dépendent, et ce composant n'a pas d'autre raison d'être rendu à nouveau.
  useLingui();
  const labels = buildTrayScheduleLabels();
  const untitledTitle = labels.untitledEvent;
  const events = useMemo(
    () =>
      buildTrayScheduleEvents(
        timelineEventsTable,
        isIgnored,
        Date.now(),
        timezone,
        undefined,
        use24HourTime,
        untitledTitle,
      ),
    [
      currentDay,
      isIgnored,
      timelineEventsTable,
      timezone,
      untitledTitle,
      use24HourTime,
    ],
  );

  return (
    <TraySchedulePublisher
      key={JSON.stringify([events, labels])}
      events={events}
      labels={labels}
    />
  );
}

function toTimezone(date: Date, timezone?: string): Date {
  return timezone ? new TZDate(date, timezone) : date;
}

function TraySchedulePublisher({
  events,
  labels,
}: {
  events: TrayScheduleEvent[];
  labels: TrayScheduleLabels;
}) {
  useMountEffect(() => {
    if (getCurrentWebviewWindowLabel() !== "main") {
      return;
    }

    void trayCommands
      .setTraySchedule(events, labels)
      .then((result) => {
        if (result.status === "error") {
          console.error("[tray] failed to publish schedule", result.error);
        }
      })
      .catch((error) => {
        console.error("[tray] failed to publish schedule", error);
      });
  });

  return null;
}
