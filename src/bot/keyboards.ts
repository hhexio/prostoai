import { Markup } from 'telegraf';

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔥 GPT-5.1', 'model_gpt-5.1'),
      Markup.button.callback('🍌 Nano Banana', 'model_nano-banana-2'),
    ],
    [
      Markup.button.callback('💬 Чат-модели', 'menu_chat'),
      Markup.button.callback('🎨 Создать фото', 'menu_image'),
    ],
    [
      Markup.button.callback('👤 Мой профиль', 'profile'),
      Markup.button.callback('💎 Купить токены', 'buy_tokens'),
    ],
  ]);
}

export function chatModelsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⚡ GPT-4.1 Mini (FREE)', 'model_gpt-4.1-mini'),
      Markup.button.callback('🧠 GPT-5 Mini', 'model_gpt-5-mini'),
    ],
    [
      Markup.button.callback('🌟 GPT-4o', 'model_gpt-4o'),
      Markup.button.callback('🔥 GPT-5.1', 'model_gpt-5.1'),
    ],
    [Markup.button.callback('◀️ В главное меню', 'back_menu')],
  ]);
}

export function imageModelsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🖼 GPT Image Mini (FREE)', 'model_gpt-image-1-mini'),
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
    [Markup.button.callback('📸 GPT-4o Vision (FREE)', 'model_gpt-4o-vision')],
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
  { id: 'basic', name: 'Basic', tokens: 250_000, priceRub: 199, priceStars: 110, type: 'EXPIRING', expiryDays: 30 },
  { id: 'standard', name: 'Standard', tokens: 500_000, priceRub: 299, priceStars: 165, type: 'EXPIRING', expiryDays: 30 },
  { id: 'pro', name: 'Pro', tokens: 1_500_000, priceRub: 690, priceStars: 385, type: 'EXPIRING', expiryDays: 30 },
  { id: 'ultra', name: 'Ultra', tokens: 5_000_000, priceRub: 1990, priceStars: 1105, type: 'EXPIRING', expiryDays: 30 },
  // Permanent
  { id: 'mini', name: 'Mini', tokens: 50_000, priceRub: 79, priceStars: 44, type: 'PERMANENT' },
  { id: 'medium', name: 'Medium', tokens: 200_000, priceRub: 249, priceStars: 138, type: 'PERMANENT' },
  { id: 'large', name: 'Large', tokens: 500_000, priceRub: 499, priceStars: 277, type: 'PERMANENT' },
  { id: 'xl', name: 'XL', tokens: 1_000_000, priceRub: 649, priceStars: 360, type: 'PERMANENT' },
];

export function buyKeyboard() {
  return Markup.inlineKeyboard([
    // Expiring (30 days)
    [
      Markup.button.callback('💰 Starter 100k — 99₽ (30д)', 'buy_starter'),
      Markup.button.callback('💎 Basic 250k — 199₽ (30д)', 'buy_basic'),
    ],
    [
      Markup.button.callback('⭐ Standard 500k — 299₽ (30д)', 'buy_standard'),
      Markup.button.callback('🚀 Pro 1.5M — 690₽ (30д)', 'buy_pro'),
    ],
    [Markup.button.callback('👑 Ultra 5M — 1990₽ (30д)', 'buy_ultra')],
    // Permanent
    [
      Markup.button.callback('💚 Mini 50k — 79₽ (∞)', 'buy_mini'),
      Markup.button.callback('💙 Medium 200k — 249₽ (∞)', 'buy_medium'),
    ],
    [
      Markup.button.callback('💜 Large 500k — 499₽ (∞)', 'buy_large'),
      Markup.button.callback('🧡 XL 1000k — 649₽ (∞)', 'buy_xl'),
    ],
    [Markup.button.callback('◀️ В главное меню', 'back_menu')],
  ]);
}

// Stars available only for packages ≤299₽
const STARS_MAX_PRICE = 299;

export function buyMethodKeyboard(packageId: string) {
  const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId);
  const starsAvailable = pkg && pkg.priceRub <= STARS_MAX_PRICE;

  if (starsAvailable) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('⭐ Оплата Telegram Stars', `pay_stars_${packageId}`)],
      [Markup.button.callback('💳 Оплата картой', `pay_card_${packageId}`)],
      [Markup.button.callback('◀️ В главное меню', 'back_menu')],
    ]);
  }

  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 Оплата картой — скоро!', `pay_card_${packageId}`)],
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
