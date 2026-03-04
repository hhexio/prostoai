import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiService } from './ai.service';
import { RouterService } from './router.service';

@Module({
  imports: [HttpModule],
  providers: [AiService, RouterService],
  exports: [AiService, RouterService],
})
export class AiModule {}
