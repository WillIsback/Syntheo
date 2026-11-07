import { i18n } from "@lingui/core";
import { afterEach, describe, expect, test } from "vitest";

import {
  buildTrayScheduleEvents,
  buildTrayScheduleLabels,
} from "./tray-schedule";

import { messages as frMessages } from "~/i18n/locales/fr/messages";
import type { TimelineEventRow } from "~/sidebar/timeline/utils";

function activateFrench() {
  i18n.load("fr", frMessages);
  i18n.activate("fr");
}

afterEach(() => {
  i18n.activate("en");
});

const NOW = Date.parse("2026-07-17T00:00:00.000Z");

function event(overrides: Partial<TimelineEventRow>): TimelineEventRow {
  return {
    has_recurrence_rules: false,
    ...overrides,
  };
}

describe("buildTrayScheduleEvents", () => {
  test("publishes active and upcoming timed events in start order", () => {
    const events = buildTrayScheduleEvents(
      {
        upcoming: event({
          title: "  Design sync  ",
          meeting_link: "https://meet.example.com/design-sync",
          started_at: "2026-07-17T01:00:00.000Z",
          ended_at: "2026-07-17T02:00:00.000Z",
        }),
        active: event({
          title: "Standup",
          started_at: "2026-07-16T23:55:00.000Z",
          ended_at: "2026-07-17T00:25:00.000Z",
        }),
      },
      () => false,
      NOW,
      "UTC",
      "en-US",
    );

    expect(events).toEqual([
      {
        id: "active",
        title: "Standup",
        meetingLink: null,
        startsAtMs: Date.parse("2026-07-16T23:55:00.000Z"),
        endsAtMs: Date.parse("2026-07-17T00:25:00.000Z"),
        dayStartMs: Date.parse("2026-07-16T00:00:00.000Z"),
        previousDayStartMs: Date.parse("2026-07-15T00:00:00.000Z"),
        timeLabel: "11:55 PM – 12:25 AM",
      },
      {
        id: "upcoming",
        title: "Design sync",
        meetingLink: "https://meet.example.com/design-sync",
        startsAtMs: Date.parse("2026-07-17T01:00:00.000Z"),
        endsAtMs: Date.parse("2026-07-17T02:00:00.000Z"),
        dayStartMs: NOW,
        previousDayStartMs: Date.parse("2026-07-16T00:00:00.000Z"),
        timeLabel: "1:00 AM – 2:00 AM",
      },
    ]);
  });

  test("omits ignored, all-day, expired, and distant events", () => {
    const events = buildTrayScheduleEvents(
      {
        ignored: event({
          title: "Ignored",
          tracking_id_event: "ignored",
          started_at: "2026-07-17T01:00:00.000Z",
        }),
        allDay: event({
          title: "Holiday",
          is_all_day: true,
          started_at: "2026-07-17T00:00:00.000Z",
        }),
        expired: event({
          title: "Finished",
          started_at: "2026-07-16T22:00:00.000Z",
          ended_at: "2026-07-16T23:00:00.000Z",
        }),
        distant: event({
          title: "Next month",
          started_at: "2026-08-17T01:00:00.000Z",
        }),
      },
      (trackingId) => trackingId === "ignored",
      NOW,
      "UTC",
      "en-US",
    );

    expect(events).toEqual([]);
  });

  test.each([
    ["UTC", "00:00 – 12:30"],
    ["Asia/Seoul", "09:00 – 21:30"],
  ])(
    "uses 24-hour times in %s, including midnight and noon",
    (timezone, timeLabel) => {
      const events = buildTrayScheduleEvents(
        {
          meeting: event({
            title: "Meeting",
            started_at: "2026-07-17T00:00:00.000Z",
            ended_at: "2026-07-17T12:30:00.000Z",
          }),
        },
        () => false,
        NOW,
        timezone,
        "en-US",
        true,
      );
      expect(events[0].timeLabel).toBe(timeLabel);
    },
  );
});

describe("buildTrayScheduleLabels", () => {
  test("keeps the English menu bar labels", () => {
    expect(buildTrayScheduleLabels()).toEqual({
      untitledEvent: "Untitled event",
      startsIn: "in {duration}",
      remainingOne: "{duration} left",
      remainingOther: "{duration} left",
      seconds: "{count}s",
      minutes: "{count}m",
      hours: "{count}h",
      hoursMinutes: "{hours}h {minutes}m",
    });
  });

  test("translates the menu bar labels into French", () => {
    activateFrench();

    expect(buildTrayScheduleLabels()).toEqual({
      untitledEvent: "Événement sans titre",
      startsIn: "dans {duration}",
      remainingOne: "{duration} restante",
      remainingOther: "{duration} restantes",
      seconds: "{count} s",
      minutes: "{count} min",
      hours: "{count} h",
      hoursMinutes: "{hours} h {minutes} min",
    });
  });
});

describe("untitled tray events", () => {
  const rows = {
    blank: event({
      title: "   ",
      started_at: "2026-07-17T01:00:00.000Z",
    }),
  };

  test("names a blank event in English", () => {
    const events = buildTrayScheduleEvents(rows, () => false, NOW, "UTC");
    expect(events[0].title).toBe("Untitled event");
  });

  test("names a blank event in French", () => {
    activateFrench();
    const events = buildTrayScheduleEvents(rows, () => false, NOW, "UTC");
    expect(events[0].title).toBe("Événement sans titre");
  });
});
