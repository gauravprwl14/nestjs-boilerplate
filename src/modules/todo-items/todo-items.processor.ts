import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TODO_QUEUE } from '@/queue/queue.module';
// Import the type augmentation so TypeScript sees logEvent/logError on Logger
import '@logger/logger.d';

/**
 * BullMQ processor for todo-related background jobs.
 * Demonstrates using NestJS's native Logger with custom methods
 * (logEvent, logError) via the logger delegation pattern.
 */
@Processor(TODO_QUEUE)
export class TodoItemsProcessor extends WorkerHost {
  private readonly logger = new Logger(TodoItemsProcessor.name);

  async process(job: Job<{ todoItemId: string; type: string }>): Promise<void> {
    this.logger.logEvent('todo.job.processing', {
      attributes: { jobId: job.id ?? '', type: job.data.type, todoItemId: job.data.todoItemId },
    });

    switch (job.data.type) {
      case 'overdue-check':
        this.logger.logEvent('todo.overdue.checked', {
          attributes: { todoItemId: job.data.todoItemId },
        });
        break;
      default:
        this.logger.logEvent('todo.job.unknown', {
          attributes: { type: job.data.type },
        });
    }
  }
}
