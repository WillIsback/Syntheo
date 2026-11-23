import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isCleartextRemoteUrl,
  isLoopbackHost,
  isPrivateHost,
  ProviderCredentialError,
  providerCredentialIdentity,
  validateProviderBaseUrl,
  validateProviderRequestUrl,
  verifyProviderCredentials,
} from "./index.ts";

const credential = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "synthetic-key",
};

test("accepts an authenticated model response, without sending keys in URLs", async () => {
  const requests = [];
  await verifyProviderCredentials(credential, async (url, init) => {
    requests.push({ url, init });
    return Response.json({ data: [] });
  });
  assert.equal(requests[0].url, "https://api.openai.com/v1/models");
  assert.equal(requests[0].init.headers.Authorization, "Bearer synthetic-key");
  assert.equal(requests[0].init.redirect, "error");
  assert.equal(requests.length, 1);
  assert.ok(
    !providerCredentialIdentity(credential).includes(credential.apiKey),
  );
  assert.notEqual(
    providerCredentialIdentity(credential),
    providerCredentialIdentity({ ...credential, apiKey: "other" }),
  );
});

for (const [status, message] of [
  [401, { code: "key_rejected", retryable: false }],
  [403, { code: "key_rejected", retryable: false }],
  [429, { code: "rate_limited", retryable: true }],
  [500, { code: "verification_unavailable", retryable: true }],
  [404, { code: "verification_unavailable", retryable: true }],
]) {
  test(`does not save on HTTP ${status}, or expose response secrets`, async () => {
    await assert.rejects(
      verifyProviderCredentials(
        credential,
        async () => new Response("secret-key-echo", { status }),
      ),
      (error) => {
        assert.ok(!error.message.includes("secret-key-echo"));
        assert.ok(error instanceof ProviderCredentialError);
        assert.equal(error.code, message.code);
        assert.equal(error.retryable, message.retryable);
        return true;
      },
    );
  });
}

for (const body of [
  { error: "invalid key", data: [] },
  { valid: false },
  "<html>success</html>",
  null,
]) {
  test(`does not treat an arbitrary 200 response as verification: ${JSON.stringify(body)}`, async () => {
    await assert.rejects(
      verifyProviderCredentials(credential, async () => Response.json(body)),
    );
  });
}

test("on-prem STT validates configuration without probing a model catalog", async () => {
  const fetcher = async () => {
    assert.fail("On-prem STT must not send model-list or control-key requests");
  };
  for (const baseUrl of [
    "http://127.0.0.1:8000/v1",
    "http://192.168.1.87:8000/v1",
    "http://100.101.102.103:9000",
    "http://dgx.local:8000/v1",
    "https://stt.example/v1",
  ]) {
    await verifyProviderCredentials(
      { ...credential, type: "stt", provider: "openai", baseUrl, apiKey: "" },
      fetcher,
    );
  }
});

test("on-prem STT still rejects unsafe URLs and malformed keys before saving", async () => {
  for (const update of [
    { baseUrl: "not-a-url" },
    { baseUrl: "http://stt.example/v1" },
    { baseUrl: "https://user:password@stt.example/v1" },
    { baseUrl: "http://8.8.8.8/v1" },
    { baseUrl: "https://stt.example/v1?key=secret" },
    { apiKey: "bad\nkey" },
  ]) {
    await assert.rejects(
      verifyProviderCredentials(
        { ...credential, type: "stt", provider: "openai", ...update },
        async () => assert.fail("Invalid configuration must not send requests"),
      ),
      ProviderCredentialError,
    );
  }
});

test("cancellation does not validate a key", async () => {
  const controller = new AbortController();
  await assert.rejects(
    verifyProviderCredentials(
      credential,
      async () => {
        controller.abort();
        return Response.json({ data: [] });
      },
      controller.signal,
    ),
    { code: "network" },
  );
});

test("network failures are not mislabeled as invalid credentials", async () => {
  await assert.rejects(
    verifyProviderCredentials(credential, async () => {
      throw Error("secret-key");
    }),
    { code: "network", retryable: true },
  );
});

test("rejects malformed credentials and unsafe endpoints before a request", async () => {
  for (const update of [
    { apiKey: "a\nb" },
    { baseUrl: "not-a-url" },
    { baseUrl: "http://remote.test" },
    { baseUrl: "https://u:p@remote.test" },
    { baseUrl: "https://remote.test/?token=test" },
  ]) {
    await assert.rejects(
      verifyProviderCredentials({ ...credential, ...update }, () =>
        assert.fail("Unexpected network request"),
      ),
      (error) => {
        assert.ok(error instanceof ProviderCredentialError);
        assert.equal(error.retryable, false);
        return true;
      },
    );
  }
});

test("reuses recent proof only for the same credential and endpoint", async () => {
  let requests = 0;
  const fetcher = async () => {
    requests++;
    return Response.json({ data: [] });
  };
  await verifyProviderCredentials(credential, fetcher);
  await verifyProviderCredentials(credential, fetcher);
  assert.equal(requests, 1);
  await verifyProviderCredentials(
    { ...credential, apiKey: "replacement" },
    fetcher,
  );
  assert.equal(requests, 2);
  await verifyProviderCredentials(
    { ...credential, baseUrl: credential.baseUrl + "/new" },
    fetcher,
  );
  assert.equal(requests, 3);
});

test("never caches a failed verification as accepted", async () => {
  let rejected = true;
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return rejected
      ? new Response(null, { status: 401 })
      : Response.json({ data: [] });
  };
  await assert.rejects(verifyProviderCredentials(credential, fetcher), {
    code: "key_rejected",
  });
  rejected = false;
  await verifyProviderCredentials(credential, fetcher);
  assert.equal(calls, 2);
});

test("native streaming providers validate input without requiring a model catalog", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw new Error("No documented credential probe");
  };
  for (const provider of ["openai", "nvidia"]) {
    await verifyProviderCredentials(
      { ...credential, type: "stt", provider },
      fetcher,
    );
  }
  await verifyProviderCredentials(
    {
      ...credential,
      type: "stt",
      provider: "nvidia",
      baseUrl: "http://localhost:9000",
      apiKey: "",
    },
    fetcher,
  );
  assert.equal(calls, 0, "Native streaming providers must not probe a catalog");
});

test("custom_llm_without_key_lists_models", async () => {
  const requests = [];
  await verifyProviderCredentials(
    {
      type: "llm",
      provider: "custom",
      baseUrl: "http://192.168.1.87:30000/v1",
      apiKey: "",
    },
    async (url, init) => {
      requests.push({ url, init });
      return Response.json({ data: [{ id: "m" }] });
    },
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://192.168.1.87:30000/v1/models");
  assert.equal(requests[0].init.headers.Authorization, undefined);
});

test("custom_llm_skips_control_key_probe", async () => {
  const requests = [];
  await verifyProviderCredentials(
    {
      type: "llm",
      provider: "custom",
      baseUrl: "https://inference.example.com/v1",
      apiKey: "vllm-key",
    },
    async (url, init) => {
      requests.push({ url, init });
      return Response.json({ data: [{ id: "m" }] });
    },
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers.Authorization, "Bearer vllm-key");
});

test("validateProviderBaseUrl_rejects_plain_http_on_a_public_host", () => {
  assert.throws(() => validateProviderBaseUrl("http://8.8.8.8/v1"), {
    code: "https_required",
  });
  assert.throws(
    () => validateProviderBaseUrl("https://user:pass@example.com/v1"),
    { code: "url_with_credentials" },
  );
  assert.throws(() => validateProviderBaseUrl("not-a-url"), {
    code: "invalid_url",
    message: "Enter a valid base URL.",
  });
});

test("validateProviderBaseUrl_accepts_private_hosts_and_https", () => {
  for (const baseUrl of [
    "https://inference.example.com/v1",
    "http://192.168.1.87:30000/v1",
    "http://127.0.0.1:8000/v1",
    "http://localhost:9000",
  ]) {
    assert.ok(validateProviderBaseUrl(baseUrl) instanceof URL);
  }
});

test("isPrivateHost_accepte_les_noms_magicdns_du_tailnet", () => {
  for (const host of [
    "machine.tailnet.ts.net",
    "spark.tail6cba9f.ts.net",
    "SPARK.Tail6cba9f.TS.NET",
  ]) {
    assert.equal(isPrivateHost(host), true, host);
  }
  const url = validateProviderBaseUrl("http://machine.tailnet.ts.net:9000");
  assert.equal(url.hostname, "machine.tailnet.ts.net");
});

test("isPrivateHost_refuse_les_imitations_du_suffixe_ts_net", () => {
  for (const host of [
    "ts.net",
    ".ts.net",
    "evil-ts.net",
    "machine.evil-ts.net",
    "machine.ts.net.evil.com",
    "machine.ts.network",
    "machinets.net",
  ]) {
    assert.equal(isPrivateHost(host), false, host);
  }
  assert.throws(() => validateProviderBaseUrl("http://evil-ts.net:9000"), {
    code: "https_required",
    message:
      "Use HTTPS: plain HTTP is only accepted on this computer or a private network.",
  });
});

// Issue 646 : HTTP clair hors de cette machine signalé, sans exemption sur la
// forme de l'adresse.
test("isCleartextRemoteUrl_signale_tout_http_hors_de_cette_machine", () => {
  for (const url of [
    "http://192.168.1.87:8000/v1",
    "http://gpu.tailnet.ts.net:8000/v1",
    "http://100.64.0.1:8000/v1",
    "http://10.0.0.5:8000",
    "http://gpu.local:8000",
  ]) {
    assert.equal(isCleartextRemoteUrl(url), true, url);
  }
  for (const url of [
    "http://localhost:8000/v1",
    "http://127.0.0.1:8000/v1",
    "http://127.8.9.10:8000",
    "http://[::1]:8000/v1",
    "https://192.168.1.87:8000/v1",
    "https://gpu.tailnet.ts.net/v1",
    "pas une url",
  ]) {
    assert.equal(isCleartextRemoteUrl(url), false, url);
  }
});

test("isLoopbackHost_ne_reconnait_que_cette_machine", () => {
  for (const host of ["localhost", "127.0.0.1", "127.255.0.1", "[::1]"]) {
    assert.equal(isLoopbackHost(host), true, host);
  }
  for (const host of ["192.168.1.87", "gpu.local", "a.ts.net", "128.0.0.1"]) {
    assert.equal(isLoopbackHost(host), false, host);
  }
});

test("revalidates each request URL with the base URL rule (issue 678)", () => {
  for (const url of [
    "https://api.openai.com/v1/models?limit=10",
    "http://localhost:8000/v1/chat/completions",
    "http://192.168.1.20:8000/v1/models",
    "https://spark.tailnet.ts.net:9443/v1/models",
  ]) {
    assert.equal(validateProviderRequestUrl(url).href, new URL(url).href);
  }
  for (const url of [
    "http://api.example.com/v1/models",
    "http://203.0.113.5:8000/v1",
    "https://user:secret@api.example.com/v1",
    "ftp://api.example.com",
    "not a url",
  ]) {
    assert.throws(
      () => validateProviderRequestUrl(url),
      ProviderCredentialError,
    );
  }
});
