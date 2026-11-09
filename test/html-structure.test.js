import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.resolve("public");
const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(PUBLIC_DIR, "js", "app.js"), "utf8");
const css = fs.readFileSync(path.join(PUBLIC_DIR, "css", "style.css"), "utf8");

test("public/index.html: містить усі DOM ID, які викликаються з js/app.js", () => {
  const idsInAppJs = new Set();
  const idRegex = /\$\((["'])([^"']+)\1\)/g;
  let match;
  while ((match = idRegex.exec(appJs)) !== null) {
    idsInAppJs.add(match[2]);
  }

  assert.ok(idsInAppJs.size > 30, `Очікувалось понад 30 ID, знайдено ${idsInAppJs.size}`);

  const missing = [];
  for (const id of idsInAppJs) {
    const hasDoubleQuote = html.includes(`id="${id}"`);
    const hasSingleQuote = html.includes(`id='${id}'`);
    if (!hasDoubleQuote && !hasSingleQuote) {
      missing.append(id);
    }
  }

  assert.deepEqual(missing, [], `Усі ID з app.js мають бути присутні в index.html. Відсутні: ${missing.join(", ")}`);
});

test("public/index.html: не містить дублікатів ідентифікаторів (id)", () => {
  const idMatches = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
  const seen = new Set();
  const duplicates = new Set();

  for (const id of idMatches) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }

  assert.deepEqual([...duplicates], [], `Знайдено дублікати ID в index.html: ${[...duplicates].join(", ")}`);
});

test("public/index.html: підключає конфігурацію, модульний скрипт, стилі та маніфест", () => {
  assert.match(html, /<script\b[^>]*src=["'](?:\/)?config\.js["']/i, "Має підключатися config.js");
  assert.match(html, /<script\b[^>]*type=["']module["'][^>]*src=["'](?:\/)?js\/app\.js["']/i, "Має підключатися js/app.js як модуль");
  assert.match(html, /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'](?:\/)?css\/style\.css["']/i, "Мають підключатися стилі css/style.css");
  assert.match(html, /<link\b[^>]*rel=["']manifest["'][^>]*href=["'](?:\/)?manifest\.json["']/i, "Має підключатися manifest.json");
});

test("public/index.html: містить необхідні мета-теги для мобільних пристроїв та PWA", () => {
  assert.match(html, /<meta\b[^>]*name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i);
  assert.match(html, /<meta\b[^>]*name=["']theme-color["']/i);
  assert.match(html, /<meta\b[^>]*name=["']description["']/i);
});

test("public/index.html: містить ключові елементи встановлення та поширення додатку", () => {
  assert.match(html, /id=["']homeInstallBanner["']/);
  assert.match(html, /id=["']homeInstallBtn["']/);
  assert.match(html, /id=["']homeDismissInstallBtn["']/);
  assert.match(html, /id=["']shareCard["']/);
  assert.match(html, /id=["']shareAppButton["']/);
  assert.match(html, /id=["']copyShareLinkBtn["']/);
  assert.match(html, /id=["']tgShareBtn["']/);
});

test("головний екран показує назву каналу в шапці без окремої картки джерела", () => {
  assert.match(html, /class=["'][^"']*brand-subtitle[^"']*["'][^>]*id=["']homeSourceName["']/);
  assert.doesNotMatch(html, /id=["']homeSourceCard["']/);
  assert.doesNotMatch(html, /<small>Джерело даних<\/small>/);
});

test("частота перевірки розміщена в налаштуваннях і збережена окремо від діалогу каналів", () => {
  const settingsScreen = html.slice(html.indexOf('id="sourceScreen"'), html.indexOf('id="errorBanner"'));
  const channelDialog = html.slice(html.indexOf('id="settingsDialog"'), html.indexOf('id="onboardDialog"'));
  assert.match(settingsScreen, /id="frequencyTitle"/);
  assert.match(settingsScreen, /id="saveIntervalBtn"/);
  assert.match(settingsScreen, /name="interval" value="5"/);
  assert.doesNotMatch(channelDialog, /name="interval"/);
  assert.equal([...html.matchAll(/id="saveIntervalBtn"/g)].length, 1);
});

test("блоки відключень на головній та в розкладі однакові, називаються «Коли не буде світла» і містять бейджі кількості", () => {
  assert.match(html, /id=["']homeOutagesHeading["'][^>]*>[\s\S]*?Коли не буде світла\s*<span class=["']count-chip["'] id=["']homeOutageCount["']/);
  assert.match(html, /id=["']scheduleOutagesHeading["'][^>]*>[\s\S]*?Коли не буде світла\s*<span class=["']count-chip["'] id=["']outageCount["']/);
  assert.match(html, /class=["']channel-headline["'][\s\S]*?id=["']homeSourceName["']/);
});

test("головний екран містить блоки статистики «Зі світлом» та «Без світла» над графіком", () => {
  const homeScreen = html.slice(html.indexOf('id="homeScreen"'), html.indexOf('id="scheduleScreen"'));
  const statPos = homeScreen.indexOf('id="homeStatRow"');
  const chartPos = homeScreen.indexOf('id="homeOverviewHeading"');
  assert.ok(statPos !== -1, "homeStatRow має бути на головній сторінці");
  assert.ok(chartPos !== -1, "homeOverviewHeading має бути на головній сторінці");
  assert.ok(statPos < chartPos, "homeStatRow має бути розташований над графіком");
  assert.match(homeScreen, /id="homeStatOn"/);
  assert.match(homeScreen, /id="homeStatOff"/);
});

test("блоки статистики «Зі світлом» та «Без світла» містять відповідні лампочки на головній та в розкладі", () => {
  const homeScreen = html.slice(html.indexOf('id="homeScreen"'), html.indexOf('id="scheduleScreen"'));
  const scheduleScreen = html.slice(html.indexOf('id="scheduleScreen"'), html.indexOf('id="sourceScreen"'));

  for (const [screenName, screenHtml] of [["home", homeScreen], ["schedule", scheduleScreen]]) {
    assert.match(screenHtml, /class="stat stat-on"[\s\S]*?mascot-lightbulb\.webp/, `${screenName} stat-on має містити лампочку зі світлом`);
    assert.match(screenHtml, /class="stat stat-off"[\s\S]*?mascot-lightbulb-off\.webp/, `${screenName} stat-off має містити лампочку без світла`);
  }
});

test("app.js скидає прокрутку на початок сторінки та позначає наступну дію як Увімкнуть або Вимкнуть", () => {
  assert.match(appJs, /window\.scrollTo\(0,\s*0\)/, "setActiveScreen має викликати scrollTo на початок");
  assert.match(appJs, /state\.powered\s*\?\s*"Вимкнуть:\s*о"\s*:\s*"Увімкнуть:\s*о"/, "наступна дія має залежати від поточного стану мережі");
});

test("головний екран виводить назву області над назвою каналу", () => {
  assert.match(html, /class=["']channel-headline["'][\s\S]*?id=["']homeRegionName["'][\s\S]*?id=["']homeSourceName["']/);
});

test("налаштування містять кнопку довідки про додаток та діалог з описом роботи", () => {
  assert.match(html, /id=["']aboutAppBtn["']/);
  assert.match(html, /id=["']aboutAppDialog["'][\s\S]*?id=["']aboutDialogTitle["']/);
  assert.match(html, /id=["']aboutRequestChannelBtn["']/);
});

test("стилі містять правила для кастомних списків у неоновому стилі додатку", () => {
  assert.match(css, /\.custom-select-trigger/, "має містити кнопку-тригер кастомного списку");
  assert.match(css, /\.custom-select-menu/, "має містити меню випадаючого списку");
  assert.match(css, /\.custom-select-option/, "має містити стилі пунктів списку");
});

test("поля вибору областей і типу запиту не містять конфліктних обгорток input-wrap select-wrap", () => {
  assert.doesNotMatch(html, /input-wrap\s+select-wrap[\s\S]{0,80}id=["']settingsRegionSelect["']/);
  assert.doesNotMatch(html, /input-wrap\s+select-wrap[\s\S]{0,80}id=["']requestType["']/);
  assert.doesNotMatch(html, /input-wrap\s+select-wrap[\s\S]{0,80}id=["']requestRegion["']/);
});
