import { Markup } from 'telegraf';

export function mainMenuKeyboard(activeHelperLabel?: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🧠 GPT-5.2', 'model_gpt-5.2'),
      Markup.button.callback('🍌 Nano Banana 2', 'model_nano-banana-2'),
    ],
    [
      Markup.button.callback('💬 Чат-модели', 'menu_chat'),
      Markup.button.callback('🎨 Создать фото', 'menu_image'),
    ],
    [
      Markup.button.callback(activeHelperLabel ?? '🎭 Помощники', 'helpers_menu'),
    ],
    [
      Markup.button.callback('👤 Мой профиль', 'profile'),
      Markup.button.callback('💎 Купить токены', 'buy_tokens'),
    ],
  ]);
}

export function helpersMenuKeyboard(hasActive: boolean) {
  const rows = [
    [Markup.button.callback('✍️ Копирайтер', 'helper_select:copywriter')],
    [Markup.button.callback('🌍 Переводчик', 'helper_select:translator')],
    [Markup.button.callback('💻 Программист', 'helper_select:programmer')],
    [Markup.button.callback('🔍 SEO-специалист', 'helper_select:seo')],
    [Markup.button.callback('🇬🇧 Репетитор английского', 'helper_select:english_tutor')],
    [Markup.button.callback('📊 Маркетолог', 'helper_select:marketer')],
    [Markup.button.callback('📱 SMM-менеджер', 'helper_select:smm')],
    [Markup.button.callback('🏋️ Нутрициолог и тренер', 'helper_select:fitness')],
  ] as ReturnType<typeof Markup.button.callback>[][];

  if (hasActive) {
    rows.push([Markup.button.callback('❌ Отключить помощника', 'helper_disable')]);
  }
  rows.push([Markup.button.callback('◀️ В главное меню', 'back_menu')]);

  return Markup.inlineKeyboard(rows);
}

export function helperSelectedKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🎭 Сменить помощника', 'helpers_menu'),
      Markup.button.callback('❌ Отключить', 'helper_disable'),
    ],
    [Markup.button.callback('◀️ В главное меню', 'back_menu')],
  ]);
}

export function chatModelsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⚡ GPT-4.1 Mini', 'model_gpt-4.1-mini'),
      Markup.button.callback('🧠 GPT-5 Mini', 'model_gpt-5-mini'),
    ],
    [
      Markup.button.callback('🌟 GPT-4o', 'model_gpt-4o'),
      Markup.button.callback('🧠 GPT-5.2', 'model_gpt-5.2'),
    ],
    [Markup.button.callback('◀️ В главное меню', 'back_menu')],
  ]);
}

export function imageModelsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🖼 GPT Image Mini', 'model_gpt-image-1-mini'),
      Markup.button.callback('🍌 Nano Banana 2', 'model_nano-banana-2'),
    ],
    [
      Markup.button.callback('🎨 GPT Image 1', 'model_gpt-image-1'),
      Markup.button.callback('✨ GPT Image 1.5', 'model_gpt-image-1.5'),
    ],
    [
      Markup.button.callback('🌈 DALL-E 3', 'model_dall-e-3'),
      Markup.button.callback('◀️ В главное меню', 'back_menu'),
    ],
  ]);
}

export function visionModelsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📸 GPT-4o Vision', 'model_gpt-4o-vision')],
    [Markup.button.callback('« Назад', 'back_menu')],
  ]);
}

export function audioModelsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎤 Whisper', 'model_whisper')],
    [Markup.button.callback('« Назад', 'back_menu')],
  ]);
}

export interface PackageConfig {
  id: string;
  name: string;
  tokens: number;
  priceRub: number;
  priceStars: number;
  type: 'EXPIRING' | 'PERMANENT';
  expiryDays?: number;
}

export const TOKEN_PACKAGES: PackageConfig[] = [
  // Expiring (30 days)
  { id: 'starter', name: 'Starter', tokens: 100_000, priceRub: 99, priceStars: 55, type: 'EXPIRING', expiryDays: 30 },
  { id: 'basic', name: 'Basic', tokens: 250_000, priceRub: 249, priceStars: 139, type: 'EXPIRING', expiryDays: 30 },
  { id: 'standard', name: 'Standard', tokens: 500_000, priceRub: 399, priceStars: 222, type: 'EXPIRING', expiryDays: 30 },
  { id: 'pro', name: 'Pro', tokens: 1_500_000, priceRub: 990, priceStars: 550, type: 'EXPIRING', expiryDays: 30 },
  { id: 'ultra', name: 'Ultra', tokens: 5_000_000, priceRub: 2990, priceStars: 1662, type: 'EXPIRING', expiryDays: 30 },
  // Permanent
  { id: 'mini', name: 'Mini', tokens: 50_000, priceRub: 99, priceStars: 55, type: 'PERMANENT' },
  { id: 'medium', name: 'Medium', tokens: 200_000, priceRub: 349, priceStars: 194, type: 'PERMANENT' },
  { id: 'large', name: 'Large', tokens: 500_000, priceRub: 699, priceStars: 389, type: 'PERMANENT' },
  { id: 'xl', name: 'XL', tokens: 1_000_000, priceRub: 990, priceStars: 550, type: 'PERMANENT' },
];

export function buyKeyboard() {
  return Markup.inlineKeyboard([
    // Expiring (30 days)
    [
      Markup.button.callback('💰 Starter 100k — 99₽ (30д)', 'buy_starter'),
      Markup.button.callback('💎 Basic 250k — 249₽ (30д)', 'buy_basic'),
    ],
    [
      Markup.button.callback('⭐ Standard 500k — 399₽ (30д)', 'buy_standard'),
      Markup.button.callback('🚀 Pro 1.5M — 990₽ (30д)', 'buy_pro'),
    ],
    [Markup.button.callback('👑 Ultra 5M — 2990₽ (30д)', 'buy_ultra')],
    // Permanent
    [
      Markup.button.callback('💚 Mini 50k — 99₽ (∞)', 'buy_mini'),
      Markup.button.callback('💙 Medium 200k — 349₽ (∞)', 'buy_medium'),
    ],
    [
      Markup.button.callback('💜 Large 500k — 699₽ (∞)', 'buy_large'),
      Markup.button.callback('🧡 XL 1000k — 990₽ (∞)', 'buy_xl'),
    ],
    [Markup.button.callback('◀️ В главное меню', 'back_menu')],
  ]);
}

// Stars available only for packages ≤399₽
const STARS_MAX_PRICE = 399;

export function buyMethodKeyboard(packageId: string) {
  const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId);
  const starsAvailable = pkg && pkg.priceRub <= STARS_MAX_PRICE;

  if (starsAvailable) {
    return Markup.inlineKeyboard([
      [Markup.button.callback(`⭐ Telegram Stars — ${pkg.priceStars} ⭐`, `pay_stars_${packageId}`)],
      [Markup.button.callback(`💳 Картой / СБП — ${pkg.priceRub}₽`, `pay_yukassa_${packageId}`)],
      [Markup.button.callback('◀️ В главное меню', 'back_menu')],
    ]);
  }

  return Markup.inlineKeyboard([
    [Markup.button.callback(`💳 Картой / СБП — ${pkg!.priceRub}₽`, `pay_yukassa_${packageId}`)],
    [Markup.button.callback('◀️ В главное меню', 'back_menu')],
  ]);
}

export function profileKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💎 Купить токены', 'buy_tokens'),
      Markup.button.callback('🔗 Реферальная ссылка', 'referral_link'),
    ],
    [
      Markup.button.callback('📊 Статистика', 'user_stats'),
      Markup.button.callback('◀️ В главное меню', 'back_menu'),
    ],
  ]);
}

export function backToMenuKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('◀️ В главное меню', 'back_menu')]]);
}
