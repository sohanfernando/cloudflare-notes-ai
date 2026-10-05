import assert from "node:assert/strict";
import { test } from "node:test";
import { retryUntilFound } from "../../src/lib/retry.ts";

/** A clock that only moves when `sleep` is called, so the tests run instantly. */
function fakeClock() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    options: {
      now: () => time,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        time += ms;
      },
    },
  };
}

test("returns as soon as an attempt finds something", async () => {
  const clock = fakeClock();
  let calls = 0;
  const found = await retryUntilFound(async () => (++calls === 3 ? ["chunk"] : []), {
    intervalMs: 3000,
    maxWaitMs: 45_000,
    ...clock.options,
  });

  assert.deepEqual(found, ["chunk"]);
  assert.equal(calls, 3);
  assert.deepEqual(clock.sleeps, [3000, 3000, 3000]);
});

test("waits before the first attempt, since the caller has just tried", async () => {
  const clock = fakeClock();
  let sleptBeforeFirstCall = false;
  await retryUntilFound(
    async () => {
      sleptBeforeFirstCall = clock.sleeps.length === 1;
      return ["chunk"];
    },
    { intervalMs: 3000, maxWaitMs: 45_000, ...clock.options },
  );
  assert.ok(sleptBeforeFirstCall);
});

test("gives up with an empty list once the time allowed has passed", async () => {
  const clock = fakeClock();
  let calls = 0;
  const found = await retryUntilFound(
    async () => {
      calls++;
      return [];
    },
    { intervalMs: 3000, maxWaitMs: 45_000, ...clock.options },
  );

  assert.deepEqual(found, []);
  assert.equal(calls, 15);
  assert.equal(clock.sleeps.reduce((sum, ms) => sum + ms, 0), 45_000);
});

test("never waits past the limit, even when it is not a multiple of the interval", async () => {
  const clock = fakeClock();
  let calls = 0;
  await retryUntilFound(
    async () => {
      calls++;
      return [];
    },
    { intervalMs: 3000, maxWaitMs: 10_000, ...clock.options },
  );
  assert.equal(calls, 3);
});

test("an attempt that fails is not swallowed", async () => {
  const clock = fakeClock();
  await assert.rejects(
    retryUntilFound(
      async () => {
        throw new Error("vector store unavailable");
      },
      { intervalMs: 3000, maxWaitMs: 45_000, ...clock.options },
    ),
    /vector store unavailable/,
  );
});
