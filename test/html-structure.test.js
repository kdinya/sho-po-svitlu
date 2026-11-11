import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.resolve("public");
const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(PUBLIC_DIR, "js", "app.js"), "utf8");
const css = fs.readFileSync(path.join(PUBLIC_DIR, "css", "style.css"), "utf8");
const sw = fs.readFileSync(path.join(PUBLIC_DIR, "sw.js"), "utf8");

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
  assert.match(settingsScreen, /name="interval" value="30" checked/);
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

test("назва джерела на головній є доступним посиланням на активне джерело", () => {
  assert.match(html, /<a class="brand-subtitle home-source-link" id="homeSourceName"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(appJs, /els\.homeSourceName\.href = els\.sourceLink\.href/);
  assert.match(appJs, /els\.homeSourceName\.setAttribute\("aria-label", `Відкрити джерело графіка:/);
  assert.match(css, /\.home-source-link:focus-visible \{[^}]*outline: 2px solid var\(--sun\)/);
  assert.match(css, /\.home-source-link:hover \{[^}]*text-decoration: underline/);
});

test("налаштування містять кнопку довідки про додаток та діалог з описом роботи", () => {
  assert.match(html, /id=["']aboutAppBtn["']/);
  assert.match(html, /id=["']aboutAppDialog["'][\s\S]*?id=["']aboutDialogTitle["']/);
  assert.match(html, /id=["']aboutRequestChannelBtn["']/);
});

test("лампочка на головній доступна як кнопка й відкриває наявний діалог про додаток", () => {
  const homeScreen = html.slice(html.indexOf('id="homeScreen"'), html.indexOf('id="scheduleScreen"'));
  assert.match(homeScreen, /<button class="mascot mascot-button" id="mascot" type="button" aria-label="Як працює додаток" aria-haspopup="dialog" aria-controls="aboutAppDialog">[\s\S]*?<\/button>/);
  assert.match(appJs, /els\.mascot\.addEventListener\("click", openAboutApp\)/);
  assert.match(css, /\.mascot-button \{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.mascot-button:focus-visible \{[^}]*outline-offset:\s*4px/);
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

test("public/index.html: лічильник користувачів стоїть у картці поділу під кнопками", () => {
  const card = html.match(/<article class="card share-card" id="shareCard">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(card, "картка shareCard має існувати");
  assert.ok(card.indexOf('id="shareCounter"') > card.indexOf('class="share-buttons"'), "лічильник має бути під кнопками");
  assert.match(card, /Нас зараз: <b id="usersCount">/);
  assert.match(html, /<div class="heading-title-row">\s*<h1>Налаштування<\/h1>\s*<button class="info-circle-btn" id="aboutAppBtn"/);
});

test("назва області має попередній розмір в один рядок, а назва каналу лишається збільшеною", () => {
  const region = css.match(/\.channel-headline \.channel-region \{([^}]*)\}/)?.[1] ?? "";
  assert.match(region, /white-space:\s*nowrap/);
  assert.match(region, /font-size:\s*clamp\(15px,\s*4\.6vw,\s*20px\)/);
  assert.match(css, /\.channel-headline \{[^}]*width:\s*calc\(100% - var\(--mascot-w\) - 12px\)/);
  assert.match(css, /font-size:\s*clamp\(15\.75px,\s*4\.5vw,\s*18\.75px\)/);
  assert.doesNotMatch(appJs, /const SCALE = 1\.5/);
  assert.match(appJs, /el\.style\.fontSize = `\$\{Math\.max\(MIN, Math\.min\(MAX, size\)\)\}px`/);
});

test("лампочка прив'язана до попередньої позиції статусного блоку", () => {
  assert.match(css, /\.status-wrap \{[^}]*margin-top:\s*84px/);
  assert.match(css, /\.mascot \{[^}]*top:\s*-84px/);
  assert.match(css, /@media \(max-width: 390px\) \{[\s\S]*?\.mascot \{ top:\s*-70px; right:\s*0; \}\s*\.status-wrap \{ --mascot-w:\s*94px; margin-top:\s*74px; \}/);
});


test("прапор у шапці використовує оригінальний анімований GIF, зберігає розмір і має нерухомий варіант для reduced motion", () => {
  const brand = html.match(/<a class="brand"[\s\S]*?<\/a>/)?.[0] ?? "";
  assert.match(brand, /ШоПо<span>Світлу<\/span>/);
  assert.match(brand, /<picture class="brand-flag"[^>]*aria-label="Прапор України"/);
  assert.match(brand, /<source srcset="\/images\/ukraine-flag-header-still\.png" media="\(prefers-reduced-motion: reduce\)"/);
  assert.match(brand, /<img class="brand-flag-image" src="\/images\/ukraine-flag-header\.gif"[^>]*width="511" height="340"/);
  assert.match(css, /\.topbar \{[^}]*align-items:\s*center/);
  assert.match(css, /\.brand \{[^}]*align-items:\s*center/);
  assert.match(css, /\.brand-copy \{[^}]*position:\s*relative;[^}]*justify-content:\s*center;[^}]*height:\s*52px/);
  assert.match(css, /\.brand-flag \{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*-8px;[^}]*transform:\s*translateY\(-50%\);[^}]*z-index:\s*1;[^}]*width:\s*75px;[^}]*height:\s*54px;/);
  assert.match(css, /\.brand-title \{[^}]*position:\s*relative;[^}]*z-index:\s*2;[^}]*white-space:\s*nowrap;/);
  assert.match(css, /\.brand-flag-image \{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*contain/);
  assert.match(sw, /CACHE_NAME = "sho-po-svitlu-shell-v42"/);
  assert.match(sw, /"\/images\/ukraine-flag-header\.gif"/);
  assert.match(sw, /"\/images\/ukraine-flag-header-still\.png"/);
});

test("анімація очей керується станом живлення й враховує повагу до зменшення руху", () => {
  const homeScreen = html.slice(html.indexOf('id="homeScreen"'), html.indexOf('id="scheduleScreen"'));
  assert.match(homeScreen, /class="mascot-eyes mascot-eyes-on"/);
  assert.match(homeScreen, /class="mascot-eyes mascot-eyes-off"/);
  assert.match(css, /body\[data-power="on"\] \.mascot-eyes-on/);
  assert.match(css, /body\[data-power="off"\] \.mascot-eyes-off/);
  assert.match(css, /body\[data-loading\] \.mascot-eyes/);
  assert.match(css, /outageWake 10s/);
  assert.match(css, /outageSleep 10s/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});


test("опис у довідці пояснює вимоги до каналу та розпізнавання графіків серед новин", () => {
  assert.match(html, /бажано, щоб канал публікував лише графіки відключень/);
  assert.match(html, /перевіряє останні п’ять і знаходить графік/);
  assert.match(html, /Зображення графіків без текстового розкладу автоматично не розпізнаються/);
});


test("кнопка підтримки доступна на всіх екранах і безпечно відкриває банку в новій вкладці", () => {
  const link = html.match(/<a class="support-link"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(link, "має бути постійна кнопка підтримки поза окремими екранами");
  assert.match(link, /href="https:\/\/send\.monobank\.ua\/jar\/e9Z2mHngN"/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /aria-label="[^"]+"/);
  assert.match(link, />\s*<span>Підтримати<\/span>/);
  assert.match(css, /\.support-link \{[\s\S]*?position:\s*fixed;[\s\S]*?right:\s*max\([\s\S]*?bottom:\s*calc\(var\(--nav-h\) \+ 14px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});


test("налаштування доброзичливо пояснюють запит імені або ніку без технічних пояснень", () => {
  assert.match(html, /id="onboardNickname"[^>]*required/);
  assert.match(html, /id="onboardContinueNickname"/);
  assert.match(html, /id="onboardDone">Зберегти<\/button>/);
  assert.match(html, /Так спілкуватися приємніше/);
  assert.doesNotMatch(html, /shoposvitlu_bot|службов(ий|ого) нік|технічних перевірок/iu);
  assert.match(html, /Ваше ім’я або нік/);
  assert.match(appJs, /registerCompletedSetup\(/);
  assert.match(appJs, /fetchCompletedSetupsCount\(/);
  assert.match(appJs, /openOnboarding\(\{ nicknameOnly: true \}\)/);
  assert.match(appJs, /sho-po-svitlu\.profile\.v1/);
});
