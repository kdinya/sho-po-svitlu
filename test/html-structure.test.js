import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.resolve("public");
const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(PUBLIC_DIR, "js", "app.js"), "utf8");

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
