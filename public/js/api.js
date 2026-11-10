export const DEFAULT_CHANNEL = "https://t.me/s/SvitloMalovyskivskohoRaionu";
export const DEFAULT_WORKER_URL = normalizeWorkerUrl(globalThis.SHO_PO_SVITLU_CONFIG?.workerUrl ?? "");

export function normalizeWorkerUrl(input) {
  const value = String(input ?? "").trim();
  if (!value) return "";
  let url;
  try { url = new URL(value); } catch { throw new Error("Введіть повну адресу Worker, наприклад https://назва.workers.dev."); }
  if (url.protocol !== "https:") throw new Error("Адреса Worker має починатися з https://.");
  if (url.username || url.password) throw new Error("Посилання Worker не повинно містити логін або пароль.");
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api(?:\/schedule)?$/i, "");
  return url.toString().replace(/\/$/, "");
}

const OFFICIAL_SCHEDULE_SOURCES = [
  { username: "source-dnipro-dtem", url: "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages" },
  { username: "source-dnipro-cek", url: "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/303/planned-outages" },
  { username: "source-cherkasy", url: "https://www.cherkasyoblenergo.com/api/v1/posts/main?lang=uk&limit=10" },
];

export function normalizeChannelInput(input) {
  const value = String(input ?? "").trim();
  if (!value) throw new Error("Вкажіть посилання або @назву Telegram-каналу.");
  let parsed;
  try { parsed = new URL(value); } catch {}
  if (parsed && parsed.protocol === "https:") {
    const source = OFFICIAL_SCHEDULE_SOURCES.find((item) => {
      const expected = new URL(item.url);
      return parsed.origin === expected.origin && parsed.pathname === expected.pathname;
    });
    if (source) return { username: source.username, url: source.url };
  }
  const match = value.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{5,32})\/?(?:\?.*)?$/i)
    || value.match(/^@?([A-Za-z0-9_]{5,32})$/);
  if (!match) throw new Error("Введіть публічне посилання виду https://t.me/s/назва_каналу або оберіть офіційне джерело зі списку.");
  return { username: match[1], url: `https://t.me/s/${match[1]}` };
}

export async function fetchSchedule({ workerUrl, channel, refresh = false, signal } = {}) {
  const base = normalizeWorkerUrl(workerUrl);
  if (!base) throw new Error("Власнику сайту потрібно один раз задати адресу Cloudflare Worker у public/config.js.");
  const normalized = normalizeChannelInput(channel);
  const endpoint = new URL(`${base}/api/schedule`);
  endpoint.searchParams.set("channel", normalized.url);
  if (refresh) endpoint.searchParams.set("refresh", "1");
  const controller = new AbortController();
  const timeoutMs = normalized.username === "SumyEnergo" ? 90_000 : 12_000;
  const timeout = setTimeout(() => controller.abort(new DOMException("Час очікування минув.", "TimeoutError")), timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(endpoint, { method: "GET", mode: "cors", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    let data;
    try { data = await response.json(); } catch { throw new Error("Worker повернув некоректну відповідь. Перевірте адресу API."); }
    if (!response.ok) throw new Error(data.message || `Не вдалося отримати графік (HTTP ${response.status}).`);
    if (!data || typeof data !== "object" || !data.schedules) throw new Error("Worker відповів, але формат графіка не розпізнано.");
    return data;
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") throw new Error("Worker довго не відповідає. Перевірте інтернет і спробуйте ще раз.");
    if (error instanceof TypeError) throw new Error("Не вдалося з'єднатися з Worker. Перевірте Worker URL та CORS.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}


export const UKRAINE_REGIONS = [
  "Кіровоградська область",
  "Вінницька область",
  "Волинська область",
  "Дніпропетровська область",
  "Донецька область",
  "Житомирська область",
  "Закарпатська область",
  "Запорізька область",
  "Івано-Франківська область",
  "Київська область",
  "м. Київ",
  "Луганська область",
  "Львівська область",
  "Миколаївська область",
  "Одеська область",
  "Полтавська область",
  "Рівненська область",
  "Сумська область",
  "Тернопільська область",
  "Харківська область",
  "Херсонська область",
  "Хмельницька область",
  "Черкаська область",
  "Чернівецька область",
  "Чернігівська область",
];

export async function sendChannelRequest({ workerUrl, region, channelUrl, senderName, requestType = "new", note = "", signal } = {}) {
  const base = normalizeWorkerUrl(workerUrl);
  if (!base) throw new Error("Адреса Cloudflare Worker не налаштована.");
  const endpoint = `${base}/api/request-channel`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Час очікування минув.", "TimeoutError")), 10000);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ region, channelUrl, senderName, requestType, note }),
      signal: controller.signal,
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Worker повернув некоректну відповідь.");
    }
    if (!response.ok) {
      throw new Error(data.message || `Помилка сервера (HTTP ${response.status}).`);
    }
    if (data?.sentToTelegram !== true) {
      throw new Error(data?.message || "Сервер не підтвердив доставку запиту в Telegram.");
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      throw new Error("Worker довго не відповідає. Спробуйте ще раз.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function requestUsersData(endpoint, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(endpoint, { mode: "cors", cache: "no-store", ...options, signal: controller.signal });
    let data;
    try { data = await response.json(); } catch { throw new Error("Worker повернув некоректну відповідь."); }
    if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestUsersCount(endpoint, options = {}) {
  const data = await requestUsersData(endpoint, options);
  return Number.isFinite(data?.users) && data.users >= 0 ? data.users : null;
}

export function normalizeSetupNickname(input) {
  const nickname = String(input ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!nickname) throw new Error("Введіть свій нік.");
  const length = [...nickname].length;
  if (length < 2 || length > 24 || !/^[\p{L}\p{M}\p{N}_ -]+$/u.test(nickname)) {
    throw new Error("Нік має містити 2–24 символи: літери, цифри, пробіли, _ або -.");
  }
  return nickname;
}

// Реєструє пристрій (анонімний випадковий id) і повертає кількість унікальних користувачів.
export function pingUsers({ workerUrl, clientId } = {}) {
  const base = normalizeWorkerUrl(workerUrl);
  if (!base) return Promise.resolve(null);
  return requestUsersCount(`${base}/api/ping`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id: clientId }),
  });
}

// Лише читає поточну кількість користувачів, нікого не реєструючи.
export function fetchUsersCount({ workerUrl } = {}) {
  const base = normalizeWorkerUrl(workerUrl);
  if (!base) return Promise.resolve(null);
  return requestUsersCount(`${base}/api/stats`, { method: "GET", headers: { Accept: "application/json" } });
}

// Реєструє завершення налаштувань за анонімним ID; нік використовується лише для перевірки службового імені.
export async function registerCompletedSetup({ workerUrl, clientId, nickname } = {}) {
  const base = normalizeWorkerUrl(workerUrl);
  if (!base) return null;
  const normalizedNickname = normalizeSetupNickname(nickname);
  const data = await requestUsersData(`${base}/api/complete-setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id: clientId, nickname: normalizedNickname }),
  });
  return Number.isFinite(data?.users) && data.users >= 0
    ? { users: data.users, isNew: data.isNew === true, excluded: data.excluded === true }
    : null;
}

// Читає окремий лічильник браузерів, що завершили налаштування.
export function fetchCompletedSetupsCount({ workerUrl } = {}) {
  const base = normalizeWorkerUrl(workerUrl);
  if (!base) return Promise.resolve(null);
  return requestUsersCount(`${base}/api/completed-settings`, { method: "GET", headers: { Accept: "application/json" } });
}
