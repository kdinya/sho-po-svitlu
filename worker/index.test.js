import test from "node:test";
import assert from "node:assert/strict";
import {
  extractScheduleDates,
  handleRequest,
  normalizeChannel,
  parseIntervals,
  parseQueues,
  parseTelegramHtml,
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
