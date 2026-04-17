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
   └── dto/
       ├── create-{name}.dto.ts
       └── update-{name}.dto.ts
   ```

2. **Database layer** — Do **not** add a `*.repository.ts` inside the feature module.
   Instead, add a new aggregate under `src/database/{name}/`:

   ```
   src/database/{name}/
   ├── {name}.db-repository.ts   # Prisma calls only
   └── {name}.db-service.ts      # Public DB API injected by feature services
   ```

   Repository — extend `BaseRepository` from `@database/base.repository`:

   ```typescript
   @Injectable()
   export class {Name}DbRepository extends BaseRepository<{Model}, ...> {
     constructor(prisma: PrismaService) { super(prisma); }
     protected get delegate() { return this.prisma.{model}; }
     protected readonly supportsSoftDelete = true; // if model has deletedAt
   }
   ```

   DbService — thin façade over the repository; this is the only class
   that feature services import:

   ```typescript
   @Injectable()
   export class {Name}DbService {
     constructor(private readonly repo: {Name}DbRepository) {}

     findById(id: string, tx?: DbTransactionClient): Promise<{Model} | null> {
       return this.repo.findUnique({ id }, undefined, tx);
     }
     // … other public methods
   }
   ```

   Register both in `DatabaseModule` (`providers` + `exports`):

   ```typescript
   providers: [...existing, {Name}DbRepository, {Name}DbService],
   exports:   [...existing, {Name}DbService],
   ```

   `DatabaseModule` is `@Global()` — no import needed in the feature module.

   If the new aggregate is a small addition to an existing one (e.g. a new
   join-table operation), add the method to the existing `*DbService` rather
   than creating a new aggregate directory.

3. **Service** — Inject `{Name}DbService` (and `DatabaseService` if you need
   cross-aggregate transactions):

   ```typescript
   @Injectable()
   export class {Name}Service {
     constructor(
       private readonly {name}Db: {Name}DbService,
       private readonly logger: AppLogger,
     ) {}

     async create(userId: string, dto: Create{Name}Dto): Promise<{Model}> {
       // business logic only — no direct Prisma calls
     }
   }
   ```

4. **Controller** — Use composite decorators:
   - `@ApiTags('{Name}s')` for Swagger grouping
   - `@ApiEndpoint({ summary, successStatus, ... })` on each endpoint
   - `@CurrentUser('id')` for user context
   - `ParseUuidPipe` for ID parameters

5. **DTOs** — Use Zod schemas + `ZodValidationPipe`:

   ```typescript
   export const Create{Name}Schema = z.object({ name: z.string().min(1) });
   export type Create{Name}Dto = z.infer<typeof Create{Name}Schema>;
   ```

6. **Module** — Providers are the service + controller only (no repository —
   it lives in `DatabaseModule`):

   ```typescript
   @Module({
     controllers: [{Name}Controller],
     providers: [{Name}Service],
     exports: [{Name}Service],
   })
   export class {Name}Module {}
   ```

7. **Register in AppModule** — Add to imports array in `src/app.module.ts`.

8. **Add Prisma model** (if needed) — Update
   `src/database/prisma/schema.prisma`, then run:
   ```bash
   npx prisma migrate dev --name add-{name}
   npx prisma generate
   ```

## Checklist

- [ ] All files use kebab-case naming
- [ ] JSDoc on all public methods of `*DbService` and `*Service`
- [ ] `*DbRepository` and `*DbService` registered in `DatabaseModule`
- [ ] Feature module does **not** contain a `*.repository.ts`
- [ ] Feature service injects `*DbService`, not `PrismaService` directly
- [ ] Error codes registered if new error scenarios are needed
- [ ] Swagger decorators on all endpoints
- [ ] No hardcoded strings — use constants
