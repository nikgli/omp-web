import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");

// The wrapper builds an RpcSubagentRegistry, which subscribes to the session's
// event bus; these shutdown tests only care about teardown ordering, so hand it
// a bus that records nothing.
function makeEventBus() {
  return { on: () => () => {} };
}

test("session shutdown notifies extensions before disposing the SDK session", async () => {
  const calls = [];
  const inner = {
    isBashRunning: false,
    extensionRunner: {
      async emit(event) {
        calls.push(["emit", event]);
      },
    },
    dispose() {
      calls.push(["dispose"]);
    },
  };
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.onDestroy(() => calls.push(["destroy"]));

  await Promise.all([wrapper.shutdown(), wrapper.shutdown()]);

  assert.deepEqual(calls, [
    ["emit", { type: "session_shutdown", reason: "quit" }],
    ["dispose"],
    ["destroy"],
  ]);
  assert.equal(wrapper.isAlive(), false);
});

test("session shutdown still disposes the SDK session when an extension fails", async () => {
  const calls = [];
  const inner = {
    isBashRunning: false,
    extensionRunner: {
      async emit() {
        calls.push("emit");
        throw new Error("shutdown hook failed");
      },
    },
    dispose() {
      calls.push("dispose");
    },
  };
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.onDestroy(() => calls.push("destroy"));

  await assert.rejects(wrapper.shutdown(), /shutdown hook failed/);

  assert.deepEqual(calls, ["emit", "dispose", "destroy"]);
  assert.equal(wrapper.isAlive(), false);
});

test("direct destruction disposes the SDK session before unregistering the wrapper", () => {
  const calls = [];
  const inner = {
    isBashRunning: false,
    extensionRunner: {},
    dispose() {
      calls.push("dispose");
    },
  };
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.onDestroy(() => calls.push("destroy"));

  wrapper.destroy();
  wrapper.destroy();

  assert.deepEqual(calls, ["dispose", "destroy"]);
  assert.equal(wrapper.isAlive(), false);
});

test("extension confirmations queue and replay until answered", async () => {
  const inner = { sessionId: "ui-queue-test", isBashRunning: false, dispose() {} };
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  let ui;
  wrapper.bindToolUiContext((context) => { ui = context; });
  const events = [];
  const unsubscribe = wrapper.onEvent((event) => events.push(event));
  try {
    const first = ui.confirm("First", "First request");
    const second = ui.confirm("Second", "Second request");
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "First");

    unsubscribe();
    const replayed = [];
    wrapper.onEvent((event) => replayed.push(event));
    assert.equal(replayed.length, 1);
    assert.equal(replayed[0].id, events[0].id);

    await wrapper.send({ type: "extension_ui_response", id: events[0].id, confirmed: true });
    assert.equal(await first, true);
    assert.equal(replayed[1].method, "close");
    assert.equal(replayed[2].title, "Second");
    await wrapper.send({ type: "extension_ui_response", id: replayed[2].id, confirmed: false });
    assert.equal(await second, false);
  } finally {
    wrapper.destroy();
  }
});

test("an aborted confirmation closes without approving the action", async () => {
  const inner = { sessionId: "ui-abort-test", isBashRunning: false, dispose() {} };
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  let ui;
  wrapper.bindToolUiContext((context) => { ui = context; });
  const events = [];
  wrapper.onEvent((event) => events.push(event));
  try {
    const controller = new AbortController();
    const result = ui.confirm("Approval", "Pending action", { signal: controller.signal });
    controller.abort();
    assert.equal(await result, false);
    assert.equal(events[1].method, "close");
    assert.equal(events[1].id, events[0].id);
  } finally {
    wrapper.destroy();
  }
});
