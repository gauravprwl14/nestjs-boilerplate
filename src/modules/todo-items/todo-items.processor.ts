import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TODO_QUEUE } from '@/queue/queue.module';
import { AppLogger } from '@logger/logger.service';

@Processor(TODO_QUEUE)
export class TodoItemsProcessor extends WorkerHost {
  constructor(private readonly logger: AppLogger) {
    super();
    this.logger.setContext(TodoItemsProcessor.name);
  }

  async process(job: Job<{ todoItemId: string; type: string }>): Promise<void> {
    this.logger.logEvent('todo.job.processing', {
      attributes: { jobId: job.id ?? '', type: job.data.type, todoItemId: job.data.todoItemId },
    });

    switch (job.data.type) {
      case 'overdue-check':
        // Placeholder for overdue notification logic
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
