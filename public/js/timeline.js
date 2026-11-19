const MINUTES_PER_DAY = 1440;

export function minutesToTime(minutes) {
  const safe = Math.max(0, Math.min(MINUTES_PER_DAY, Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function formatDate(isoDate, options = {}) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "Очікуємо графік";
  const [year, month, day] = isoDate.split("-");
  if (options.long) return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(new Date(Number(year), Number(month) - 1, Number(day)));
  return `${day}.${month}.${year}`;
}

function getKyivDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    iso: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function formatScheduleChangesLabel(postedAt, messageText = "", { now = new Date() } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowKyiv = getKyivDateParts(nowDate);

  if (postedAt) {
    const date = new Date(postedAt);
    if (!Number.isNaN(date.getTime())) {
      const postedKyiv = getKyivDateParts(date);
      const time = new Intl.DateTimeFormat("uk-UA", {
        timeZone: "Europe/Kyiv",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);

      if (postedKyiv.iso === nowKyiv.iso) {
        return `(зміни на ${time})`;
      }
      const datePart = postedKyiv.year === nowKyiv.year
        ? `${postedKyiv.day}.${postedKyiv.month}`
        : `${postedKyiv.day}.${postedKyiv.month}.${postedKyiv.year}`;
      return `(зміни на ${time}, ${datePart})`;
    }
  }

  if (typeof messageText === "string" && messageText.trim()) {
    const timeMatch = messageText.match(/(?:станом\s+на|о|об)\s+(\d{1,2})[:.](\d{2})/iu)
      ?? messageText.match(/(?:з|від)\s+(\d{1,2}):(\d{2})/iu)
      ?? messageText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (timeMatch) {
      const hours = Number(timeMatch[1]);
      const minutes = timeMatch[2];
      const timeStr = `${hours}:${minutes}`;

      const dateMatch = messageText.match(/(?:від|за|допис\s+від|повідомлення\s+від)?\s*\b(\d{1,2})[.\/](\d{2})\b/iu);
      if (dateMatch) {
        const day = dateMatch[1].padStart(2, "0");
        const month = dateMatch[2].padStart(2, "0");
        if (day !== nowKyiv.day || month !== nowKyiv.month) {
          return `(зміни на ${timeStr}, ${day}.${month})`;
        }
      }
      return `(зміни на ${timeStr})`;
    }
  }

  return "";
}

export function getLocalClock(now = new Date()) {
  return { minutes: now.getHours() * 60 + now.getMinutes(), time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` };
}

export function getScheduleState(periods = [], nowMinutes) {
  const current = periods.find((period) => nowMinutes >= period.start && nowMinutes < period.end);
  if (current) return { powered: false, period: current, changeAt: current.end, changeType: "on" };
  const next = periods.find((period) => period.start > nowMinutes);
  if (next) return { powered: true, period: null, changeAt: next.start, changeType: "off" };
  return { powered: true, period: null, changeAt: null, changeType: null };
}

export function formatCountdown(targetMinutes, nowMinutes) {
  if (targetMinutes == null) return "—";
  const difference = Math.max(0, targetMinutes - nowMinutes);
  const hours = Math.floor(difference / 60);
  const minutes = difference % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function mergeIntervals(periods = []) {
  const merged = [];
  for (const period of [...periods].sort((left, right) => left.start - right.start || left.end - right.end)) {
    const last = merged.at(-1);
    if (last && period.start <= last.end) last.end = Math.max(last.end, period.end);
    else merged.push({ ...period });
  }
  return merged;
}

export function preserveElapsedOutages(previousPeriods = [], currentPeriods = [], nowMinutes = 0) {
  if (!Array.isArray(previousPeriods) || !previousPeriods.length) return currentPeriods || [];
  if (!Array.isArray(currentPeriods)) currentPeriods = [];
  const preserved = previousPeriods.flatMap((period) => {
    if (period.end <= nowMinutes) return [period];
    if (period.start < nowMinutes && period.end > nowMinutes
      && !currentPeriods.some((current) => current.start <= nowMinutes && current.end > nowMinutes)) {
      return [{ start: period.start, end: nowMinutes }];
    }
    return [];
  });
  const currentAndFuture = currentPeriods.filter((period) => period.end > nowMinutes);
  return mergeIntervals([...preserved, ...currentAndFuture]);
}

function kyivMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

export function extractEffectiveMinutes(messageText, postedAt, fallbackMinutes = 0) {
  if (typeof messageText === "string") {
    const match = messageText.match(/(?:станом\s+на|з|від|о|об)\s+(\d{1,2})[:.](\d{2})/iu);
    if (match) {
      const hours = Number(match[1]);
      const mins = Number(match[2]);
      if (hours >= 0 && hours < 24 && mins >= 0 && mins < 60) {
        return hours * 60 + mins;
      }
    }
  }
  if (postedAt) {
    const date = new Date(postedAt);
    if (!Number.isNaN(date.getTime())) {
      return kyivMinutes(date);
    }
  }
  return fallbackMinutes;
}

export function mergeClientScheduleData(existingData, incomingData, now = new Date()) {
  if (!existingData || !incomingData) return incomingData;
  if (!incomingData.today || existingData.today !== incomingData.today) return incomingData;
  const existingSchedule = existingData.schedules?.[existingData.today];
  const incomingSchedule = incomingData.schedules?.[incomingData.today];
  if (!existingSchedule?.queues || !incomingSchedule?.queues) return incomingData;

  const { minutes: nowMinutes } = getLocalClock(now);
  const cutoffMinutes = extractEffectiveMinutes(incomingSchedule.messageText, incomingSchedule.postedAt, nowMinutes);
  const mergedQueues = { ...incomingSchedule.queues };
  for (const [queue, prevPeriods] of Object.entries(existingSchedule.queues)) {
    const nextPeriods = mergedQueues[queue] ?? [];
    mergedQueues[queue] = preserveElapsedOutages(prevPeriods, nextPeriods, cutoffMinutes);
  }

  return {
    ...incomingData,
    schedules: {
      ...incomingData.schedules,
      [incomingData.today]: {
        ...incomingSchedule,
        queues: mergedQueues,
      },
    },
  };
}

export function renderTimeline(track, marker, currentTimeNode, periods = [], now = new Date(), { showNow = true } = {}) {
  track.replaceChildren();
  track.classList.toggle("is-empty", !periods.length);
  for (const period of periods) {
    const segment = document.createElement("span");
    segment.className = "outage-segment";
    segment.style.left = `${(period.start / MINUTES_PER_DAY) * 100}%`;
    segment.style.width = `${((period.end - period.start) / MINUTES_PER_DAY) * 100}%`;
    segment.setAttribute("aria-label", `Відключення з ${minutesToTime(period.start)} до ${minutesToTime(period.end)}`);
    track.append(segment);
  }
  const { minutes, time } = getLocalClock(now);
  marker.style.left = `${Math.min(100, (minutes / MINUTES_PER_DAY) * 100)}%`;
  marker.hidden = !showNow;
  marker.setAttribute("aria-label", `Поточний час ${time}`);
  currentTimeNode.textContent = time;
}

export function formatDuration(start, end) {
  const diff = Math.max(0, end - start);
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (!hours) return `${mins} хв`;
  if (!mins) return `${hours} год`;
  return `${hours} год ${mins} хв`;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgIcon(id) {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("class", "icon");
  icon.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  icon.append(use);
  return icon;
}

export function formatMissingScheduleMessage(queue, { isTomorrow = false } = {}) {
  if (isTomorrow) {
    return `Графік на завтра для черги ${queue} ще не знайдено. Можливо, джерело ще не опублікувало його. Перевірте трохи пізніше.`;
  }
  return `Дані графіка для черги ${queue} поки не знайдено. Перевірте джерело пізніше.`;
}

export function totalMinutes(periods = []) {
  return periods.reduce((sum, period) => sum + Math.max(0, period.end - period.start), 0);
}

export function formatHours(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins} хв`;
  return mins ? `${hours} год ${mins} хв` : `${hours} год`;
}

export function renderOutages(container, countNode, periods = [], nowMinutes = 0, { highlightPast = true, hidePast = false, emptyText } = {}) {
  container.replaceChildren();
  const visible = hidePast ? periods.filter((period) => period.end > nowMinutes) : periods;
  countNode.textContent = String(visible.length);
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const orb = document.createElement("span");
    orb.className = "empty-orb";
    const text = document.createElement("p");
    text.textContent = emptyText || (periods.length ? "На сьогодні більше відключень не планується." : "Планових відключень немає — світло за графіком увесь день.");
    empty.append(orb, text);
    container.append(empty);
    return;
  }
  visible.forEach((period, index) => {
    if (index > 0) {
      const prev = visible[index - 1];
      const divider = document.createElement("div");
      divider.className = "outage-divider";
      if (highlightPast && period.start <= nowMinutes) divider.classList.add("is-past");
      if (highlightPast && nowMinutes >= prev.end && nowMinutes < period.start) divider.classList.add("is-current");
      const dividerLabel = document.createElement("span");
      dividerLabel.className = "outage-divider-label";
      dividerLabel.textContent = `зі світлом — ${formatDuration(prev.end, period.start)}`;
      divider.append(dividerLabel);
      container.append(divider);
    }

    const item = document.createElement("div");
    item.className = "outage-item";
    const isCurrent = highlightPast && nowMinutes >= period.start && nowMinutes < period.end;
    if (highlightPast && period.end <= nowMinutes) item.classList.add("is-past");
    if (isCurrent) item.classList.add("is-current");
    const bolt = document.createElement("span");
    bolt.className = "outage-bolt";
    bolt.append(svgIcon("i-bolt"));
    const time = document.createElement("time");
    time.textContent = `${minutesToTime(period.start)} – ${minutesToTime(period.end)}`;
    const duration = document.createElement("span");
    duration.className = "outage-duration";
    duration.append(svgIcon("i-clock"), document.createTextNode(formatDuration(period.start, period.end)));
    item.append(bolt, time, duration);
    container.append(item);
  });
}
