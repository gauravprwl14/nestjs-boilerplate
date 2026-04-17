import { Body, Controller, Get, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { Trace } from '@telemetry/decorators/trace.decorator';
import { TweetsService, TimelineTweet } from './tweets.service';
import { CreateTweetDto, CreateTweetSchema } from './dto/create-tweet.dto';
import { CreateTweetSwagger, GetTimelineSwagger } from './tweets.swagger';
import { Tweet } from '@prisma/client';

/**
 * HTTP surface for the Tweet aggregate. Keep this file short —
 * Swagger metadata lives in `tweets.swagger.ts`, validation schema in
 * `dto/create-tweet.dto.ts`, business logic in `tweets.service.ts`.
 */
@ApiTags('Tweets')
@ApiSecurity('x-user-id')
@Controller({ version: '1' })
export class TweetsController {
  constructor(private readonly service: TweetsService) {}

  @Post('tweets')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateTweetSchema))
  @CreateTweetSwagger()
  @Trace({ spanName: 'tweets.create' })
  async create(@Body() dto: CreateTweetDto): Promise<Tweet> {
    return this.service.create(dto);
  }

  @Get('timeline')
  @GetTimelineSwagger()
  @Trace({ spanName: 'tweets.timeline' })
  async timeline(): Promise<TimelineTweet[]> {
    return this.service.timeline();
  }
}
