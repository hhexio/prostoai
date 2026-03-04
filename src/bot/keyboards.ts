import { Markup } from 'telegraf';
import { getModelsByCategory } from '../ai/models.config';

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💬 Чат', 'menu_chat'),
      Markup.button.callback('🎨 Изображения', 'menu_image'),
    ],
    [
      Markup.button.callback('📷 Анализ фото', 'menu_vision'),
      Markup.button.callback('🎤 Аудио/Голос', 'menu_audio'),
    ],
  ]);
}

export function chatModelsKeyboard() {
  const models = getModelsByCategory('chat');
  const buttons = models.map((m) =>
    Markup.button.callback(
      `${m.isFree ? '🆓 ' : ''}${m.displayName} x${m.multiplier}`,
      `model_${m.id}`,
    ),
  );
  return Markup.inlineKeyboard([...buttons.map((b) => [b]), [backButton()]]);
}

export function imageModelsKeyboard() {
  const models = getModelsByCategory('image');
  const buttons = models.map((m) =>
    Markup.button.callback(
      `${m.isFree ? '🆓 ' : ''}${m.displayName} ~${(m.estimatedTokens / 1000).toFixed(0)}k`,
      `model_${m.id}`,
    ),
  );
  return Markup.inlineKeyboard([...buttons.map((b) => [b]), [backButton()]]);
}

export function visionModelsKeyboard() {
  const models = getModelsByCategory('vision');
  const buttons = models.map((m) =>
    Markup.button.callback(
      `${m.isFree ? '🆓 ' : ''}${m.displayName} ~${(m.estimatedTokens / 1000).toFixed(1)}k`,
      `model_${m.id}`,
    ),
  );
  return Markup.inlineKeyboard([...buttons.map((b) => [b]), [backButton()]]);
}

export function audioModelsKeyboard() {
  const models = getModelsByCategory('audio');
  const buttons = models.map((m) =>
    Markup.button.callback(
      `${m.displayName} ~${(m.estimatedTokens / 1000).toFixed(0)}k/мин`,
      `model_${m.id}`,
    ),
  );
  return Markup.inlineKeyboard([...buttons.map((b) => [b]), [backButton()]]);
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
  const expiring = TOKEN_PACKAGES.filter((p) => p.type === 'EXPIRING');
  const permanent = TOKEN_PACKAGES.filter((p) => p.type === 'PERMANENT');

  const expiringButtons = expiring.map((p) =>
    Markup.button.callback(
      `⏱ ${p.name} ${(p.tokens / 1000).toFixed(0)}k — ${p.priceRub}₽`,
      `buy_${p.id}`,
    ),
  );

  const permanentButtons = permanent.map((p) =>
    Markup.button.callback(
      `♾️ ${p.name} ${(p.tokens / 1000).toFixed(0)}k — ${p.priceRub}₽`,
      `buy_${p.id}`,
    ),
  );

  return Markup.inlineKeyboard([
    ...expiringButtons.map((b) => [b]),
    ...permanentButtons.map((b) => [b]),
  ]);
}

export function buyMethodKeyboard(packageId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 ЮKassa (карта/СБП)', `pay_yukassa_${packageId}`)],
    [Markup.button.callback('⭐ Telegram Stars', `pay_stars_${packageId}`)],
    [backButton()],
  ]);
}

export function backToMenuKeyboard() {
  return Markup.inlineKeyboard([[backButton()]]);
}

function backButton() {
  return Markup.button.callback('« Назад', 'back_menu');
}
