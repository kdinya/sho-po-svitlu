import { DEFAULT_CHANNEL, DEFAULT_WORKER_URL, UKRAINE_REGIONS, fetchCompletedSetupsCount, fetchSchedule, normalizeChannelInput, normalizeSetupNickname, registerCompletedSetup, sendChannelRequest } from "./api.js";
import { formatDate, formatHours, getLocalClock, getScheduleState, renderOutages, renderTimeline, totalMinutes } from "./timeline.js";

const STORAGE_KEY = "sho-po-svitlu.settings.v1";
const DATA_KEY = "sho-po-svitlu.last-data.v1";
const CHANNELS_KEY = "sho-po-svitlu.channels.v1";
const ONBOARD_KEY = "sho-po-svitlu.onboarded.v1";
const CLIENT_ID_KEY = "sho-po-svitlu.client-id.v1";
const USERS_KEY = "sho-po-svitlu.completed-settings-count.v1";
const PROFILE_KEY = "sho-po-svitlu.profile.v1";
const CLIENT_ID_COOKIE = "sps_cid";
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

const DEFAULT_CHANNELS = [
  {
    name: "Світло Маловисківського району",
    url: DEFAULT_CHANNEL,
    username: "SvitloMalovyskivskohoRaionu",
    region: "Кіровоградська область",
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
  homeRegionName: $("homeRegionName"),
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
  onboardStepNickname: $("onboardStepNickname"),
  onboardUseDefault: $("onboardUseDefault"),
  onboardUseCustom: $("onboardUseCustom"),
  onboardChannelInput: $("onboardChannelInput"),
  onboardError: $("onboardError"),
  onboardQueueGrid: $("onboardQueueGrid"),
  onboardDone: $("onboardDone"),
  onboardContinueNickname: $("onboardContinueNickname"),
  onboardNickname: $("onboardNickname"),
  onboardNicknameError: $("onboardNicknameError"),
  onboardBack: $("onboardBack"),
  onboardBackQueue: $("onboardBackQueue"),
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
  errorReport: $("errorReport"),
  settingsDialog: $("settingsDialog"),
  requestChannelDialog: $("requestChannelDialog"),
  openRequestChannelBtn: $("openRequestChannelBtn"),
  proposeChannelBtn: $("proposeChannelBtn"),
  closeRequestDialog: $("closeRequestDialog"),
  cancelRequestBtn: $("cancelRequestBtn"),
  requestType: $("requestType"),
  requestRegion: $("requestRegion"),
  requestChannelUrl: $("requestChannelUrl"),
  requestSender: $("requestSender"),
  requestNote: $("requestNote"),
  requestError: $("requestError"),
  submitRequestBtn: $("submitRequestBtn"),
  settingsRegionSelect: $("settingsRegionSelect"),
  regionChannelsHeading: $("regionChannelsHeading"),
  closeSettings: $("closeSettings"),
  editSourceButton: $("editSourceButton"),
  channelsList: $("channelsList"),
  toggleAddChannelBtn: $("toggleAddChannelBtn"),
  addChannelBox: $("addChannelBox"),
  newChannelInput: $("newChannelInput"),
  cancelAddChannelBtn: $("cancelAddChannelBtn"),
  confirmAddChannelBtn: $("confirmAddChannelBtn"),
  saveIntervalBtn: $("saveIntervalBtn"),
  aboutAppBtn: $("aboutAppBtn"),
  aboutAppDialog: $("aboutAppDialog"),
  closeAboutAppDialog: $("closeAboutAppDialog"),
  aboutCloseBtn: $("aboutCloseBtn"),
  aboutRequestChannelBtn: $("aboutRequestChannelBtn"),
  homeInstallBanner: $("homeInstallBanner"),
  homeInstallBtn: $("homeInstallBtn"),
  homeDismissInstallBtn: $("homeDismissInstallBtn"),
  pwaPanel: $("pwaPanel"),
  installButton: $("installButton"),
  shareAppButton: $("shareAppButton"),
  copyShareLinkBtn: $("copyShareLinkBtn"),
  tgShareBtn: $("tgShareBtn"),
  shareCard: $("shareCard"),
  shareCounter: $("shareCounter"),
  usersCount: $("usersCount"),
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
    if (!Array.isArray(list)) return [...DEFAULT_CHANNELS];
    const saved = list.filter((ch) => ch && typeof ch.username === "string");
    const merged = DEFAULT_CHANNELS.map((defaultChannel) => {
      const stored = saved.find((ch) => ch.username.toLowerCase() === defaultChannel.username.toLowerCase());
      return { ...defaultChannel, ...(stored || {}), region: defaultChannel.region };
    });
    for (const ch of saved) {
      if (!merged.some((known) => known.username.toLowerCase() === ch.username.toLowerCase())) {
        merged.push({ ...ch, region: ch.region || "Кіровоградська область", isDefault: false });
      }
    }
    return merged;
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
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const mainContent = document.getElementById("mainContent");
  if (mainContent) mainContent.scrollTop = 0;
  if (name === "schedule") renderView();
  if (name === "home") fitRegionName();
  if (name === "source") {
    syncUsersCount();
    const intervalRadio = document.querySelector(`input[name="interval"][value="${settings.intervalMinutes}"]`);
    if (intervalRadio) intervalRadio.checked = true;
  }
}

const REGION_CHANNELS = {
  "Кіровоградська область": DEFAULT_CHANNELS,
};

function currentRegion() {
  const normalized = normalizeChannelInput(settings.channel).username.toLowerCase();
  const selected = channels.find((channel) => channel.username.toLowerCase() === normalized);
  return selected?.region || localStorage.getItem("sho-po-svitlu.region.v1") || "Кіровоградська область";
}

function setSelectedRegion(region) {
  try { localStorage.setItem("sho-po-svitlu.region.v1", region); } catch {}
}

function getRegionChannels(region) {
  const bundled = REGION_CHANNELS[region] || [];
  const added = channels.filter((channel) => !bundled.some((item) => item.username.toLowerCase() === channel.username.toLowerCase()) && (channel.region || "Кіровоградська область") === region);
  return [...bundled, ...added];
}


const customSelectInstances = new Map();

function initCustomSelect(selectEl, { getOptionMeta } = {}) {
  if (!selectEl) return null;
  if (customSelectInstances.has(selectEl)) {
    return customSelectInstances.get(selectEl);
  }

  const parent = selectEl.parentElement;
  if (parent && (parent.classList.contains("select-wrap") || parent.classList.contains("input-wrap"))) {
    parent.classList.remove("input-wrap", "select-wrap");
  }
  const wrap = document.createElement("div");
  wrap.className = "custom-select";
  parent.insertBefore(wrap, selectEl);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const label = document.createElement("span");
  label.className = "custom-select-label";

  const chevronSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevronSvg.setAttribute("class", "custom-select-chevron");
  chevronSvg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#i-chevron");
  chevronSvg.appendChild(use);

  trigger.append(label, chevronSvg);

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  wrap.append(trigger, menu, selectEl);
  selectEl.classList.add("sr-only");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closeAllCustomSelects();
    if (willOpen) {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      menu.querySelector(".custom-select-option.is-selected")?.scrollIntoView({ block: "nearest" });
    }
  });

  function sync() {
    menu.replaceChildren();
    const options = Array.from(selectEl.options);
    const selectedOption = options.find((opt) => opt.value === selectEl.value) || options[0];
    label.textContent = selectedOption ? selectedOption.textContent : "Оберіть зі списку";

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `custom-select-option${opt.value === selectEl.value ? " is-selected" : ""}`;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", String(opt.value === selectEl.value));

      const titleSpan = document.createElement("span");
      titleSpan.className = "custom-select-text";
      titleSpan.textContent = opt.textContent;
      btn.appendChild(titleSpan);

      if (typeof getOptionMeta === "function") {
        const meta = getOptionMeta(opt.value);
        if (meta) {
          const badge = document.createElement("span");
          badge.className = `custom-select-badge${meta.empty ? " empty" : ""}`;
          badge.textContent = meta.label;
          btn.appendChild(badge);
        }
      }

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        close();
        sync();
      });

      menu.appendChild(btn);
    });
  }

  function close() {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  const instance = { sync, close, trigger, menu, wrap };
  customSelectInstances.set(selectEl, instance);
  sync();
  return instance;
}

function syncCustomSelect(selectEl) {
  if (selectEl && customSelectInstances.has(selectEl)) {
    customSelectInstances.get(selectEl).sync();
  }
}

function closeAllCustomSelects() {
  customSelectInstances.forEach((inst) => inst.close());
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".custom-select")) {
    closeAllCustomSelects();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAllCustomSelects();
  }
});

function fillRegionSelect(select, selectedRegion = "Кіровоградська область", onlyAvailable = true) {
  if (!select) return;
  select.replaceChildren();
  const availableRegions = onlyAvailable ? UKRAINE_REGIONS.filter((region) => getRegionChannels(region).length > 0) : UKRAINE_REGIONS;
  availableRegions.forEach((region) => {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = onlyAvailable ? `${region} (${getRegionChannels(region).length} канал${getRegionChannels(region).length === 1 ? "" : "и"})` : region;
    option.selected = region === selectedRegion;
    select.append(option);
  });
  if (onlyAvailable && !availableRegions.includes(selectedRegion)) select.value = availableRegions[0] || "";
  syncCustomSelect(select);
}

function renderChannelsList() {
  if (!els.channelsList) return;
  els.channelsList.replaceChildren();
  const currentNormalized = normalizeChannelInput(settings.channel).username.toLowerCase();

  const region = els.settingsRegionSelect?.value || currentRegion();
  const regionChannels = getRegionChannels(region);
  if (els.regionChannelsHeading) els.regionChannelsHeading.textContent = `Доступні канали (${region})`;

  if (regionChannels.length === 0) {
    const empty = document.createElement("div");
    empty.className = "channels-empty";
    const p = document.createElement("p");
    p.textContent = "Для цієї області ще немає доданих каналів.";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "primary-btn";
    btn.style.padding = "8px 16px";
    btn.style.fontSize = "13.5px";
    btn.textContent = "Запропонувати канал";
    btn.addEventListener("click", () => openRequestDialog("new"));
    empty.append(p, btn);
    els.channelsList.append(empty);
    return;
  }

  regionChannels.forEach((ch) => {
    const index = channels.findIndex((channel) => channel.username.toLowerCase() === ch.username.toLowerCase());
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
    const regionTag = document.createElement("small");
    regionTag.className = "channel-region-tag";
    regionTag.textContent = ch.region || region;
    info.append(regionTag);

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
    setSelectedRegion(ch.region || currentRegion());
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
  if (!removed || removed.isDefault || index < 0) return;
  channels.splice(index, 1);
  saveChannels();
  if (settings.channel === removed.url) {
    selectChannel(channels[0]);
  } else {
    renderChannelsList();
  }
}

function openSettings() {
  fillRegionSelect(els.settingsRegionSelect, currentRegion());
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
  const regionTitle = known?.region || "Кіровоградська область";
  els.sourceName.textContent = channelTitle;
  els.sourceHandle.textContent = `t.me/s/${normalized.username}`;
  els.homeSourceName.textContent = channelTitle;
  if (els.homeRegionName) {
    els.homeRegionName.textContent = regionTitle;
    fitRegionName();
  }
}

// Підбирає розмір назви області, щоб вона займала один рядок і не заходила на лампочку.
function fitRegionName() {
  const el = els.homeRegionName;
  const box = el?.parentElement;
  const available = box?.clientWidth ?? 0;
  if (!el || !available) return; // екран «Стан» приховано — підберемо після показу
  const REFERENCE = 20;
  const MAX = 26;
  const MIN = 13;
  el.style.fontSize = `${REFERENCE}px`;
  const range = document.createRange();
  range.selectNodeContents(el);
  const needed = range.getBoundingClientRect().width;
  if (!needed) return;
  const size = Math.floor(((REFERENCE * (available - 1)) / needed) * 10) / 10;
  el.style.fontSize = `${Math.max(MIN, Math.min(MAX, size))}px`;
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
  document.body.toggleAttribute("data-loading", !data);
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
      const nextAction = state.powered ? "Вимкнуть: о" : "Увімкнуть: о";
      setNext(nextAction, formatClock(state.changeAt), `через ${left}`);
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

function openAboutApp() {
  if (els.aboutAppDialog) els.aboutAppDialog.showModal();
}

function closeAboutApp() {
  if (els.aboutAppDialog) els.aboutAppDialog.close();
}

if (els.aboutAppBtn) els.aboutAppBtn.addEventListener("click", openAboutApp);
if (els.closeAboutAppDialog) els.closeAboutAppDialog.addEventListener("click", closeAboutApp);
if (els.aboutCloseBtn) els.aboutCloseBtn.addEventListener("click", closeAboutApp);
if (els.aboutRequestChannelBtn) {
  els.aboutRequestChannelBtn.addEventListener("click", () => {
    closeAboutApp();
    openRequestDialog("new");
  });
}

[els.settingsDialog, els.requestChannelDialog, els.aboutAppDialog].forEach((dialog) => {
  if (dialog) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
});

els.openRequestChannelBtn.addEventListener("click", () => openRequestDialog("new"));
els.proposeChannelBtn.addEventListener("click", () => openRequestDialog("new"));
els.errorReport.addEventListener("click", () => openRequestDialog("broken", settings.channel));
els.closeRequestDialog.addEventListener("click", closeRequestDialog);
els.cancelRequestBtn.addEventListener("click", closeRequestDialog);
els.submitRequestBtn.addEventListener("click", submitChannelRequest);
els.settingsRegionSelect.addEventListener("change", () => {
  setSelectedRegion(els.settingsRegionSelect.value);
  renderChannelsList();
});
els.requestType.addEventListener("change", () => {
  if (els.requestType.value === "broken" && !els.requestChannelUrl.value.trim()) {
    els.requestChannelUrl.value = settings.channel;
  }
});

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
        region: els.settingsRegionSelect?.value || currentRegion(),
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

function openRequestDialog(type = "new", channelUrl = "") {
  fillRegionSelect(els.requestRegion, els.settingsRegionSelect?.value || currentRegion(), false);
  els.requestType.value = type;
  syncCustomSelect(els.requestType);
  els.requestChannelUrl.value = channelUrl;
  els.requestSender.value = "";
  els.requestNote.value = "";
  els.requestError.hidden = true;
  els.requestError.textContent = "";
  if (els.settingsDialog.open) closeSettings();
  els.requestChannelDialog.showModal();
}

function closeRequestDialog() {
  els.requestChannelDialog.close();
}

async function submitChannelRequest() {
  const channelUrl = els.requestChannelUrl.value.trim();
  const region = els.requestRegion.value;
  if (!channelUrl) {
    els.requestError.textContent = "Вкажіть посилання на канал або @username.";
    els.requestError.hidden = false;
    return;
  }
  try { normalizeChannelInput(channelUrl); } catch (error) {
    els.requestError.textContent = error.message;
    els.requestError.hidden = false;
    return;
  }

  const buttonText = els.submitRequestBtn.textContent;
  els.submitRequestBtn.disabled = true;
  els.submitRequestBtn.textContent = "Надсилаємо…";
  els.requestError.hidden = true;
  try {
    const result = await sendChannelRequest({
      workerUrl: settings.workerUrl,
      region,
      channelUrl,
      senderName: els.requestSender.value.trim(),
      requestType: els.requestType.value,
      note: els.requestNote.value.trim(),
    });
    closeRequestDialog();
    showToast(result.message || "Дякуємо! Запит надіслано.");
  } catch (error) {
    els.requestError.textContent = error.message || "Не вдалося надіслати запит. Спробуйте ще раз.";
    els.requestError.hidden = false;
  } finally {
    els.submitRequestBtn.disabled = false;
    els.submitRequestBtn.textContent = buttonText;
  }
}

// Перший запуск: вибір каналу та черги
let onboardChannel = null;
let onboardQueue = settings.queue;
let onboardMode = "setup";

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
  els.onboardStepNickname.hidden = step !== "nickname";
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

function openOnboarding({ nicknameOnly = false } = {}) {
  onboardMode = nicknameOnly ? "nickname" : "setup";
  onboardChannel = nicknameOnly ? channels.find((channel) => normalizeChannelInput(channel.url).url === normalizeChannelInput(settings.channel).url) || {
    name: normalizeChannelInput(settings.channel).username,
    url: normalizeChannelInput(settings.channel).url,
    username: normalizeChannelInput(settings.channel).username,
    isDefault: false,
  } : null;
  onboardQueue = settings.queue;
  els.onboardError.hidden = true;
  els.onboardNicknameError.hidden = true;
  els.onboardChannelInput.value = "";
  els.onboardNickname.value = "";
  els.onboardBackQueue.hidden = nicknameOnly;
  showOnboardStep(nicknameOnly ? "nickname" : "channel");
  els.onboardDialog.showModal();
}

function pickOnboardChannel(channel) {
  onboardChannel = channel;
  renderOnboardQueues();
  showOnboardStep("queue");
}

function saveProfile(profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch {}
}

function readStoredProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    if (!profile || typeof profile.nickname !== "string") return null;
    return { nickname: profile.nickname, registered: profile.registered === true };
  } catch {
    return null;
  }
}

function continueOnboardingToNickname() {
  if (!onboardChannel) return;
  els.onboardNicknameError.hidden = true;
  showOnboardStep("nickname");
  els.onboardNickname.focus();
}

async function finishOnboarding() {
  if (!onboardChannel) return;
  let nickname;
  try {
    nickname = normalizeSetupNickname(els.onboardNickname.value);
    els.onboardNicknameError.hidden = true;
  } catch (error) {
    els.onboardNicknameError.textContent = error.message;
    els.onboardNicknameError.hidden = false;
    els.onboardNickname.focus();
    return;
  }

  const buttonText = els.onboardDone.textContent;
  els.onboardDone.disabled = true;
  els.onboardDone.textContent = "Зберігаємо…";
  try {
    if (onboardMode === "setup") {
      const changed = normalizeChannelInput(onboardChannel.url).url !== normalizeChannelInput(settings.channel).url;
      if (!channels.some((ch) => ch.username.toLowerCase() === onboardChannel.username.toLowerCase())) {
        channels.push(onboardChannel);
        saveChannels();
      }
      settings.channel = normalizeChannelInput(onboardChannel.url).url;
      settings.queue = onboardQueue;
      saveSettings();
      if (changed) data = null;
    }
    saveProfile({ nickname, registered: false });
    markOnboarded();
    els.onboardDialog.close();
    initQueueOptions();
    renderChannelsList();
    renderView();
    if (settings.workerUrl) refresh({ manual: true, force: true });
    const synced = await syncUsersCount({ force: true });
    showToast(synced.excluded
      ? "Технічне налаштування збережено, до лічильника його не додано."
      : synced.ok
        ? "Налаштування збережено."
        : "Налаштування збережено. До лічильника додамо після з’єднання з сервером.");
  } finally {
    els.onboardDone.disabled = false;
    els.onboardDone.textContent = buttonText;
  }
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
els.onboardContinueNickname.addEventListener("click", continueOnboardingToNickname);
els.onboardBackQueue.addEventListener("click", () => showOnboardStep("queue"));
els.onboardDone.addEventListener("click", finishOnboarding);
els.onboardDialog.addEventListener("cancel", (event) => event.preventDefault());

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

// Лічильник користувачів: анонімний випадковий id пристрою зберігається одразу у трьох сховищах
// (localStorage, cookie, IndexedDB), щоб очищення одного з них не створювало «нового» користувача.
function isClientId(value) {
  return typeof value === "string" && CLIENT_ID_PATTERN.test(value);
}

function createClientId() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readIdCookie() {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CLIENT_ID_COOKIE}=([^;]+)`));
    return match && isClientId(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

function writeIdCookie(id) {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CLIENT_ID_COOKIE}=${id}; max-age=63072000; path=/; SameSite=Lax${secure}`;
  } catch {}
}

function withIdStore(mode, action) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("sho-po-svitlu", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("meta");
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const request = action(open.result.transaction("meta", mode).objectStore("meta"));
          request.onsuccess = () => { resolve(request.result ?? null); open.result.close(); };
          request.onerror = () => { resolve(null); open.result.close(); };
        } catch {
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

async function getClientId() {
  let id = null;
  try { id = localStorage.getItem(CLIENT_ID_KEY); } catch {}
  if (!isClientId(id)) id = readIdCookie();
  if (!isClientId(id)) id = await withIdStore("readonly", (store) => store.get("clientId"));
  if (!isClientId(id)) id = createClientId();
  try { localStorage.setItem(CLIENT_ID_KEY, id); } catch {}
  writeIdCookie(id);
  withIdStore("readwrite", (store) => store.put(id, "clientId"));
  return id;
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readUsersCache() {
  try {
    const value = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function renderUsersCount(count) {
  if (!els.shareCounter || !els.usersCount) return;
  if (!Number.isFinite(count) || count < 1) {
    els.shareCounter.hidden = true;
    return;
  }
  els.usersCount.textContent = count.toLocaleString("uk-UA");
  els.shareCounter.hidden = false;
}

let usersSyncedAt = 0;
let usersSyncPromise = null;

async function syncUsersCount({ force = false } = {}) {
  if (!settings.workerUrl) return { ok: false, excluded: false };
  if (usersSyncPromise) {
    return force ? usersSyncPromise.then(() => syncUsersCount({ force: true })) : usersSyncPromise;
  }
  if (!force && Date.now() - usersSyncedAt < 60_000) return { ok: true, excluded: false };

  usersSyncPromise = (async () => {
    try {
      const profile = readStoredProfile();
      let count;
      if (profile && !profile.registered) {
        const result = await registerCompletedSetup({
          workerUrl: settings.workerUrl,
          clientId: await getClientId(),
          nickname: profile.nickname,
        });
        if (!result) return { ok: false, excluded: false };
        saveProfile({ ...profile, registered: true });
        count = result.users;
        if (result.excluded) {
          usersSyncedAt = Date.now();
          try { localStorage.setItem(USERS_KEY, JSON.stringify({ count })); } catch {}
          renderUsersCount(count);
          return { ok: true, excluded: true };
        }
      } else {
        count = await fetchCompletedSetupsCount({ workerUrl: settings.workerUrl });
      }
      usersSyncedAt = Date.now();
      if (count === null) return { ok: false, excluded: false };
      try { localStorage.setItem(USERS_KEY, JSON.stringify({ count })); } catch {}
      renderUsersCount(count);
      return { ok: true, excluded: false };
    } catch {
      /* Якщо Worker недоступний, завершення буде повторно надіслано під час наступного синхронізування. */
      return { ok: false, excluded: false };
    }
  })();
  try {
    return await usersSyncPromise;
  } finally {
    usersSyncPromise = null;
  }
}

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
  if (settings.workerUrl) {
    refresh();
    syncUsersCount({ force: true });
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && settings.workerUrl) syncUsersCount();
});

// Initialize
initQueueOptions();
initCustomSelect(els.settingsRegionSelect);
initCustomSelect(els.requestRegion);
initCustomSelect(els.requestType);
updateShareLinks();
renderUsersCount(readUsersCache().count);
setActiveScreen("home");
renderView();
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("is-ready")));
scheduleAutoRefresh();
clockTimer = setInterval(() => {
  if (data) renderView();
}, 30_000);

if (settings.workerUrl) {
  refresh({ manual: false, force: false });
  syncUsersCount();
}
if (els.homeRegionName?.parentElement && "ResizeObserver" in window) {
  let lastWidth = 0;
  new ResizeObserver(() => {
    const width = els.homeRegionName.parentElement.clientWidth;
    if (width !== lastWidth) {
      lastWidth = width;
      fitRegionName();
    }
  }).observe(els.homeRegionName.parentElement);
}
document.fonts?.ready.then(fitRegionName);
if (needsOnboarding()) openOnboarding();
else if (!readStoredProfile()?.nickname) openOnboarding({ nicknameOnly: true });
