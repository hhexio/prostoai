import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { ReferralService } from './referral.service';

@Module({
  providers: [UsersService, ReferralService],
  exports: [UsersService, ReferralService],
})
export class UsersModule {}
