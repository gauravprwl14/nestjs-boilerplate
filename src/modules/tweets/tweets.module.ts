import { Module } from '@nestjs/common';
import { TweetsController } from './tweets.controller';
import { TweetsService } from './tweets.service';

/**
 * Tweets feature module. Both TweetsDbService and DepartmentsDbService come
 * from the global DatabaseModule; feature-local providers are just the service.
 */
@Module({
  controllers: [TweetsController],
  providers: [TweetsService],
})
export class TweetsModule {}
