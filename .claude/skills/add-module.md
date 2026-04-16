# Add Module

Scaffold a new feature module following all project conventions.

## Usage
Provide the module name (singular, e.g., "comment", "notification").

## Steps

1. **Create directory structure:**
   ```
   src/modules/{name}/
   ├── {name}.module.ts
   ├── {name}.controller.ts
   ├── {name}.service.ts
   ├── {name}.repository.ts
   └── dto/
       ├── create-{name}.dto.ts
       └── update-{name}.dto.ts
   ```

2. **Repository** — Extend `BaseRepository` from `@database/repositories/base.repository.ts`:
   ```typescript
   @Injectable()
   export class {Name}Repository extends BaseRepository<{Model}, Prisma.{Model}CreateInput, ...> {
     constructor(prisma: PrismaService) { super(prisma); }
     protected get delegate() { return this.prisma.{model}; }
     protected readonly supportsSoftDelete = true; // if model has deletedAt
   }
   ```

3. **Service** — Inject repository and logger:
   - CRUD methods with ownership verification
   - Use `ErrorException.notFound()` for missing resources
   - Use `AppLogger.logEvent()` for business events

4. **Controller** — Use decorators:
   - `@ApiTags('{Name}s')` for Swagger grouping
   - `@ApiOperation({ summary })` on each endpoint
   - `@CurrentUser('id')` for user context
   - `ParseUuidPipe` for ID parameters

5. **DTOs** — Use class-validator + Swagger decorators:
   - `@ApiProperty()` / `@ApiPropertyOptional()`
   - `@IsString()`, `@IsEmail()`, `@MinLength()`, etc.
   - Update DTO: `PartialType(CreateDto)`

6. **Module** — Register providers and exports:
   ```typescript
   @Module({
     controllers: [{Name}Controller],
     providers: [{Name}Repository, {Name}Service],
     exports: [{Name}Service],
   })
   export class {Name}Module {}
   ```

7. **Register in AppModule** — Add to imports array in `src/app.module.ts`

8. **Add Prisma model** (if needed) — Update `prisma/schema.prisma`, run `npx prisma migrate dev --name add-{name}`

## Checklist
- [ ] All files use kebab-case naming
- [ ] JSDoc on public methods
- [ ] Error codes registered if new scenarios needed
- [ ] Swagger decorators on all endpoints
- [ ] No hardcoded strings
