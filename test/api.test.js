import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHANNEL,
  fetchSchedule,
  fetchUsersCount,
  pingUsers,
  normalizeSetupNickname,
  registerCompletedSetup,
  fetchCompletedSetupsCount,
  normalizeChannelInput,
  normalizeWorkerUrl,
} from "../public/js/api.js";

test("normalizeWorkerUrl: коректно нормалізує URL-адресу Cloudflare Worker", () => {
  assert.equal(normalizeWorkerUrl(""), "");
  assert.equal(normalizeWorkerUrl(null), "");
  assert.equal(normalizeWorkerUrl(undefined), "");
  assert.equal(normalizeWorkerUrl("  https://my-worker.workers.dev  "), "https://my-worker.workers.dev");
  assert.equal(normalizeWorkerUrl("https://my-worker.workers.dev/"), "https://my-worker.workers.dev");
  assert.equal(normalizeWorkerUrl("https://my-worker.workers.dev/api"), "https://my-worker.workers.dev");
  assert.equal(normalizeWorkerUrl("https://my-worker.workers.dev/api/schedule"), "https://my-worker.workers.dev");
  assert.equal(normalizeWorkerUrl("https://my-worker.workers.dev/api/schedule/"), "https://my-worker.workers.dev");
  assert.equal(normalizeWorkerUrl("https://my-worker.workers.dev?test=1#hash"), "https://my-worker.workers.dev");
});

test("normalizeWorkerUrl: відхиляє небезпечні або некоректні адреси Worker", () => {
  assert.throws(() => normalizeWorkerUrl("http://insecure-worker.workers.dev"), /має починатися з https:\/\//);
  assert.throws(() => normalizeWorkerUrl("ftp://worker.workers.dev"), /має починатися з https:\/\//);
  assert.throws(() => normalizeWorkerUrl("https://user:password@worker.workers.dev"), /не повинно містити логін або пароль/);
  assert.throws(() => normalizeWorkerUrl("not-a-valid-url"), /Введіть повну адресу Worker/);
});

test("normalizeChannelInput: приймає різні формати публічного каналу Telegram", () => {
  const expected = {
    username: "SvitloMalovyskivskohoRaionu",
    url: "https://t.me/s/SvitloMalovyskivskohoRaionu",
  };
  assert.deepEqual(normalizeChannelInput("https://t.me/s/SvitloMalovyskivskohoRaionu"), expected);
  assert.deepEqual(normalizeChannelInput("https://t.me/SvitloMalovyskivskohoRaionu"), expected);
  assert.deepEqual(normalizeChannelInput("https://www.t.me/s/SvitloMalovyskivskohoRaionu"), expected);
  assert.deepEqual(normalizeChannelInput("https://telegram.me/s/SvitloMalovyskivskohoRaionu"), expected);
  assert.deepEqual(normalizeChannelInput("@SvitloMalovyskivskohoRaionu"), expected);
  assert.deepEqual(normalizeChannelInput("SvitloMalovyskivskohoRaionu"), expected);
  assert.deepEqual(normalizeChannelInput("https://t.me/s/SvitloMalovyskivskohoRaionu?query=123"), expected);
});

test("normalizeChannelInput: валідує довжину та забороняє некоректні імена й чужі домени", () => {
  assert.throws(() => normalizeChannelInput(""), /Вкажіть посилання або @назву/);
  assert.throws(() => normalizeChannelInput("   "), /Вкажіть посилання або @назву/);
  assert.throws(() => normalizeChannelInput("abcd"), /Введіть публічне посилання/); // менше 5 символів
  assert.throws(() => normalizeChannelInput("a".repeat(33)), /Введіть публічне посилання/); // понад 32 символи
  assert.throws(() => normalizeChannelInput("https://example.com/s/my_channel"), /Введіть публічне посилання/);
  assert.throws(() => normalizeChannelInput("channel-with-dashes"), /Введіть публічне посилання/);
  assert.throws(() => normalizeChannelInput("channel with spaces"), /Введіть публічне посилання/);
});

test("fetchSchedule: успішно запитує розклад і коректно передає параметри", async () => {
  const mockData = {
    channel: "test_channel",
    today: "2026-11-09",
    tomorrow: "2026-11-10",
    schedules: {
      "2026-11-09": { queues: { "1.1": [{ start: 0, end: 120 }] } },
    },
  };

  const originalFetch = globalThis.fetch;
  let requestedUrl = null;
  globalThis.fetch = async (url) => {
    requestedUrl = url.toString();
    return new Response(JSON.stringify(mockData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await fetchSchedule({
      workerUrl: "https://worker.test.dev",
      channel: "@test_channel",
      refresh: true,
    });

    assert.deepEqual(result, mockData);
    assert.match(requestedUrl, /^https:\/\/worker\.test\.dev\/api\/schedule\?/);
    assert.match(requestedUrl, /channel=https%3A%2F%2Ft\.me%2Fs%2Ftest_channel/);
    assert.match(requestedUrl, /refresh=1/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchSchedule: викидає помилку, якщо адреса Worker не налаштована", async () => {
  await assert.rejects(
    () => fetchSchedule({ workerUrl: "", channel: DEFAULT_CHANNEL }),
    /задати адресу Cloudflare Worker у public\/config\.js/i
  );
});

test("fetchSchedule: обробляє HTTP помилки від Worker з текстом повідомлення", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Канал не знайдено або недоступний." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await assert.rejects(
      () => fetchSchedule({ workerUrl: "https://worker.test.dev", channel: "@test_channel" }),
      /Канал не знайдено або недоступний/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchSchedule: обробляє некоректну структуру відповіді без schedules", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await assert.rejects(
      () => fetchSchedule({ workerUrl: "https://worker.test.dev", channel: "@test_channel" }),
      /формат графіка не розпізнано/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchSchedule: обробляє мережеву помилку з'єднання", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    await assert.rejects(
      () => fetchSchedule({ workerUrl: "https://worker.test.dev", channel: "@test_channel" }),
      /Не вдалося з'єднатися з Worker/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchSchedule: обробляє переривання за сигналом AbortSignal", async () => {
  const controller = new AbortController();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, { signal }) => {
    return new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted", "AbortError")));
    });
  };

  try {
    const promise = fetchSchedule({
      workerUrl: "https://worker.test.dev",
      channel: "@test_channel",
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(promise, /Worker довго не відповідає/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pingUsers / fetchUsersCount: надсилають id POST-запитом, читають число GET-запитом і ігнорують сміття у відповіді", async () => {
  const original = globalThis.fetch;
  const calls = [];
  let reply = { ok: true, users: 42 };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body });
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  try {
    assert.equal(await pingUsers({ workerUrl: "https://w.workers.dev/", clientId: "abcdefabcdefabcdef" }), 42);
    assert.deepEqual(calls[0], { url: "https://w.workers.dev/api/ping", method: "POST", body: JSON.stringify({ id: "abcdefabcdefabcdef" }) });
    assert.equal(await fetchUsersCount({ workerUrl: "https://w.workers.dev" }), 42);
    assert.equal(calls[1].url, "https://w.workers.dev/api/stats");
    assert.equal(calls[1].method, "GET");
    reply = { ok: true, users: null };
    assert.equal(await fetchUsersCount({ workerUrl: "https://w.workers.dev" }), null);
    reply = { ok: true, users: "many" };
    assert.equal(await fetchUsersCount({ workerUrl: "https://w.workers.dev" }), null);
    assert.equal(await pingUsers({ workerUrl: "", clientId: "abcdefabcdefabcdef" }), null);
  } finally {
    globalThis.fetch = original;
  }
});


test("complete setup API: normalizes nicknames, registers by browser ID and fetches only completed setup count", async () => {
  assert.equal(normalizeSetupNickname("  Олена  Тест "), "Олена Тест");
  assert.throws(() => normalizeSetupNickname("x"), /2–24 символи/);
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body });
    return Response.json({ ok: true, users: 17, isNew: true, excluded: false });
  };
  try {
    assert.deepEqual(await registerCompletedSetup({ workerUrl: "https://w.workers.dev", clientId: "abcdefabcdefabcdef", nickname: "Олена" }), { users: 17, isNew: true, excluded: false });
    assert.deepEqual(calls[0], {
      url: "https://w.workers.dev/api/complete-setup",
      method: "POST",
      body: JSON.stringify({ id: "abcdefabcdefabcdef", nickname: "Олена" }),
    });
    assert.equal(await fetchCompletedSetupsCount({ workerUrl: "https://w.workers.dev" }), 17);
    assert.equal(calls[1].url, "https://w.workers.dev/api/completed-settings");
    assert.equal(await registerCompletedSetup({ workerUrl: "", clientId: "abcdefabcdefabcdef", nickname: "Олена" }), null);
  } finally {
    globalThis.fetch = original;
  }
});


test("normalizeChannelInput accepts only built-in official schedule source URLs", () => {
  assert.deepEqual(normalizeChannelInput("https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages"), {
    username: "source-dnipro-dtem", url: "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages",
  });
  assert.equal(normalizeChannelInput("https://www.cherkasyoblenergo.com/api/v1/posts/main?limit=2").username, "source-cherkasy");
  assert.equal(normalizeChannelInput("https://t.me/s/SumyEnergo").username, "SumyEnergo");
  assert.throws(() => normalizeChannelInput("https://evil.example/api/v1/posts/main"), /Введіть публічне посилання/);
});
