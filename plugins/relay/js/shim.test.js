import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const shim = readFileSync(new URL("./shim.js", import.meta.url), "utf8");

function loadShim(windowOverrides = {}) {
  const timers = [];
  const sockets = [];
  let reloads = 0;

  class FakeWebSocket {
    static OPEN = 1;

    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
    }

    send(message) {
      this.sent.push(message);
    }
  }

  // Page servie par le relay (port 1423), comme dans le navigateur.
  const window = {
    ...windowOverrides,
    location: {
      protocol: "http:",
      host: "127.0.0.1:1423",
      port: "1423",
      hash: "",
      pathname: "/",
      search: "",
      reload() {
        reloads += 1;
      },
      ...windowOverrides.location,
    },
  };
  vm.runInNewContext(shim, {
    clearTimeout() {},
    console: { info() {} },
    navigator: { userAgent: "test" },
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    WebSocket: FakeWebSocket,
    window,
  });

  return {
    invoke: window.__TAURI_INTERNALS__.invoke,
    reloads: () => reloads,
    sockets,
    timers,
    window,
  };
}

function connect(relay) {
  const socket = relay.sockets[0];
  socket.readyState = 1;
  socket.onopen();
  return socket;
}

function fireInvokeTimeout(relay) {
  relay.timers.find((timer) => timer.delay === 30_000).callback();
}

test("timed-out disconnected invokes are not replayed", async () => {
  const relay = loadShim();
  const invocation = relay.invoke("test", {}).catch((error) => error.message);

  fireInvokeTimeout(relay);
  assert.equal(await invocation, "relay invoke timed out");

  const socket = connect(relay);
  assert.deepEqual(socket.sent, []);
});

for (const connected of [false, true]) {
  test(`pending invokes are bounded (connected: ${connected})`, async () => {
    const relay = loadShim();
    const socket = connected ? connect(relay) : relay.sockets[0];
    const pending = Array.from({ length: 64 }, (_, index) =>
      relay.invoke(`pending-${index}`, {}).catch((error) => error.message),
    );

    await assert.rejects(
      relay.invoke("overflow", {}),
      /relay invoke limit reached/,
    );
    assert.equal(socket.sent.length, connected ? 64 : 0);

    socket.onclose({ code: 1006 });
    await Promise.all(pending);
  });
}

test("slow-client close reloads the browser to resubscribe", () => {
  const relay = loadShim();

  relay.sockets[0].onclose({ code: 1013 });

  assert.equal(relay.reloads(), 1);
});

test("unregistering listeners and channels releases callbacks", () => {
  const relay = loadShim();
  const internals = relay.window.__TAURI_INTERNALS__;
  const listenerId = internals.transformCallback(() => {});
  const channelId = internals.transformCallback(() => {});
  assert.equal(typeof relay.window[`_${listenerId}`], "function");

  relay.window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(
    "test-event",
    listenerId,
  );
  internals.unregisterCallback(channelId);

  assert.equal(relay.window[`_${listenerId}`], undefined);
  assert.equal(relay.window[`_${channelId}`], undefined);
});

for (const [outcome, settle, expected] of [
  [
    "failed",
    (relay, socket) =>
      socket.onmessage({
        data: JSON.stringify({
          id: JSON.parse(socket.sent[0]).id,
          ok: false,
          payload: "listen failed",
        }),
      }),
    "listen failed",
  ],
  ["timed-out", (relay) => fireInvokeTimeout(relay), "relay invoke timed out"],
]) {
  test(`${outcome} event listens release their transformed callback`, async () => {
    const relay = loadShim();
    const callbackId = relay.window.__TAURI_INTERNALS__.transformCallback(
      () => {},
    );
    const socket = connect(relay);
    const listening = relay
      .invoke("plugin:event|listen", { handler: callbackId })
      .catch((error) => error.message);

    settle(relay, socket);

    assert.equal(await listening, expected);
    assert.equal(relay.window[`_${callbackId}`], undefined);
  });
}

// Issue 664 : le secret du canal arrive dans le fragment de l'URL de retour
// de l'amorçage. Il est gardé pour ce port, retiré de la barre d'adresse et
// présenté en sous-protocole WebSocket.
test("the session secret from the bootstrap fragment opens the socket", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const stored = new Map();
  const replaced = [];
  const relay = loadShim({
    location: { hash: `#relay-session=${secret}` },
    sessionStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    },
    history: { replaceState: (...args) => replaced.push(args) },
  });

  assert.deepEqual(
    [...relay.sockets[0].protocols],
    [`syntheo-relay.${secret}`],
  );
  assert.equal(stored.get("syntheo-relay-session"), secret);
  assert.deepEqual(replaced, [[null, "", "/"]]);
});

test("a reloaded page reuses the session secret of this port", () => {
  const secret = "fedcba9876543210fedcba9876543210";
  const relay = loadShim({
    sessionStorage: {
      getItem: (key) => (key === "syntheo-relay-session" ? secret : null),
      setItem() {},
    },
  });

  assert.deepEqual(
    [...relay.sockets[0].protocols],
    [`syntheo-relay.${secret}`],
  );
});

test("without a session secret, no protocol is offered", () => {
  const relay = loadShim();

  assert.deepEqual([...relay.sockets[0].protocols], []);
});
