import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiKeysService, ApiKeyListItem, CreateApiKeyResult } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ApiAuth } from '@common/decorators/api-auth.decorator';

/**
 * Controller for API key management.
 * All routes require JWT authentication.
 */
@ApiTags('Authentication')
@ApiAuth()
@Controller('auth/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * Creates a new API key for the authenticated user.
   * The raw key value is returned once and cannot be retrieved again.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new API key' })
  @ApiResponse({ status: 201, description: 'API key created. The key value is shown only once.' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResult> {
    return this.apiKeysService.create(userId, dto);
  }

  /**
   * Lists all API keys belonging to the authenticated user.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all API keys for the authenticated user' })
  @ApiResponse({ status: 200, description: 'API keys retrieved successfully' })
  async findAll(@CurrentUser('id') userId: string): Promise<ApiKeyListItem[]> {
    return this.apiKeysService.findAll(userId);
  }

  /**
   * Revokes a specific API key owned by the authenticated user.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key by ID' })
  @ApiResponse({ status: 204, description: 'API key revoked successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revoke(
    @CurrentUser('id') userId: string,
    @Param('id') keyId: string,
  ): Promise<void> {
    return this.apiKeysService.revoke(userId, keyId);
  }
}
