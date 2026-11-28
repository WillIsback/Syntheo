import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: {
    providerId: "openai",
    baseUrl: "https://spark.tail6cba9f.ts.net/v1/realtime",
    apiKey: "",
    state: { status: "untested" } as Record<string, unknown>,
    test: vi.fn(),
  },
  config: {
    current_stt_provider: "openai",
    current_stt_model: "voxtral-mini",
  } as Record<string, string>,
  setSelection: vi.fn(),
  setAiProvider: vi.fn(),
  persisted: [] as Array<{ provider?: string; model?: string }>,
  managed: new Set<string>(),
  openUrl: vi.fn(),
}));

vi.mock("@syntheo/plugin-opener2", () => ({
  commands: { openUrl: mocks.openUrl },
}));

vi.mock("~/settings/ai/shared/server-connection", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useServerConnection: () => mocks.connection,
}));
vi.mock("~/settings/ai/shared/server-address", () => ({
  ServerAddressForm: ({
    onTest,
    managed,
    selectionManaged,
  }: {
    onTest: () => void;
    managed?: boolean;
    selectionManaged?: boolean;
  }) => (
    <>
      <button
        type="button"
        onClick={onTest}
        data-managed={String(!!managed)}
        data-selection-managed={String(!!selectionManaged)}
      >
        Test connection
      </button>
      <details open data-testid="advanced">
        <summary>Advanced</summary>
        <input aria-label="API key (optional)" />
      </details>
    </>
  ),
}));
vi.mock("~/settings/ai/shared/persist-selection", () => ({
  PersistAiSelection: (props: { provider?: string; model?: string }) => {
    mocks.persisted.push({ provider: props.provider, model: props.model });
    return null;
  },
}));
vi.mock("~/settings/managed", () => ({
  useManagedSettingIds: () => mocks.managed,
  useIsManagedSetting: (id: string) => mocks.managed.has(id),
}));
vi.mock("~/settings/providers", () => ({
  setAiProvider: mocks.setAiProvider,
}));
vi.mock("~/settings/queries", () => ({
  useSetSettingValues: () => mocks.setSelection,
}));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => mocks.config,
}));

import { SttServerCard } from "./server-card";

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SttServerCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.persisted = [];
  mocks.managed = new Set();
  mocks.connection.providerId = "openai";
  mocks.connection.state = { status: "untested" };
  mocks.config = {
    current_stt_provider: "openai",
    current_stt_model: "voxtral-mini",
  };
  mocks.setAiProvider.mockResolvedValue(undefined);
  mocks.openUrl.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("SttServerCard", () => {
  it("dit quoi faire quand le serveur est injoignable", () => {
    mocks.connection.state = {
      status: "failed",
      failure: { ok: false, reason: "unreachable" },
    };
    setup();

    expect(screen.getByRole("status").textContent).toBe("Unreachable");
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).toContain("spark.tail6cba9f.ts.net/v1/realtime");
    expect(alert).toContain("(VPN, Tailscale), then test again.");
  });

  it("affiche la latence et les modèles annoncés, choisis d'un clic", () => {
    mocks.connection.state = {
      status: "connected",
      latencyMs: 84,
      protocol: "openai",
      models: ["voxtral-mini", "whisper-large-v3"],
    };
    setup();

    expect(screen.getByRole("status").textContent).toBe("Connected · 84 ms");
    expect(screen.getByText(/detected automatically/)).toBeTruthy();
    const current = screen.getByRole("radio", { name: /voxtral-mini/ });
    expect(current.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: /whisper-large-v3/ }));
    expect(mocks.setSelection).toHaveBeenCalledWith({
      current_stt_provider: "openai",
      current_stt_model: "whisper-large-v3",
    });
  });

  it("NeMo-Speech.cpp sans test : propose le modèle de référence", () => {
    mocks.connection.providerId = "nvidia";
    mocks.config = {
      current_stt_provider: "nvidia",
      current_stt_model: "nemotron-3.5-asr-streaming-0.6b",
    };
    setup();

    expect(
      screen
        .getByRole("radio", { name: /nemotron-3\.5-asr-streaming-0\.6b/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByText(/transcribes with the model it loaded/),
    ).toBeTruthy();
    expect(mocks.persisted).toEqual([]);
  });

  it("NeMo-Speech.cpp connecté : retient le modèle que le serveur annonce", () => {
    mocks.connection.providerId = "nvidia";
    mocks.connection.state = {
      status: "connected",
      latencyMs: 9,
      protocol: "nvidia",
      models: ["nemotron-3.5-asr-streaming-0.6b.q8_0"],
    };
    mocks.config = {
      current_stt_provider: "nvidia",
      current_stt_model: "nemotron-3.5-asr-streaming-0.6b",
    };
    setup();

    expect(
      screen.getByRole("radio", { name: /asr-streaming-0\.6b\.q8_0/ }),
    ).toBeTruthy();
    expect(mocks.persisted).toContainEqual({
      provider: "nvidia",
      model: "nemotron-3.5-asr-streaming-0.6b.q8_0",
    });
  });

  // Issue 707 : modèle imposé par l'administration (current_stt_model géré),
  // le serveur en annonce un autre. L'écriture serait refusée en silence par
  // le déclencheur : rien n'est tenté.
  it("NeMo-Speech.cpp connecté, modèle géré : n'écrit pas le modèle annoncé", () => {
    mocks.managed = new Set(["current_stt_model"]);
    mocks.connection.providerId = "nvidia";
    mocks.connection.state = {
      status: "connected",
      latencyMs: 9,
      protocol: "nvidia",
      models: ["nemotron-3.5-asr-streaming-0.6b.q8_0"],
    };
    mocks.config = {
      current_stt_provider: "nvidia",
      current_stt_model: "nemotron-3.5-asr-streaming-0.6b",
    };
    setup();

    expect(mocks.persisted).toEqual([]);
    expect(mocks.setSelection).not.toHaveBeenCalled();
  });

  it.each([
    { speakerDiarization: false, shown: true },
    { speakerDiarization: true, shown: false },
    { speakerDiarization: undefined, shown: false },
  ])(
    "NeMo-Speech.cpp sans diariseur : le dit (speakerDiarization=$speakerDiarization)",
    ({ speakerDiarization, shown }) => {
      mocks.connection.providerId = "nvidia";
      mocks.connection.state = {
        status: "connected",
        latencyMs: 9,
        protocol: "nvidia",
        models: ["nemotron-3.5-asr-streaming-0.6b.q8_0"],
        ...(speakerDiarization === undefined ? {} : { speakerDiarization }),
      };
      mocks.config = {
        current_stt_provider: "nvidia",
        current_stt_model: "nemotron-3.5-asr-streaming-0.6b",
      };
      setup();

      const note = screen.queryByTestId("stt-no-diarization");
      expect(note !== null).toBe(shown);
      if (note) {
        expect(note.textContent).toBe(
          "This server has no diarization model loaded: transcripts will not tell speakers apart.",
        );
      }
    },
  );

  it("ne propose que les protocoles OpenAI compatible et NeMo-Speech.cpp", () => {
    setup();

    expect(
      screen
        .getAllByRole("radio", { name: /OpenAI|NVIDIA/ })
        .map((radio) => radio.textContent),
    ).toEqual([
      "OpenAI compatible (realtime and batch)",
      "NVIDIA NeMo-Speech.cpp",
    ]);
  });

  it("change de protocole avec le modèle par défaut du protocole", () => {
    setup();

    fireEvent.click(
      screen.getByRole("radio", { name: "NVIDIA NeMo-Speech.cpp" }),
    );

    expect(mocks.setSelection).toHaveBeenCalledWith({
      current_stt_provider: "nvidia",
      current_stt_model: "nemotron-3.5-asr-streaming-0.6b",
    });
  });

  it("reprend l'adresse quand le test détecte un autre protocole", async () => {
    mocks.connection.state = {
      status: "connected",
      latencyMs: 12,
      protocol: "nvidia",
      models: ["nemotron-3.5-asr-streaming-0.6b.q8_0"],
    };
    setup();

    expect(
      screen.getByText(/This server answers as NVIDIA NeMo-Speech\.cpp\./),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this protocol" }));

    await waitFor(() =>
      expect(mocks.setSelection).toHaveBeenCalledWith({
        current_stt_provider: "nvidia",
        current_stt_model: "nemotron-3.5-asr-streaming-0.6b",
      }),
    );
    expect(mocks.setAiProvider).toHaveBeenCalledWith("stt", "nvidia", {
      base_url: "https://spark.tail6cba9f.ts.net/v1/realtime",
      api_key: "",
    });
  });

  it("renvoie discrètement vers l'installation du service local, dans l'aide", () => {
    setup();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Install the local transcription service/,
      }),
    );

    expect(mocks.openUrl).toHaveBeenCalledWith(
      expect.stringMatching(/\/en\/local-transcription-service$/),
    );
  });

  it("relance le test à la demande", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(mocks.connection.test).toHaveBeenCalled();
  });

  // Issue 710 : réglages imposés par managed_settings.json. Chaque champ ne se
  // verrouille que si sa propre clé est gérée ; aucune écriture ne vise une
  // clé gérée (le déclencheur refuserait toute la transaction).
  describe("réglage géré", () => {
    const CONNECTED = {
      status: "connected",
      latencyMs: 12,
      protocol: "openai",
      models: ["voxtral-mini", "whisper-large-v3"],
    };

    function addressButton() {
      return screen.getByRole("button", { name: "Test connection" });
    }
    function protocolRadios() {
      return screen.getAllByRole("radio", { name: /OpenAI|NVIDIA/ });
    }
    function modelRadios() {
      return screen.getAllByRole("radio", { name: /voxtral|whisper/ });
    }
    function disabled(elements: HTMLElement[]) {
      return elements.map((el) => (el as HTMLButtonElement).disabled);
    }
    function expectMention(text = "Set by your administrator.") {
      const mention = screen.getByTestId("stt-server-managed");
      expect(mention.textContent).toBe(text);
      // En tête de carte, avant l'adresse : jamais dans « Avancé » ni sous la
      // clé d'API, qu'elle ferait passer pour imposée (issue 710).
      expect(mention.closest("details")).toBeNull();
      expect(
        mention.compareDocumentPosition(addressButton()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        mention.compareDocumentPosition(
          screen.getByRole("textbox", { name: "API key (optional)" }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    it("adresse seule : adresse figée, protocole et modèle modifiables", () => {
      mocks.managed = new Set(["ai_provider:stt:openai"]);
      mocks.connection.state = CONNECTED;
      setup();

      expectMention("Set by your administrator: server address.");
      expect(addressButton().getAttribute("data-managed")).toBe("true");
      expect(addressButton().getAttribute("data-selection-managed")).toBe(
        "false",
      );
      expect(disabled(protocolRadios())).toEqual([false, false]);
      expect(disabled(modelRadios())).toEqual([false, false]);
      expect(
        screen.getByRole("button", { name: "Enter another name" }),
      ).toBeTruthy();

      fireEvent.click(screen.getByRole("radio", { name: /whisper-large-v3/ }));
      expect(mocks.setSelection).toHaveBeenLastCalledWith({
        current_stt_provider: "openai",
        current_stt_model: "whisper-large-v3",
      });
      fireEvent.click(
        screen.getByRole("radio", { name: "NVIDIA NeMo-Speech.cpp" }),
      );
      expect(mocks.setSelection).toHaveBeenLastCalledWith({
        current_stt_provider: "nvidia",
        current_stt_model: "nemotron-3.5-asr-streaming-0.6b",
      });
    });

    // Politique {"current_stt_provider":"openai","stt:openai":{…}} sans
    // current_stt_model : le modèle doit pouvoir s'enregistrer et se choisir.
    it("fournisseur et adresse, sans modèle : le modèle s'enregistre et se choisit", () => {
      mocks.managed = new Set([
        "current_stt_provider",
        "ai_provider:stt:openai",
      ]);
      mocks.config = { current_stt_provider: "openai" };
      mocks.connection.state = CONNECTED;
      setup();

      expectMention("Set by your administrator: server address, protocol.");
      expect(addressButton().getAttribute("data-managed")).toBe("true");
      expect(disabled(protocolRadios())).toEqual([true, true]);
      expect(disabled(modelRadios())).toEqual([false, false]);
      // Premier modèle annoncé enregistré, sans réécrire le fournisseur géré.
      expect(mocks.persisted).toEqual([
        { provider: undefined, model: "voxtral-mini" },
      ]);

      fireEvent.click(
        screen.getByRole("radio", { name: "NVIDIA NeMo-Speech.cpp" }),
      );
      expect(mocks.setSelection).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("radio", { name: /whisper-large-v3/ }));
      expect(mocks.setSelection).toHaveBeenCalledWith({
        current_stt_model: "whisper-large-v3",
      });
    });

    it("fournisseur et adresse, sans test : le nom du modèle se saisit", () => {
      mocks.managed = new Set([
        "current_stt_provider",
        "ai_provider:stt:openai",
      ]);
      mocks.config = { current_stt_provider: "openai" };
      setup();

      expectMention("Set by your administrator: server address, protocol.");
      const input = screen.getByRole("textbox", { name: "Model name" });
      expect((input as HTMLInputElement).disabled).toBe(false);
      fireEvent.change(input, { target: { value: "voxtral-mini" } });
      // Enregistré à la validation du champ, pas à la frappe (issue 803).
      expect(mocks.setSelection).not.toHaveBeenCalled();
      fireEvent.blur(input);
      expect(mocks.setSelection).toHaveBeenCalledWith({
        current_stt_model: "voxtral-mini",
      });
    });

    it("fournisseur seul : protocole figé, adresse et modèle modifiables", () => {
      mocks.managed = new Set(["current_stt_provider"]);
      mocks.connection.state = CONNECTED;
      setup();

      expectMention("Set by your administrator: protocol.");
      expect(addressButton().getAttribute("data-managed")).toBe("false");
      expect(disabled(protocolRadios())).toEqual([true, true]);
      expect(disabled(modelRadios())).toEqual([false, false]);

      fireEvent.click(
        screen.getByRole("radio", { name: "NVIDIA NeMo-Speech.cpp" }),
      );
      expect(mocks.setSelection).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("radio", { name: /whisper-large-v3/ }));
      expect(mocks.setSelection).toHaveBeenCalledWith({
        current_stt_model: "whisper-large-v3",
      });
    });

    it("modèle seul : modèle figé, adresse et protocole modifiables", () => {
      mocks.managed = new Set(["current_stt_model"]);
      mocks.connection.state = CONNECTED;
      setup();

      expectMention("Set by your administrator: model.");
      expect(addressButton().getAttribute("data-managed")).toBe("false");
      expect(addressButton().getAttribute("data-selection-managed")).toBe(
        "true",
      );
      expect(disabled(protocolRadios())).toEqual([false, false]);
      expect(disabled(modelRadios())).toEqual([true, true]);
      expect(
        screen.queryByRole("button", { name: "Enter another name" }),
      ).toBeNull();

      fireEvent.click(screen.getByRole("radio", { name: /whisper-large-v3/ }));
      expect(mocks.setSelection).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("radio", { name: "NVIDIA NeMo-Speech.cpp" }),
      );
      expect(mocks.setSelection).toHaveBeenCalledWith({
        current_stt_provider: "nvidia",
      });
    });

    // Issue 719 : sans adresse saisie, le modèle imposé reste affiché, et
    // la carte n'invite pas à tester la connexion pour choisir un modèle.
    it("modèle seul, sans adresse : le modèle imposé est affiché, sans invitation au test", () => {
      mocks.managed = new Set(["current_stt_model"]);
      mocks.config = { current_stt_model: "voxtral-mini" };
      mocks.connection.baseUrl = "";
      try {
        setup();
        const input = screen.getByRole("textbox", { name: "Model name" });
        expect((input as HTMLInputElement).value).toBe("voxtral-mini");
        expect((input as HTMLInputElement).disabled).toBe(true);
        expect(
          screen.queryByText("Test the connection to list the models served."),
        ).toBeNull();
      } finally {
        mocks.connection.baseUrl =
          "https://spark.tail6cba9f.ts.net/v1/realtime";
      }
    });

    it("tout imposé : la mention reste courte", () => {
      mocks.managed = new Set([
        "ai_provider:stt:openai",
        "current_stt_provider",
        "current_stt_model",
      ]);
      setup();

      expectMention();
    });

    it("modèle hors liste, géré : affiché dans un champ désactivé", () => {
      mocks.managed = new Set(["current_stt_model"]);
      setup();

      const input = screen.getByRole("textbox", { name: "Model name" });
      expect((input as HTMLInputElement).disabled).toBe(true);
      expect((input as HTMLInputElement).value).toBe("voxtral-mini");
      // Même aspect désactivé que le protocole imposé (issue 710).
      expect(input.className).toContain("cursor-not-allowed");
      expect(input.className).toContain("opacity-60");
      expectMention("Set by your administrator: model.");
    });

    // Non-régression : les radios avaient déjà cet aspect avant le correctif
    // de l'issue 710, qui ne visait que le champ libre (test précédent).
    it("modèle géré : les radios non retenues restent estompées comme le protocole", () => {
      mocks.managed = new Set(["current_stt_model"]);
      mocks.connection.state = CONNECTED;
      setup();

      const [voxtral, whisper] = modelRadios();
      expect(voxtral!.className).toContain("disabled:cursor-not-allowed");
      expect(voxtral!.className).not.toContain("opacity-60");
      expect(whisper!.className).toContain("opacity-60");
    });

    it("politique complète : tout est figé, rien n'est écrit", () => {
      mocks.managed = new Set([
        "ai_provider:stt:openai",
        "current_stt_provider",
        "current_stt_model",
      ]);
      mocks.connection.state = CONNECTED;
      setup();

      expectMention();
      expect(addressButton().getAttribute("data-managed")).toBe("true");
      expect(disabled(protocolRadios())).toEqual([true, true]);
      expect(disabled(modelRadios())).toEqual([true, true]);
      expect(
        screen.queryByRole("button", { name: "Enter another name" }),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole("radio", { name: "NVIDIA NeMo-Speech.cpp" }),
      );
      fireEvent.click(screen.getByRole("radio", { name: /whisper-large-v3/ }));
      expect(mocks.setSelection).not.toHaveBeenCalled();
      expect(mocks.persisted).toEqual([]);
      // Tester la connexion reste possible.
      fireEvent.click(addressButton());
      expect(mocks.connection.test).toHaveBeenCalled();
    });

    it.each([["current_stt_provider"], ["ai_provider:stt:nvidia"]])(
      "%s géré : ne propose pas d'adopter le protocole détecté",
      (id) => {
        mocks.managed = new Set([id]);
        mocks.connection.state = {
          status: "connected",
          latencyMs: 12,
          protocol: "nvidia",
          models: ["nemotron-3.5-asr-streaming-0.6b.q8_0"],
        };
        setup();

        expect(
          screen.queryByRole("button", { name: "Use this protocol" }),
        ).toBeNull();
        expect(mocks.setAiProvider).not.toHaveBeenCalled();
      },
    );

    it("adresse seule : adopter le protocole détecté reste possible", () => {
      mocks.managed = new Set(["ai_provider:stt:openai"]);
      mocks.connection.state = {
        status: "connected",
        latencyMs: 12,
        protocol: "nvidia",
        models: ["nemotron-3.5-asr-streaming-0.6b.q8_0"],
      };
      setup();

      expect(
        screen.getByRole("button", { name: "Use this protocol" }),
      ).toBeTruthy();
    });

    it("adresse d'un autre fournisseur gérée : cette carte reste modifiable", () => {
      mocks.managed = new Set(["ai_provider:stt:nvidia"]);
      setup();

      expect(screen.queryByTestId("stt-server-managed")).toBeNull();
    });

    it("rien de géré : carte modifiable, sans mention", () => {
      mocks.connection.state = {
        status: "connected",
        latencyMs: 12,
        protocol: "openai",
        models: ["voxtral-mini", "whisper-large-v3"],
      };
      setup();

      expect(screen.queryByTestId("stt-server-managed")).toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Test connection" })
          .getAttribute("data-managed"),
      ).toBe("false");
      for (const radio of screen.getAllByRole("radio")) {
        expect((radio as HTMLButtonElement).disabled).toBe(false);
      }
      expect(
        screen.getByRole("button", { name: "Enter another name" }),
      ).toBeTruthy();
    });
  });
});
