const TELEGRAM_HOST = "https://t.me";
const MAX_MESSAGES = 5;
const CACHE_SECONDS = 180;
const TIME_ZONE = "Europe/Kyiv";
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const USER_KEY_PREFIX = "user:";
const USERS_COUNT_KEY = "stats:users";
const USERS_RECOUNT_MAX_PAGES = 100;
const COMPLETED_COUNTER_NAME = "sho-po-svitlu-completed-settings";
// New counter generation starts from zero while retaining the previous records in storage.
const COMPLETED_COUNTER_GENERATION = "v2";
const COMPLETED_COUNTER_COUNT_KEY = `${COMPLETED_COUNTER_GENERATION}:count`;
const RESERVED_SETUP_NICKNAME = "shoposvitlu_bot";
const SETUP_NICKNAME_PATTERN = /^[\p{L}\p{M}\p{N}_ -]+$/u;
const UKRAINE_REGIONS = new Set([
  "Кіровоградська область", "Вінницька область", "Волинська область", "Дніпропетровська область",
  "Донецька область", "Житомирська область", "Закарпатська область", "Запорізька область",
  "Івано-Франківська область", "Київська область", "м. Київ", "Луганська область", "Львівська область",
  "Миколаївська область", "Одеська область", "Полтавська область", "Рівненська область",
  "Сумська область", "Тернопільська область", "Харківська область", "Херсонська область",
  "Хмельницька область", "Черкаська область", "Чернівецька область", "Чернігівська область",
]);

export function normalizeChannel(input) {
  if (typeof input !== "string") throw new Error("Вкажіть публічний канал Telegram.");
  const value = input.trim();
  const match = value.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{5,32})\/?(?:\?.*)?$/i)
    || value.match(/^@?([A-Za-z0-9_]{5,32})$/);
  if (!match) throw new Error("Введіть посилання на публічний канал виду https://t.me/s/назва_каналу або @назва_каналу.");
  return { username: match[1], url: `${TELEGRAM_HOST}/s/${match[1]}` };
}

function dateInKyiv(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function datePlusOne(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isValidDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function extractScheduleDates(text, referenceDate = dateInKyiv()) {
  const found = [];
  const seen = new Set();
  const add = (year, month, day) => {
    if (year < 100) year += 2000;
    if (!isValidDate(year, month, day)) return;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!seen.has(iso)) { seen.add(iso); found.push(iso); }
  };
  for (const match of text.matchAll(/\b(\d{1,2})[.\/]([0-1]?\d)(?:[.\/]((?:20)?\d{2}))?\b/g)) {
    const year = match[3] ? Number(match[3]) : Number(referenceDate.slice(0, 4));
    add(year, Number(match[2]), Number(match[1]));
  }
  for (const match of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    add(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  const today = referenceDate;
  const tomorrow = datePlusOne(referenceDate);
  return found.filter((date) => date === today || date === tomorrow);
}

function decodeEntities(text) {
  const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", laquo: "«", raquo: "»" };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === "#") {
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try { return String.fromCodePoint(value); } catch { return " "; }
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function stripTags(html) {
  return decodeEntities(html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " "))
    .replace(/[\t\u00a0 ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readMessageBlocks(html) {
  const starts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*tgme_widget_message_wrap[^"']*["'][^>]*>/gi)].map((match) => match.index);
  const blocks = starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
  return blocks.slice(-MAX_MESSAGES).reverse().map((block) => {
    const body = block.match(/<div\b[^>]*class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
    if (!body) return null;
    const time = block.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1]
      ?? block.match(/datetime=["']([^"']+)["']/i)?.[1]
      ?? null;
    return { text: stripTags(body), postedAt: time && !Number.isNaN(Date.parse(time)) ? new Date(time).toISOString() : null };
  }).filter((message) => message?.text);
}

export function parseIntervals(value) {
  const periods = [];
  const expression = /(?<!\d)(\d{1,2}(?::[0-5]\d)?)\s*[-–—−]\s*(\d{1,2}(?::[0-5]\d)?)(?!\d)/g;
  for (const match of value.matchAll(expression)) {
    const start = toMinutes(match[1]);
    const end = toMinutes(match[2]);
    if (start === null || end === null || end <= start || end > 1440) continue;
    periods.push({ start, end });
  }
  return periods.filter((period, index) => periods.findIndex((item) => item.start === period.start && item.end === period.end) === index)
    .sort((left, right) => left.start - right.start);
}

function toMinutes(value) {
  const [hoursText, minutesText = "0"] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

export function parseQueues(text) {
  const queues = {};
  const lines = text.replace(/\r/g, "").split(/\n/);
  for (const line of lines) {
    const match = line.match(/(?:черга|черги|черг\w*)\s*([1-6][.]\d)\s*[:：-]\s*(.*)/i);
    if (!match) continue;
    const queue = match[1];
    const periods = parseIntervals(match[2]);
    if (periods.length) queues[queue] = periods;
  }
  return queues;
}

export function parseTelegramHtml(html, { channel, now = new Date() } = {}) {
  const today = dateInKyiv(now);
  const tomorrow = datePlusOne(today);
  const candidates = { [today]: [], [tomorrow]: [] };
  const messages = readMessageBlocks(html);
  for (const [index, message] of messages.entries()) {
    const queues = parseQueues(message.text);
    if (!Object.keys(queues).length) continue;
    const mentionedDates = extractScheduleDates(message.text, today);
    const postedDate = message.postedAt ? dateInKyiv(new Date(message.postedAt)) : null;
    const targetDates = mentionedDates.length ? mentionedDates : [postedDate ?? today];
    for (const date of targetDates) {
      if (date !== today && date !== tomorrow) continue;
      candidates[date].push({ date, queues, postedAt: message.postedAt, messageText: message.text, rank: message.postedAt ? Date.parse(message.postedAt) : -index });
    }
  }
  const schedules = {};
  for (const date of [today, tomorrow]) {
    const best = candidates[date].sort((a, b) => b.rank - a.rank)[0];
    if (best) {
      const { rank, ...schedule } = best;
      schedules[date] = schedule;
    }
  }
  const title = html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/i)?.[1]
    ?? html.match(/<title>([^<]+)/i)?.[1]
    ?? channel;
  return {
    channel,
    sourceUrl: `https://t.me/s/${channel}`,
    title: stripTags(title).replace(/\s*[-|].*Telegram.*$/i, "").trim() || channel,
    fetchedAt: now.toISOString(),
    today,
    tomorrow,
    schedules,
    analyzedMessages: messages.length,
  };
}

async function channelKey(username) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(username.toLowerCase()));
  return `channel:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function readCache(env, key) {
  if (!env.KV_BINDING) return null;
  try { return await env.KV_BINDING.get(key, "json"); } catch { return null; }
}

async function writeCache(env, key, value) {
  if (!env.KV_BINDING) return;
  try { await env.KV_BINDING.put(key, JSON.stringify(value), { expirationTtl: 86400 }); } catch { /* The live API still works if KV is temporarily unavailable. */ }
}

async function fetchChannel(username, env, { force = false } = {}) {
  const key = await channelKey(username);
  const cached = await readCache(env, key);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_SECONDS * 1000) return cached;
  let response;
  try {
    response = await fetch(`${TELEGRAM_HOST}/s/${encodeURIComponent(username)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ShoPoSvitlu/1.0; +https://t.me/)" },
      signal: AbortSignal.timeout(9000),
    });
  } catch (error) {
    return cached ? { ...cached, stale: true, warning: "Канал Telegram тимчасово недоступний. Показано останні збережені дані." }
      : { error: "channel_unavailable", message: "Не вдалося з'єднатися з Telegram. Перевірте інтернет або спробуйте пізніше." };
  }
  if (!response.ok) {
    return cached ? { ...cached, stale: true, warning: "Telegram повернув помилку. Показано останні збережені дані." }
      : { error: "channel_unavailable", message: `Канал не відкрився (HTTP ${response.status}). Перевірте посилання та доступність каналу.` };
  }
  const html = await response.text();
  if (!/tgme_widget_message_wrap|tgme_page_title/i.test(html) || /tgme_page_error|tgme_page_extra[^>]*>\s*(?:If you have|Sorry)/i.test(html)) {
    return cached ? { ...cached, stale: true, warning: "Не вдалося прочитати канал. Показано останні збережені дані." }
      : { error: "channel_unavailable", message: "Канал не знайдено або його дописи недоступні для читання." };
  }
  const result = parseTelegramHtml(html, { channel: username });
  await writeCache(env, key, result);
  return result;
}

export function normalizeSetupNickname(input) {
  if (typeof input !== "string") throw new Error("Введіть свій нік.");
  const nickname = input.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!nickname) throw new Error("Введіть свій нік.");
  const length = [...nickname].length;
  if (length < 2 || length > 24 || !SETUP_NICKNAME_PATTERN.test(nickname)) {
    throw new Error("Нік має містити 2–24 символи: літери, цифри, пробіли, _ або -.");
  }
  return nickname;
}

async function callCompletedSetupCounter(env, path, { method = "GET", body } = {}) {
  const binding = env.COMPLETED_SETUP_COUNTER;
  if (!binding) return null;
  const stub = binding.get(binding.idFromName(COMPLETED_COUNTER_NAME));
  const response = await stub.fetch(new Request(`https://completed-counter.internal${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }));
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Не вдалося оновити лічильник налаштувань.");
  return data;
}

async function readCompletedSetupsCount(env) {
  try {
    const data = await callCompletedSetupCounter(env, "/stats");
    return Number.isFinite(data?.users) && data.users >= 0 ? data.users : null;
  } catch {
    return null;
  }
}

async function registerCompletedSetup(env, id, nickname) {
  try {
    const data = await callCompletedSetupCounter(env, "/register", {
      method: "POST",
      body: { id, nickname },
    });
    return {
      count: Number.isFinite(data?.users) && data.users >= 0 ? data.users : null,
      isNew: data?.isNew === true,
      excluded: data?.excluded === true,
    };
  } catch {
    // Не підтверджуємо успіх при тимчасовій помилці: клієнт має безпечно повторити запит.
    return { count: null, isNew: false, excluded: false };
  }
}

export class CompletedSetupCounter {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/stats" && request.method === "GET") {
      const count = Number(await this.ctx.storage.get(COMPLETED_COUNTER_COUNT_KEY) ?? 0);
      return Response.json({ ok: true, users: Number.isFinite(count) && count >= 0 ? count : 0 });
    }
    if (url.pathname !== "/register" || request.method !== "POST") {
      return Response.json({ error: "not_found", message: "Маршрут не знайдено." }, { status: 404 });
    }

    let body;
    try { body = await request.json(); } catch {
      return Response.json({ error: "invalid_json", message: "Некоректний JSON." }, { status: 400 });
    }
    const { id, nickname: rawNickname } = body || {};
    if (typeof id !== "string" || !USER_ID_PATTERN.test(id)) {
      return Response.json({ error: "invalid_id", message: "Некоректний ідентифікатор браузера." }, { status: 400 });
    }
    let nickname;
    try { nickname = normalizeSetupNickname(rawNickname); } catch (error) {
      return Response.json({ error: "invalid_nickname", message: error.message }, { status: 400 });
    }

    const result = await this.ctx.storage.transaction(async (transaction) => {
      const count = Math.max(0, Number(await transaction.get(COMPLETED_COUNTER_COUNT_KEY) ?? 0));
      const key = `${COMPLETED_COUNTER_GENERATION}:user:${id}`;
      const exists = await transaction.get(key) !== undefined;
      if (nickname.toLowerCase() === RESERVED_SETUP_NICKNAME) {
        if (exists) {
          await transaction.delete(key);
          const nextCount = Math.max(0, count - 1);
          await transaction.put(COMPLETED_COUNTER_COUNT_KEY, nextCount);
          return { users: nextCount, isNew: false, excluded: true };
        }
        return { users: count, isNew: false, excluded: true };
      }
      if (exists) return { users: count, isNew: false, excluded: false };
      const nextCount = count + 1;
      await transaction.put(key, new Date().toISOString());
      await transaction.put(COMPLETED_COUNTER_COUNT_KEY, nextCount);
      return { users: nextCount, isNew: true, excluded: false };
    });
    return Response.json({ ok: true, ...result });
  }
}

async function readUsersCount(env) {
  if (!env.KV_BINDING) return null;
  try {
    const value = Number.parseInt(await env.KV_BINDING.get(USERS_COUNT_KEY) ?? "", 10);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return null;
  }
}

// Кожен пристрій — окремий ключ user:<id>, тож повторні візити не дублюються.
// Загальне число зберігається окремо й раз на годину точно перераховується (recountUsers).
async function registerUser(env, id) {
  const kv = env.KV_BINDING;
  if (!kv) return { count: null, isNew: false };
  try {
    const key = `${USER_KEY_PREFIX}${id}`;
    const existing = await kv.get(key);
    let count = (await readUsersCount(env)) ?? 0;
    if (existing !== null) return { count, isNew: false };
    await kv.put(key, new Date().toISOString());
    count += 1;
    await kv.put(USERS_COUNT_KEY, String(count));
    return { count, isNew: true };
  } catch {
    return { count: await readUsersCount(env), isNew: false };
  }
}

export async function recountUsers(env) {
  const kv = env.KV_BINDING;
  if (!kv || typeof kv.list !== "function") return null;
  try {
    let total = 0;
    let cursor;
    for (let page = 0; page < USERS_RECOUNT_MAX_PAGES; page += 1) {
      const result = await kv.list({ prefix: USER_KEY_PREFIX, cursor });
      total += result.keys.length;
      if (result.list_complete) {
        await kv.put(USERS_COUNT_KEY, String(total));
        return total;
      }
      cursor = result.cursor;
    }
  } catch { /* Лічильник не критичний: лишаємо попереднє значення. */ }
  return null;
}

function corsHeaders(request, methods = "GET, OPTIONS") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(body, request, status = 200, methods = "GET, OPTIONS") {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request, methods) });
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


export function getTelegramBotToken(env = {}) {
  if (!env || typeof env !== "object") return null;
  const candidates = [
    env.TELEGRAM_BOT_TOKEN,
    env.telegram_bot_token,
    env.TELEGRAM_TOKEN,
    env.telegram_token,
    env.BOT_TOKEN,
    env.bot_token,
    env.TG_BOT_TOKEN,
    env.tg_bot_token,
    env.TELEGRAM_API_KEY,
    env.telegram_api_key,
  ];
  for (const raw of candidates) {
    if (typeof raw === "string" && raw.trim()) {
      return cleanBotToken(raw);
    }
  }
  for (const [key, val] of Object.entries(env)) {
    if (typeof val === "string" && val.trim() && /bot.*token|telegram.*token/i.test(key)) {
      return cleanBotToken(val);
    }
  }
  return null;
}

function cleanBotToken(raw) {
  let token = String(raw).trim();
  token = token.replace(/^["']|["']$/g, "").trim();
  token = token.replace(/^bot(?=\d)/i, "");
  return token || null;
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  const isPostRoute = ["/api/request-channel", "/api/ping", "/api/complete-setup"].includes(url.pathname);
  const methods = isPostRoute ? "POST, OPTIONS" : "GET, OPTIONS";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, methods) });

  if (url.pathname === "/api/health") {
    if (request.method !== "GET") return json({ error: "method_not_allowed", message: "Дозволені лише GET-запити." }, request, 405);
    const hasToken = Boolean(getTelegramBotToken(env));
    const envKeys = Object.keys(env || {}).map((k) => k);
    return json({
      ok: true,
      service: "sho-po-svitlu-api",
      telegramConfigured: hasToken,
      availableKeys: envKeys,
      timestamp: new Date().toISOString(),
    }, request);
  }

  if (url.pathname === "/api/stats") {
    if (request.method !== "GET") return json({ error: "method_not_allowed", message: "Дозволені лише GET-запити." }, request, 405);
    return json({ ok: true, users: await readUsersCount(env) }, request);
  }

  if (url.pathname === "/api/completed-settings") {
    if (request.method !== "GET") return json({ error: "method_not_allowed", message: "Дозволені лише GET-запити." }, request, 405);
    return json({ ok: true, users: await readCompletedSetupsCount(env) }, request);
  }

  if (url.pathname === "/api/complete-setup") {
    if (request.method !== "POST") return json({ error: "method_not_allowed", message: "Дозволені лише POST-запити." }, request, 405, "POST, OPTIONS");
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json", message: "Некоректний JSON у тілі запиту." }, request, 400, "POST, OPTIONS");
    }
    const id = body?.id;
    if (typeof id !== "string" || !USER_ID_PATTERN.test(id)) {
      return json({ error: "invalid_id", message: "Некоректний ідентифікатор браузера." }, request, 400, "POST, OPTIONS");
    }
    let nickname;
    try {
      nickname = normalizeSetupNickname(body?.nickname);
    } catch (error) {
      return json({ error: "invalid_nickname", message: error.message }, request, 400, "POST, OPTIONS");
    }
    const { count, isNew, excluded } = await registerCompletedSetup(env, id, nickname);
    return json({ ok: true, users: count, isNew, excluded }, request, 200, "POST, OPTIONS");
  }

  if (url.pathname === "/api/ping") {
    if (request.method !== "POST") return json({ error: "method_not_allowed", message: "Дозволені лише POST-запити." }, request, 405, "POST, OPTIONS");
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json", message: "Некоректний JSON у тілі запиту." }, request, 400, "POST, OPTIONS");
    }
    const id = body?.id;
    if (typeof id !== "string" || !USER_ID_PATTERN.test(id)) {
      return json({ error: "invalid_id", message: "Некоректний ідентифікатор пристрою." }, request, 400, "POST, OPTIONS");
    }
    const { count, isNew } = await registerUser(env, id);
    return json({ ok: true, users: count, isNew }, request, 200, "POST, OPTIONS");
  }

  if (url.pathname === "/api/request-channel") {
    if (request.method !== "POST") return json({ error: "method_not_allowed", message: "Дозволені лише POST-запити." }, request, 405);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json", message: "Некоректний JSON у тілі запиту." }, request, 400, "POST, OPTIONS");
    }
    const { region, channelUrl, senderName, requestType = "new", note } = body || {};
    if (typeof region !== "string" || !UKRAINE_REGIONS.has(region.trim())) {
      return json({ error: "invalid_region", message: "Оберіть область України зі списку." }, request, 400, "POST, OPTIONS");
    }
    let normalizedChannel;
    try {
      normalizedChannel = normalizeChannel(channelUrl);
    } catch (error) {
      return json({ error: "invalid_channel", message: error.message }, request, 400, "POST, OPTIONS");
    }
    if (!["new", "broken"].includes(requestType)) {
      return json({ error: "invalid_request_type", message: "Оберіть коректний тип запиту." }, request, 400, "POST, OPTIONS");
    }
    if (senderName != null && (typeof senderName !== "string" || senderName.length > 100)) {
      return json({ error: "invalid_sender", message: "Ім'я або нікнейм має бути до 100 символів." }, request, 400, "POST, OPTIONS");
    }
    if (note != null && (typeof note !== "string" || note.length > 500)) {
      return json({ error: "invalid_note", message: "Коментар має бути до 500 символів." }, request, 400, "POST, OPTIONS");
    }
    const botToken = getTelegramBotToken(env);
    if (!botToken) {
      return json({
        error: "not_configured",
        message: "Надсилання запитів ще не налаштоване. Спробуйте пізніше.",
        hint: "У Cloudflare Worker не знайдено TELEGRAM_BOT_TOKEN. Перевірте Settings -> Variables and Secrets та натисніть Save and Deploy."
      }, request, 503, "POST, OPTIONS");
    }

    const typeLabel = requestType === "broken" ? "⚠️ Канал не працює / змінився формат" : "➕ Запит на додавання нового каналу";
    const senderText = senderName?.trim() || "Не вказано (анонімно)";
    const noteText = note?.trim() || "—";
    const kyivTime = new Intl.DateTimeFormat("uk-UA", {
      timeZone: TIME_ZONE,
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date());

    const messageText = `⚡ <b>Запит на канал у ШоПоСвітлу</b>\n\n` +
      `📍 <b>Область:</b> ${escapeHtml(region.trim())}\n` +
      `📌 <b>Тип:</b> ${escapeHtml(typeLabel)}\n` +
      `🔗 <b>Канал:</b> ${escapeHtml(normalizedChannel.url)}\n` +
      `👤 <b>Від кого:</b> ${escapeHtml(senderText)}\n` +
      `📝 <b>Коментар:</b> ${escapeHtml(noteText)}\n` +
      `⏰ <b>Час:</b> ${kyivTime}`;

    const targetChat = env.TELEGRAM_REQUESTS_CHAT_ID || env.TELEGRAM_CHAT_ID || env.TELEGRAM_CHANNEL_ID || "@sho_po_svitlu";
    let sentToTelegram = false;
    let telegramError = null;
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: targetChat, text: messageText, parse_mode: "HTML", disable_web_page_preview: false }),
      });
      const tgData = await tgRes.json();
      if (tgRes.ok && tgData.ok) sentToTelegram = true;
      else telegramError = tgData.description || `HTTP ${tgRes.status}`;
    } catch (err) {
      telegramError = err.message;
    }

    if (env.KV_BINDING && typeof env.KV_BINDING.put === "function") {
      try {
        const reqKey = `req:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
        await env.KV_BINDING.put(reqKey, JSON.stringify({
          region: region.trim(), channelUrl: normalizedChannel.url, senderName: senderText,
          requestType, note: noteText, sentToTelegram, telegramError, createdAt: new Date().toISOString(),
        }), { expirationTtl: 30 * 86400 });
      } catch {}
    }

    if (!sentToTelegram) {
      const detail = telegramError ? ` (${telegramError})` : "";
      return json({ error: "telegram_delivery_failed", message: `Не вдалося доставити запит у Telegram${detail}. Перевірте права бота в каналі.` }, request, 502, "POST, OPTIONS");
    }
    return json({
      ok: true,
      sentToTelegram: true,
      message: "Дякуємо! Запит успішно надіслано в наш Telegram-канал.",
    }, request, 200, "POST, OPTIONS");
  }

  if (request.method !== "GET") return json({ error: "method_not_allowed", message: "Дозволені лише GET-запити." }, request, 405);
  if (url.pathname !== "/api/schedule") return json({ error: "not_found", message: "Маршрут не знайдено." }, request, 404);
  let channel;
  try {
    channel = normalizeChannel(url.searchParams.get("channel") || env.DEFAULT_CHANNEL || "SvitloMalovyskivskohoRaionu");
  } catch (error) {
    return json({ error: "invalid_channel", message: error.message }, request, 400);
  }
  const result = await fetchChannel(channel.username, env, { force: url.searchParams.get("refresh") === "1" });
  if (result.error) return json(result, request, 502);
  return json(result, request);
}

export default {
  fetch: handleRequest,
  scheduled(controller, env, context) {
    const username = env.DEFAULT_CHANNEL || "SvitloMalovyskivskohoRaionu";
    context.waitUntil(fetchChannel(username, env, { force: true }));
    // Cron працює кожні 5 хв; точний перерахунок користувачів — лише раз на годину.
    if (new Date(controller?.scheduledTime ?? Date.now()).getUTCMinutes() < 5) {
      context.waitUntil(recountUsers(env));
    }
  },
};
