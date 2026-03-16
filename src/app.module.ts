import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { BotModule } from './bot/bot.module';
import { AiModule } from './ai/ai.module';
import { BillingModule } from './billing/billing.module';
import { UsersModule } from './users/users.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TelegrafModule.forRootAsync({
      useFactory: () => ({
        token: process.env.BOT_TOKEN!,
      }),
    }),
    RedisModule.forRootAsync({
      useFactory: () => ({
        type: 'single',
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    AiModule,
    BillingModule,
    AnalyticsModule,
    AdminModule,
    BotModule,
  ],
})
export class AppModule {}
