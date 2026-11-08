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
  for (const period of visible) {
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
  }
}
