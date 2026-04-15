import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppConfigService } from '@config/config.service';

export const TODO_QUEUE = 'todo-queue';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password || undefined,
          db: config.redis.db,
        },
      }),
    }),
    BullModule.registerQueue({ name: TODO_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
