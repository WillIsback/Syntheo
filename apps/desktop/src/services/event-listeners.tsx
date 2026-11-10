import { LiveCaptureConfigSync } from "./event-listeners-capture-config";
import { useNotificationEvents } from "./event-listeners-notifications";

export function EventListeners() {
  return (
    <>
      <EventListenersInner />
      <LiveCaptureConfigSync />
    </>
  );
}

function EventListenersInner() {
  useNotificationEvents();

  return null;
}
