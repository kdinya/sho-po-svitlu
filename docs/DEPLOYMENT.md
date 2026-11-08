# Технічний супровід

Цей документ призначений для супроводу коду. Користувацький опис і правила роботи застосунку містяться в кореневому [README](../README.md).

## Архітектура

- `public/` — статичний адаптивний PWA-клієнт, який публікується на Vercel.
- `public/config.js` — спільна адреса API Worker; значення публічне, секрети сюди не додають.
- `worker/index.js` — Cloudflare Worker API: безпечне читання публічного Telegram preview, розбір графіків, CORS і KV-кеш.
- `wrangler.jsonc` — конфігурація production Worker для Cloudflare Workers Builds із кореня репозиторію.
- `worker/wrangler.toml` — конфігурація для локальної розробки та окремого запуску Wrangler із `worker/`.
- `worker/index.test.js` — модульні тести парсера й API на вбудованому Node.js test runner.

Worker приймає ім'я або посилання на публічний Telegram-канал, а не довільну адресу. Він аналізує до п'яти останніх дописів, знаходить найновіші придатні розклади на сьогодні та завтра і кешує відповіді у KV. Cron у Wrangler-конфігурації запускається раз на п'ять хвилин для типового каналу; канали, які вказують відвідувачі, запитуються при зверненні до API.

## Production

- Вебзастосунок: <https://sho-po-svitlu-ib61.vercel.app/>
- Worker API: <https://sho-po-svitlu-api.k-dinya.workers.dev>
- Основна гілка: `main`.

Репозиторій підключений до Vercel для фронтенду й Cloudflare Workers Builds для API. У Cloudflare Build налаштування мають залишатися на корені репозиторію; deploy command — `npx wrangler deploy`. Wrangler читає кореневий `wrangler.jsonc`, який вказує на `worker/index.js` і KV binding `KV_BINDING`. У Vercel використовується статичний сайт з output directory `public` відповідно до `vercel.json`. Push до `main` запускає автоматичну публікацію.

Адреса Worker, записана у `public/config.js`, публічна й не є ключем доступу. Не зберігайте в публічних файлах токени, секрети або особисті облікові дані.

## Локальна перевірка

Потрібен Node.js 18 або новіший.

```bash
npm test
npm run dev
```

Для локального запуску Worker окремо:

```bash
cd worker
npx wrangler dev
```

Після зміни парсера запустіть `npm test`. Тести використовують локальні приклади й не вимагають Telegram-токена.
