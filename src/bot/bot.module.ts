import { Module } from '@nestjs/common';
import { BotUpdate } from './bot.update';
import { BotService } from './bot.service';
import { UsersModule } from '../users/users.module';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [UsersModule, AiModule, BillingModule, AnalyticsModule],
  providers: [BotUpdate, BotService],
  exports: [BotService],
})
export class BotModule {}
