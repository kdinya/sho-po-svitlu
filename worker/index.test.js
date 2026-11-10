import test from "node:test";
import assert from "node:assert/strict";
import {
  extractScheduleDates,
  handleRequest,
  normalizeChannel,
  parseIntervals,
  parseQueues,
  parseTelegramHtml,
  normalizeYasno,
  parseCherkasyContent,
  parseSumyOcr,
  readSumySchedulePosts,
  readLimitedResponseBytes,
  callOcrSpace,
  getOcrSpaceKeys,
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
  assert.equal(normalizeChannel("https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages").sourceId, "source-dnipro-dtem");
  assert.equal(normalizeChannel("https://www.cherkasyoblenergo.com/api/v1/posts/main?lang=uk&limit=10").sourceId, "source-cherkasy");
  assert.equal(normalizeChannel("https://t.me/s/SumyEnergo").sourceId, "source-sumy");
  assert.throws(() => normalizeChannel("https://example.com/secret"), /публічний канал/);
  assert.throws(() => normalizeChannel("../../internal"), /публічний канал/);
});


function fullYasnoFixture(status = "ScheduleApplies") {
  return Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
    const queue = `${Math.floor(index / 2) + 1}.${index % 2 + 1}`;
    return [queue, {
      today: { date: "2026-11-10T00:00:00+02:00", status, slots: [{ start: 0, end: 120, type: "NotPlanned" }, { start: 120, end: 180, type: "Definite" }, { start: 180, end: 1440, type: "NotPlanned" }] },
      tomorrow: { date: "2026-11-11T00:00:00+02:00", status: "WaitingForSchedule", slots: [] },
      updatedOn: "2026-11-10T04:00:00Z",
    }];
  }));
}

test("YASNO: normalizes only complete, valid 12-queue schedules", () => {
  const result = normalizeYasno(fullYasnoFixture(), "source-dnipro-dtem", new Date("2026-11-10T04:00:00Z"));
  assert.equal(Object.keys(result.schedules).length, 1, "WaitingForSchedule for tomorrow is not presented as a schedule");
  assert.deepEqual(result.schedules["2026-11-10"].queues["1.1"], [{ start: 120, end: 180 }]);
  const missing = fullYasnoFixture(); delete missing["6.2"];
  assert.throws(() => normalizeYasno(missing, "source-dnipro-dtem"), /відсутні черги/);
  const broken = fullYasnoFixture(); broken["1.1"].today.slots[0].end = 119;
  assert.deepEqual(normalizeYasno(broken, "source-dnipro-dtem", new Date("2026-11-10T04:00:00Z")).schedules, {});
  const unknown = fullYasnoFixture(); unknown["1.1"].today.slots[0].type = "Probable";
  assert.deepEqual(normalizeYasno(unknown, "source-dnipro-dtem", new Date("2026-11-10T04:00:00Z")).schedules, {});
});

test("Cherkasy: parses all 12 official queue rows and rejects a missing row", () => {
  const rows = Array.from({ length: 12 }, (_, index) => `<p>${Math.floor(index / 2) + 1}.${index % 2 + 1}&nbsp;<span>00</span><span>:00 - 02:00,&nbsp;</span><span>04</span><span>:00 - 06:00</span></p>`).join("");
  const queues = parseCherkasyContent(rows);
  assert.equal(Object.keys(queues).length, 12);
  assert.deepEqual(queues["1.1"], [{ start: 0, end: 120 }, { start: 240, end: 360 }]);
  assert.equal(parseCherkasyContent(rows.replace(/<p>6\.2[\s\S]*?<\/p>/, "")), null);
});

test("Sumy OCR keeps the last outage interval when it ends at midnight", () => {
  const text = Array.from({ length: 12 }, (_, index) => `${Math.floor(index / 2) + 1}.${index % 2 + 1} | 00:00 - 02:00 | 22:00 - 00:00`).join("\n");
  const queues = parseSumyOcr(text);
  assert.equal(Object.keys(queues).length, 12);
  assert.deepEqual(queues["1.1"], [{ start: 0, end: 120 }, { start: 1320, end: 1440 }]);
});

test("Sumy OCR fails closed unless all 12 subqueues have readable time ranges", () => {
  const text = Array.from({ length: 12 }, (_, index) => `${Math.floor(index / 2) + 1}.${index % 2 + 1} | 00:00 - 02:00 | 04:00 - 06:00`).join("\n");
  assert.equal(Object.keys(parseSumyOcr(text)).length, 12);
  assert.equal(parseSumyOcr(text.split("\n").slice(0, 11).join("\n")), null);
  assert.equal(parseSumyOcr(text.replace("1.1", "9.9")), null);
  assert.equal(parseSumyOcr(text.replace("00:00 - 02:00 | 04:00 - 06:00", "00:00 - 05:00 | 04:00 - 06:00")), null, "overlapping intervals are rejected");
});

test("OCR keys are discovered by numbered Cloudflare Secret name, deduplicated, and support the legacy first name", () => {
  assert.deepEqual(getOcrSpaceKeys({ OCR_SPACE_API_KEY_1: "one", OCR_SPACE_API_KEY_2: "two", OCR_SPACE_API_KEY_4: "four" }), ["one", "two", "four"]);
  assert.deepEqual(getOcrSpaceKeys({ OCR_SPACE_API_KEY: "legacy", OCR_SPACE_API_KEY_2: "two" }), ["legacy", "two"]);
  assert.deepEqual(getOcrSpaceKeys({ OCR_SPACE_API_KEY_1: " same ", OCR_SPACE_API_KEY_2: "same", OCR_SPACE_API_KEY_3: "three" }), ["same", "three"]);
  const fifty = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`OCR_SPACE_API_KEY_${index + 1}`, `key-${index + 1}`]));
  assert.equal(getOcrSpaceKeys(fifty).length, 50);
});

test("Sumy Telegram parser binds an image to its post and explicit date", () => {
  const html = `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="SumyEnergo/3882"><a class="tgme_widget_message_photo_wrap" href="https://t.me/SumyEnergo/3882" style="background-image:url('https://cdn4.telesco.pe/file/schedule.jpg')"></a><div class="tgme_widget_message_text">Завтра, 10-11-2026, діятимуть графіки погодинних відключень</div><time datetime="2026-11-09T18:04:52+00:00"></time></div></div>`;
  const posts = readSumySchedulePosts(html, "2026-11-10");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].postId, "3882");
  assert.equal(posts[0].date, "2026-11-10");
  assert.equal(posts[0].photoUrl, "https://cdn4.telesco.pe/file/schedule.jpg");
});

test("розбирає інтервали з двокрапками, хвилинами та переходом через північ", () => {
  assert.deepEqual(parseIntervals("00-02, 04:15–06:00, 12-12:30, 22-24, 22:00-00:00, 24:00-24:00, 25-26"), [
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


test("OCR lock serializes same-image work and rotates the selected key", async () => {
  const counter = memoryCompletedCounter();
  const digest = "a".repeat(64);
  const claim = (imageDigest, keyCount) => counter.get("test").fetch(new Request("https://do/ocr/claim", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ digest: imageDigest, keyCount }),
  }));
  const release = (imageDigest) => counter.get("test").fetch(new Request("https://do/ocr/release", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ digest: imageDigest }),
  }));
  const first = await (await claim(digest, 50)).json();
  const blocked = await (await claim(digest, 50)).json();
  assert.deepEqual(first, { claimed: true, keyIndex: 0 });
  assert.deepEqual(blocked, { claimed: false });
  await release(digest);
  const next = await (await claim("b".repeat(64), 50)).json();
  assert.deepEqual(next, { claimed: true, keyIndex: 1 });
  await release("b".repeat(64));
  for (let index = 2; index < 50; index += 1) {
    const currentDigest = index.toString(16).padStart(64, "0");
    const rotated = await (await claim(currentDigest, 50)).json();
    assert.deepEqual(rotated, { claimed: true, keyIndex: index });
    await release(currentDigest);
  }
  const wrapped = await (await claim("c".repeat(64), 50)).json();
  assert.deepEqual(wrapped, { claimed: true, keyIndex: 0 }, "rotation index wraps at the configured key count");
  const tooMany = await claim("d".repeat(64), 51);
  assert.equal(tooMany.status, 400);
});

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

test("/api/complete-setup: починає новий лічильник з нуля, зберігаючи старі записи", async () => {
  const counter = memoryCompletedCounter();
  counter.entries.set("count", 26);
  counter.entries.set("user:previous-browser-id", "2026-11-08T00:00:00.000Z");
  const env = { COMPLETED_SETUP_COUNTER: counter };
  const before = await (await handleRequest(new Request("https://worker.example/api/completed-settings"), env)).json();
  assert.deepEqual(before, { ok: true, users: 0 });

  const id = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";
  const request = new Request("https://worker.example/api/complete-setup", {
    method: "POST", body: JSON.stringify({ id, nickname: "Олена" }),
  });
  const first = await (await handleRequest(request, env)).json();
  assert.deepEqual({ users: first.users, isNew: first.isNew }, { users: 1, isNew: true });
  assert.equal(counter.entries.get("count"), 26, "старий лічильник лишається недоторканим");
  assert.equal(counter.entries.has("user:previous-browser-id"), true, "старі записи лишаються збереженими");
  assert.equal(counter.entries.get("v2:count"), 1);
  assert.equal(counter.entries.has(`v2:user:${id}`), true);
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
  assert.equal(env.COMPLETED_SETUP_COUNTER.entries.has(`v2:user:${id}`), true);
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
  assert.equal(env.COMPLETED_SETUP_COUNTER.entries.has(`v2:user:${id}`), false);
  assert.equal(env.COMPLETED_SETUP_COUNTER.entries.get("v2:count"), 0);
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
  assert.equal(env.COMPLETED_SETUP_COUNTER.entries.get("v2:count"), 1);
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


test("завантажувач зупиняє потік зображення, щойно перевищено межу розміру", async () => {
  const response = new Response(new Uint8Array(10));
  await assert.rejects(() => readLimitedResponseBytes(response, 5), /завелике/);
});

test("завантажувач повертає байти, якщо розмір зображення в межах ліміту", async () => {
  const expected = new Uint8Array([1, 2, 3]);
  const actual = await readLimitedResponseBytes(new Response(expected), 3);
  assert.deepEqual([...actual], [...expected]);
});


test("OCR чергує багато ключів і зупиняється на першому валідному розпізнаванні", async () => {
  const acceptedText = Array.from({ length: 12 }, (_, index) => `${Math.floor(index / 2) + 1}.${index % 2 + 1} | 00:00 - 02:00 | 04:00 - 06:00`).join("\n");
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(options.headers.apikey);
    if (options.headers.apikey === "key-4") return Response.json({ ParsedResults: [{ ParsedText: acceptedText }] });
    return Response.json({ IsErroredOnProcessing: true, ErrorMessage: ["test failure"] });
  };
  try {
    const keys = Array.from({ length: 50 }, (_, index) => `key-${index + 1}`);
    const result = await callOcrSpace(new Uint8Array([1, 2, 3]), "image/jpeg", keys, 2, parseSumyOcr);
    assert.deepEqual(calls, ["key-3", "key-4"]);
    assert.equal(Object.keys(result.value).length, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
