import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCountdown,
  formatDate,
  formatDuration,
  formatHours,
  getLocalClock,
  getScheduleState,
  minutesToTime,
  renderOutages,
  renderTimeline,
  totalMinutes,
} from "../public/js/timeline.js";

// Мінімальний DOM-мокап для перевірки рендерингу в Node.js без сторонніх бібліотек
class MockClassList {
  constructor() { this.classes = new Set(); }
  add(cls) { this.classes.add(cls); }
  delete(cls) { this.classes.delete(cls); }
  has(cls) { return this.classes.has(cls); }
  toggle(cls, cond) { if (cond) this.add(cls); else this.delete(cls); }
}

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.classList = new MockClassList();
    this.style = {};
    this.attributes = {};
    this.textContent = '';
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  append(...kids) { this.children.push(...kids); }
  replaceChildren(...kids) { this.children = kids; }
}

globalThis.document = {
  createElement: (tag) => new MockElement(tag),
  createElementNS: (_, tag) => new MockElement(tag),
  createTextNode: (text) => String(text),
};

test("minutesToTime: правильно переводить хвилини доби в формат HH:MM", () => {
  assert.equal(minutesToTime(0), "00:00");
  assert.equal(minutesToTime(65), "01:05");
  assert.equal(minutesToTime(720), "12:00");
  assert.equal(minutesToTime(1410), "23:30");
  assert.equal(minutesToTime(1440), "24:00");
  assert.equal(minutesToTime(-10), "00:00"); // межовий випадок
  assert.equal(minutesToTime(1500), "24:00"); // межовий випадок
});

test("formatDate: форматує дати у короткому та розгорнутому українському форматі", () => {
  assert.equal(formatDate("2026-11-09"), "09.11.2026");
  const longFormat = formatDate("2026-11-09", { long: true });
  assert.match(longFormat, /9.*листопада.*2026/);
  assert.equal(formatDate(""), "Очікуємо графік");
  assert.equal(formatDate("invalid-date"), "Очікуємо графік");
  assert.equal(formatDate(null), "Очікуємо графік");
});

test("getLocalClock: обчислює хвилини з початку доби та текстовий час", () => {
  const date = new Date(2026, 10, 9, 14, 25);
  const clock = getLocalClock(date);
  assert.equal(clock.minutes, 14 * 60 + 25);
  assert.equal(clock.time, "14:25");
});

test("getScheduleState: визначає стан живлення та наступну подію перемикання", () => {
  const periods = [
    { start: 240, end: 360 },  // 04:00 - 06:00
    { start: 720, end: 840 },  // 12:00 - 14:00
    { start: 1200, end: 1320 } // 20:00 - 22:00
  ];

  // Світло є, очікується перше відключення (02:00 = 120 хв)
  const beforeFirst = getScheduleState(periods, 120);
  assert.equal(beforeFirst.powered, true);
  assert.equal(beforeFirst.period, null);
  assert.equal(beforeFirst.changeAt, 240);
  assert.equal(beforeFirst.changeType, "off");

  // Триває перше відключення (04:30 = 270 хв)
  const duringFirst = getScheduleState(periods, 270);
  assert.equal(duringFirst.powered, false);
  assert.deepEqual(duringFirst.period, periods[0]);
  assert.equal(duringFirst.changeAt, 360);
  assert.equal(duringFirst.changeType, "on");

  // Рівно початок відключення (04:00 = 240 хв)
  const atStart = getScheduleState(periods, 240);
  assert.equal(atStart.powered, false);

  // Рівно кінець відключення (06:00 = 360 хв) — світло з'явилося
  const atEnd = getScheduleState(periods, 360);
  assert.equal(atEnd.powered, true);
  assert.equal(atEnd.changeAt, 720);
  assert.equal(atEnd.changeType, "off");

  // Всі відключення доби минули (23:00 = 1380 хв)
  const afterAll = getScheduleState(periods, 1380);
  assert.equal(afterAll.powered, true);
  assert.equal(afterAll.changeAt, null);
  assert.equal(afterAll.changeType, null);

  // Доба без відключень
  const noOutages = getScheduleState([], 500);
  assert.equal(noOutages.powered, true);
  assert.equal(noOutages.changeAt, null);
});

test("formatCountdown: обчислює зворотний відлік часу до події", () => {
  assert.equal(formatCountdown(720, 600), "02:00");
  assert.equal(formatCountdown(720, 715), "00:05");
  assert.equal(formatCountdown(720, 720), "00:00");
  assert.equal(formatCountdown(720, 750), "00:00");
  assert.equal(formatCountdown(null, 600), "—");
});

test("formatDuration: форматує тривалість відключення українською мовою", () => {
  assert.equal(formatDuration(0, 30), "30 хв");
  assert.equal(formatDuration(0, 120), "2 год");
  assert.equal(formatDuration(0, 150), "2 год 30 хв");
  assert.equal(formatDuration(240, 360), "2 год");
  assert.equal(formatDuration(100, 100), "0 хв");
});

test("totalMinutes та formatHours: правильно підраховують і форматують сумарний час", () => {
  const periods = [
    { start: 0, end: 120 },    // 2 год
    { start: 300, end: 450 },  // 2.5 год = 150 хв
  ];
  assert.equal(totalMinutes(periods), 270);
  assert.equal(formatHours(270), "4 год 30 хв");
  assert.equal(formatHours(120), "2 год");
  assert.equal(formatHours(45), "45 хв");
  assert.equal(totalMinutes([]), 0);
});

test("renderTimeline: створює сегменти графіка та встановлює маркер поточного часу", () => {
  const track = document.createElement("div");
  const marker = document.createElement("div");
  const currentTimeNode = document.createElement("span");
  const periods = [
    { start: 0, end: 120 },
    { start: 720, end: 840 },
  ];
  const now = new Date(2026, 10, 9, 12, 0); // 720 хв = 50% доби

  renderTimeline(track, marker, currentTimeNode, periods, now, { showNow: true });

  assert.equal(track.children.length, 2);
  assert.equal(track.children[0].style.left, "0%");
  assert.equal(track.children[0].style.width, `${(120 / 1440) * 100}%`);
  assert.equal(marker.style.left, "50%");
  assert.equal(marker.hidden, false);
  assert.equal(currentTimeNode.textContent, "12:00");
});

test("renderOutages: коректно формує список відключень або повідомлення про їх відсутність", () => {
  const container = document.createElement("div");
  const countNode = document.createElement("span");

  // Випадок без відключень
  renderOutages(container, countNode, []);
  assert.equal(countNode.textContent, "0");
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].className, "empty-state");

  // Випадок з відключеннями (поточний час 05:00 = 300 хв)
  const periods = [
    { start: 120, end: 240 }, // 02:00 - 04:00 (минуле)
    { start: 240, end: 360 }, // 04:00 - 06:00 (поточне)
    { start: 720, end: 840 }, // 12:00 - 14:00 (майбутнє)
  ];
  renderOutages(container, countNode, periods, 300, { highlightPast: true });
  assert.equal(countNode.textContent, "3");
  assert.equal(container.children.length, 3);
  assert.equal(container.children[0].classList.has("is-past"), true);
  assert.equal(container.children[1].classList.has("is-current"), true);
  assert.equal(container.children[2].classList.has("is-past"), false);
  assert.equal(container.children[2].classList.has("is-current"), false);

  const firstItem = container.children[0];
  const range = firstItem.children.find((c) => c.className === "outage-range");
  assert.ok(range, "повинен містити .outage-range");
  const startTime = range.children[0];
  const divider = range.children[1];
  const endTime = range.children[2];
  assert.equal(startTime.textContent, "02:00");
  assert.equal(endTime.textContent, "04:00");
  assert.equal(divider.children[0].textContent, "без світла - 2 год");
});
