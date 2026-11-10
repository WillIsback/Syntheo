import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { folderDisplayName } from "@syntheo/utils/folders";

import { folderCardClassName } from "./folder-side-panel";
import { formatMeetingDate } from "./format";
import type { FolderMeeting } from "./meetings";

import { useTabs } from "~/store/zustand/tabs";

const VISIBLE_MEETINGS = 5;

// Chronologie des réunions du dossier (issue 496), plus récentes d'abord,
// avec le résumé d'une ligne tiré de la synthèse quand elle existe.
export function FolderMeetingsCard({
  folderPath,
  meetings,
}: {
  folderPath: string;
  meetings: readonly FolderMeeting[];
}) {
  const { i18n } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? meetings : meetings.slice(0, VISIBLE_MEETINGS);
  const hiddenCount = meetings.length - visible.length;

  return (
    <section className={folderCardClassName}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">
          <Trans>Meetings</Trans>
        </h3>
        <span className="text-muted-foreground ml-auto text-xs">
          <Trans>most recent first</Trans>
        </span>
      </div>
      {meetings.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          <Trans>No notes in this folder yet.</Trans>
        </p>
      ) : (
        <ol className="flex flex-col">
          {visible.map((meeting) => (
            <li
              key={meeting.id}
              className="grid grid-cols-[5.5rem_0.75rem_minmax(0,1fr)] gap-2.5 py-2"
            >
              <span className="text-muted-foreground pt-px text-right text-xs">
                {formatMeetingDate(meeting.createdAt, i18n.locale)}
              </span>
              <span
                aria-hidden
                className="bg-primary mt-1.5 size-2 rounded-full"
              />
              <div className="min-w-0">
                <button
                  type="button"
                  className="text-foreground hover:text-primary block max-w-full truncate text-left text-[13.5px] font-semibold focus-visible:underline focus-visible:outline-hidden"
                  onClick={() =>
                    useTabs
                      .getState()
                      .openNew({ type: "sessions", id: meeting.id })
                  }
                >
                  {meeting.title.trim() || <Trans>Untitled</Trans>}
                </button>
                {meeting.folderPath !== folderPath ? (
                  <span className="text-muted-foreground text-[11.5px]">
                    {folderDisplayName(meeting.folderPath)}
                  </span>
                ) : null}
                {meeting.oneLine ? (
                  <p className="text-muted-foreground line-clamp-2 text-[12.5px]">
                    {meeting.oneLine}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="text-primary self-start pl-[6.75rem] text-[12.5px] hover:underline"
          onClick={() => setExpanded(true)}
        >
          <Plural
            value={hiddenCount}
            one="See the previous meeting"
            other="See the # previous meetings"
          />
        </button>
      ) : null}
    </section>
  );
}
