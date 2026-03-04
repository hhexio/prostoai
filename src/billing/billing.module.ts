import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BillingService } from './billing.service';
import { YukassaService } from './yukassa.service';
import { StarsService } from './stars.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [HttpModule],
  providers: [BillingService, YukassaService, StarsService],
  controllers: [BillingController],
  exports: [BillingService, StarsService],
})
export class BillingModule {}
