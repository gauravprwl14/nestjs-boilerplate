# ─── Stage 1: base ───────────────────────────────────────────────────────────
FROM node:22-alpine AS base

RUN apk add --no-cache openssl libc6-compat dumb-init

WORKDIR /app

# ─── Stage 2: dependencies ───────────────────────────────────────────────────
FROM base AS dependencies

# Copy package manifests and prisma schema (needed for prisma generate)
COPY package*.json ./
COPY prisma/ ./prisma/

# Install production dependencies
RUN npm ci --only=production

# Generate Prisma client (needs a DATABASE_URL — dummy value is fine at build time)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Save production node_modules aside, then install all deps (including devDeps)
RUN cp -r node_modules prod_node_modules

RUN npm ci

# ─── Stage 3: development ────────────────────────────────────────────────────
FROM base AS development

# Copy all dependencies (full, including devDependencies)
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source
COPY . .

# Re-run prisma generate with real schema in place
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start:dev"]

# ─── Stage 4: builder ────────────────────────────────────────────────────────
FROM base AS builder

# Copy all dependencies (full, including devDependencies)
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source
COPY . .

# Re-run prisma generate with real schema in place
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# ─── Stage 5: production ─────────────────────────────────────────────────────
FROM base AS production

# Create non-root user/group
RUN addgroup -g 1001 -S nestjs && adduser -u 1001 -S nestjs -G nestjs

# Copy compiled app from builder
COPY --from=builder --chown=nestjs:nestjs /app/dist ./dist

# Copy production node_modules from dependencies stage
COPY --from=dependencies --chown=nestjs:nestjs /app/prod_node_modules ./node_modules

# Copy prisma schema and package.json (needed at runtime for migrations/client)
COPY --from=builder --chown=nestjs:nestjs /app/prisma ./prisma
COPY --chown=nestjs:nestjs package.json ./

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]
