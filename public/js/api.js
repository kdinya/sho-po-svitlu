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

export function normalizeChannelInput(input) {
  const value = String(input ?? "").trim();
  if (!value) throw new Error("Вкажіть посилання або @назву Telegram-каналу.");
  const match = value.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{5,32})\/?(?:\?.*)?$/i)
    || value.match(/^@?([A-Za-z0-9_]{5,32})$/);
  if (!match) throw new Error("Введіть публічне посилання виду https://t.me/s/назва_каналу.");
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
  const timeout = setTimeout(() => controller.abort(new DOMException("Час очікування минув.", "TimeoutError")), 12000);
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
