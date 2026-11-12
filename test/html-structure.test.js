import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.resolve("public");
const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(PUBLIC_DIR, "js", "app.js"), "utf8");
const css = fs.readFileSync(path.join(PUBLIC_DIR, "css", "style.css"), "utf8");
const sw = fs.readFileSync(path.join(PUBLIC_DIR, "sw.js"), "utf8");
const readme = fs.readFileSync(path.resolve("README.md"), "utf8");

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
      missing.push(id);
    }
  }

  assert.deepEqual(missing, [], `Усі ID з app.js мають бути присутні в index.html. Відсутні: ${missing.join(", ")}`);
});

test("відкриті модальні вікна блокують прокручування та взаємодію з фоном", () => {
  assert.match(css, /html:has\(dialog\[open\]\) \{[^}]*overflow:\s*hidden;[^}]*overscroll-behavior:\s*none/);
  assert.match(css, /dialog\.sheet::backdrop \{[^}]*background:/);
  const dialogs = [...html.matchAll(/<dialog\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(dialogs.length >= 7, "усі спливаючі вікна мають залишатися нативними модальними діалогами");
  assert.match(appJs, /els\.settingsDialog\.showModal\(\)/);
  assert.match(appJs, /els\.requestChannelDialog\.showModal\(\)/);
  assert.match(appJs, /els\.onboardDialog\.showModal\(\)/);
  assert.match(appJs, /dialog\.showModal\(\)/);
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

test("після збереження назви черги фокус повертається на перемальовану опцію", () => {
  const submitHandler = appJs.match(/els\.queueNameForm\.addEventListener\("submit", \(event\) => \{([\s\S]*?)\n\}\);/)?.[1] ?? "";
  assert.ok(submitHandler, "має бути обробник збереження назви черги");
  const closeIndex = submitHandler.indexOf("dismissQueueNameDialog({ restoreFocus: false })");
  const renderIndex = submitHandler.indexOf("renderQueueOptions()", closeIndex);
  const focusIndex = submitHandler.indexOf("querySelector(`[data-queue=\"${queue}\"]`)?.focus()", renderIndex);
  assert.ok(closeIndex >= 0 && closeIndex < renderIndex && renderIndex < focusIndex, "спочатку закриваємо діалог, перемальовуємо список, потім повертаємо фокус на ту саму чергу");
  assert.ok(appJs.includes("function closeQueueNameDialog({ restoreFocus = true } = {})"));
  assert.doesNotMatch(appJs, /els\.queueNameInput\.focus\s*\(/, "відкриття редактора не повинно викликати клавіатуру автоматично");
  assert.match(appJs, /function showQueueDialog\(dialog\)[\s\S]*?dialog\.focus\(\{ preventScroll: true \}\)/);
  assert.match(appJs, /window\.visualViewport\?\.addEventListener\("resize", updateQueueDialogPosition\)/);
  assert.match(appJs, /els\.queueOptions\.querySelector\(\`\[data-queue="\$\{settings\.queue\}"\]\`\)\?\.focus\(\{ preventScroll: true \}\)/, "початковий фокус редактора не повинен прокручувати сторінку");
});

test("діалоги назв черг відкриваються по центру, а підпис над лампочкою вдвічі більший", () => {
  for (const id of ["queueNameIntroDialog", "queueNameDialog", "queueNameExitDialog"]) {
    assert.match(html, new RegExp(`id="${id}" tabindex="-1" autofocus`));
  }
  assert.match(css, /dialog\.sheet\.queue-dialog \{[^}]*margin:\s*auto/);
  assert.match(css, /transform:\s*translateY\(var\(--queue-dialog-viewport-shift, 0px\)\)/);
  assert.match(css, /body\[data-screen="home"\] \.queue-picker \{[^}]*position:\s*absolute;[^}]*top:\s*var\(--queue-picker-top/);
  assert.doesNotMatch(css.match(/body\[data-screen="home"\] \.queue-picker \{[^}]*\}/)?.[0] ?? "", /position:\s*fixed/);
  assert.match(appJs, /const lampDocumentTop = els\.mascot\.getBoundingClientRect\(\)\.top \+ scrollY/);
  assert.match(appJs, /const topbarDocumentTop = topbar\.getBoundingClientRect\(\)\.top \+ scrollY/);
  assert.match(appJs, /const centeredDocumentTop = \(lampDocumentTop - els\.queuePicker\.offsetHeight\) \/ 2/);
  assert.match(appJs, /const top = Math\.max\(0, centeredDocumentTop - topbarDocumentTop\)/);
  assert.match(css, /\.queue-trigger\.has-name \.queue-trigger-name \{[^}]*font-size:\s*22px/);
  assert.match(appJs, /function hasUncommittedQueueNameInput\(\)/);
  assert.match(appJs, /els\.queueNameDialog\.open && hasUncommittedQueueNameInput\(\)/);
  assert.match(appJs, /if \(wasNameDialogOpen\) commitQueueNameInput\(\)/);
  assert.match(appJs, /pendingInput \? "Вийти без збереження\?"/);
  assert.match(html, /id="queueNameExitCopy"/);
  assert.match(readme, /\[\*\*Перейти до ШоПоСвітлу →\*\*\]\(https:\/\/sho-po-svitlu-ib61\.vercel\.app\/\)/);
  assert.match(readme, /## Власні назви черг[\s\S]*?під номером вибраної черги[\s\S]*?підтвердження/);
  assert.match(sw, /sho-po-svitlu-shell-v62/);
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

test("крок ніку має прив’язаний заголовок, підказку та поле до елементів інтерфейсу", () => {
  assert.ok(appJs.includes('onboardNicknameTitle: $("onboardNicknameTitle")'));
  assert.ok(appJs.includes('onboardNicknameHelp: $("onboardNicknameHelp")'));
  for (const id of ["onboardNicknameTitle", "onboardNicknameHelp", "onboardNickname"]) {
    assert.ok(html.includes(`id="${id}"`), `HTML має містити елемент ${id}`);
  }
});

test("поверненому користувачу показує лише відкладений крок ніку, а новому лишає звичайне налаштування", () => {
  assert.match(appJs, /if \(requiresFirstSetup\) \{[\s\S]*?openOnboarding\(\);[\s\S]*?nicknameOnly: true/);
  assert.match(appJs, /requestAnimationFrame\(\(\) => \{[\s\S]*?openOnboarding\(\{ nicknameOnly: true \}\)/);
  assert.match(appJs, /profile\.nicknamePromptVersion < NICKNAME_PROMPT_VERSION/);
  assert.match(appJs, /nicknamePromptVersion: NICKNAME_PROMPT_VERSION/);
  assert.match(appJs, /Number\.isInteger\(profile\.nicknamePromptVersion\)/);
  assert.match(appJs, /const NICKNAME_PROMPT_VERSION = 1/);
  assert.doesNotMatch(appJs, /nicknamePromptCompleted|nicknameListed/);
});

test("лічильник має діалог тестових ніків, а поле чесно пояснює їх використання та видимість", () => {
  assert.match(html, /id="completedNicknamesDialog"/);
  assert.match(html, /id="completedNicknamesList"/);
  assert.match(html, /буде видимий іншим користувачам/);
  assert.match(html, /випадковий ID браузера/);
  assert.match(appJs, /counterTapCount >= 5/);
  assert.match(appJs, /completedNicknamesDialog\.showModal\(\)/);
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
  assert.match(sw, /CACHE_NAME = "sho-po-svitlu-shell-v62"/);
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



test("перший екран налаштування показує області за абеткою та відкривається по центру", () => {
  const apiJs = fs.readFileSync(path.join(PUBLIC_DIR, "js", "api.js"), "utf8");
  const regionsBlock = apiJs.match(/export const UKRAINE_REGIONS = \[([\s\S]*?)\];/)?.[1] ?? "";
  const regions = [...regionsBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(regions, [
    "Вінницька область", "Волинська область", "Дніпропетровська область", "Донецька область",
    "Житомирська область", "Закарпатська область", "Запорізька область", "Івано-Франківська область",
    "Київська область", "м. Київ", "Кіровоградська область", "Луганська область", "Львівська область",
    "Миколаївська область", "Одеська область", "Полтавська область", "Рівненська область",
    "Сумська область", "Тернопільська область", "Харківська область", "Херсонська область",
    "Хмельницька область", "Черкаська область", "Чернігівська область", "Чернівецька область",
  ]);
  assert.match(css, /dialog\.sheet\.welcome \{[^}]*margin:\s*auto/);
  assert.match(css, /dialog\.sheet\.welcome \{[^}]*max-height:\s*calc\(100dvh - 24px\)/);
  assert.match(css, /dialog\.sheet\.welcome \.sheet-box \{[^}]*border-radius:\s*30px/);
});

test("список областей у першому запуску підлаштовується до вільного місця діалогу", () => {
  assert.match(appJs, /\["onboardRegionSelect", "settingsRegionSelect"\]\.includes\(selectEl\.id\)/);
  assert.match(appJs, /const spaceAbove = Math\.max\(0, triggerRect\.top - bounds\.top - 10\)/);
  assert.match(appJs, /const spaceBelow = Math\.max\(0, bounds\.bottom - triggerRect\.bottom - 10\)/);
  assert.match(appJs, /menu\.classList\.toggle\("opens-up", spaceAbove > spaceBelow\)/);
  assert.match(appJs, /menu\.style\.maxHeight = `\$\{Math\.min\(240, Math\.max\(spaceAbove, spaceBelow\)\)\}px`/);
  assert.match(css, /\.custom-select-menu\.opens-up \{[^}]*bottom:\s*calc\(100% \+ 6px\)/);
  assert.match(css, /\.custom-select-menu \{[^}]*overscroll-behavior:\s*contain/);
});

test("заявка на канал у першому запуску має зрозумілий текст і вигляд кнопки", () => {
  const requestButton = html.match(/<button type="button" class="link-btn center" id="onboardRequestRegionBtn">([\s\S]*?)<\/button>/)?.[0] ?? "";
  assert.match(requestButton, /Подати заявку на свій канал у Telegram/);
  assert.match(appJs, /els\.onboardRequestRegionBtn\.addEventListener\("click"/);
  assert.match(css, /\.onboard-sources \.link-btn\.center \{[^}]*display:\s*flex;[^}]*min-height:\s*48px/);
  assert.match(css, /\.onboard-sources \.link-btn\.center:focus-visible \{[^}]*outline:\s*2px solid var\(--sun\)/);
});

test("перший запуск спочатку обирає область і показує тільки її джерела", () => {
  const onboarding = html.slice(html.indexOf('id="onboardDialog"'), html.indexOf('id="toast"'));
  assert.match(onboarding, /id="onboardRegionSelect"/);
  assert.match(onboarding, /id="onboardSourcesArea"[^>]*hidden/);
  assert.match(onboarding, /id="onboardSourcesList"/);
  assert.match(onboarding, /id="onboardRequestRegionBtn"/);
  assert.doesNotMatch(onboarding, /Світло Маловисківського району|id="onboardUseDefault"/);
  assert.match(appJs, /function populateOnboardRegions\(/);
  assert.match(appJs, /function renderOnboardSources\(/);
  assert.match(appJs, /getRegionChannels\(region\)/);
  assert.match(appJs, /getOptionMeta: \(region\) => \{/);
  assert.match(appJs, /label: "Немає каналів", empty: true/);
  assert.match(appJs, /Подати заявку на свій канал у Telegram/);
  assert.match(appJs, /openRequestDialog\("new", els\.onboardChannelInput\.value\.trim\(\), requestReturnRegion\)/);
  assert.match(appJs, /sendChannelRequest\(\{/);
  assert.match(css, /\.custom-select-option\.is-unavailable/);
  assert.match(css, /\.onboard-sources-list \.choice-card \{[^}]*padding: 8px 10px/);
  assert.match(css, /\.onboard-sources-list \.choice-card \.source-mark \{ width: 36px; height: 36px; \}/);
  assert.match(appJs, /Спочатку оберіть область для цього каналу/);
  assert.match(appJs, /requestReturnRegion/);
});


test("кавова кнопка підтримки відкриває доступну пропозицію підтримати проєкт", () => {
  const button = html.match(/<button class="support-link"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button, "має бути постійна кнопка підтримки поза окремими екранами");
  assert.match(button, /id="supportButton"/);
  assert.match(button, /aria-label="[^"]+"/);
  assert.match(button, /<use href="#i-coffee"/);
  assert.match(html, /<symbol id="i-coffee"/);
  assert.doesNotMatch(button, /<span>/);
  assert.match(html, /<dialog class="sheet support-dialog" id="supportDialog"[^>]*aria-labelledby="supportDialogTitle"/);
  assert.match(html, /Якщо ШоПоСвітлу допомагає тобі тримати графік під контролем/);
  assert.match(html, /href="https:\/\/send\.monobank\.ua\/jar\/e9Z2mHngN"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /Пригостити кавою/);
  assert.match(appJs, /supportButton\.addEventListener\("click", \(\) => els\.supportDialog\.showModal\(\)\)/);
  assert.match(appJs, /closeSupportDialog\.addEventListener/);
  assert.match(css, /\.support-link \{[\s\S]*?position:\s*fixed;[\s\S]*?right:\s*max\([\s\S]*?bottom:\s*calc\(var\(--nav-h\) \+ 14px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.support-dialog-actions/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});


test("області без каналів мають теплий, зрозумілий стан і дію для пропозиції джерела", () => {
  assert.match(appJs, /function createEmptyChannelsState\(\)/);
  assert.match(appJs, /title\.textContent = "Поки що без джерела"/);
  assert.match(appJs, /copy\.textContent = "Знаєте Telegram-канал із графіками для цієї області\? Надішліть його нам — перевіримо й додамо\."/);
  assert.match(appJs, /els\.channelsList\.append\(createEmptyChannelsState\(\)\)/);
  assert.match(appJs, /els\.onboardSourcesList\.append\(createEmptyChannelsState\(\)\)/);
  assert.match(appJs, /Запропонуйте канал для цієї області/);
  assert.doesNotMatch(appJs, /поки немає готових каналів/);
  assert.match(css, /\.onboard-empty-state \{[^}]*border-radius:\s*16px/);
  assert.match(css, /\.onboard-empty-title \{[^}]*color:\s*#ffe28b/);
});

test("вибір каналу в налаштуваннях повторює центрований екран першого запуску", () => {
  const dialogStart = html.lastIndexOf("<dialog", html.indexOf('id="settingsDialog"'));
  const dialog = html.slice(dialogStart, html.indexOf('id="requestChannelDialog"'));
  assert.match(dialog, /class="sheet welcome settings-picker"/);
  assert.match(dialog, /class="welcome-mascot"/);
  assert.match(dialog, /id="settingsRegionSelect"/);
  assert.match(dialog, /id="settingsSourcesArea"[^>]*hidden/);
  assert.match(dialog, /id="channelsList"/);
  assert.match(dialog, /id="settingsRequestRegionBtn"/);
  assert.match(dialog, /id="newChannelInput"/);
  assert.match(appJs, /function openSettings\(\{ region = currentRegion\(\) \} = \{\}\)/);
  assert.match(appJs, /const currentNormalized = normalizeChannelInput\(settings\.channel\)\.username\.toLowerCase\(\)/);
  assert.match(appJs, /const isSelected = channel\.username\.toLowerCase\(\) === currentNormalized/);
  assert.match(appJs, /els\.settingsRegionSelect\.value = region/);
  assert.match(appJs, /els\.settingsRegionSelect\.replaceChildren\(placeholder, \.\.\.options\)/);
  assert.match(appJs, /function renderChannelsList\(\)[\s\S]*?getRegionChannels\(region\)/);
  assert.match(appJs, /className = "choice-card settings-channel-choice"/);
  assert.match(appJs, /settingsRequestRegionBtn\.addEventListener/);
  assert.match(appJs, /returnToSettingsAfterRequest/);
  assert.match(appJs, /if \(dialog === els\.requestChannelDialog\) closeRequestDialog\(\)/);
  assert.match(appJs, /requestChannelDialog\.addEventListener\("cancel", \(event\) => \{ event\.preventDefault\(\); closeRequestDialog\(\); \}\)/);
  assert.match(css, /dialog\.sheet\.welcome \{[^}]*margin:\s*auto/);
  assert.match(css, /dialog\.sheet\.welcome \.sheet-box \{[^}]*border-radius:\s*30px/);
  assert.match(css, /\.settings-channel-choice\[aria-checked="true"\]/);
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

test("вибір черги містить кнопку редагування, список черг і підпис обраної черги", () => {
  assert.match(html, /id="editQueueNamesBtn"/);
  assert.match(html, /id="queueOptions"[\s\S]*?role="listbox"/);
  assert.match(html, /id="queueNameValue"[^>]*hidden/);
  assert.match(appJs, /queueNames\[settings\.queue\]/);
  assert.match(appJs, /areQueueNamesEqual\(queueNames, queueNameDraft\)/);
  assert.match(appJs, /QUEUE_NAMES_KEY = "sho-po-svitlu\.queue-names\.v1"/);
});

test("редагування назв має початкове пояснення, введення і підтвердження виходу без native dialogs", () => {
  assert.match(html, /id="queueNameIntroDialog"/);
  assert.match(html, /id="queueNameDialog"/);
  assert.match(html, /id="queueNameExitDialog"/);
  assert.match(html, /id="confirmSaveQueueNamesBtn"/);
  assert.match(appJs, /requestQueueNameEditExit/);
  assert.doesNotMatch(appJs, /\b(?:window\.)?(?:alert|confirm)\s*\(/);
});


test("новий модуль назв черг входить до PWA кешу", () => {
  assert.match(sw, /"\/js\/queue-names\.js"/);
});
