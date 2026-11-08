import { DEFAULT_CHANNEL, DEFAULT_WORKER_URL, fetchSchedule, normalizeChannelInput } from "./api.js";
import { formatCountdown, formatDate, getLocalClock, getScheduleState, renderOutages, renderTimeline } from "./timeline.js";

const STORAGE_KEY = "sho-po-svitlu.settings.v1";
const DATA_KEY = "sho-po-svitlu.last-data.v1";
const QUEUES = Array.from({ length: 6 }, (_, index) => [`${index + 1}.1`, `${index + 1}.2`]).flat();
const DEFAULTS = { channel: DEFAULT_CHANNEL, workerUrl: DEFAULT_WORKER_URL, queue: "6.2", intervalMinutes: 5 };
const $ = (id) => document.getElementById(id);
const els = {
  queueSelect: $("queueSelect"), todayTab: $("todayTab"), tomorrowTab: $("tomorrowTab"), scheduleDate: $("scheduleDate"), heroDate: $("heroDate"),
  statusCard: $("statusCard"), statusKicker: $("statusKicker"), statusTitle: $("statusTitle"), statusDetail: $("statusDetail"), statusMeta: $("statusMeta"),
  nextTitle: $("nextTitle"), nextDetail: $("nextDetail"), countdown: $("countdown"), timelineTrack: $("timelineTrack"), nowMarker: $("nowMarker"), currentTime: $("currentTime"),
  timelineNote: $("timelineNote"), outageList: $("outageList"), outageCount: $("outageCount"), sourceLink: $("sourceLink"), sourceName: $("sourceName"), sourceHandle: $("sourceHandle"),
  updatedAt: $("updatedAt"), footerUpdate: $("footerUpdate"), networkIndicator: $("networkIndicator"), updateIcon: $("updateIcon"), refreshButton: $("refreshButton"),
  sourceStatus: $("sourceStatus"), errorBanner: $("errorBanner"), errorTitle: $("errorTitle"), errorText: $("errorText"),
  settingsButton: $("settingsButton"), settingsDialog: $("settingsDialog"), settingsForm: $("settingsForm"), channelInput: $("channelInput"),
  cancelSettings: $("cancelSettings"), closeSettings: $("closeSettings"), errorRetry: $("errorRetry"), toast: $("toast"),
};

function readStoredSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const result = { ...DEFAULTS, ...stored };
    if (DEFAULT_WORKER_URL) result.workerUrl = DEFAULT_WORKER_URL;
    if (!QUEUES.includes(result.queue)) result.queue = DEFAULTS.queue;
    if (![5, 15, 30].includes(Number(result.intervalMinutes))) result.intervalMinutes = DEFAULTS.intervalMinutes;
    return result;
  } catch { return { ...DEFAULTS }; }
}

function readStoredData() {
  try {
    const data = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    return data?.schedules ? data : null;
  } catch { return null; }
}

let settings = readStoredSettings();
let data = readStoredData();
let activeDay = "today";
let timer = null;
let clockTimer = null;
let toastTimer = null;
let currentController = null;

function saveSettings() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { showToast("Не вдалося зберегти налаштування в цьому браузері."); } }
function saveData(value) { try { localStorage.setItem(DATA_KEY, JSON.stringify(value)); } catch { /* The app remains usable for this visit. */ } }

function initQueueOptions() {
  els.queueSelect.replaceChildren(...QUEUES.map((queue) => {
    const option = document.createElement("option"); option.value = queue; option.textContent = queue; return option;
  }));
  els.queueSelect.value = settings.queue;
}

function scheduleDateForView() { return data?.[activeDay] ?? data?.schedules?.[activeDay === "today" ? data?.today : data?.tomorrow] ?? null; }
function todayFromData() { return data?.today ?? null; }
function tomorrowFromData() { return data?.tomorrow ?? null; }

function formatTimestamp(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "Ще не оновлювали";
  return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)).replace(",", " ·");
}

function setNetwork(state, text) {
  els.networkIndicator.classList.remove("is-online", "is-loading", "is-offline");
  if (state === "online") els.networkIndicator.classList.add("is-online");
  if (state === "loading") els.networkIndicator.classList.add("is-loading");
  if (state === "offline") els.networkIndicator.classList.add("is-offline");
  const label = els.networkIndicator.querySelector("span");
  if (label) label.textContent = text;
  els.sourceStatus.classList.toggle("is-online", state === "online");
  els.sourceStatus.classList.toggle("is-offline", state === "offline");
  els.sourceStatus.innerHTML = `<i></i> ${state === "online" ? "актуальне" : state === "loading" ? "оновлюємо" : state === "offline" ? "немає зв'язку" : "очікуємо"}`;
}

function showError(message, { title = "Немає зв'язку з каналом", stale = false } = {}) {
  els.errorBanner.hidden = false;
  els.errorTitle.textContent = stale ? "Показуємо збережений графік" : title;
  els.errorText.textContent = message;
  setNetwork(stale ? "offline" : "offline", stale ? "дані можуть застаріти" : "канал недоступний");
}
function clearError() { els.errorBanner.hidden = true; els.errorText.textContent = ""; }

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 3000);
}

function renderHeaderDate() {
  const date = activeDay === "today" ? todayFromData() : tomorrowFromData();
  els.scheduleDate.textContent = date ? formatDate(date) : activeDay === "today" ? "Графік на сьогодні" : "Графік на завтра";
  els.heroDate.textContent = date ? formatDate(date) : "";
  els.todayTab.classList.toggle("is-active", activeDay === "today");
  els.tomorrowTab.classList.toggle("is-active", activeDay === "tomorrow");
  els.todayTab.setAttribute("aria-selected", String(activeDay === "today"));
  els.tomorrowTab.setAttribute("aria-selected", String(activeDay === "tomorrow"));
}

function updateSource() {
  const normalized = normalizeChannelInput(settings.channel);
  els.sourceLink.href = normalized.url;
  els.sourceName.textContent = data?.title || normalized.username;
  els.sourceHandle.textContent = `t.me/s/${normalized.username}`;
}

function renderView() {
  renderHeaderDate();
  updateSource();
  if (!data) {
    renderTimeline(els.timelineTrack, els.nowMarker, els.currentTime, [], new Date(), { showNow: activeDay === "today" });
    renderOutages(els.outageList, els.outageCount, [], 0, { highlightPast: false });
    els.statusCard.dataset.state = "unknown";
    els.statusKicker.textContent = "ГРАФІК НЕ ЗАВАНТАЖЕНО";
    els.statusTitle.textContent = "Підключаємо світло";
    els.statusDetail.textContent = DEFAULT_WORKER_URL ? "Зараз перевіримо останні дописи каналу." : "Власник сайту ще не підключив спільний Worker API.";
    els.statusMeta.textContent = "Очікуємо джерело даних";
    els.nextTitle.textContent = "Ще немає графіка";
    els.nextDetail.textContent = DEFAULT_WORKER_URL ? "Під'єднайте Telegram-канал" : "API налаштовується власником сайту";
    els.countdown.innerHTML = "—";
    els.updatedAt.textContent = "Ще не оновлювали";
    els.footerUpdate.textContent = "Очікуємо перше оновлення";
    els.timelineNote.lastElementChild.textContent = "Після підключення тут буде графік для вибраної черги.";
    return;
  }

  const date = data[activeDay] ?? data.schedules?.[activeDay === "today" ? data.today : data.tomorrow];
  const selectedDate = activeDay === "today" ? data.today : data.tomorrow;
  const queuePeriods = date?.queues?.[settings.queue] ?? [];
  const hasSchedule = Boolean(date?.queues?.[settings.queue]);
  const now = new Date();
  const { minutes: nowMinutes } = getLocalClock(now);
  const isCurrentDay = activeDay === "today";
  const state = hasSchedule && isCurrentDay ? getScheduleState(queuePeriods, nowMinutes) : null;

  renderTimeline(els.timelineTrack, els.nowMarker, els.currentTime, hasSchedule ? queuePeriods : [], now, { showNow: isCurrentDay });
  renderOutages(els.outageList, els.outageCount, hasSchedule ? queuePeriods : [], isCurrentDay ? nowMinutes : 0, { highlightPast: isCurrentDay });

  if (!hasSchedule) {
    els.statusCard.dataset.state = "unknown";
    els.statusKicker.textContent = isCurrentDay ? "ГРАФІК ЩЕ НЕ ОПУБЛІКОВАНО" : "ГРАФІК НА ЗАВТРА";
    els.statusTitle.textContent = activeDay === "today" ? "Поки без графіка" : "Дані ще не надійшли";
    els.statusDetail.textContent = `У повідомленнях каналу не знайдено чергу ${settings.queue} на ${formatDate(selectedDate || (isCurrentDay ? new Date().toISOString().slice(0, 10) : ""), { long: true })}.`;
    els.statusMeta.textContent = "Перевірте канал або оновіть дані";
    els.nextTitle.textContent = "Зміна невідома";
    els.nextDetail.textContent = "План для цієї черги відсутній";
    els.countdown.innerHTML = "—";
    els.timelineNote.lastElementChild.textContent = "Немає опублікованого графіка для цієї черги та дати.";
  } else if (!isCurrentDay) {
    els.statusCard.dataset.state = "unknown";
    els.statusKicker.textContent = "ПЛАН НА ЗАВТРА";
    els.statusTitle.textContent = `Черга ${settings.queue}`;
    els.statusDetail.textContent = queuePeriods.length ? `Заплановано ${queuePeriods.length} періодів без електроенергії.` : "Планових відключень не опубліковано.";
    els.statusMeta.textContent = `Графік на ${formatDate(selectedDate)}`;
    els.nextTitle.textContent = queuePeriods.length ? `Перше відключення о ${formatClock(queuePeriods[0].start)}` : "Змін немає";
    els.nextDetail.textContent = "Плановий час на завтра";
    els.countdown.innerHTML = "ЗАВТРА";
    els.timelineNote.lastElementChild.textContent = "Показано завтрашній план; поточний маркер часу приховано.";
  } else {
    els.statusCard.dataset.state = state.powered ? "on" : "off";
    els.statusKicker.textContent = "СТАН ЗА ОПУБЛІКОВАНИМ ГРАФІКОМ";
    els.statusTitle.textContent = state.powered ? "За графіком світло є" : "За графіком світла немає";
    els.statusDetail.textContent = state.powered
      ? state.changeAt === null ? "Планових відключень до кінця доби більше немає." : `Світло має бути до ${formatClock(state.changeAt)}.`
      : `Планове відключення з ${formatClock(state.period.start)} до ${formatClock(state.period.end)}.`;
    els.statusMeta.textContent = data.stale ? "Останні збережені дані · можуть застаріти" : `Черга ${settings.queue} · перевірено ${formatTimestamp(data.fetchedAt)}`;
    els.nextTitle.textContent = state.changeAt === null ? "Змін до кінця доби немає" : state.changeType === "off" ? `Відключення о ${formatClock(state.changeAt)}` : `Світло очікується о ${formatClock(state.changeAt)}`;
    els.nextDetail.textContent = state.changeAt === null ? "Графік на сьогодні" : state.changeType === "off" ? "Початок планового відключення" : "Завершення планового відключення";
    els.countdown.innerHTML = state.changeAt === null ? "—" : `${formatCountdown(state.changeAt, nowMinutes).replace(":", "<small>год</small> : ")}<small>хв</small>`;
    els.timelineNote.lastElementChild.textContent = `Помаранчеві ділянки — планові відключення для черги ${settings.queue}. Фактичний стан може відрізнятися.`;
  }

  els.updatedAt.textContent = formatTimestamp(data.fetchedAt);
  els.footerUpdate.textContent = `Оновлено ${formatTimestamp(data.fetchedAt)}`;
  if (data.warning || data.stale) showError(data.warning || "Показано останню збережену копію графіка.", { stale: true });
  else { clearError(); setNetwork("online", `дані оновлено ${new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.fetchedAt))}`); }
}

function formatClock(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }

async function refresh({ manual = false, force = false } = {}) {
  if (!settings.workerUrl) {
    renderView();
    showError("Власнику сайту потрібно один раз додати адресу розгорнутого Worker у public/config.js.", { title: "Спільний API ще не підключено" });
    return;
  }
  currentController?.abort();
  currentController = new AbortController();
  const started = Date.now();
  els.refreshButton.disabled = true;
  els.refreshButton.setAttribute("aria-busy", "true");
  els.updateIcon.classList.add("is-spinning");
  setNetwork("loading", "отримуємо графік…");
  els.statusMeta.textContent = "Перевіряємо останні повідомлення…";
  try {
    const result = await fetchSchedule({ workerUrl: settings.workerUrl, channel: settings.channel, refresh: force, signal: currentController.signal });
    const minimumSpinner = manual ? 1200 : 450;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, minimumSpinner - (Date.now() - started))));
    data = result;
    saveData(data);
    renderView();
    if (result.warning) showError(result.warning, { stale: true });
    else if (!Object.keys(result.schedules).length) {
      showError("У п'яти останніх дописах не знайдено графіків на сьогодні чи завтра.", { title: "Графік не знайдено" });
      setNetwork("online", "канал доступний");
    } else if (manual) showToast("Графік оновлено з Telegram.");
  } catch (error) {
    const minimumSpinner = manual ? 1200 : 450;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, minimumSpinner - (Date.now() - started))));
    showError(error.message, { title: error.message.includes("Worker") && !settings.workerUrl ? "Потрібно підключити API" : "Канал недоступний" });
    if (manual) showToast("Не вдалося оновити графік.");
  } finally {
    els.refreshButton.disabled = false;
    els.refreshButton.removeAttribute("aria-busy");
    els.updateIcon.classList.remove("is-spinning");
    currentController = null;
  }
}

function openSettings() {
  els.channelInput.value = settings.channel;
  const selected = document.querySelector(`input[name="interval"][value="${settings.intervalMinutes}"]`);
  if (selected) selected.checked = true;
  els.settingsDialog.showModal();
}
function closeSettings() { els.settingsDialog.close(); }

function scheduleAutoRefresh() {
  clearInterval(timer);
  timer = setInterval(() => refresh({ manual: false, force: false }), Number(settings.intervalMinutes) * 60_000);
}

function tickClock() {
  if (data) renderView();
  else {
    const { time } = getLocalClock();
    els.currentTime.textContent = time;
    els.nowMarker.style.left = `${(getLocalClock().minutes / 1440) * 100}%`;
  }
}

els.queueSelect.addEventListener("change", () => { settings.queue = els.queueSelect.value; saveSettings(); renderView(); });
els.todayTab.addEventListener("click", () => { activeDay = "today"; renderView(); });
els.tomorrowTab.addEventListener("click", () => { activeDay = "tomorrow"; renderView(); });
els.settingsButton.addEventListener("click", openSettings);
els.cancelSettings.addEventListener("click", closeSettings);
els.closeSettings.addEventListener("click", closeSettings);
els.refreshButton.addEventListener("click", () => refresh({ manual: true, force: true }));
els.errorRetry.addEventListener("click", () => refresh({ manual: true, force: true }));
els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const channel = normalizeChannelInput(els.channelInput.value);
    const intervalMinutes = Number(document.querySelector('input[name="interval"]:checked')?.value || 5);
    settings = { ...settings, channel: channel.url, workerUrl: DEFAULT_WORKER_URL || settings.workerUrl, intervalMinutes };
    saveSettings();
    scheduleAutoRefresh();
    closeSettings();
    data = null;
    renderView();
    if (settings.workerUrl) await refresh({ manual: true, force: true });
    else showError("Власнику сайту потрібно один раз додати адресу розгорнутого Worker у public/config.js.", { title: "Канал збережено, API ще не підключено" });
  } catch (error) { showToast(error.message); }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && settings.workerUrl) refresh({ manual: false, force: false });
});
window.addEventListener("online", () => { if (settings.workerUrl) refresh(); });
window.addEventListener("offline", () => showError("Пристрій офлайн. Показано останні збережені дані, якщо вони є.", { stale: Boolean(data) }));

initQueueOptions();
renderView();
scheduleAutoRefresh();
clockTimer = setInterval(tickClock, 30_000);
if (data) {
  setNetwork(data.stale ? "offline" : "online", data.stale ? "показано кеш" : "збережені дані");
  if (data.stale) showError(data.warning || "Показано останні збережені дані.", { stale: true });
}
if (settings.workerUrl) refresh({ manual: false, force: false });
else if (!data) showError("Відкрийте налаштування та додайте адресу вашого Cloudflare Worker.", { title: "Підключіть джерело даних" });

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}), { once: true });
}
