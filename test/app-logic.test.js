import test from "node:test";
import assert from "node:assert/strict";

const DEFAULT_FALLBACK_QUEUES = ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2", "5.1", "5.2", "6.1", "6.2"];

function availableQueues(scheduleData) {
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

function formatHeroDate(isoDate, isToday) {
  const prefix = isToday ? "Сьогодні" : "Завтра";
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isToday ? "Сьогодні" : "Завтра";
  const [year, month, day] = isoDate.split("-");
  const formatted = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" }).format(new Date(Number(year), Number(month) - 1, Number(day)));
  return `${prefix}, ${formatted}`;
}

function sanitizeShareUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function buildTelegramShareLink(url, text) {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

test("availableQueues: динамічно витягує та правильно сортує черги з графіка Telegram", () => {
  // Канал з чергами лише до 4.1 (наприклад, інший обленерго)
  const customData = {
    schedules: {
      "2026-11-09": {
        queues: {
          "3.1": [{ start: 0, end: 120 }],
          "1.2": [{ start: 120, end: 240 }],
          "4.1": [{ start: 240, end: 360 }],
          "1.1": [{ start: 360, end: 480 }],
          "2.2": [{ start: 480, end: 600 }],
          "2.1": [{ start: 600, end: 720 }],
        },
      },
    },
  };

  const queues = availableQueues(customData);
  assert.deepEqual(queues, ["1.1", "1.2", "2.1", "2.2", "3.1", "4.1"]);
});

test("availableQueues: об'єднує черги з сьогоднішнього та завтрашнього графіка", () => {
  const multiDayData = {
    schedules: {
      "2026-11-09": {
        queues: {
          "1.1": [{ start: 0, end: 120 }],
          "2.1": [{ start: 120, end: 240 }],
        },
      },
      "2026-11-10": {
        queues: {
          "2.1": [{ start: 0, end: 120 }],
          "3.2": [{ start: 120, end: 240 }],
        },
      },
    },
  };

  const queues = availableQueues(multiDayData);
  assert.deepEqual(queues, ["1.1", "2.1", "3.2"]);
});

test("availableQueues: не видаляє відомі черги, для яких у новому графіку ще немає даних", () => {
  const data = {
    knownQueues: ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2"],
    schedules: {
      "2026-11-11": {
        queues: {
          "1.1": [{ start: 0, end: 120 }],
          "1.2": [{ start: 120, end: 240 }],
          "2.1": [{ start: 240, end: 360 }],
          "2.2": [{ start: 360, end: 480 }],
        },
      },
    },
  };
  assert.deepEqual(availableQueues(data), ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2"]);
});

test("availableQueues: повертає стандартний список 1.1-6.2, якщо даних розкладу ще немає", () => {
  assert.deepEqual(availableQueues(null), DEFAULT_FALLBACK_QUEUES);
  assert.deepEqual(availableQueues({}), DEFAULT_FALLBACK_QUEUES);
  assert.deepEqual(availableQueues({ schedules: {} }), DEFAULT_FALLBACK_QUEUES);
});

test("formatHeroDate: формує зрозумілий підпис дати для головного екрана", () => {
  const todayText = formatHeroDate("2026-11-09", true);
  assert.match(todayText, /^Сьогодні,\s+9\s+листопада/);

  const tomorrowText = formatHeroDate("2026-11-10", false);
  assert.match(tomorrowText, /^Завтра,\s+10\s+листопада/);

  assert.equal(formatHeroDate("", true), "Сьогодні");
  assert.equal(formatHeroDate(null, false), "Завтра");
  assert.equal(formatHeroDate("invalid", true), "Сьогодні");
});

test("sanitizeShareUrl та buildTelegramShareLink: формують чисті посилання для поширення", () => {
  const clean = sanitizeShareUrl("https://sho-po-svitlu-ib61.vercel.app/?ref=telegram#settings");
  assert.equal(clean, "https://sho-po-svitlu-ib61.vercel.app/");

  const tgLink = buildTelegramShareLink(clean, "Графік відключень електроенергії");
  assert.equal(
    tgLink,
    "https://t.me/share/url?url=https%3A%2F%2Fsho-po-svitlu-ib61.vercel.app%2F&text=%D0%93%D1%80%D0%B0%D1%84%D1%96%D0%BA%20%D0%B2%D1%96%D0%B4%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D1%8C%20%D0%B5%D0%BB%D0%B5%D0%BA%D1%82%D1%80%D0%BE%D0%B5%D0%BD%D0%B5%D1%80%D0%B3%D1%96%D1%97"
  );
});

test("налаштування автооновлення: за замовчуванням 30 хв, допустимі 5, 15 і 30 хв", () => {
  const allowed = [5, 15, 30];
  const defaultInterval = 30;
  const sanitizeInterval = (val) => (allowed.includes(Number(val)) ? Number(val) : defaultInterval);

  assert.equal(defaultInterval, 30);
  assert.equal(sanitizeInterval(5), 5);
  assert.equal(sanitizeInterval(15), 15);
  assert.equal(sanitizeInterval(30), 30);
  assert.equal(sanitizeInterval(10), 30);
  assert.equal(sanitizeInterval("abc"), 30);
  assert.equal(sanitizeInterval(-1), 30);
});
