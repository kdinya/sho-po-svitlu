const TELEGRAM_HOST = "https://t.me";
const MAX_MESSAGES = 5;
const CACHE_SECONDS = 180;
const OCR_FAILURE_CACHE_SECONDS = 15 * 60;
const OCR_IMAGE_MAX_BYTES = 1_000_000;
const OCR_TOTAL_TIMEOUT_MS = 55_000;
const MAX_OCR_KEYS = 50;
const SUMY_OCR_CACHE_VERSION = "v2";
const EXPECTED_QUEUES = Array.from({ length: 12 }, (_, index) => `${Math.floor(index / 2) + 1}.${index % 2 + 1}`);
const YASNO_SOURCE_BY_ID = {
  "source-dnipro-dtem": { title: "ДТЕК Дніпровські електромережі (ДнЕМ)", url: "https://static.yasno.ua/dnipro/outages" },
  "source-dnipro-cek": { title: "ЦЕК · Дніпропетровська область", url: "https://static.yasno.ua/dnipro/outages" },
};
const CHERKASY_API = "https://www.cherkasyoblenergo.com/api/v1/posts";
const SUMY_CHANNEL = "SumyEnergo";
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
  if (typeof input !== "string") throw new Error("Вкажіть публічний канал Telegram або офіційне джерело зі списку.");
  const value = input.trim();
  let parsed;
  try { parsed = new URL(value); } catch {}
  if (parsed && parsed.protocol === "https:") {
    if (parsed.origin === "https://app.yasno.ua" && /^\/api\/blackout-service\/public\/shutdowns\/regions\/3\/dsos\/(?:301|303)\/planned-outages$/.test(parsed.pathname)) {
      const username = parsed.pathname.includes("/301/") ? "source-dnipro-dtem" : "source-dnipro-cek";
      return { username, url: parsed.toString(), sourceId: username };
    }
    if (parsed.origin === "https://www.cherkasyoblenergo.com" && parsed.pathname === "/api/v1/posts/main") {
      return { username: "source-cherkasy", url: "https://www.cherkasyoblenergo.com/api/v1/posts/main?lang=uk&limit=10", sourceId: "source-cherkasy" };
    }
  }
  const match = value.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{5,32})\/?(?:\?.*)?$/i)
    || value.match(/^@?([A-Za-z0-9_]{5,32})$/);
  if (!match) throw new Error("Введіть посилання на публічний канал виду https://t.me/s/назва_каналу або оберіть офіційне джерело зі списку.");
  const username = match[1];
  return { username, url: `${TELEGRAM_HOST}/s/${username}`, ...(username.toLowerCase() === SUMY_CHANNEL.toLowerCase() ? { sourceId: "source-sumy" } : {}) };
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
    const postId = block.match(/data-post=["']([A-Za-z0-9_]+\/(\d+))["']/i)?.[2] ?? null;
    const photoUrl = block.match(/class=["'][^"']*tgme_widget_message_photo_wrap[^"']*["'][^>]*style=["'][^"']*background-image:\s*url\(["']?(https:\/\/[^"')]+)["']?\)/i)?.[1]
      ?? block.match(/class=["'][^"']*tgme_widget_message_photo_wrap[^"']*["'][^>]*href=["']https:\/\/t\.me\/[^"']+["'][^>]*style=["'][^"']*background-image:\s*url\(["']?(https:\/\/[^"')]+)["']?\)/i)?.[1]
      ?? null;
    return { text: stripTags(body), postedAt: time && !Number.isNaN(Date.parse(time)) ? new Date(time).toISOString() : null, postId, photoUrl };
  }).filter((message) => message?.text);
}

export function parseIntervals(value) {
  const periods = [];
  const expression = /(?<!\d)(\d{1,2}(?::[0-5]\d)?)\s*[-–—−]\s*(\d{1,2}(?::[0-5]\d)?)(?!\d)/g;
  for (const match of value.matchAll(expression)) {
    const start = toMinutes(match[1]);
    let end = toMinutes(match[2]);
    // In outage tables, 00:00 at the end of a late-night interval means midnight (24:00).
    if (start > 0 && end === 0) end = 1440;
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

async function writeCache(env, key, value, expirationTtl = 86400) {
  if (!env.KV_BINDING) return;
  try { await env.KV_BINDING.put(key, JSON.stringify(value), { expirationTtl }); } catch { /* The live API still works if KV is temporarily unavailable. */ }
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

function normalizedSchedule({ sourceId, title, sourceUrl, schedules, fetchedAt = new Date().toISOString() }) {
  const today = dateInKyiv(new Date(fetchedAt));
  const tomorrow = datePlusOne(today);
  return { channel: sourceId, sourceUrl, title, fetchedAt, today, tomorrow, schedules };
}

function validQueueName(queue) {
  return EXPECTED_QUEUES.includes(queue);
}

function normalizeYasno(payload, sourceId, now = new Date()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("YASNO повернув некоректні дані.");
  const queueNames = Object.keys(payload).filter(validQueueName);
  if (queueNames.length !== EXPECTED_QUEUES.length || EXPECTED_QUEUES.some((queue) => !payload[queue])) {
    throw new Error("У графіку YASNO відсутні черги. Дані не показано.");
  }
  const schedules = {};
  const expectedDates = { today: dateInKyiv(now), tomorrow: datePlusOne(dateInKyiv(now)) };
  for (const dayKey of ["today", "tomorrow"]) {
    const perQueue = {};
    let scheduleDate = null;
    let complete = true;
    for (const queue of EXPECTED_QUEUES) {
      const day = payload[queue]?.[dayKey];
      if (!day || day.status !== "ScheduleApplies") { complete = false; break; }
      const date = typeof day.date === "string" ? day.date.slice(0, 10) : "";
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !isValidDate(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))) || date !== expectedDates[dayKey] || (scheduleDate && scheduleDate !== date)) { complete = false; break; }
      scheduleDate = date;
      if (!Array.isArray(day.slots) || !day.slots.length) { complete = false; break; }
      const slots = [...day.slots].sort((a, b) => a.start - b.start);
      let cursor = 0;
      const outages = [];
      for (const slot of slots) {
        if (!Number.isInteger(slot.start) || !Number.isInteger(slot.end) || slot.start !== cursor || slot.end <= slot.start || slot.end > 1440 || !["NotPlanned", "Definite"].includes(slot.type)) {
          complete = false; break;
        }
        if (slot.type === "Definite") outages.push({ start: slot.start, end: slot.end });
        cursor = slot.end;
      }
      if (!complete || cursor !== 1440) { complete = false; break; }
      perQueue[queue] = outages;
    }
    if (complete && scheduleDate) schedules[scheduleDate] = { date: scheduleDate, queues: perQueue, postedAt: payload["1.1"]?.updatedOn || null };
  }
  const today = dateInKyiv(now);
  const tomorrow = datePlusOne(today);
  const source = YASNO_SOURCE_BY_ID[sourceId];
  return { channel: sourceId, sourceUrl: source.url, title: source.title, fetchedAt: now.toISOString(), today, tomorrow, schedules };
}

const UKRAINIAN_MONTHS = new Map([
  ["січня", 1], ["лютого", 2], ["березня", 3], ["квітня", 4], ["травня", 5], ["червня", 6],
  ["липня", 7], ["серпня", 8], ["вересня", 9], ["жовтня", 10], ["листопада", 11], ["грудня", 12],
]);

function dateFromCherkasyTitle(title, referenceDate) {
  const match = String(title).match(/на\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)/iu);
  if (!match) return null;
  const day = Number(match[1]);
  const month = UKRAINIAN_MONTHS.get(match[2].toLowerCase());
  const monthCandidates = [Number(referenceDate.slice(0, 4)), Number(referenceDate.slice(0, 4)) - 1, Number(referenceDate.slice(0, 4)) + 1];
  for (const year of monthCandidates) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isValidDate(year, month, day) && (date === referenceDate || date === datePlusOne(referenceDate))) return date;
  }
  return null;
}

function parseCherkasyContent(content) {
  if (typeof content !== "string" || content.length > 100_000) return null;
  const text = decodeEntities(content.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p\s*>/gi, "\n").replace(/<[^>]*>/g, ""));
  const queues = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([1-6]\.[12])\s*(.*)$/);
    if (!match) continue;
    const queue = match[1];
    const intervals = parseIntervals(match[2]);
    if (!intervals.length || queues[queue]) return null;
    queues[queue] = intervals;
  }
  if (Object.keys(queues).length !== EXPECTED_QUEUES.length || EXPECTED_QUEUES.some((queue) => !queues[queue])) return null;
  return queues;
}

async function fetchJson(url, { timeout = 12_000, maxBytes = 1_000_000 } = {}) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ShoPoSvitlu/1.0 (+https://github.com/kdinya/sho-po-svitlu)" }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Офіційне джерело тимчасово недоступне (HTTP ${response.status}).`);
  const text = await response.text();
  if (text.length > maxBytes) throw new Error("Відповідь джерела завелика. Дані не показано.");
  try { return JSON.parse(text); } catch { throw new Error("Офіційне джерело повернуло некоректний JSON."); }
}

async function fetchYasno(sourceId, env, { force = false } = {}) {
  const source = YASNO_SOURCE_BY_ID[sourceId];
  const cacheKey = `official:${sourceId}`;
  const cached = await readCache(env, cacheKey);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_SECONDS * 1000) return cached;
  try {
    const dsoId = sourceId.endsWith("dtem") ? "301" : "303";
    const payload = await fetchJson(`https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/${dsoId}/planned-outages`);
    const result = normalizeYasno(payload, sourceId);
    if (!Object.keys(result.schedules).length) throw new Error("YASNO ще не опублікував перевірений графік на сьогодні або завтра.");
    await writeCache(env, cacheKey, result);
    return result;
  } catch (error) {
    return cached ? { ...cached, stale: true, warning: error.message } : { error: "official_source_unavailable", message: error.message || "Не вдалося отримати графік з YASNO." };
  }
}

async function fetchCherkasy(env, { force = false } = {}) {
  const sourceId = "source-cherkasy";
  const cacheKey = `official:${sourceId}`;
  const cached = await readCache(env, cacheKey);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_SECONDS * 1000) return cached;
  try {
    const listing = await fetchJson(`${CHERKASY_API}/main?lang=uk&limit=10`);
    if (listing?.success !== true || !Array.isArray(listing.data)) throw new Error("Список дописів Черкасиобленерго має неочікуваний формат.");
    const today = dateInKyiv();
    const candidates = listing.data.filter((post) => /(?:оновлено\s+)?графік погодинних відключень\s*\(гпв\)/iu.test(post?.title || ""))
      .map((post) => ({ post, date: dateFromCherkasyTitle(post.title, today) }))
      .filter((item) => item.date)
      .sort((a, b) => Date.parse(b.post.publishedAt || b.post.createdAt || 0) - Date.parse(a.post.publishedAt || a.post.createdAt || 0));
    const schedules = {};
    for (const date of [today, datePlusOne(today)]) {
      const candidate = candidates.find((item) => item.date === date);
      if (!candidate) continue;
      const slug = String(candidate.post.slug || "");
      if (!/^[a-z0-9-]{1,180}$/i.test(slug)) continue;
      const detail = await fetchJson(`${CHERKASY_API}/${encodeURIComponent(slug)}?lang=uk`);
      const queues = detail?.success === true ? parseCherkasyContent(detail.data?.content) : null;
      if (!queues) throw new Error(`Не вдалося безпечно перевірити всі 12 черг Черкасиобленерго на ${date}.`);
      schedules[date] = { date, queues, postedAt: candidate.post.publishedAt || candidate.post.createdAt || null };
    }
    if (!Object.keys(schedules).length) throw new Error("Черкасиобленерго ще не опублікувало графік на сьогодні або завтра.");
    const latest = candidates[0]?.post;
    const result = { channel: sourceId, sourceUrl: "https://www.cherkasyoblenergo.com/media?category=news&lang=uk", title: "Черкасиобленерго · офіційний графік", fetchedAt: new Date().toISOString(), today, tomorrow: datePlusOne(today), schedules };
    await writeCache(env, cacheKey, result);
    return result;
  } catch (error) {
    return cached ? { ...cached, stale: true, warning: error.message } : { error: "official_source_unavailable", message: error.message || "Не вдалося прочитати Черкасиобленерго." };
  }
}

function extractSumyPhotoUrl(block) {
  const photoTag = block.match(/<a\b[^>]*class=["'][^"']*tgme_widget_message_photo_wrap[^"']*["'][^>]*>/i)?.[0];
  const imageUrl = photoTag?.match(/background-image:\s*url\(["']?(https:\/\/[^"')]+)["']?\)/i)?.[1];
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    return ["cdn4.telesco.pe", "cdn5.telesco.pe"].includes(url.hostname) && url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function readSumySchedulePosts(html, referenceDate) {
  const starts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*tgme_widget_message_wrap[^"']*["'][^>]*>/gi)].map((match) => match.index);
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length)).map((block) => {
    const postId = block.match(/data-post=["']SumyEnergo\/(\d+)["']/i)?.[1];
    const body = block.match(/<div\b[^>]*class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const text = stripTags(body);
    if (!postId || !/графік(?:и)?\s+погодинних\s+відключень/iu.test(text)) return null;
    const numericDate = text.match(/(?:завтра[,\s]*)?(\d{1,2})[-.\/](\d{1,2})[-.\/](20\d{2})/i);
    const namedDate = text.match(/(?:на|завтра[,\s]*)\s*(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)/iu);
    const monthByName = namedDate ? UKRAINIAN_MONTHS.get(namedDate[2].toLowerCase()) : null;
    if (!numericDate && !namedDate) return null;
    const year = numericDate ? Number(numericDate[3]) : Number(referenceDate.slice(0, 4));
    const month = numericDate ? Number(numericDate[2]) : monthByName;
    const day = numericDate ? Number(numericDate[1]) : Number(namedDate[1]);
    if (!isValidDate(year, month, day)) return null;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (date !== referenceDate && date !== datePlusOne(referenceDate)) return null;
    const posted = block.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1];
    return { postId, date, postedAt: posted && !Number.isNaN(Date.parse(posted)) ? new Date(posted).toISOString() : null, photoUrl: extractSumyPhotoUrl(block) };
  }).filter(Boolean).sort((a, b) => (Date.parse(b.postedAt || 0) - Date.parse(a.postedAt || 0)));
}

export function getOcrSpaceKeys(env = {}) {
  const firstKey = env.OCR_SPACE_API_KEY_1 || env.OCR_SPACE_API_KEY;
  const numberedKeys = Array.from({ length: MAX_OCR_KEYS - 1 }, (_, index) => env[`OCR_SPACE_API_KEY_${index + 2}`]);
  return [firstKey, ...numberedKeys]
    .filter((key) => typeof key === "string" && key.trim())
    .map((key) => key.trim())
    .filter((key, index, all) => all.indexOf(key) === index);
}

async function callOcrSpace(imageBytes, mimeType, keys, keyIndex, validate) {
  const uniqueKeys = Array.isArray(keys)
    ? keys.filter((key) => typeof key === "string" && key.trim()).map((key) => key.trim()).filter((key, index, all) => all.indexOf(key) === index)
    : [];
  if (uniqueKeys.length < 1) throw new Error("Не налаштовано жодного ключа OCR.space.");
  if (uniqueKeys.length > MAX_OCR_KEYS) throw new Error(`Підтримується не більше ${MAX_OCR_KEYS} ключів OCR.space.`);
  const startIndex = Number.isInteger(keyIndex) ? ((keyIndex % uniqueKeys.length) + uniqueKeys.length) % uniqueKeys.length : 0;
  const ordered = [...uniqueKeys.slice(startIndex), ...uniqueKeys.slice(0, startIndex)];
  let lastError = "OCR сервіс тимчасово недоступний.";
  const deadline = Date.now() + OCR_TOTAL_TIMEOUT_MS;
  for (const apiKey of ordered) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      lastError = "вичерпано час очікування для послідовних ключів OCR.space";
      break;
    }
    const form = new FormData();
    form.append("file", new Blob([imageBytes], { type: mimeType }), "official-sumy-schedule.jpg");
    form.append("OCREngine", "3");
    form.append("isTable", "true");
    form.append("language", "ukr");
    form.append("detectOrientation", "true");
    form.append("scale", "true");
    let response;
    try {
      response = await fetch("https://api.ocr.space/parse/image", {
        method: "POST", headers: { apikey: apiKey }, body: form, signal: AbortSignal.timeout(Math.min(25_000, remainingMs)),
      });
    } catch {
      lastError = "Не вдалося з’єднатися з OCR.space.";
      continue;
    }
    let data;
    try { data = await response.json(); } catch { lastError = "OCR.space повернув некоректну відповідь."; continue; }
    if (!response.ok || data?.IsErroredOnProcessing || !Array.isArray(data?.ParsedResults) || !data.ParsedResults[0]?.ParsedText) {
      lastError = String(data?.ErrorMessage?.[0] || data?.ErrorMessage || data?.ErrorDetails || `OCR.space HTTP ${response.status}`);
      continue;
    }
    const text = data.ParsedResults[0].ParsedText;
    const value = validate ? validate(text) : text;
    if (value === null || value === undefined || value === false) {
      lastError = "розпізнаний текст не пройшов перевірку всіх черг та часових блоків";
      continue;
    }
    return { text, value };
  }
  throw new Error(`Жоден налаштований ключ OCR.space не повернув результат, що пройшов перевірку. Остання причина: ${lastError}`);
}

async function readLimitedResponseBytes(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("Зображення завелике для безкоштовного OCR.space. Графік не розпізнано.");
    return bytes;
  }
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Зображення завелике для безкоштовного OCR.space. Графік не розпізнано.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function parseSumyOcr(text) {
  if (typeof text !== "string" || text.length > 50_000) return null;
  const normalized = text.replace(/\|/g, " ").replace(/\*{1,2}/g, "").replace(/[–—−]/g, "-");
  const queues = {};
  for (const line of normalized.split(/\r?\n/)) {
    const match = line.match(/(?:^|[^0-9])([1-6]\.[12])\s*(?:[|:：-]\s*)?(.+)$/);
    if (!match) continue;
    const intervals = parseIntervals(match[2]);
    if (!intervals.length || intervals.length > 12 || queues[match[1]]) return null;
    for (let index = 1; index < intervals.length; index += 1) {
      if (intervals[index].start < intervals[index - 1].end) return null;
    }
    queues[match[1]] = intervals;
  }
  if (Object.keys(queues).length !== EXPECTED_QUEUES.length || EXPECTED_QUEUES.some((queue) => !queues[queue])) return null;
  return queues;
}

async function claimOcr(env, digest, keyCount) {
  if (!env.COMPLETED_SETUP_COUNTER) return { claimed: false, configurationError: true };
  try {
    return await callCompletedSetupCounter(env, "/ocr/claim", { method: "POST", body: { digest, keyCount } });
  } catch { return { claimed: false }; }
}

async function releaseOcr(env, digest) {
  if (!env.COMPLETED_SETUP_COUNTER) return;
  try { await callCompletedSetupCounter(env, "/ocr/release", { method: "POST", body: { digest } }); } catch {}
}

async function fetchSumy(env, { force = false } = {}) {
  const sourceId = "source-sumy";
  const cacheKey = `official:${sourceId}`;
  const cached = await readCache(env, cacheKey);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_SECONDS * 1000) return cached;
  try {
    const response = await fetch(`${TELEGRAM_HOST}/s/${SUMY_CHANNEL}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ShoPoSvitlu/1.0; +https://github.com/kdinya/sho-po-svitlu)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Офіційний канал Сумиобленерго тимчасово недоступний (HTTP ${response.status}).`);
    const html = await response.text();
    if (html.length > 2_000_000 || !html.includes("tgme_widget_message_wrap")) throw new Error("Не вдалося прочитати офіційний канал Сумиобленерго.");
    const now = new Date();
    const today = dateInKyiv(now); const tomorrow = datePlusOne(today);
    const posts = readSumySchedulePosts(html, today);
    const latestByDate = {};
    for (const post of posts) if (!latestByDate[post.date]) latestByDate[post.date] = post;
    const schedules = {};
    for (const date of [today, tomorrow]) {
      const post = latestByDate[date];
      if (!post?.photoUrl) continue;
      const postCacheKey = `sumy:${SUMY_OCR_CACHE_VERSION}:post:${post.postId}`;
      const postCached = await readCache(env, postCacheKey);
      if (postCached?.photoUrl === post.photoUrl && postCached.schedule) {
        schedules[date] = postCached.schedule;
        continue;
      }
      if (!getOcrSpaceKeys(env).length) {
        throw new Error("OCR не налаштований як Secret у Cloudflare. Перевірте OCR_SPACE_API_KEY_1 або OCR_SPACE_API_KEY.");
      }
      const imageResponse = await fetch(post.photoUrl, { headers: { "User-Agent": "ShoPoSvitlu/1.0 (+https://github.com/kdinya/sho-po-svitlu)" }, signal: AbortSignal.timeout(15_000) });
      if (!imageResponse.ok) throw new Error("Зображення з офіційного каналу тимчасово недоступне.");
      const mimeType = imageResponse.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      if (!/^image\/(?:jpeg|png|webp)$/i.test(mimeType)) throw new Error("Формат зображення графіка не підтримується.");
      const declaredSize = Number(imageResponse.headers.get("content-length") || 0);
      if (declaredSize > OCR_IMAGE_MAX_BYTES) throw new Error("Зображення завелике для безкоштовного OCR.space. Графік не розпізнано.");
      const bytes = await readLimitedResponseBytes(imageResponse, OCR_IMAGE_MAX_BYTES);
      const digestBytes = await crypto.subtle.digest("SHA-256", bytes);
      const digest = [...new Uint8Array(digestBytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const imageCacheKey = `sumy:${SUMY_OCR_CACHE_VERSION}:image:${digest}`;
      const imageCached = await readCache(env, imageCacheKey);
      if (imageCached?.schedule) {
        const schedule = { ...imageCached.schedule, date, postedAt: post.postedAt, postId: post.postId };
        schedules[date] = schedule;
        await writeCache(env, postCacheKey, { photoUrl: post.photoUrl, schedule });
        continue;
      }
      const failedCacheKey = `sumy:${SUMY_OCR_CACHE_VERSION}:failed:${digest}`;
      if (await readCache(env, failedCacheKey)) throw new Error("Це зображення вже не пройшло перевірку OCR. Щоб уникнути зайвих розпізнавань, спробуйте пізніше або відкрийте офіційне джерело.");
      const keys = getOcrSpaceKeys(env);
      if (!keys.length) throw new Error("OCR не налаштований як Secret у Cloudflare. Перевірте OCR_SPACE_API_KEY_1 або OCR_SPACE_API_KEY.");
      const lock = await claimOcr(env, digest, keys.length);
      if (!lock?.claimed) {
        if (lock?.configurationError) throw new Error("Захист від повторного OCR не налаштований. Щоб не витрачати квоту двічі, розпізнавання не запускали.");
        let shared = null;
        for (let attempt = 0; attempt < 30; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          shared = await readCache(env, imageCacheKey);
          if (shared?.schedule) break;
        }
        if (!shared?.schedule) throw new Error("Графік уже розпізнається. Зачекайте кілька секунд і оновіть ще раз.");
        schedules[date] = shared.schedule;
        continue;
      }
      try {
        let queues;
        try {
          const ocrResult = await callOcrSpace(bytes, mimeType, keys, lock.keyIndex || 0, parseSumyOcr);
          queues = ocrResult.value;
        } catch (error) {
          await writeCache(env, failedCacheKey, { failedAt: new Date().toISOString() }, OCR_FAILURE_CACHE_SECONDS);
          throw error;
        }
        const schedule = { date, queues, postedAt: post.postedAt, postId: post.postId };
        schedules[date] = schedule;
        await writeCache(env, imageCacheKey, { schedule });
        await writeCache(env, postCacheKey, { photoUrl: post.photoUrl, schedule });
      } finally { await releaseOcr(env, digest); }
    }
    if (!Object.keys(schedules).length) throw new Error("Не знайдено підтверджений графік Сумиобленерго на сьогодні або завтра. Відкрийте офіційний канал.");
    const latest = latestByDate[today] || latestByDate[tomorrow];
    const result = { channel: sourceId, sourceUrl: latest ? `https://t.me/${SUMY_CHANNEL}/${latest.postId}` : `https://t.me/${SUMY_CHANNEL}`, title: "Сумиобленерго · офіційний графік", fetchedAt: now.toISOString(), today, tomorrow, schedules };
    await writeCache(env, cacheKey, result);
    return result;
  } catch (error) {
    if (cached) {
      const today = dateInKyiv();
      const tomorrow = datePlusOne(today);
      const schedules = Object.fromEntries(Object.entries(cached.schedules || {}).filter(([date]) => date === today || date === tomorrow));
      if (Object.keys(schedules).length) return { ...cached, today, tomorrow, schedules, stale: true, warning: error.message };
    }
    return { error: "official_source_unavailable", message: error.message || "Не вдалося прочитати офіційний графік Сумиобленерго." };
  }
}

async function fetchOfficialSource(sourceId, env, { force = false } = {}) {
  if (YASNO_SOURCE_BY_ID[sourceId]) return fetchYasno(sourceId, env, { force });
  if (sourceId === "source-cherkasy") return fetchCherkasy(env, { force });
  if (sourceId === "source-sumy") return fetchSumy(env, { force });
  return { error: "official_source_unavailable", message: "Офіційне джерело не налаштоване." };
}

export { normalizeYasno, parseCherkasyContent, parseSumyOcr, readSumySchedulePosts, readLimitedResponseBytes, callOcrSpace };

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
    if (url.pathname === "/ocr/claim" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
      const digest = body?.digest;
      const keyCount = body?.keyCount;
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest) || !Number.isInteger(keyCount) || keyCount < 1 || keyCount > MAX_OCR_KEYS) {
        return Response.json({ error: "invalid_request" }, { status: 400 });
      }
      const result = await this.ctx.storage.transaction(async (transaction) => {
        const lockKey = `ocr:lock:${digest}`;
        const until = Number(await transaction.get(lockKey) ?? 0);
        const now = Date.now();
        if (until > now) return { claimed: false };
        await transaction.put(lockKey, now + 90_000);
        const nextKey = Math.max(0, Number(await transaction.get("ocr:next-key") ?? 0));
        const keyIndex = nextKey % keyCount;
        await transaction.put("ocr:next-key", (keyIndex + 1) % keyCount);
        return { claimed: true, keyIndex };
      });
      return Response.json(result);
    }
    if (url.pathname === "/ocr/release" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
      const digest = body?.digest;
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) return Response.json({ error: "invalid_request" }, { status: 400 });
      await this.ctx.storage.delete(`ocr:lock:${digest}`);
      return Response.json({ released: true });
    }
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
  const force = url.searchParams.get("refresh") === "1";
  const result = channel.sourceId ? await fetchOfficialSource(channel.sourceId, env, { force }) : await fetchChannel(channel.username, env, { force });
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
