# ШоПоСвітлу

PWA для перегляду опублікованих графіків погодинних відключень. Фронтенд розміщується на Vercel, API та розбір публічних Telegram-дописів працюють у Cloudflare Worker, структурований кеш зберігається в Cloudflare KV.

> Застосунок показує плановий графік з Telegram, а не телеметрію електромережі. Фактична наявність електроенергії може відрізнятися від плану.

## Локальний запуск і перевірка

Потрібен Node.js 18 або новіший.

```bash
npm test
npm run dev
```

Відкрийте URL локального сервера. У меню налаштувань задайте Worker URL після його розгортання. Налаштування й черга зберігаються у браузері.

## Розгортання API у Cloudflare

1. Увійдіть у [Cloudflare Dashboard](https://dash.cloudflare.com/) і відкрийте **Workers & Pages → KV**.
2. Створіть namespace із назвою, наприклад, `sho-po-svitlu-schedules`, скопіюйте його Namespace ID.
3. У репозиторії відкрийте `worker/wrangler.toml` і замініть `REPLACE_WITH_KV_NAMESPACE_ID` у binding `SCHEDULES` на цей ID.
4. Встановіть Node.js, увійдіть у Cloudflare через Wrangler та опублікуйте Worker:

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

5. Wrangler виведе адресу виду `https://sho-po-svitlu-api.<ваш-акаунт>.workers.dev`. Скопіюйте її та додайте у налаштуваннях застосунку. Перевірте `/api/health` і `/api/schedule?channel=https%3A%2F%2Ft.me%2Fs%2FSvitloMalovyskivskohoRaionu`.
6. Cron `*/5 * * * *` оновлює канал за замовчуванням із `DEFAULT_CHANNEL` у `worker/wrangler.toml`. Інтервал 5/15/30 хв у PWA окремо визначає, як часто саме цей браузер запитує Worker. Інший канал оновлюється при запиті клієнта та кешується у KV.

У реальному Worker перевірте **Settings → Triggers → Cron Triggers**, що графік `*/5 * * * *` активний. За потреби застосуйте зміни налаштувань повторним `npx wrangler deploy`.

## Публікація фронтенду на Vercel

1. У [Vercel](https://vercel.com/) натисніть **Add New → Project** та імпортуйте GitHub-репозиторій `kdinya/sho-po-svitlu`.
2. Виберіть Framework Preset **Other**. Build Command залиште порожнім, Output Directory задайте `public`, Install Command можна залишити порожнім.
3. Натисніть **Deploy**. У застосунку відкрийте ⚙ налаштування, укажіть Worker URL і збережіть.
4. За бажанням додайте домен у Vercel → Settings → Domains.

## Налаштування програми

На головній сторінці можна змінювати чергу та день графіка. У налаштуваннях можна змінити публічний URL/ім'я Telegram-каналу, Worker endpoint та інтервал автооновлення 5, 15 або 30 хвилин. Зміна каналу тригерить негайне оновлення. Ручне оновлення доступне кнопкою; також програма оновлюється під час відкриття та повернення у вкладку.

Worker приймає лише імена публічних каналів Telegram; він не проксіює довільні URL. Аналізуються щонайбільше п'ять останніх дописів. Для дати графіка приймаються формати `09.11.2026`, `09.11` і `2026-11-09`; інтервали відключення можуть містити хвилини, наприклад `12-12:30`.

## Структура

- `public/` — адаптивний PWA-клієнт для Vercel.
- `public/icons/` — SVG та PNG-іконки для домашнього екрана телефона.
- `worker/` — Cloudflare Worker, Telegram-парсер, API та Cron.
- `worker/index.test.js` — модульні тести парсера без доступу до мережі.
