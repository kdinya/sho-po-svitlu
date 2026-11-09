import test from "node:test";
import assert from "node:assert/strict";
import {
  extractScheduleDates,
  handleRequest,
  normalizeChannel,
  parseIntervals,
  parseQueues,
  parseTelegramHtml,
  getTelegramBotToken,
  recountUsers,
  normalizeSetupNickname,
  CompletedSetupCounter,
} from "./index.js";

const NOW = new Date("2026-11-08T18:00:00.000Z");

function messageBlock(text, postedAt, id) {
  return `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="test/${id}"><div class="tgme_widget_message_text js-message_text" dir="auto">${text.replaceAll("\n", "<br>")}</div><a class="tgme_widget_message_date"><time datetime="${postedAt}"></time></a></div></div>`;
}

test("нормалізує лише публічне ім'я Telegram-каналу, а не довільний URL", () => {
  assert.deepEqual(normalizeChannel("https://t.me/s/SvitloMalovyskivskohoRaionu"), {
    username: "SvitloMalovyskivskohoRaionu",
    url: "https://t.me/s/SvitloMalovyskivskohoRaionu",
  });
  assert.equal(normalizeChannel("@my_channel").url, "https://t.me/s/my_channel");
  assert.throws(() => normalizeChannel("https://example.com/secret"), /публічний канал/);
  assert.throws(() => normalizeChannel("../../internal"), /публічний канал/);
});

test("розбирає інтервали з двокрапками, хвилинами та перевіряє межі доби", () => {
  assert.deepEqual(parseIntervals("00-02, 04:15–06:00, 12-12:30, 22-24, 24:00-24:00, 25-26"), [
    { start: 0, end: 120 },
    { start: 255, end: 360 },
    { start: 720, end: 750 },
    { start: 1320, end: 1440 },
  ]);
});

test("витягує всі черги зі зразка та не плутає десятковий номер черги з часом", () => {
  const queues = parseQueues(`09.11.2026 за розпорядженням Укренерго:\nЧерга 1.1: 02-04, 06-08, 10-12\nЧерга 6.2: 00-02, 04-06, 12-12:30, 22-24`);
  assert.deepEqual(Object.keys(queues), ["1.1", "6.2"]);
  assert.deepEqual(queues["6.2"], [{ start: 0, end: 120 }, { start: 240, end: 360 }, { start: 720, end: 750 }, { start: 1320, end: 1440 }]);
});

test("розпізнає українську дату й ISO дату тільки на сьогодні або завтра", () => {
  assert.deepEqual(extractScheduleDates("Сьогодні 08.11.2026. На завтра — 2026-11-09." , "2026-11-08"), ["2026-11-08", "2026-11-09"]);
  assert.deepEqual(extractScheduleDates("09.11 графік погодинних відключень", "2026-11-08"), ["2026-11-09"]);
  assert.deepEqual(extractScheduleDates("31.02.2026", "2026-11-08"), []);
});

test("з Telegram preview бере найновіший допис для завтра й окремо зберігає сьогоднішній", () => {
  const html = `<html><head><meta property="og:title" content="Світло громади"></head><body>${[
    messageBlock("08.11.2026 графік\nЧерга 6.2: 00-02, 06-08", "2026-11-08T06:00:00+00:00", 1),
    messageBlock("09.11.2026 графік\nЧерга 6.2: 02-04, 12-12:30", "2026-11-08T10:00:00+00:00", 2),
    messageBlock("09.11.2026 ОНОВЛЕНО\nЧерга 6.2: 04-06, 14-16, 20-22", "2026-11-08T14:00:00+00:00", 3),
  ].join("")}</body></html>`;
  const result = parseTelegramHtml(html, { channel: "example_channel", now: NOW });
  assert.equal(result.title, "Світло громади");
  assert.equal(result.analyzedMessages, 3);
  assert.deepEqual(result.schedules["2026-11-08"].queues["6.2"], [{ start: 0, end: 120 }, { start: 360, end: 480 }]);
  assert.deepEqual(result.schedules["2026-11-09"].queues["6.2"], [{ start: 240, end: 360 }, { start: 840, end: 960 }, { start: 1200, end: 1320 }]);
  assert.equal(result.schedules["2026-11-09"].postedAt, "2026-11-08T14:00:00.000Z");
});

test("Worker додає CORS і повідомляє про невалідне посилання без мережевого запиту", async () => {
  const response = await handleRequest(new Request("https://worker.example/api/schedule?channel=https%3A%2F%2Fexample.com%2Fprivate", { headers: { Origin: "https://app.example" } }), {});
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match((await response.json()).message, /публічний канал/);
});

test("запит каналу надсилає коректно нормалізоване повідомлення й не довіряє HTML у полях", async () => {
  const originalFetch = globalThis.fetch;
  let telegramPayload;
  globalThis.fetch = async (_url, options) => {
    telegramPayload = JSON.parse(options.body);
    return Response.json({ ok: true, result: { message_id: 1 } });
  };
  try {
    const response = await handleRequest(new Request("https://worker.example/api/request-channel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region: "Кіровоградська область", channelUrl: "@sho_po_svitlu", senderName: "<b>Олена</b>", requestType: "new", note: "<script>bad</script>" }),
    }), { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHANNEL_ID: "@sho_po_svitlu" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sentToTelegram, true);
    assert.equal(telegramPayload.chat_id, "@sho_po_svitlu");
    assert.match(telegramPayload.text, /https:\/\/t\.me\/s\/sho_po_svitlu/);
    assert.match(telegramPayload.text, /&lt;b&gt;Олена&lt;\/b&gt;/);
    assert.doesNotMatch(telegramPayload.text, /<script>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("запит каналу відхиляє невалідні дані й повертає помилку без налаштованого бота", async () => {
  const invalid = await handleRequest(new Request("https://worker.example/api/request-channel", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region: "Не область", channelUrl: "https://example.com" }),
  }), { TELEGRAM_BOT_TOKEN: "test-token" });
  assert.equal(invalid.status, 400);

  const unconfigured = await handleRequest(new Request("https://worker.example/api/request-channel", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region: "Кіровоградська область", channelUrl: "https://t.me/sho_po_svitlu" }),
  }), {});
  assert.equal(unconfigured.status, 503);
  assert.equal((await unconfigured.json()).error, "not_configured");
});

test("запит каналу не повертає успіх, якщо Telegram не підтвердив доставку", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: false, description: "Forbidden" }, { status: 403 });
  try {
    const response = await handleRequest(new Request("https://worker.example/api/request-channel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region: "Кіровоградська область", channelUrl: "https://t.me/sho_po_svitlu" }),
    }), { TELEGRAM_BOT_TOKEN: "test-token" });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, "telegram_delivery_failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Worker health endpoint повертає JSON і OPTIONS відповідає на CORS preflight", async () => {
  const health = await handleRequest(new Request("https://worker.example/api/health"), {});
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const options = await handleRequest(new Request("https://worker.example/api/schedule", { method: "OPTIONS" }), {});
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
});

test("Worker використовує KV namespace через binding KV_BINDING", async () => {
  const entries = new Map();
  const kv = {
    async get(key) { return entries.get(key) ?? null; },
    async put(key, value) { entries.set(key, value); },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<html><head><meta property="og:title" content="Тест"></head><body>${messageBlock("08.11.2026 графік\nЧерга 1.1: 02-04", "2026-11-08T12:00:00Z", 1)}</body></html>`);
  try {
    const response = await handleRequest(new Request("https://worker.example/api/schedule?channel=example_channel"), { KV_BINDING: kv });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).channel, "example_channel");
    assert.equal(entries.size, 1);
    assert.match([...entries.keys()][0], /^channel:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Worker повертає 405 для не-GET запитів", async () => {
  const post = await handleRequest(new Request("https://worker.example/api/schedule", { method: "POST" }), {});
  assert.equal(post.status, 405);
  const data = await post.json();
  assert.equal(data.error, "method_not_allowed");
});

test("Worker повертає 404 для невідомих маршрутів", async () => {
  const notFound = await handleRequest(new Request("https://worker.example/api/unknown-endpoint"), {});
  assert.equal(notFound.status, 404);
  const data = await notFound.json();
  assert.equal(data.error, "not_found");
});

test("Worker повертає 502, якщо Telegram повертає помилку сервера", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Internal Server Error", { status: 500 });
  try {
    const response = await handleRequest(new Request("https://worker.example/api/schedule?channel=test_channel"), {});
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.equal(data.error, "channel_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("розбирає черги з різними видами тире, двокрапками та пробілами", () => {
  const text = `Черга 1.1 - 00:00 - 02:00, 06:00 – 08:00\nчерги 2.2: 10:00 — 12:00, 18:00 − 20:00`;
  const queues = parseQueues(text);
  assert.deepEqual(Object.keys(queues), ["1.1", "2.2"]);
  assert.deepEqual(queues["1.1"], [{ start: 0, end: 120 }, { start: 360, end: 480 }]);
  assert.deepEqual(queues["2.2"], [{ start: 600, end: 720 }, { start: 1080, end: 1200 }]);
});

test("ігнорує повідомлення без графіків відключень", () => {
  const plainText = "Увага! Завтра плануються аварійно-відновлювальні роботи на підстанції. Слідкуйте за оновленнями.";
  assert.deepEqual(parseQueues(plainText), {});
});

test("getTelegramBotToken: коректно розпізнає та нормалізує токен бота з різних ключів env", () => {
  assert.equal(getTelegramBotToken({ TELEGRAM_BOT_TOKEN: "123456:ABC" }), "123456:ABC");
  assert.equal(getTelegramBotToken({ BOT_TOKEN: ' "bot987654:XYZ" ' }), "987654:XYZ");
  assert.equal(getTelegramBotToken({ my_telegram_token: "555:DEF" }), "555:DEF");
  assert.equal(getTelegramBotToken({}), null);
});

function memoryKv() {
  const entries = new Map();
  return {
    entries,
    async get(key) { return entries.get(key) ?? null; },
    async put(key, value) { entries.set(key, value); },
    async delete(key) { entries.delete(key); },
    async list({ prefix = "", cursor } = {}) {
      const keys = [...entries.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name }));
      const start = Number(cursor ?? 0);
      const page = keys.slice(start, start + 2);
      const done = start + 2 >= keys.length;
      return { keys: page, list_complete: done, cursor: done ? undefined : String(start + 2) };
    },
  };
}

function memoryCompletedCounter() {
  const entries = new Map();
  let queue = Promise.resolve();
  const storage = {
    async get(key) { return entries.get(key); },
    async put(key, value) { entries.set(key, value); },
    async delete(key) { return entries.delete(key); },
    async transaction(callback) {
      let release;
      const previous = queue;
      queue = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await callback(storage); } finally { release(); }
    },
  };
  const instance = new CompletedSetupCounter({ storage });
  return {
    entries,
    idFromName(name) { return name; },
    get(_id) { return { fetch: (request) => instance.fetch(request) }; },
  };
}

function ping(id) {
  return new Request("https://worker.example/api/ping", { method: "POST", body: JSON.stringify({ id }) });
}

test("/api/ping: рахує унікальні пристрої й не дублює повторні візити", async () => {
  const kv = memoryKv();
  const env = { KV_BINDING: kv };
  const first = await (await handleRequest(ping("aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb"), env)).json();
  assert.deepEqual({ ok: first.ok, users: first.users, isNew: first.isNew }, { ok: true, users: 1, isNew: true });
  const repeat = await (await handleRequest(ping("aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb"), env)).json();
  assert.deepEqual({ users: repeat.users, isNew: repeat.isNew }, { users: 1, isNew: false });
  const second = await (await handleRequest(ping("cccccccc-1111-4222-8333-dddddddddddd"), env)).json();
  assert.equal(second.users, 2);
  const stats = await handleRequest(new Request("https://worker.example/api/stats"), env);
  assert.equal(stats.status, 200);
  assert.deepEqual(await stats.json(), { ok: true, users: 2 });
});

test("/api/complete-setup: рахує тільки завершення з ніком і дедуплікує за ID", async () => {
  const env = { COMPLETED_SETUP_COUNTER: memoryCompletedCounter() };
  const id = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";
  const request = (nickname, clientId = id) => new Request("https://worker.example/api/complete-setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: clientId, nickname }),
  });
  const first = await (await handleRequest(request("Олена"), env)).json();
  assert.deepEqual({ users: first.users, isNew: first.isNew, excluded: first.excluded }, { users: 1, isNew: true, excluded: false });
  const repeat = await (await handleRequest(request("Інший нік"), env)).json();
  assert.deepEqual({ users: repeat.users, isNew: repeat.isNew }, { users: 1, isNew: false });
  const second = await (await handleRequest(request("Тест", "cccccccc-1111-4222-8333-dddddddddddd"), env)).json();
  assert.equal(second.users, 2);
  assert.deepEqual(await (await handleRequest(new Request("https://worker.example/api/completed-settings"), env)).json(), { ok: true, users: 2 });
  assert.equal(env.COMPLETED_SETUP_COUNTER.entries.has(`user:${id}`), true);
});

test("/api/complete-setup: виключає службовий нік без урахування регістру та прибирає попередній запис цього ID", async () => {
  const env = { COMPLETED_SETUP_COUNTER: memoryCompletedCounter() };
  const id = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";
  const request = (nickname) => new Request("https://worker.example/api/complete-setup", {
    method: "POST", body: JSON.stringify({ id, nickname }),
  });
  await handleRequest(request("Олена"), env);
  const excluded = await (await handleRequest(request("  SHOPOSVITLU_BOT  "), env)).json();
  assert.deepEqual({ users: excluded.users, isNew: excluded.isNew, excluded: excluded.excluded }, { users: 0, isNew: false, excluded: true });
  assert.equal(env.COMPLETED_SETUP_COUNTER.entries.has(`user:${id}`), false);
  assert.equal(env.COMPLETED_SETUP_COUNTER.entries.get("count"), 0);
  const laterCounted = await (await handleRequest(request("Олена"), env)).json();
  assert.equal(laterCounted.users, 1);
});

test("/api/complete-setup: відхиляє незавершені або некоректні дані та працює без Durable Object", async () => {
  const env = { COMPLETED_SETUP_COUNTER: memoryCompletedCounter() };
  const id = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";
  for (const nickname of [undefined, "A", "<script>", "x".repeat(25)]) {
    const response = await handleRequest(new Request("https://worker.example/api/complete-setup", {
      method: "POST", body: JSON.stringify({ id, nickname }),
    }), env);
    assert.equal(response.status, 400);
  }
  const badId = await handleRequest(new Request("https://worker.example/api/complete-setup", {
    method: "POST", body: JSON.stringify({ id: "short", nickname: "Олена" }),
  }), env);
  assert.equal(badId.status, 400);
  const noKv = await handleRequest(new Request("https://worker.example/api/complete-setup", {
    method: "POST", body: JSON.stringify({ id, nickname: "Олена" }),
  }), {});
  assert.equal((await noKv.json()).users, null);
  const unavailable = { COMPLETED_SETUP_COUNTER: { idFromName: () => "counter", get: () => ({ fetch: async () => { throw new Error("Temporary storage error"); } }) } };
  const failedWrite = await handleRequest(new Request("https://worker.example/api/complete-setup", {
    method: "POST", body: JSON.stringify({ id, nickname: "Олена" }),
  }), unavailable);
  assert.equal((await failedWrite.json()).users, null, "помилка зберігання не повинна виглядати як успішна реєстрація");
  assert.equal(await normalizeSetupNickname("  Олена  Тест "), "Олена Тест");
  assert.throws(() => normalizeSetupNickname(" "), /Введіть свій нік/);
});

test("/api/ping: відхиляє некоректні id, не-POST запити та не ламається без KV", async () => {
  const env = { KV_BINDING: memoryKv() };
  for (const id of ["", "short", "has spaces in it 1234567", "../../etc/passwd-1234567", 12345678901234567, null]) {
    const response = await handleRequest(ping(id), env);
    assert.equal(response.status, 400, `id ${JSON.stringify(id)} має бути відхилений`);
  }
  assert.equal(env.KV_BINDING.entries.size, 0);
  const badJson = await handleRequest(new Request("https://worker.example/api/ping", { method: "POST", body: "{" }), env);
  assert.equal(badJson.status, 400);
  const get = await handleRequest(new Request("https://worker.example/api/ping"), env);
  assert.equal(get.status, 405);
  const options = await handleRequest(new Request("https://worker.example/api/ping", { method: "OPTIONS" }), env);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  const noKv = await handleRequest(ping("aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb"), {});
  assert.equal(noKv.status, 200);
  assert.equal((await noKv.json()).users, null);
});

test("Durable Object serializes concurrent registrations for the same ID", async () => {
  const env = { COMPLETED_SETUP_COUNTER: memoryCompletedCounter() };
  const id = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";
  const responses = await Promise.all(Array.from({ length: 20 }, () => handleRequest(new Request("https://worker.example/api/complete-setup", {
    method: "POST", body: JSON.stringify({ id, nickname: "Олена" }),
  }), env)));
  const results = await Promise.all(responses.map((response) => response.json()));
  assert.equal(results.filter((result) => result.isNew).length, 1);
  assert.equal(results.at(-1).users, 1);
  assert.equal(env.COMPLETED_SETUP_COUNTER.entries.get("count"), 1);
});

test("recountUsers: точно перераховує користувачів по сторінках KV і виправляє лічильник", async () => {
  const kv = memoryKv();
  for (let index = 0; index < 5; index += 1) kv.entries.set(`user:device-number-${index}-padding`, "2026-11-09");
  kv.entries.set("channel:abc", "{}");
  kv.entries.set("stats:users", "2");
  assert.equal(await recountUsers({ KV_BINDING: kv }), 5);
  assert.equal(kv.entries.get("stats:users"), "5");
  assert.equal(await recountUsers({}), null);
});
