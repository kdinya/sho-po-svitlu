import { DEFAULT_CHANNEL, DEFAULT_WORKER_URL, UKRAINE_REGIONS, fetchCompletedSetupsCount, fetchSchedule, normalizeChannelInput, normalizeSetupNickname, registerCompletedSetup, sendChannelRequest } from "./api.js";
import { formatDate, formatHours, formatMissingScheduleMessage, getLocalClock, getScheduleState, renderOutages, renderTimeline, totalMinutes } from "./timeline.js";
import { areQueueNamesEqual, normalizeQueueNames, QUEUE_NAME_MAX_LENGTH } from "./queue-names.js";

const STORAGE_KEY = "sho-po-svitlu.settings.v1";
const DATA_KEY = "sho-po-svitlu.last-data.v1";
const CHANNELS_KEY = "sho-po-svitlu.channels.v1";
const ONBOARD_KEY = "sho-po-svitlu.onboarded.v1";
const CLIENT_ID_KEY = "sho-po-svitlu.client-id.v1";
const USERS_KEY = "sho-po-svitlu.completed-settings-count.v1";
const PROFILE_KEY = "sho-po-svitlu.profile.v1";
const QUEUE_NAMES_KEY = "sho-po-svitlu.queue-names.v1";
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

const DEFAULTS = { channel: DEFAULT_CHANNEL, workerUrl: DEFAULT_WORKER_URL, queue: "6.2", intervalMinutes: 30 };
let QUEUES = [];

const $ = (id) => document.getElementById(id);

const els = {
  queueSelect: $("queueSelect"),
  queueValue: $("queueValue"),
  queueNameValue: $("queueNameValue"),
  queueMenu: $("queueMenu"),
  queueOptions: $("queueOptions"),
  editQueueNamesBtn: $("editQueueNamesBtn"),
  queueEditActions: $("queueEditActions"),
  cancelQueueNamesBtn: $("cancelQueueNamesBtn"),
  saveQueueNamesBtn: $("saveQueueNamesBtn"),
  queueNameIntroDialog: $("queueNameIntroDialog"),
  closeQueueNameIntro: $("closeQueueNameIntro"),
  cancelQueueNameIntro: $("cancelQueueNameIntro"),
  confirmQueueNameIntro: $("confirmQueueNameIntro"),
  queueNameDialog: $("queueNameDialog"),
  queueNameDialogTitle: $("queueNameDialogTitle"),
  queueNameForm: $("queueNameForm"),
  queueNameInput: $("queueNameInput"),
  closeQueueNameDialog: $("closeQueueNameDialog"),
  cancelQueueNameDialog: $("cancelQueueNameDialog"),
  queueNameExitDialog: $("queueNameExitDialog"),
  queueNameExitTitle: $("queueNameExitTitle"),
  queueNameExitCopy: $("queueNameExitCopy"),
  discardQueueNamesBtn: $("discardQueueNamesBtn"),
  continueQueueNamesBtn: $("continueQueueNamesBtn"),
  confirmSaveQueueNamesBtn: $("confirmSaveQueueNamesBtn"),
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
  onboardRegionSelect: $("onboardRegionSelect"),
  onboardSourcesArea: $("onboardSourcesArea"),
  onboardSourcesHeading: $("onboardSourcesHeading"),
  onboardSourcesList: $("onboardSourcesList"),
  onboardRequestRegionBtn: $("onboardRequestRegionBtn"),
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
  settingsSourcesArea: $("settingsSourcesArea"),
  settingsRequestRegionBtn: $("settingsRequestRegionBtn"),
  settingsChannelError: $("settingsChannelError"),
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
  newChannelInput: $("newChannelInput"),
  confirmAddChannelBtn: $("confirmAddChannelBtn"),
  saveIntervalBtn: $("saveIntervalBtn"),
  aboutAppBtn: $("aboutAppBtn"),
  mascot: $("mascot"),
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
  supportButton: $("supportButton"),
  supportDialog: $("supportDialog"),
  closeSupportDialog: $("closeSupportDialog"),
  laterSupportBtn: $("laterSupportBtn"),
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

function readStoredQueueNames() {
  try {
    return normalizeQueueNames(JSON.parse(localStorage.getItem(QUEUE_NAMES_KEY) || "{}"));
  } catch {
    return {};
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
let queueNames = readStoredQueueNames();
let queueNameDraft = null;
let editingQueueName = null;
let pendingQueueNameDialogExit = false;
let queuePickerPositionFrame = null;
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

function saveQueueNames(value) {
  try {
    localStorage.setItem(QUEUE_NAMES_KEY, JSON.stringify(normalizeQueueNames(value)));
    return true;
  } catch {
    showToast("Не вдалося зберегти назви черг у цьому браузері.");
    return false;
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
  (Array.isArray(scheduleData?.knownQueues) ? scheduleData.knownQueues : []).forEach((queue) => {
    if (/^[1-6]\.[12]$/.test(queue)) queues.add(queue);
  });
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

function renderQueueOptions() {
  const names = queueNameDraft ?? queueNames;
  els.queueOptions.replaceChildren(
    ...QUEUES.map((queue) => {
      const name = names[queue] || "";
      const option = document.createElement("button");
      option.type = "button";
      option.className = "queue-option";
      option.setAttribute("role", "option");
      option.dataset.queue = queue;
      option.setAttribute("aria-label", `Черга ${queue}${name ? `, ${name}` : ""}${queueNameDraft !== null ? ". Натисніть, щоб змінити назву" : ""}`);

      const number = document.createElement("span");
      number.className = "queue-option-number";
      number.textContent = queue;
      option.append(number);
      if (name || queueNameDraft !== null) {
        const label = document.createElement("span");
        label.className = "queue-option-name";
        label.textContent = name || "Додати назву";
        option.append(label);
      }
      option.addEventListener("click", () => {
        if (queueNameDraft !== null) openQueueNameDialog(queue);
        else selectQueue(queue);
      });
      return option;
    })
  );
  updateQueuePicker();
}

function initQueueOptions() {
  const wasEditing = queueNameDraft !== null;
  QUEUES = availableQueues();
  renderQueueOptions();
  if (wasEditing) setQueueMenu(true);
  else setQueueMenu(false);
}

function updateQueuePicker() {
  els.queueValue.textContent = settings.queue;
  const currentQueueName = queueNames[settings.queue] || "";
  els.queueNameValue.textContent = currentQueueName;
  els.queueNameValue.hidden = !currentQueueName;
  els.queueSelect.classList.toggle("has-name", Boolean(currentQueueName));
  els.queueSelect.setAttribute("aria-label", QUEUES.length ? `Обрана черга ${settings.queue}${currentQueueName ? `, ${currentQueueName}` : ""}. Натисніть, щоб змінити` : "Очікуємо список черг з Telegram");
  els.queueSelect.disabled = QUEUES.length === 0;
  scheduleQueuePickerPosition();
  els.queueOptions.querySelectorAll(".queue-option").forEach((option) => {
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

function beginQueueNameEdit() {
  queueNameDraft = { ...queueNames };
  pendingQueueNameDialogExit = false;
  els.queueMenu.classList.add("is-editing");
  els.editQueueNamesBtn.hidden = true;
  els.queueEditActions.hidden = false;
  renderQueueOptions();
  setQueueMenu(true);
  els.queueOptions.querySelector(`[data-queue="${settings.queue}"]`)?.focus({ preventScroll: true });
}

function finishQueueNameEdit(save) {
  if (queueNameDraft === null) return true;
  if (save) {
    const names = normalizeQueueNames(queueNameDraft);
    if (!saveQueueNames(names)) return false;
    queueNames = names;
    updateQueuePicker();
  }
  queueNameDraft = null;
  editingQueueName = null;
  pendingQueueNameDialogExit = false;
  els.queueMenu.classList.remove("is-editing");
  els.editQueueNamesBtn.hidden = false;
  els.queueEditActions.hidden = true;
  renderQueueOptions();
  setQueueMenu(false);
  return true;
}

function showQueueNameExitConfirmation({ pendingInput = false } = {}) {
  els.queueNameExitTitle.textContent = pendingInput ? "Вийти без збереження?" : "Зберегти назви черг?";
  els.queueNameExitCopy.textContent = pendingInput
    ? "Ти ввів назву, але ще не підтвердив її кнопкою «Готово». Вийти без збереження?"
    : "Ти змінив назви черг. Зберегти їх перед виходом із редагування?";
  showQueueDialog(els.queueNameExitDialog);
  els.continueQueueNamesBtn.focus({ preventScroll: true });
}

function requestQueueNameEditExit() {
  if (queueNameDraft === null) {
    setQueueMenu(false);
    return;
  }
  if (areQueueNamesEqual(queueNames, queueNameDraft)) {
    finishQueueNameEdit(false);
    return;
  }
  showQueueNameExitConfirmation();
}

function openQueueNameDialog(queue) {
  editingQueueName = queue;
  const currentName = queueNameDraft?.[queue] || "";
  els.queueNameDialogTitle.textContent = `Черга ${queue}`;
  els.queueNameInput.value = currentName;
  els.queueNameInput.maxLength = QUEUE_NAME_MAX_LENGTH;
  showQueueDialog(els.queueNameDialog);
}

function getQueueNameInputValue() {
  return Array.from(els.queueNameInput.value.trim()).slice(0, QUEUE_NAME_MAX_LENGTH).join("");
}

function hasUncommittedQueueNameInput() {
  if (!editingQueueName || queueNameDraft === null) return false;
  return getQueueNameInputValue() !== (queueNameDraft[editingQueueName] || "");
}

function commitQueueNameInput() {
  if (!editingQueueName || queueNameDraft === null) return;
  const name = getQueueNameInputValue();
  if (name) queueNameDraft[editingQueueName] = name;
  else delete queueNameDraft[editingQueueName];
}

function dismissQueueNameDialog({ restoreFocus = true } = {}) {
  if (els.queueNameDialog.open) els.queueNameDialog.close();
  const queue = editingQueueName;
  editingQueueName = null;
  if (restoreFocus && queue) els.queueOptions.querySelector(`[data-queue="${queue}"]`)?.focus({ preventScroll: true });
}

function closeQueueNameDialog({ restoreFocus = true } = {}) {
  if (els.queueNameDialog.open && hasUncommittedQueueNameInput()) {
    pendingQueueNameDialogExit = true;
    showQueueNameExitConfirmation({ pendingInput: true });
    return;
  }
  dismissQueueNameDialog({ restoreFocus });
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
  document.body.dataset.screen = name;
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
  if (name === "home") {
    fitRegionName();
    scheduleQueuePickerPosition();
  }
  if (name === "source") {
    syncUsersCount();
    const intervalRadio = document.querySelector(`input[name="interval"][value="${settings.intervalMinutes}"]`);
    if (intervalRadio) intervalRadio.checked = true;
  }
}

const BUILTIN_SOURCES = [
  {
    name: "Сумиобленерго · офіційний графік",
    url: "https://t.me/s/SumyEnergo",
    username: "SumyEnergo",
    region: "Сумська область",
    sourceLabel: "Офіційний Telegram-канал Сумиобленерго",
    sourcePage: "https://t.me/SumyEnergo",
    isDefault: true,
  },
  {
    name: "ДТЕК Дніпровські електромережі (ДнЕМ)",
    url: "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages",
    username: "source-dnipro-dtem",
    region: "Дніпропетровська область",
    sourceLabel: "Офіційні дані YASNO · ДТЕК ДнЕМ",
    sourcePage: "https://static.yasno.ua/dnipro/outages",
    isDefault: true,
  },
  {
    name: "ЦЕК · Дніпропетровська область",
    url: "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/303/planned-outages",
    username: "source-dnipro-cek",
    region: "Дніпропетровська область",
    sourceLabel: "Офіційні дані YASNO · ЦЕК",
    sourcePage: "https://static.yasno.ua/dnipro/outages",
    isDefault: true,
  },
  {
    name: "Черкасиобленерго · офіційний графік",
    url: "https://www.cherkasyoblenergo.com/api/v1/posts/main?lang=uk&limit=10",
    username: "source-cherkasy",
    region: "Черкаська область",
    sourceLabel: "Офіційний сайт Черкасиобленерго",
    sourcePage: "https://www.cherkasyoblenergo.com/media?category=news&lang=uk",
    isDefault: true,
  },
];

const REGION_CHANNELS = {
  "Кіровоградська область": DEFAULT_CHANNELS,
  "Сумська область": BUILTIN_SOURCES.filter((item) => item.region === "Сумська область"),
  "Дніпропетровська область": BUILTIN_SOURCES.filter((item) => item.region === "Дніпропетровська область"),
  "Черкаська область": BUILTIN_SOURCES.filter((item) => item.region === "Черкаська область"),
};

function findKnownSource(username) {
  return [...channels, ...BUILTIN_SOURCES].find((item) => item.username.toLowerCase() === username.toLowerCase());
}

function currentRegion() {
  const normalized = normalizeChannelInput(settings.channel).username.toLowerCase();
  const selected = findKnownSource(normalized);
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
      if (["onboardRegionSelect", "settingsRegionSelect"].includes(selectEl.id)) {
        const triggerRect = trigger.getBoundingClientRect();
        const sheetBox = selectEl.closest(".sheet-box");
        const bounds = sheetBox?.getBoundingClientRect();
        if (bounds) {
          const spaceAbove = Math.max(0, triggerRect.top - bounds.top - 10);
          const spaceBelow = Math.max(0, bounds.bottom - triggerRect.bottom - 10);
          menu.classList.toggle("opens-up", spaceAbove > spaceBelow);
          menu.style.maxHeight = `${Math.min(240, Math.max(spaceAbove, spaceBelow))}px`;
        }
      }
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
      const meta = typeof getOptionMeta === "function" ? getOptionMeta(opt.value) : null;
      btn.className = `custom-select-option${opt.value === selectEl.value ? " is-selected" : ""}${meta?.empty ? " is-unavailable" : ""}`;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", String(opt.value === selectEl.value));

      const titleSpan = document.createElement("span");
      titleSpan.className = "custom-select-text";
      titleSpan.textContent = opt.textContent;
      btn.appendChild(titleSpan);

      if (meta) {
        const badge = document.createElement("span");
        badge.className = `custom-select-badge${meta.empty ? " empty" : ""}`;
        badge.textContent = meta.label;
        btn.appendChild(badge);
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
  if (!els.channelsList || !els.settingsRegionSelect) return;
  els.channelsList.replaceChildren();
  const region = els.settingsRegionSelect.value;
  els.settingsSourcesArea.hidden = !region;
  if (!region) return;

  const currentNormalized = normalizeChannelInput(settings.channel).username.toLowerCase();
  const regionChannels = getRegionChannels(region);
  els.regionChannelsHeading.textContent = regionChannels.length
    ? `Доступні канали · ${region}`
    : `Для ${region.toLowerCase()} поки немає готових каналів`;

  if (regionChannels.length === 0) {
    const empty = document.createElement("p");
    empty.className = "welcome-lead onboard-empty-copy";
    empty.textContent = "Надішліть заявку, і я отримаю її в Telegram. Область уже буде вказана.";
    els.channelsList.append(empty);
    return;
  }

  regionChannels.forEach((channel) => {
    const index = channels.findIndex((item) => item.username.toLowerCase() === channel.username.toLowerCase());
    const isSelected = channel.username.toLowerCase() === currentNormalized;
    const item = document.createElement("div");
    item.className = "choice-card settings-channel-choice";
    item.setAttribute("role", "radio");
    item.setAttribute("aria-checked", String(isSelected));
    item.setAttribute("tabindex", "0");

    const mark = document.createElement("span");
    mark.className = "source-mark";
    mark.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-send" /></svg>';
    const copy = document.createElement("span");
    copy.className = "source-copy";
    const regionLabel = document.createElement("small");
    regionLabel.textContent = channel.sourceLabel || region;
    const name = document.createElement("strong");
    name.textContent = channel.name;
    copy.append(regionLabel, name);
    const action = document.createElement("span");
    action.className = "choice-go";
    action.textContent = isSelected ? "Обрано" : "Обрати";
    item.append(mark, copy, action);

    if (!channel.isDefault && index >= 0) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "channel-delete-btn";
      del.setAttribute("aria-label", `Видалити канал ${channel.name} зі списку`);
      del.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-trash" /></svg>';
      del.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteChannel(index);
      });
      item.append(del);
    }

    const choose = () => selectChannel(channel);
    item.addEventListener("click", (event) => {
      if (!event.target.closest(".channel-delete-btn")) choose();
    });
    item.addEventListener("keydown", (event) => {
      if (event.target === item && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        choose();
      }
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

function openSettings({ region = currentRegion() } = {}) {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Спочатку оберіть область";
  placeholder.disabled = true;
  placeholder.selected = true;
  const options = UKRAINE_REGIONS.map((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    return option;
  });
  els.settingsRegionSelect.replaceChildren(placeholder, ...options);
  els.settingsRegionSelect.value = region;
  syncCustomSelect(els.settingsRegionSelect);
  els.settingsChannelError.hidden = true;
  els.settingsChannelError.textContent = "";
  els.newChannelInput.value = "";
  renderChannelsList();
  els.settingsDialog.showModal();
}

function closeSettings() {
  els.settingsDialog.close();
}

function updateSource() {
  const normalized = normalizeChannelInput(settings.channel);
  els.sourceLink.href = normalized.url;
  const known = findKnownSource(normalized.username);
  const channelTitle = data?.title || known?.name || normalized.username;
  const regionTitle = known?.region || "Кіровоградська область";
  els.sourceLink.href = data?.sourceUrl || known?.sourcePage || normalized.url;
  const sourceEyebrow = els.sourceLink.closest(".source-panel")?.querySelector(".source-head .eyebrow");
  if (sourceEyebrow) sourceEyebrow.textContent = known?.sourceLabel || "Telegram";
  els.sourceName.textContent = channelTitle;
  els.sourceHandle.textContent = known?.sourceLabel || `t.me/s/${normalized.username}`;
  els.homeSourceName.textContent = channelTitle;
  els.homeSourceName.href = els.sourceLink.href;
  els.homeSourceName.setAttribute("aria-label", `Відкрити джерело графіка: ${channelTitle}`);
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
    emptyText: data && !hasSchedule ? formatMissingScheduleMessage(settings.queue, { isTomorrow: !isCurrentDay }) : data ? undefined : "Завантажуємо графік…",
  });
  renderTimeline(els.homeTimelineTrack, els.homeNowMarker, els.homeCurrentTime, periods, now, { showNow: isCurrentDay });
  renderOutages(els.homeOutageList, els.homeOutageCount, periods, isCurrentDay ? nowMinutes : 0, {
    highlightPast: isCurrentDay,
    emptyText: data && !hasSchedule ? formatMissingScheduleMessage(settings.queue, { isTomorrow: !isCurrentDay }) : data ? undefined : "Завантажуємо графік…",
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
    els.statusMeta.textContent = "Оновлюємо дані з обраного джерела...";
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
    els.statusMeta.textContent = data.stale
      ? `${data.warning || "Показано збережену копію графіка."} Перевірте першоджерело.`
      : `Черга ${settings.queue} · оновлено ${formatTimestamp(data.fetchedAt)}`;
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
  if (queueNameDraft !== null) requestQueueNameEditExit();
  else setQueueMenu(els.queueMenu.hidden);
});
els.editQueueNamesBtn.addEventListener("click", () => showQueueDialog(els.queueNameIntroDialog));
els.confirmQueueNameIntro.addEventListener("click", () => {
  els.queueNameIntroDialog.close();
  beginQueueNameEdit();
});
els.closeQueueNameIntro.addEventListener("click", () => els.queueNameIntroDialog.close());
els.cancelQueueNameIntro.addEventListener("click", () => els.queueNameIntroDialog.close());
els.queueNameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editingQueueName || queueNameDraft === null) return;
  const queue = editingQueueName;
  commitQueueNameInput();
  dismissQueueNameDialog({ restoreFocus: false });
  renderQueueOptions();
  els.queueOptions.querySelector(`[data-queue="${queue}"]`)?.focus();
});
els.closeQueueNameDialog.addEventListener("click", closeQueueNameDialog);
els.cancelQueueNameDialog.addEventListener("click", closeQueueNameDialog);
els.queueNameDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeQueueNameDialog();
});
els.saveQueueNamesBtn.addEventListener("click", () => finishQueueNameEdit(true));
els.cancelQueueNamesBtn.addEventListener("click", requestQueueNameEditExit);
els.discardQueueNamesBtn.addEventListener("click", () => {
  const wasNameDialogOpen = pendingQueueNameDialogExit;
  pendingQueueNameDialogExit = false;
  if (wasNameDialogOpen) dismissQueueNameDialog({ restoreFocus: false });
  els.queueNameExitDialog.close();
  finishQueueNameEdit(false);
});
els.continueQueueNamesBtn.addEventListener("click", () => {
  const wasNameDialogOpen = pendingQueueNameDialogExit;
  pendingQueueNameDialogExit = false;
  els.queueNameExitDialog.close();
  if (!wasNameDialogOpen) els.queueOptions.querySelector(`[data-queue="${settings.queue}"]`)?.focus({ preventScroll: true });
});
els.confirmSaveQueueNamesBtn.addEventListener("click", () => {
  const wasNameDialogOpen = pendingQueueNameDialogExit;
  if (wasNameDialogOpen) commitQueueNameInput();
  if (finishQueueNameEdit(true)) {
    pendingQueueNameDialogExit = false;
    if (wasNameDialogOpen) dismissQueueNameDialog({ restoreFocus: false });
    els.queueNameExitDialog.close();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (els.queueNameIntroDialog.open || els.queueNameDialog.open || els.queueNameExitDialog.open) return;
  if (!els.queuePicker.contains(event.target)) {
    if (queueNameDraft !== null && !areQueueNamesEqual(queueNames, queueNameDraft)) {
      event.preventDefault();
      event.stopPropagation();
      requestQueueNameEditExit();
    } else {
      if (queueNameDraft !== null) finishQueueNameEdit(false);
      setQueueMenu(false);
    }
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || els.queueNameIntroDialog.open || els.queueNameDialog.open || els.queueNameExitDialog.open) return;
  if (queueNameDraft !== null) {
    event.preventDefault();
    requestQueueNameEditExit();
  } else {
    setQueueMenu(false);
  }
});
function showQueueDialog(dialog) {
  dialog.showModal();
  dialog.focus({ preventScroll: true });
  updateQueueDialogPosition();
}

function scheduleQueuePickerPosition() {
  if (queuePickerPositionFrame !== null) return;
  queuePickerPositionFrame = requestAnimationFrame(() => {
    queuePickerPositionFrame = null;
    if (document.body.dataset.screen !== "home") return;
    const topbar = els.queuePicker.closest(".topbar");
    if (!topbar) return;
    topbar.style.setProperty("--queue-picker-space", `${Math.round(els.queuePicker.offsetWidth + 10)}px`);
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const lampDocumentTop = els.mascot.getBoundingClientRect().top + scrollY;
    const topbarDocumentTop = topbar.getBoundingClientRect().top + scrollY;
    const centeredDocumentTop = (lampDocumentTop - els.queuePicker.offsetHeight) / 2;
    const top = Math.max(0, centeredDocumentTop - topbarDocumentTop);
    els.queuePicker.style.setProperty("--queue-picker-top", `${Math.round(top)}px`);
  });
}

window.addEventListener("resize", scheduleQueuePickerPosition);
window.addEventListener("scroll", scheduleQueuePickerPosition, { passive: true });
if ("ResizeObserver" in window) {
  const queuePickerResizeObserver = new ResizeObserver(scheduleQueuePickerPosition);
  [els.queueSelect, els.queuePicker, els.homeInstallBanner, els.mascot].forEach((element) => {
    if (element) queuePickerResizeObserver.observe(element);
  });
}

function updateQueueDialogPosition() {
  const viewport = window.visualViewport;
  const layoutHeight = document.documentElement.clientHeight;
  const shift = viewport ? viewport.offsetTop + (viewport.height - layoutHeight) / 2 : 0;
  document.querySelectorAll("dialog.queue-dialog").forEach((dialog) => {
    dialog.style.setProperty("--queue-dialog-viewport-shift", `${Math.round(shift)}px`);
  });
}

window.addEventListener("resize", updateQueueDialogPosition);
window.visualViewport?.addEventListener("resize", updateQueueDialogPosition);
window.visualViewport?.addEventListener("scroll", updateQueueDialogPosition);
[els.queueNameIntroDialog, els.queueNameDialog, els.queueNameExitDialog].forEach((dialog) => {
  dialog.addEventListener("close", () => dialog.style.removeProperty("--queue-dialog-viewport-shift"));
});

[els.queueNameIntroDialog, els.queueNameDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      if (dialog === els.queueNameDialog) closeQueueNameDialog();
      else dialog.close();
    }
  });
});
els.queueNameExitDialog.addEventListener("cancel", (event) => event.preventDefault());

const selectDay = (day) => {
  activeDay = day;
  renderView();
  if (settings.workerUrl) refresh({ manual: false, force: false });
};
els.supportButton.addEventListener("click", () => els.supportDialog.showModal());
els.closeSupportDialog.addEventListener("click", () => els.supportDialog.close());
els.laterSupportBtn.addEventListener("click", () => els.supportDialog.close());
els.supportDialog.addEventListener("click", (event) => {
  if (event.target === els.supportDialog) els.supportDialog.close();
});

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
if (els.mascot) els.mascot.addEventListener("click", openAboutApp);
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
      if (event.target !== dialog) return;
      if (dialog === els.requestChannelDialog) closeRequestDialog();
      else dialog.close();
    });
  }
});

els.proposeChannelBtn.addEventListener("click", () => openRequestDialog("new"));
els.errorReport.addEventListener("click", () => openRequestDialog("broken", settings.channel));
els.closeRequestDialog.addEventListener("click", closeRequestDialog);
els.cancelRequestBtn.addEventListener("click", closeRequestDialog);
els.submitRequestBtn.addEventListener("click", submitChannelRequest);
els.requestChannelDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeRequestDialog(); });
els.settingsRegionSelect.addEventListener("change", renderChannelsList);
els.settingsRequestRegionBtn.addEventListener("click", () => {
  const region = els.settingsRegionSelect.value || currentRegion();
  returnToSettingsAfterRequest = true;
  requestReturnRegion = region;
  openRequestDialog("new", "", region);
});
els.requestType.addEventListener("change", () => {
  if (els.requestType.value === "broken" && !els.requestChannelUrl.value.trim()) {
    els.requestChannelUrl.value = settings.channel;
  }
});

els.confirmAddChannelBtn.addEventListener("click", () => {
  const val = els.newChannelInput.value.trim();
  if (!val) {
    els.settingsChannelError.textContent = "Введіть посилання на Telegram-канал або його @username.";
    els.settingsChannelError.hidden = false;
    return;
  }
  const region = els.settingsRegionSelect.value;
  if (!region) {
    els.settingsChannelError.textContent = "Спочатку оберіть область для цього каналу.";
    els.settingsChannelError.hidden = false;
    els.settingsRegionSelect.focus();
    return;
  }
  try {
    const normalized = normalizeChannelInput(val);
    els.settingsChannelError.hidden = true;
    const existing = channels.find((channel) => channel.username.toLowerCase() === normalized.username.toLowerCase());
    const known = BUILTIN_SOURCES.find((channel) => channel.username.toLowerCase() === normalized.username.toLowerCase());
    const existingChannel = existing || known;
    if (existingChannel) {
      const knownRegion = existingChannel.region || "Кіровоградська область";
      if (knownRegion !== region) throw new Error(`Це джерело належить до ${knownRegion}. Оберіть цю область у списку.`);
      selectChannel(existingChannel);
    } else {
      const newChannel = {
        name: normalized.username,
        url: normalized.url,
        username: normalized.username,
        region,
        isDefault: false,
      };
      channels.push(newChannel);
      saveChannels();
      selectChannel(newChannel);
    }
  } catch (err) {
    els.settingsChannelError.textContent = err.message;
    els.settingsChannelError.hidden = false;
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

function openRequestDialog(type = "new", channelUrl = "", selectedRegion = "") {
  fillRegionSelect(els.requestRegion, selectedRegion || els.settingsRegionSelect?.value || currentRegion(), false);
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

let returnToOnboardingAfterRequest = false;
let returnToSettingsAfterRequest = false;
let requestReturnRegion = "";

function closeRequestDialog() {
  els.requestChannelDialog.close();
  if (returnToOnboardingAfterRequest) {
    returnToOnboardingAfterRequest = false;
    const region = requestReturnRegion;
    requestReturnRegion = "";
    setTimeout(() => openOnboarding({ region }), 0);
  } else if (returnToSettingsAfterRequest) {
    returnToSettingsAfterRequest = false;
    const region = requestReturnRegion;
    requestReturnRegion = "";
    setTimeout(() => openSettings({ region }), 0);
  }
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

function populateOnboardRegions() {
  if (!els.onboardRegionSelect) return;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Спочатку оберіть область";
  placeholder.disabled = true;
  placeholder.selected = true;
  const options = UKRAINE_REGIONS.map((region) => {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    return option;
  });
  els.onboardRegionSelect.replaceChildren(placeholder, ...options);
  syncCustomSelect(els.onboardRegionSelect);
  renderOnboardSources();
}

function renderOnboardSources() {
  if (!els.onboardSourcesArea || !els.onboardSourcesList || !els.onboardRegionSelect) return;
  const region = els.onboardRegionSelect.value;
  els.onboardSourcesArea.hidden = !region;
  els.onboardSourcesList.replaceChildren();
  if (!region) return;

  const regionChannels = getRegionChannels(region);
  const hasChannels = regionChannels.length > 0;
  els.onboardSourcesHeading.textContent = hasChannels ? `Доступні канали · ${region}` : `Для ${region.toLowerCase()} поки немає готових каналів`;
  els.onboardRequestRegionBtn.classList.toggle("onboard-request-btn", !hasChannels);
  els.onboardRequestRegionBtn.textContent = "Подати заявку на свій канал у Telegram";
  if (!hasChannels) {
    const empty = document.createElement("p");
    empty.className = "welcome-lead onboard-empty-copy";
    empty.textContent = "Надішліть заявку, і я отримаю її в Telegram. Область уже буде вказана.";
    els.onboardSourcesList.append(empty);
    return;
  }

  regionChannels.forEach((channel) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-card";
    const mark = document.createElement("span");
    mark.className = "source-mark";
    mark.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-send" /></svg>';
    const copy = document.createElement("span");
    copy.className = "source-copy";
    const regionLabel = document.createElement("small");
    regionLabel.textContent = region;
    const name = document.createElement("strong");
    name.textContent = channel.name;
    copy.append(regionLabel, name);
    const action = document.createElement("span");
    action.className = "choice-go";
    action.textContent = "Обрати";
    button.append(mark, copy, action);
    button.addEventListener("click", () => pickOnboardChannel(channel));
    els.onboardSourcesList.append(button);
  });
}

function openOnboarding({ nicknameOnly = false, region = "" } = {}) {
  populateOnboardRegions();
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
  els.onboardRegionSelect.value = region;
  syncCustomSelect(els.onboardRegionSelect);
  renderOnboardSources();
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

els.onboardRegionSelect.addEventListener("change", renderOnboardSources);
els.onboardRequestRegionBtn.addEventListener("click", () => {
  requestReturnRegion = els.onboardRegionSelect.value;
  returnToOnboardingAfterRequest = true;
  els.onboardDialog.close();
  openRequestDialog("new", els.onboardChannelInput.value.trim(), requestReturnRegion);
});
els.onboardUseCustom.addEventListener("click", () => {
  try {
    const normalized = normalizeChannelInput(els.onboardChannelInput.value);
    const region = els.onboardRegionSelect.value;
    if (!region) throw new Error("Спочатку оберіть область для цього каналу.");
    const existing = channels.find((ch) => ch.username.toLowerCase() === normalized.username.toLowerCase());
    const known = BUILTIN_SOURCES.find((ch) => ch.username.toLowerCase() === normalized.username.toLowerCase());
    const knownRegion = known?.region || existing?.region || "Кіровоградська область";
    if ((known || existing) && knownRegion !== region) throw new Error(`Це джерело належить до ${knownRegion}. Оберіть цю область у списку.`);
    els.onboardError.hidden = true;
    pickOnboardChannel(existing || known || { name: normalized.username, url: normalized.url, username: normalized.username, region, isDefault: false });
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
    scheduleQueuePickerPosition();
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
  scheduleQueuePickerPosition();
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
initCustomSelect(els.settingsRegionSelect, {
  getOptionMeta: (region) => {
    if (!region) return null;
    const count = getRegionChannels(region).length;
    const suffix = count === 1 ? "канал" : count >= 2 && count <= 4 ? "канали" : "каналів";
    return count ? { label: `${count} ${suffix}`, empty: false } : { label: "Немає каналів", empty: true };
  },
});
initCustomSelect(els.onboardRegionSelect, {
  getOptionMeta: (region) => {
    if (!region) return null;
    const count = getRegionChannels(region).length;
    const suffix = count === 1 ? "канал" : count >= 2 && count <= 4 ? "канали" : "каналів";
    return count
      ? { label: `${count} ${suffix}`, empty: false }
      : { label: "Немає каналів", empty: true };
  },
});
initCustomSelect(els.onboardOfficialSource);
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
