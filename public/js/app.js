import { DEFAULT_CHANNEL, DEFAULT_WORKER_URL, fetchSchedule, normalizeChannelInput } from "./api.js";
import { formatDate, formatHours, getLocalClock, getScheduleState, renderOutages, renderTimeline, totalMinutes } from "./timeline.js";

const STORAGE_KEY = "sho-po-svitlu.settings.v1";
const DATA_KEY = "sho-po-svitlu.last-data.v1";
const CHANNELS_KEY = "sho-po-svitlu.channels.v1";
const ONBOARD_KEY = "sho-po-svitlu.onboarded.v1";

const DEFAULT_CHANNELS = [
  {
    name: "Світло Маловисківського району",
    url: DEFAULT_CHANNEL,
    username: "SvitloMalovyskivskohoRaionu",
    isDefault: true,
  },
];

const DEFAULTS = { channel: DEFAULT_CHANNEL, workerUrl: DEFAULT_WORKER_URL, queue: "6.2", intervalMinutes: 5 };
let QUEUES = [];

const $ = (id) => document.getElementById(id);

const els = {
  queueSelect: $("queueSelect"),
  queueValue: $("queueValue"),
  queueMenu: $("queueMenu"),
  queuePicker: $("queuePicker"),
  homeTimelineTrack: $("homeTimelineTrack"),
  homeNowMarker: $("homeNowMarker"),
  homeCurrentTime: $("homeCurrentTime"),
  homeOutageList: $("homeOutageList"),
  homeOutageCount: $("homeOutageCount"),
  homeTodayTab: $("homeTodayTab"),
  homeTomorrowTab: $("homeTomorrowTab"),
  homeOverviewHeading: $("homeOverviewHeading"),
  homeSourceName: $("homeSourceName"),
  heroDate: $("heroDate"),
  statusCard: $("statusCard"),
  statusTitle: $("statusTitle"),
  statusMeta: $("statusMeta"),
  nextCard: $("nextCard"),
  nextTitle: $("nextTitle"),
  nextTime: $("nextTime"),
  statOn: $("statOn"),
  statOff: $("statOff"),
  homeStatOn: $("homeStatOn"),
  homeStatOff: $("homeStatOff"),
  onboardDialog: $("onboardDialog"),
  onboardStepChannel: $("onboardStepChannel"),
  onboardStepQueue: $("onboardStepQueue"),
  onboardUseDefault: $("onboardUseDefault"),
  onboardUseCustom: $("onboardUseCustom"),
  onboardChannelInput: $("onboardChannelInput"),
  onboardError: $("onboardError"),
  onboardQueueGrid: $("onboardQueueGrid"),
  onboardDone: $("onboardDone"),
  onboardBack: $("onboardBack"),
  countdown: $("countdown"),
  refreshButton: $("refreshButton"),
  updateIcon: $("updateIcon"),
  todayTab: $("todayTab"),
  tomorrowTab: $("tomorrowTab"),
  scheduleDate: $("scheduleDate"),
  timelineTrack: $("timelineTrack"),
  nowMarker: $("nowMarker"),
  currentTime: $("currentTime"),
  timelineNote: $("timelineNote"),
  outageList: $("outageList"),
  outageCount: $("outageCount"),
  sourceLink: $("sourceLink"),
  sourceName: $("sourceName"),
  sourceHandle: $("sourceHandle"),
  sourceStatus: $("sourceStatus"),
  updatedAt: $("updatedAt"),
  footerUpdate: $("footerUpdate"),
  errorBanner: $("errorBanner"),
  errorTitle: $("errorTitle"),
  errorText: $("errorText"),
  errorRetry: $("errorRetry"),
  settingsDialog: $("settingsDialog"),
  closeSettings: $("closeSettings"),
  editSourceButton: $("editSourceButton"),
  channelsList: $("channelsList"),
  toggleAddChannelBtn: $("toggleAddChannelBtn"),
  addChannelBox: $("addChannelBox"),
  newChannelInput: $("newChannelInput"),
  cancelAddChannelBtn: $("cancelAddChannelBtn"),
  confirmAddChannelBtn: $("confirmAddChannelBtn"),
  saveIntervalBtn: $("saveIntervalBtn"),
  homeInstallBanner: $("homeInstallBanner"),
  homeInstallBtn: $("homeInstallBtn"),
  homeDismissInstallBtn: $("homeDismissInstallBtn"),
  pwaPanel: $("pwaPanel"),
  installButton: $("installButton"),
  shareAppButton: $("shareAppButton"),
  copyShareLinkBtn: $("copyShareLinkBtn"),
  tgShareBtn: $("tgShareBtn"),
  shareCard: $("shareCard"),
  toast: $("toast"),
  navButtons: [...document.querySelectorAll(".nav-item")],
};

function readStoredSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const result = { ...DEFAULTS, ...stored };
    if (DEFAULT_WORKER_URL) result.workerUrl = DEFAULT_WORKER_URL;
    if (![5, 15, 30].includes(Number(result.intervalMinutes))) result.intervalMinutes = DEFAULTS.intervalMinutes;
    return result;
  } catch {
    return { ...DEFAULTS };
  }
}

function readStoredData() {
  try {
    const data = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    return data?.schedules ? data : null;
  } catch {
    return null;
  }
}

function readStoredChannels() {
  try {
    const list = JSON.parse(localStorage.getItem(CHANNELS_KEY) || "[]");
    if (!Array.isArray(list) || !list.length) return [...DEFAULT_CHANNELS];
    const hasDefault = list.some((ch) => ch.username?.toLowerCase() === "svitlomalovyskivskohoraionu");
    return hasDefault ? list : [...DEFAULT_CHANNELS, ...list];
  } catch {
    return [...DEFAULT_CHANNELS];
  }
}

let settings = readStoredSettings();
let data = readStoredData();
let channels = readStoredChannels();
let activeDay = "today";
let timer = null;
let clockTimer = null;
let toastTimer = null;
let currentController = null;
let deferredInstallPrompt = null;

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    showToast("Не вдалося зберегти налаштування в браузері.");
  }
}

function saveData(value) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(value));
  } catch {}
}

function saveChannels() {
  try {
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(channels));
  } catch {}
}

const DEFAULT_FALLBACK_QUEUES = ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2", "5.1", "5.2", "6.1", "6.2"];

function availableQueues(scheduleData = data) {
  const queues = new Set();
  Object.values(scheduleData?.schedules || {}).forEach((day) => {
    Object.keys(day?.queues || {}).forEach((queue) => queues.add(queue));
  });
  if (queues.size === 0) {
    DEFAULT_FALLBACK_QUEUES.forEach((q) => queues.add(q));
  }
  return [...queues].sort((a, b) => {
    const [ag, as] = a.split(".").map(Number);
    const [bg, bs] = b.split(".").map(Number);
    return ag - bg || as - bs;
  });
}

function initQueueOptions() {
  QUEUES = availableQueues();
  els.queueMenu.replaceChildren(
    ...QUEUES.map((queue) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "queue-option";
      option.setAttribute("role", "option");
      option.dataset.queue = queue;
      option.textContent = queue;
      option.setAttribute("aria-label", `Черга ${queue}`);
      option.addEventListener("click", () => selectQueue(queue));
      return option;
    })
  );
  updateQueuePicker();
  setQueueMenu(false);
}

function updateQueuePicker() {
  els.queueValue.textContent = settings.queue;
  els.queueSelect.setAttribute("aria-label", QUEUES.length ? `Обрана черга ${settings.queue}. Натисніть, щоб змінити` : "Очікуємо список черг з Telegram");
  els.queueSelect.disabled = QUEUES.length === 0;
  els.queueMenu.querySelectorAll(".queue-option").forEach((option) => {
    const selected = option.dataset.queue === settings.queue;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
}

function setQueueMenu(open) {
  els.queueMenu.hidden = !open;
  els.queueSelect.setAttribute("aria-expanded", String(open));
}

function selectQueue(queue) {
  if (!QUEUES.includes(queue)) return;
  settings.queue = queue;
  saveSettings();
  updateQueuePicker();
  setQueueMenu(false);
  renderView();
  if (settings.workerUrl) refresh({ manual: false, force: false });
}

function formatHeroDate(isoDate, isToday) {
  const prefix = isToday ? "Сьогодні" : "Завтра";
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isToday ? "Сьогодні" : "Завтра";
  const [year, month, day] = isoDate.split("-");
  const formatted = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" }).format(new Date(Number(year), Number(month) - 1, Number(day)));
  return `${prefix}, ${formatted}`;
}

function formatTimestamp(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "Ще не оновлювали";
  const text = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return text.replace(/\s+о\s+/, ", ");
}

function formatClock(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 3200);
}

function setActiveScreen(name) {
  document.querySelectorAll(".page-screen").forEach((screen) => {
    const active = screen.dataset.screen === name;
    screen.hidden = !active;
    screen.classList.toggle("is-active", active);
  });
  els.navButtons.forEach((button) => {
    const active = button.dataset.screenTarget === name;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (name === "schedule") renderView();
  if (name === "source") {
    const intervalRadio = document.querySelector(`input[name="interval"][value="${settings.intervalMinutes}"]`);
    if (intervalRadio) intervalRadio.checked = true;
  }
}

function renderChannelsList() {
  if (!els.channelsList) return;
  els.channelsList.replaceChildren();
  const currentNormalized = normalizeChannelInput(settings.channel).username.toLowerCase();

  channels.forEach((ch, index) => {
    const isSelected = ch.username.toLowerCase() === currentNormalized;
    const item = document.createElement("div");
    item.className = `channel-item ${isSelected ? "is-selected" : ""}`;
    item.setAttribute("role", "radio");
    item.setAttribute("aria-checked", String(isSelected));
    item.setAttribute("tabindex", "0");

    const radio = document.createElement("span");
    radio.className = "channel-radio";
    radio.innerHTML = "<i></i>";

    const info = document.createElement("div");
    info.className = "channel-info";
    const infoName = document.createElement("strong");
    infoName.textContent = ch.name;
    const infoHandle = document.createElement("small");
    infoHandle.textContent = `t.me/s/${ch.username}`;
    info.append(infoName, infoHandle);

    item.append(radio, info);

    if (!ch.isDefault) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "channel-delete-btn";
      del.setAttribute("aria-label", "Видалити канал зі списку");
      del.innerHTML = `<svg class="icon"><use href="#i-trash" /></svg>`;
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChannel(index);
      });
      item.append(del);
    }

    item.addEventListener("click", () => {
      selectChannel(ch);
    });

    els.channelsList.append(item);
  });
}

function selectChannel(ch) {
  try {
    const normalized = normalizeChannelInput(ch.url);
    settings.channel = normalized.url;
    saveSettings();
    renderChannelsList();
    updateSource();
    closeSettings();
    data = null;
    renderView();
    if (settings.workerUrl) refresh({ manual: true, force: true });
    showToast(`Обрано канал: ${ch.name}`);
  } catch (err) {
    showToast(err.message);
  }
}

function deleteChannel(index) {
  const removed = channels[index];
  if (!removed || removed.isDefault) return;
  channels.splice(index, 1);
  saveChannels();
  if (settings.channel === removed.url) {
    selectChannel(channels[0]);
  } else {
    renderChannelsList();
  }
}

function openSettings() {
  renderChannelsList();
  els.addChannelBox.hidden = true;
  els.newChannelInput.value = "";
  els.settingsDialog.showModal();
}

function closeSettings() {
  els.settingsDialog.close();
}

function updateSource() {
  const normalized = normalizeChannelInput(settings.channel);
  els.sourceLink.href = normalized.url;
  const known = channels.find((ch) => ch.username.toLowerCase() === normalized.username.toLowerCase());
  const channelTitle = data?.title || known?.name || normalized.username;
  els.sourceName.textContent = channelTitle;
  els.sourceHandle.textContent = `t.me/s/${normalized.username}`;
  els.homeSourceName.textContent = channelTitle;
}

function setStatusTitle(before, accent = "", after = "") {
  const parts = [document.createTextNode(before)];
  if (accent) {
    const em = document.createElement("em");
    em.textContent = accent;
    parts.push(em);
  }
  if (after) parts.push(document.createTextNode(after));
  els.statusTitle.replaceChildren(...parts);
}

function setPower(power) {
  document.body.dataset.power = power;
  els.statusCard.dataset.state = power;
}

function setNext(label, time = "", hint = "") {
  els.nextTitle.textContent = label;
  els.nextTime.textContent = time;
  els.countdown.textContent = hint;
  els.countdown.hidden = !hint;
}

function renderView() {
  const selectedDate = activeDay === "today" ? data?.today : data?.tomorrow;
  const date = selectedDate ? data?.schedules?.[selectedDate] ?? null : null;
  const queuePeriods = date?.queues?.[settings.queue] ?? [];
  const hasSchedule = Boolean(date?.queues?.[settings.queue]);
  const now = new Date();
  const { minutes: nowMinutes } = getLocalClock(now);
  const isCurrentDay = activeDay === "today";
  const periods = hasSchedule ? queuePeriods : [];

  const todayQueue = data?.today ? data?.schedules?.[data.today]?.queues?.[settings.queue] : null;
  const hasToday = Boolean(todayQueue);
  const state = hasToday ? getScheduleState(todayQueue, nowMinutes) : null;

  els.heroDate.textContent = formatHeroDate(data?.today, true);
  els.scheduleDate.textContent = selectedDate ? formatDate(selectedDate) : isCurrentDay ? "сьогодні" : "завтра";
  els.homeOverviewHeading.querySelector("span").textContent = isCurrentDay ? "Графік на сьогодні" : "Графік на завтра";

  for (const [tab, active] of [[els.todayTab, isCurrentDay], [els.tomorrowTab, !isCurrentDay], [els.homeTodayTab, isCurrentDay], [els.homeTomorrowTab, !isCurrentDay]]) {
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }

  updateSource();

  renderTimeline(els.timelineTrack, els.nowMarker, els.currentTime, periods, now, { showNow: isCurrentDay });
  renderOutages(els.outageList, els.outageCount, periods, isCurrentDay ? nowMinutes : 0, {
    highlightPast: isCurrentDay,
    emptyText: data && !hasSchedule ? `У каналі немає графіка для черги ${settings.queue}.` : data ? undefined : "Завантажуємо графік…",
  });
  renderTimeline(els.homeTimelineTrack, els.homeNowMarker, els.homeCurrentTime, periods, now, { showNow: isCurrentDay });
  renderOutages(els.homeOutageList, els.homeOutageCount, periods, isCurrentDay ? nowMinutes : 0, {
    highlightPast: isCurrentDay,
    emptyText: data && !hasSchedule ? `У каналі немає графіка для черги ${settings.queue}.` : data ? undefined : "Завантажуємо графік…",
  });

  for (const track of [els.timelineTrack, els.homeTimelineTrack]) track.classList.toggle("is-empty", !data || !hasSchedule);

  const off = hasSchedule ? totalMinutes(queuePeriods) : null;
  const offText = off === null ? "—" : formatHours(off);
  const onText = off === null ? "—" : formatHours(1440 - off);
  els.statOff.textContent = offText;
  els.statOn.textContent = onText;
  if (els.homeStatOff) els.homeStatOff.textContent = offText;
  if (els.homeStatOn) els.homeStatOn.textContent = onText;

  if (!data) {
    setPower("unknown");
    setStatusTitle("Перевіряємо графік");
    setNext("Очікуємо дані");
    els.statusMeta.textContent = "Оновлюємо дані з Telegram...";
    els.footerUpdate.textContent = "Очікуємо перше оновлення";
    return;
  }

  if (!hasToday) {
    setPower("unknown");
    setStatusTitle("Поки без графіка");
    setNext(`Черга ${settings.queue} відсутня в каналі`);
    els.statusMeta.textContent = `У каналі не знайдено графік для черги ${settings.queue}`;
  } else {
    setPower(state.powered ? "on" : "off");
    if (state.powered) setStatusTitle("Зараз є ", "світло", "!");
    else setStatusTitle("Зараз немає ", "світла", "!");
    if (state.changeAt === null) {
      setNext("Змін до кінця доби немає");
    } else {
      const left = formatHours(Math.max(0, state.changeAt - nowMinutes));
      setNext("Наступна зміна: о", formatClock(state.changeAt), `через ${left}`);
    }
    els.statusMeta.textContent = data.stale ? "Показано збережену копію графіка" : `Черга ${settings.queue} · оновлено ${formatTimestamp(data.fetchedAt)}`;
  }

  els.updatedAt.textContent = formatTimestamp(data.fetchedAt);
  els.footerUpdate.textContent = `Оновлено ${formatTimestamp(data.fetchedAt)}`;
}

async function refresh({ manual = false, force = false } = {}) {
  if (!settings.workerUrl) {
    renderView();
    showToast("Вкажіть адресу Worker у public/config.js");
    return;
  }
  currentController?.abort();
  currentController = new AbortController();
  const started = Date.now();
  els.refreshButton.disabled = true;
  els.refreshButton.setAttribute("aria-busy", "true");
  els.updateIcon.classList.add("is-spinning");

  try {
    const result = await fetchSchedule({
      workerUrl: settings.workerUrl,
      channel: settings.channel,
      refresh: force,
      signal: currentController.signal,
    });
    const minimumSpinner = manual ? 800 : 300;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, minimumSpinner - (Date.now() - started))));
    data = result;
    const available = availableQueues(data);
    QUEUES = available;
    if (available.length && !available.includes(settings.queue)) {
      settings.queue = available[0];
      saveSettings();
    }
    initQueueOptions();
    saveData(data);
    renderView();
    if (manual) showToast("Графік оновлено.");
  } catch (error) {
    const minimumSpinner = manual ? 800 : 300;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, minimumSpinner - (Date.now() - started))));
    showToast(error.message || "Не вдалося оновити графік.");
  } finally {
    els.refreshButton.disabled = false;
    els.refreshButton.removeAttribute("aria-busy");
    els.updateIcon.classList.remove("is-spinning");
    currentController = null;
  }
}

function scheduleAutoRefresh() {
  clearInterval(timer);
  timer = setInterval(() => refresh({ manual: false, force: false }), Number(settings.intervalMinutes) * 60_000);
}

// Event Listeners
els.queueSelect.addEventListener("click", (e) => {
  e.stopPropagation();
  setQueueMenu(els.queueMenu.hidden);
});
document.addEventListener("pointerdown", (event) => {
  if (!els.queuePicker.contains(event.target)) setQueueMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setQueueMenu(false);
});

const selectDay = (day) => {
  activeDay = day;
  renderView();
  if (settings.workerUrl) refresh({ manual: false, force: false });
};
els.todayTab.addEventListener("click", () => selectDay("today"));
els.tomorrowTab.addEventListener("click", () => selectDay("tomorrow"));
els.homeTodayTab.addEventListener("click", () => selectDay("today"));
els.homeTomorrowTab.addEventListener("click", () => selectDay("tomorrow"));

els.refreshButton.addEventListener("click", () => refresh({ manual: true, force: true }));
els.editSourceButton.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", closeSettings);

els.toggleAddChannelBtn.addEventListener("click", () => {
  els.addChannelBox.hidden = !els.addChannelBox.hidden;
  if (!els.addChannelBox.hidden) els.newChannelInput.focus();
});
els.cancelAddChannelBtn.addEventListener("click", () => {
  els.addChannelBox.hidden = true;
  els.newChannelInput.value = "";
});
els.confirmAddChannelBtn.addEventListener("click", () => {
  const val = els.newChannelInput.value.trim();
  if (!val) {
    showToast("Введіть посилання на Telegram-канал або його @username.");
    return;
  }
  try {
    const normalized = normalizeChannelInput(val);
    const existing = channels.find((c) => c.username.toLowerCase() === normalized.username.toLowerCase());
    if (existing) {
      selectChannel(existing);
    } else {
      const newChannel = {
        name: normalized.username,
        url: normalized.url,
        username: normalized.username,
        isDefault: false,
      };
      channels.push(newChannel);
      saveChannels();
      selectChannel(newChannel);
    }
  } catch (err) {
    showToast(err.message);
  }
});

els.saveIntervalBtn.addEventListener("click", () => {
  const selectedInterval = document.querySelector('input[name="interval"]:checked')?.value;
  if (selectedInterval) {
    settings.intervalMinutes = Number(selectedInterval);
    saveSettings();
    scheduleAutoRefresh();
  }
  closeSettings();
  showToast("Налаштування збережено.");
});

// Перший запуск: вибір каналу та черги
let onboardChannel = null;
let onboardQueue = settings.queue;
let onboardCompleted = false;

function needsOnboarding() {
  try {
    return localStorage.getItem(STORAGE_KEY) === null && localStorage.getItem(ONBOARD_KEY) === null;
  } catch {
    return false;
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARD_KEY, "1");
  } catch {}
}

function showOnboardStep(step) {
  els.onboardStepChannel.hidden = step !== "channel";
  els.onboardStepQueue.hidden = step !== "queue";
}

function renderOnboardQueues() {
  const list = availableQueues(onboardChannel?.isDefault ? data : null);
  if (!list.includes(onboardQueue)) onboardQueue = list[0];
  els.onboardQueueGrid.replaceChildren(
    ...list.map((queue) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "queue-pick";
      button.setAttribute("role", "radio");
      const selected = queue === onboardQueue;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.textContent = queue;
      button.addEventListener("click", () => {
        onboardQueue = queue;
        renderOnboardQueues();
      });
      return button;
    })
  );
}

function openOnboarding() {
  onboardChannel = null;
  onboardQueue = settings.queue;
  els.onboardError.hidden = true;
  els.onboardChannelInput.value = "";
  showOnboardStep("channel");
  els.onboardDialog.showModal();
}

function pickOnboardChannel(channel) {
  onboardChannel = channel;
  renderOnboardQueues();
  showOnboardStep("queue");
}

function finishOnboarding() {
  if (!onboardChannel) return;
  const changed = normalizeChannelInput(onboardChannel.url).url !== normalizeChannelInput(settings.channel).url;
  if (!channels.some((ch) => ch.username.toLowerCase() === onboardChannel.username.toLowerCase())) {
    channels.push(onboardChannel);
    saveChannels();
  }
  settings.channel = normalizeChannelInput(onboardChannel.url).url;
  settings.queue = onboardQueue;
  saveSettings();
  markOnboarded();
  onboardCompleted = true;
  els.onboardDialog.close();
  if (changed) data = null;
  initQueueOptions();
  renderChannelsList();
  renderView();
  if (settings.workerUrl) refresh({ manual: true, force: true });
}

els.onboardUseDefault.addEventListener("click", () => pickOnboardChannel(DEFAULT_CHANNELS[0]));
els.onboardUseCustom.addEventListener("click", () => {
  try {
    const normalized = normalizeChannelInput(els.onboardChannelInput.value);
    const existing = channels.find((ch) => ch.username.toLowerCase() === normalized.username.toLowerCase());
    els.onboardError.hidden = true;
    pickOnboardChannel(existing || { name: normalized.username, url: normalized.url, username: normalized.username, isDefault: false });
  } catch (err) {
    els.onboardError.textContent = err.message;
    els.onboardError.hidden = false;
    els.onboardChannelInput.focus();
  }
});
els.onboardChannelInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") els.onboardUseCustom.click();
});
els.onboardBack.addEventListener("click", () => showOnboardStep("channel"));
els.onboardDone.addEventListener("click", finishOnboarding);
els.onboardDialog.addEventListener("close", () => {
  if (!onboardCompleted) markOnboarded();
});

// PWA Install
function isAppInstalled() {
  const isStandalone = window.matchMedia?.("(display-mode: standalone)").matches ||
                       window.navigator.standalone === true ||
                       document.referrer.includes("android-app://");
  let stored = false;
  try {
    stored = localStorage.getItem("sho-po-svitlu.installed") === "true";
  } catch {}
  return Boolean(isStandalone || stored);
}

function updateInstallUI() {
  const installed = isAppInstalled();
  const dismissed = sessionStorage.getItem("sho-po-svitlu.install-dismissed") === "1";
  document.documentElement.dataset.installed = String(installed);

  if (installed) {
    if (els.homeInstallBanner) els.homeInstallBanner.hidden = true;
    if (els.pwaPanel) els.pwaPanel.hidden = true;
    return;
  }

  // На веб-сайті: показуємо банер вгорі головної сторінки, якщо користувач не приховав його у поточній сесії
  if (els.homeInstallBanner) {
    els.homeInstallBanner.hidden = dismissed;
  }
  if (els.pwaPanel) {
    els.pwaPanel.hidden = false;
  }
}

async function triggerInstallPrompt() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    try {
      const choice = await deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === "accepted") {
        localStorage.setItem("sho-po-svitlu.installed", "true");
        updateInstallUI();
      }
    } catch {}
    deferredInstallPrompt = null;
    return;
  }

  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIos) {
    showToast("На iPhone/iPad: натисніть «Поділитися» ⎙ внизу Safari, потім «На початковий екран» ⊞.");
  } else {
    showToast("У меню вашого браузера (⋮) оберіть «Встановити додаток» або «Додати на головний екран».");
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallUI();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  try {
    localStorage.setItem("sho-po-svitlu.installed", "true");
  } catch {}
  updateInstallUI();
  showToast("Додаток успішно встановлено на робочий стіл!");
});

els.homeInstallBtn?.addEventListener("click", triggerInstallPrompt);
els.installButton?.addEventListener("click", triggerInstallPrompt);

els.homeDismissInstallBtn?.addEventListener("click", () => {
  if (els.homeInstallBanner) els.homeInstallBanner.hidden = true;
  try {
    sessionStorage.setItem("sho-po-svitlu.install-dismissed", "1");
  } catch {}
});

// Первинна ініціалізація стану встановлення
updateInstallUI();

// Share app
function getAppShareUrl() {
  try {
    const loc = window.location;
    if (!loc.origin || loc.origin === "null" || loc.protocol === "file:") {
      return "https://sho-po-svitlu-ib61.vercel.app/";
    }
    const url = new URL(loc.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "https://sho-po-svitlu-ib61.vercel.app/";
  }
}

function updateShareLinks() {
  const url = getAppShareUrl();
  const text = "ШоПоСвітлу — зручний графік відключень світла за чергами:";
  if (els.tgShareBtn) {
    els.tgShareBtn.href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  }
}

async function copyShareUrlToClipboard() {
  const url = getAppShareUrl();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      showToast("Посилання на додаток скопійовано у буфер!");
      return;
    }
  } catch {}
  showToast(`Посилання: ${url}`);
}

async function handleShareApp() {
  const url = getAppShareUrl();
  const shareData = {
    title: "ШоПоСвітлу",
    text: "ШоПоСвітлу — зручний графік відключень світла за чергами:",
    url: url,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }

  await copyShareUrlToClipboard();
}

els.shareAppButton?.addEventListener("click", handleShareApp);
els.copyShareLinkBtn?.addEventListener("click", copyShareUrlToClipboard);

els.navButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveScreen(btn.dataset.screenTarget));
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && settings.workerUrl) refresh({ manual: false, force: false });
});

window.addEventListener("online", () => {
  if (settings.workerUrl) refresh();
});

// Initialize
initQueueOptions();
updateShareLinks();
setActiveScreen("home");
renderView();
scheduleAutoRefresh();
clockTimer = setInterval(() => {
  if (data) renderView();
}, 30_000);

if (settings.workerUrl) {
  refresh({ manual: false, force: false });
}
if (needsOnboarding()) openOnboarding();
