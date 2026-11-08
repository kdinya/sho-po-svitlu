import { DEFAULT_CHANNEL, DEFAULT_WORKER_URL, fetchSchedule, normalizeChannelInput } from "./api.js";
import { formatCountdown, formatDate, getLocalClock, getScheduleState, renderOutages, renderTimeline } from "./timeline.js";

const STORAGE_KEY = "sho-po-svitlu.settings.v1";
const DATA_KEY = "sho-po-svitlu.last-data.v1";
const CHANNELS_KEY = "sho-po-svitlu.channels.v1";

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
  homeSourceUpdate: $("homeSourceUpdate"),
  heroDate: $("heroDate"),
  statusCard: $("statusCard"),
  statusTitle: $("statusTitle"),
  statusMeta: $("statusMeta"),
  nextCard: $("nextCard"),
  nextTitle: $("nextTitle"),
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
  openSourceSettingsBtn: $("openSourceSettingsBtn"),
  channelsList: $("channelsList"),
  toggleAddChannelBtn: $("toggleAddChannelBtn"),
  addChannelBox: $("addChannelBox"),
  newChannelInput: $("newChannelInput"),
  cancelAddChannelBtn: $("cancelAddChannelBtn"),
  confirmAddChannelBtn: $("confirmAddChannelBtn"),
  saveIntervalBtn: $("saveIntervalBtn"),
  installButton: $("installButton"),
  shareAppButton: $("shareAppButton"),
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

function availableQueues(scheduleData = data) {
  const queues = new Set();
  Object.values(scheduleData?.schedules || {}).forEach((day) => {
    Object.keys(day?.queues || {}).forEach((queue) => queues.add(queue));
  });
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
      option.textContent = `Черга ${queue}`;
      option.addEventListener("click", () => selectQueue(queue));
      return option;
    })
  );
  updateQueuePicker();
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
  return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value)).replace(",", " ·");
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
    info.innerHTML = `<strong>${ch.name}</strong><small>t.me/s/${ch.username}</small>`;

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
  const intervalRadio = document.querySelector(`input[name="interval"][value="${settings.intervalMinutes}"]`);
  if (intervalRadio) intervalRadio.checked = true;
  els.settingsDialog.showModal();
}

function closeSettings() {
  els.settingsDialog.close();
}

function updateSource() {
  const normalized = normalizeChannelInput(settings.channel);
  els.sourceLink.href = normalized.url;
  const channelTitle = data?.title || normalized.username;
  els.sourceName.textContent = channelTitle;
  els.sourceHandle.textContent = `t.me/s/${normalized.username}`;
  els.homeSourceName.textContent = channelTitle;
}

function renderView() {
  const selectedDate = activeDay === "today" ? data?.today : data?.tomorrow;
  const date = selectedDate ? data?.schedules?.[selectedDate] ?? null : null;
  const queuePeriods = date?.queues?.[settings.queue] ?? [];
  const hasSchedule = Boolean(date?.queues?.[settings.queue]);
  const now = new Date();
  const { minutes: nowMinutes } = getLocalClock(now);
  const isCurrentDay = activeDay === "today";
  const state = hasSchedule && isCurrentDay ? getScheduleState(queuePeriods, nowMinutes) : null;

  els.heroDate.textContent = formatHeroDate(selectedDate, isCurrentDay);
  els.scheduleDate.textContent = selectedDate ? formatDate(selectedDate) : isCurrentDay ? "сьогодні" : "завтра";
  els.homeOverviewHeading.textContent = isCurrentDay ? "Графік на сьогодні" : "Графік на завтра";

  els.todayTab.classList.toggle("is-active", isCurrentDay);
  els.tomorrowTab.classList.toggle("is-active", !isCurrentDay);
  els.homeTodayTab.classList.toggle("is-active", isCurrentDay);
  els.homeTomorrowTab.classList.toggle("is-active", !isCurrentDay);

  updateSource();

  renderTimeline(els.timelineTrack, els.nowMarker, els.currentTime, hasSchedule ? queuePeriods : [], now, { showNow: isCurrentDay });
  renderOutages(els.outageList, els.outageCount, hasSchedule ? queuePeriods : [], isCurrentDay ? nowMinutes : 0, { highlightPast: isCurrentDay });
  renderTimeline(els.homeTimelineTrack, els.homeNowMarker, els.homeCurrentTime, hasSchedule ? queuePeriods : [], now, { showNow: isCurrentDay });
  renderOutages(els.homeOutageList, els.homeOutageCount, hasSchedule ? queuePeriods : [], isCurrentDay ? nowMinutes : 0, { highlightPast: isCurrentDay });

  if (!data) {
    els.statusCard.dataset.state = "unknown";
    els.statusTitle.textContent = "Перевіряємо графік";
    els.nextTitle.textContent = "Очікуємо дані";
    els.countdown.textContent = "";
    els.statusMeta.textContent = "Оновлюємо дані з Telegram...";
    els.homeSourceUpdate.textContent = "Оновлено: очікуємо";
    els.footerUpdate.textContent = "Очікуємо перше оновлення";
    return;
  }

  if (!hasSchedule) {
    els.statusCard.dataset.state = "unknown";
    els.statusTitle.textContent = isCurrentDay ? "Поки без графіка" : "Графік на завтра";
    els.nextTitle.textContent = `Черга ${settings.queue} відсутня`;
    els.countdown.textContent = "";
    els.statusMeta.textContent = `У каналі не знайдено графік для черги ${settings.queue}`;
  } else if (!isCurrentDay) {
    els.statusCard.dataset.state = "unknown";
    els.statusTitle.textContent = "Графік на завтра";
    els.nextTitle.textContent = queuePeriods.length ? `Перше відключення о ${formatClock(queuePeriods[0].start)}` : "Планових відключень немає";
    els.countdown.textContent = "";
    els.statusMeta.textContent = `Черга ${settings.queue} · план на ${formatDate(selectedDate)}`;
  } else {
    els.statusCard.dataset.state = state.powered ? "on" : "off";
    els.statusTitle.textContent = state.powered ? "Зараз є світло!" : "Зараз немає світла!";
    if (state.changeAt === null) {
      els.nextTitle.textContent = "Змін до кінця доби немає";
      els.countdown.textContent = "";
    } else if (state.changeType === "off") {
      els.nextTitle.textContent = `Відключення о ${formatClock(state.changeAt)}`;
      els.countdown.textContent = `(через ${formatCountdown(state.changeAt, nowMinutes)})`;
    } else {
      els.nextTitle.textContent = `Світло буде о ${formatClock(state.changeAt)}`;
      els.countdown.textContent = `(через ${formatCountdown(state.changeAt, nowMinutes)})`;
    }
    els.statusMeta.textContent = data.stale ? "Показано збережену копію графіка" : `Черга ${settings.queue} · оновлено ${formatTimestamp(data.fetchedAt)}`;
  }

  els.updatedAt.textContent = formatTimestamp(data.fetchedAt);
  els.homeSourceUpdate.textContent = `Оновлено: ${formatTimestamp(data.fetchedAt)}`;
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
els.queueSelect.addEventListener("click", () => setQueueMenu(els.queueMenu.hidden));
document.addEventListener("pointerdown", (event) => {
  if (!els.queuePicker.contains(event.target)) setQueueMenu(false);
});

const selectDay = (day) => {
  activeDay = day;
  renderView();
};
els.todayTab.addEventListener("click", () => selectDay("today"));
els.tomorrowTab.addEventListener("click", () => selectDay("tomorrow"));
els.homeTodayTab.addEventListener("click", () => selectDay("today"));
els.homeTomorrowTab.addEventListener("click", () => selectDay("tomorrow"));

els.refreshButton.addEventListener("click", () => refresh({ manual: true, force: true }));
els.editSourceButton.addEventListener("click", openSettings);
els.openSourceSettingsBtn.addEventListener("click", (e) => {
  e.preventDefault();
  openSettings();
});
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

// PWA Install
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  els.installButton.hidden = false;
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  els.installButton.disabled = true;
  els.installButton.querySelector("span").textContent = "Встановлено";
  showToast("Додаток встановлено!");
});
els.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    showToast(
      /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? "Щоб встановити: у Safari натисніть «Поділитися» ⎙, потім «На початковий екран» ⊞."
        : "У меню браузера оберіть «Встановити додаток» або «Додати на головний екран»."
    );
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});

// Share
els.shareAppButton.addEventListener("click", async () => {
  const shareData = {
    title: "ШоПоСвітлу",
    text: "Зручний графік відключень світла для своєї черги.",
    url: window.location.href,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareData.url);
      showToast("Посилання скопійовано у буфер!");
    } else {
      showToast(`Посилання на додаток: ${shareData.url}`);
    }
  } catch (err) {
    if (err.name !== "AbortError") showToast("Не вдалося поділитися.");
  }
});

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
setActiveScreen("home");
renderView();
scheduleAutoRefresh();
clockTimer = setInterval(() => {
  if (data) renderView();
}, 30_000);

if (settings.workerUrl && !data) {
  refresh({ manual: false, force: false });
}
