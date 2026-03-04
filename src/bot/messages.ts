export const MESSAGES = {
  WELCOME: (referralLink: string) => `
👋 Добро пожаловать в <b>ProstoAI</b>!

Доступ к лучшим AI-моделям прямо в Telegram, без VPN, оплата в рублях.

<b>Что я умею:</b>
• Отвечать на любые вопросы (текст)
• Генерировать изображения (напишите: нарисуй...)
• Анализировать фото (отправьте фото)
• Расшифровывать голосовые сообщения

<b>🎁 Бесплатно каждый день:</b>
• 10 текстовых запросов (Gemini Flash)
• 2 изображения (Imagen Fast)

Просто напишите что-нибудь, чтобы начать!

🔗 Ваша реферальная ссылка: ${referralLink}
Приглашайте друзей — оба получите по 50 000 токенов!
`,

  WELCOME_BACK: `С возвращением! Просто напишите ваш вопрос или выберите модель через /menu`,

  HELP: `
<b>❓ Справка ProstoAI</b>

<b>Как работают токены?</b>
Токены — внутренняя валюта бота. Каждый запрос к AI списывает токены в зависимости от модели:
• Gemini Flash — x1 (самый экономный)
• DeepSeek R1 — x1.3
• Claude Haiku — x2
• GPT-4.1 — x3.3

<b>Доступные модели:</b>
• 💬 Чат: Gemini Flash, DeepSeek R1, Claude Haiku, GPT-4.1
• 🎨 Изображения: Imagen Fast, Nano Banana 2, GPT Image 1.5
• 📷 Анализ фото: Gemini Vision
• 🎤 Голос: Whisper

<b>Как купить токены?</b>
Используйте команду /buy — оплата через ЮKassa (карта, СБП) или Telegram Stars.

<b>Реферальная программа:</b>
/ref — получите ссылку. Каждый приглашённый друг даёт вам и ему по 50 000 токенов!

<b>Команды:</b>
/menu — выбрать модель вручную
/balance — ваш баланс
/buy — купить токены
/ref — реферальная ссылка
/mode — авто/ручной режим
/stats — статистика
/privacy — политика конфиденциальности
/terms — условия использования
`,

  BALANCE: (tokens: number, textLeft: number, imgLeft: number, expiring: number, permanent: number) => `
💰 <b>Ваш баланс: ${tokens.toLocaleString('ru-RU')} токенов</b>

📊 Breakdown:
• Временные (сгорают): ${expiring.toLocaleString('ru-RU')} токенов
• Постоянные: ${permanent.toLocaleString('ru-RU')} токенов

🎁 <b>Бесплатно сегодня:</b>
• Текст: ${textLeft}/10 запросов осталось
• Изображения: ${imgLeft}/2 запросов осталось
`,

  BUY_PROMPT: `🛒 <b>Выберите пакет токенов:</b>

<i>Временные пакеты действуют 30 дней, постоянные — бессрочно.</i>`,

  NO_BALANCE: `
❌ <b>Бесплатные запросы на сегодня исчерпаны!</b>

Купите токены, чтобы продолжить общение с AI.
Токены не сгорают (постоянные пакеты) или действуют 30 дней.
`,

  REFERRAL: (link: string, count: number, earned: number) => `
🔗 <b>Ваша реферальная ссылка:</b>

<code>${link}</code>

Поделитесь с друзьями — вы <b>оба</b> получите по 50 000 токенов!

📊 Статистика:
• Приглашено друзей: ${count}
• Заработано токенов: ${earned.toLocaleString('ru-RU')}
`,

  PROCESSING: '🤔 <i>Думаю...</i>',

  ERROR_GENERAL: '❌ Что-то пошло не так. Попробуйте ещё раз или выберите другую модель через /menu',
  ERROR_TIMEOUT: '⏱ Запрос занял слишком много времени. Попробуйте ещё раз.',
  ERROR_RATE_LIMIT: '⚡ Слишком много запросов. Подождите немного.',
  ERROR_SERVICE: '🔧 AI-сервис временно недоступен. Попробуйте позже.',

  FREE_HINT: (remaining: number, type: 'text' | 'image') =>
    `💡 У вас осталось <b>${remaining}</b> бесплатных ${type === 'text' ? 'текстовых запросов' : 'запросов на изображения'} сегодня.`,

  MODEL_SELECTED: (displayName: string) =>
    `✅ Модель переключена на <b>${displayName}</b>.\n\nОтправьте любое сообщение!`,

  AUTO_MODE: '🔄 Переключено в <b>авто-режим</b>. Модель выбирается автоматически под каждый запрос.',

  REFERRAL_BONUS: (tokens: number) =>
    `🎉 Ваш друг зарегистрировался по вашей ссылке! +${tokens.toLocaleString('ru-RU')} токенов на ваш счёт!`,

  PAYMENT_SUCCESS: (tokens: number, packageName: string) =>
    `✅ <b>Оплата прошла успешно!</b>\n\nПакет "${packageName}" активирован.\n+${tokens.toLocaleString('ru-RU')} токенов зачислено на ваш счёт.`,

  PROMO_SUCCESS: (tokens: number) =>
    `🎁 Промокод применён! +${tokens.toLocaleString('ru-RU')} токенов зачислено.`,

  PROMO_INVALID: '❌ Промокод недействителен или уже использован.',

  PRIVACY_POLICY: `
<b>Политика конфиденциальности ProstoAI</b>

Мы собираем: Telegram ID, username, историю запросов (для статистики).
Данные не передаются третьим лицам.
Для удаления аккаунта: напишите в поддержку.
`,

  TERMS_OF_SERVICE: `
<b>Условия использования ProstoAI</b>

1. Сервис предоставляется "как есть".
2. Запрещено использование для генерации вредоносного контента.
3. Токены не возвращаются после использования.
4. Временные токены сгорают через 30 дней.
5. Мы вправе заблокировать аккаунт за нарушение правил.
`,

  STATS_USER: (requests: number, tokensSpent: number, favoriteModel: string, daysActive: number, referrals: number) => `
📊 <b>Ваша статистика</b>

• Всего запросов: ${requests}
• Токенов потрачено: ${tokensSpent.toLocaleString('ru-RU')}
• Любимая модель: ${favoriteModel}
• Дней активности: ${daysActive}
• Приглашено друзей: ${referrals}
`,

  STATS_ADMIN: (data: {
    totalUsers: number;
    activeToday: number;
    activeWeek: number;
    activeMonth: number;
    revenueTotal: number;
    revenueToday: number;
    revenueMonth: number;
    requestsToday: number;
    newUsersToday: number;
    topModels: { model: string; count: number }[];
    freeRatio: number;
  }) => `
📊 <b>Статистика платформы</b>

👥 <b>Пользователи:</b>
• Всего: ${data.totalUsers}
• Сегодня новых: ${data.newUsersToday}
• Активны сегодня: ${data.activeToday}
• Активны за неделю: ${data.activeWeek}
• Активны за месяц: ${data.activeMonth}

💰 <b>Выручка:</b>
• Сегодня: ${(data.revenueToday / 100).toFixed(0)} ₽
• За месяц: ${(data.revenueMonth / 100).toFixed(0)} ₽
• Всего: ${(data.revenueTotal / 100).toFixed(0)} ₽

📨 <b>Запросы сегодня:</b> ${data.requestsToday}
🎁 <b>Доля бесплатных:</b> ${data.freeRatio}%

🤖 <b>Топ моделей:</b>
${data.topModels.map((m, i) => `${i + 1}. ${m.model}: ${m.count}`).join('\n')}
`,
};
