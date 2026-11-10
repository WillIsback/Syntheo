// Must be the first import: React only reports commits to a devtools hook that
// exists before react-dom evaluates.
import "./devtools-bar/render-hook";
import "@fontsource-variable/geist";
import "@fontsource-variable/newsreader";
import "./styles/globals.css";
import "./styles/cursor.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useMemo } from "react";
import ReactDOM from "react-dom/client";

import {
  getCurrentWebviewWindowLabel,
  init as initWindowsPlugin,
} from "@syntheo/plugin-windows";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { AITaskWindowSyncBridge } from "./ai/task-window-sync";
import { ensureLegacyAutomationsMigrated } from "./automations/migration";
import { createToolRegistry } from "./contexts/tool-registry/core";
import { startRenderPerfMonitor } from "./devtools-bar/render-perf";
import { AppI18nProvider } from "./i18n/provider";
import { AppLockGate } from "./lock/gate";
import { FloatingMeetingWindowHost } from "./meeting-float/host";
import { routeTree } from "./routeTree.gen";
import { EventListeners } from "./services/event-listeners";
import { NativeMenuLocaleSync } from "./services/native-menu-locale";
import { TaskManager } from "./services/task-manager";
import { TrayRecordingSync } from "./services/tray-recording";
import { useRemoteSessionDeletionUndoListener } from "./session/hooks/useDeleteSession";
import { refreshLegacySettingsSnapshots } from "./settings/legacy-snapshots";
import { migratePlaintextAiProviderApiKeys } from "./settings/providers";
import { initializeApplicationSettings } from "./settings/queries";
import { initializeAppExitFlush } from "./shared/app-exit";
import { useConfigValue } from "./shared/config";
import { ErrorComponent, NotFoundComponent } from "./shared/control";
import { LongLoadGate } from "./shared/long-load-gate";
import { startInteractionProfiler } from "./shared/perf/interaction-profiler";
import { preventFileDropNavigation } from "./shared/prevent-file-drop-navigation";
import { bootstrapThemeFromSettings } from "./shared/theme/apply";
import { AppThemeProvider } from "./shared/theme/provider";
import type { ThemePreference } from "./shared/theme/resolve";
import { LocalizedDialogLabels } from "./shared/ui/localized-dialog-labels";
import { LocalizedToaster } from "./shared/ui/localized-toaster";
import { createAITaskStore } from "./store/zustand/ai-task";
import { listenerStore } from "./store/zustand/listener/instance";
import { DefaultTemplatesLocaleSync } from "./templates/default-templates-locale-sync";
import { commands } from "./types/tauri.gen";

const toolRegistry = createToolRegistry();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 60_000,
    },
  },
});
const STARTUP_TASK_TIMEOUT_MS = 10_000;

const router = createRouter({
  routeTree,
  context: undefined,
  defaultErrorComponent: ErrorComponent,
  defaultNotFoundComponent: NotFoundComponent,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  const aiTaskStore = useMemo(() => createAITaskStore(), []);

  return (
    <>
      <AITaskWindowSyncBridge store={aiTaskStore} />
      <RouterProvider
        router={router}
        context={{
          listenerStore,
          aiTaskStore,
          toolRegistry,
        }}
      />
    </>
  );
}

function AppRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <LongLoadGate>
        <ReadyApp />
      </LongLoadGate>
    </QueryClientProvider>
  );
}

function ReadyApp() {
  const theme = useConfigValue("theme") as ThemePreference;
  useRemoteSessionDeletionUndoListener(isMainWindow);

  useMountEffect(() => {
    runMainWindowStartupTasks();
  });

  return (
    <AppThemeProvider>
      <AppI18nProvider>
        <LocalizedDialogLabels>
          {isMainWindow ? <NativeMenuLocaleSync /> : null}
          {isMainWindow ? <DefaultTemplatesLocaleSync /> : null}
          <AppLockGate>
            <App />
            {isMainWindow ? <TaskManager /> : null}
            {isMainWindow ? <FloatingMeetingWindowHost /> : null}
            {isMainWindow ? <EventListeners /> : null}
            {isMainWindow ? <TrayRecordingSync /> : null}
            <LocalizedToaster position="bottom-right" theme={theme} />
          </AppLockGate>
        </LocalizedDialogLabels>
      </AppI18nProvider>
    </AppThemeProvider>
  );
}

initWindowsPlugin();

const isMainWindow = getCurrentWebviewWindowLabel() === "main";

if (isMainWindow) {
  try {
    const firstOpenKey = "syntheo:analytics:first-opened";
    if (localStorage.getItem(firstOpenKey) === null) {
      localStorage.setItem(firstOpenKey, "1");
    }
  } catch {}
  void initializeAppExitFlush().catch((error) => {
    console.error("[startup] app exit flush initialization failed", error);
  });
}

const rootElement = document.getElementById("root")!;

async function renderApp() {
  if (import.meta.env.DEV) {
    startInteractionProfiler();
  }

  preventFileDropNavigation();
  await bootstrapThemeFromSettings();
  const root = ReactDOM.createRoot(rootElement, {
    onCaughtError: (error) => {
      console.error("[render] uncaught error", error);
    },
  });
  root.render(
    <StrictMode>
      <AppRoot />
    </StrictMode>,
  );
}

if (!rootElement.innerHTML) {
  void renderApp();
}

function runMainWindowStartupTasks() {
  if (!isMainWindow) {
    return;
  }

  void runStartupTask(
    "legacy_settings_refresh",
    refreshLegacySettingsSnapshots,
  );
  void runStartupTask(
    "application_settings_initialize",
    initializeApplicationSettings,
  );
  void runStartupTask(
    "ai_credentials_migrate",
    migratePlaintextAiProviderApiKeys,
  );
  void runStartupTask("automations_migrate", ensureLegacyAutomationsMigrated);
  void startRenderPerfForDevtoolsBuilds();
}

// Résumé `[render-perf]` des rendus pendant l'écoute, dans le journal de
// l'app : builds devtools seulement, rien n'est démarré en release.
async function startRenderPerfForDevtoolsBuilds() {
  try {
    if (!(await commands.showDevtool())) {
      return;
    }
  } catch {
    return;
  }
  startRenderPerfMonitor({
    getListenerStatus: () => listenerStore.getState().live.status,
  });
}

async function runStartupTask(
  operation: string,
  task: () => Promise<void>,
): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  await new Promise<void>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`startup operation timed out: ${operation}`));
    }, STARTUP_TASK_TIMEOUT_MS);

    void task().then(resolve, reject);
  })
    .catch((error) => {
      console.error(`[startup] ${operation} failed`, error);
    })
    .finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    });
}
