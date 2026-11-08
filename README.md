# ШоПоСвітлу

PWA для перегляду опублікованих графіків погодинних відключень. Фронтенд розміщується на Vercel; Cloudflare Worker і KV — спільний бекенд для всіх відвідувачів. **Власник сайту підключає Worker один раз; кінцевому користувачу достатньо ввести посилання на свій Telegram-канал і вибрати чергу.**

> Застосунок показує плановий графік з Telegram, а не телеметрію електромережі. Фактична наявність електроенергії може відрізнятися від плану.

## Локальна перевірка

Потрібен Node.js 18 або новіший.

```bash
npm test
npm run dev
```

## Одноразове налаштування Cloudflare власником сайту

1. У [Cloudflare Dashboard](https://dash.cloudflare.com/) відкрийте **Workers & Pages → KV** і створіть namespace, наприклад `sho-po-svitlu-schedules`.
2. Скопіюйте Namespace ID та замініть `REPLACE_WITH_KV_NAMESPACE_ID` у `worker/wrangler.toml`.
3. Розгорніть Worker:

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

4. Wrangler покаже адресу на зразок `https://sho-po-svitlu-api.<ваш-акаунт>.workers.dev`. Один раз вставте її в `public/config.js`:

```js
window.SHO_PO_SVITLU_CONFIG = Object.freeze({
  workerUrl: "https://sho-po-svitlu-api.<ваш-акаунт>.workers.dev",
});
```

Збережіть зміну в GitHub. Worker URL публічний і однаковий для всіх; **не додавайте у цей файл секрети чи токени**. Cron `*/5 * * * *` уже прописаний у `worker/wrangler.toml`; у Cloudflare перевірте **Workers & Pages → Settings → Triggers → Cron Triggers**. Cron оновлює типовий канал із `DEFAULT_CHANNEL`; вибрані користувачами канали Worker отримує під час запитів і кешує у KV.

## Одноразова публікація на Vercel

1. У [Vercel](https://vercel.com/) натисніть **Add New → Project** та імпортуйте GitHub-репозиторій `kdinya/sho-po-svitlu`.
2. Виберіть Framework Preset **Other**, Output Directory — `public`; Build Command та Install Command залиште порожніми.
3. Натисніть **Deploy**. Якщо репозиторій уже під'єднано до Vercel, push зміни `public/config.js` у `main` автоматично опублікує оновлений сайт.
4. За бажанням додайте домен у **Settings → Domains**.

## Налаштування для кінцевого користувача

У застосунку користувач задає лише публічне посилання/ім'я Telegram-каналу та інтервал оновлення 5, 15 або 30 хвилин. Чергу й день графіка можна змінювати на головному екрані. Worker URL не потрібно вводити на кожному пристрої: він читається зі спільного `public/config.js`. Оновлення виконується під час відкриття, повернення до вкладки, вручну та за вибраним інтервалом.

Worker приймає лише імена публічних Telegram-каналів, не довільні URL. Аналізує максимум п'ять останніх дописів і вибирає найновіший графік на сьогодні/завтра. Підтримуються дати `09.11.2026`, `09.11`, `2026-11-09` і відключення з хвилинами, наприклад `12-12:30`.

## Структура

- `public/` — адаптивний PWA-клієнт для Vercel.
- `public/config.js` — спільна публічна адреса Worker, заповнюється власником сайту один раз.
- `public/icons/` — SVG/PNG-іконки для домашнього екрана телефона.
- `worker/` — Cloudflare Worker, Telegram-парсер, API, KV binding і Cron.
- `worker/index.test.js` — модульні тести без мережевого доступу.
