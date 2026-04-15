# FOR-Authentication.md — Authentication Feature Guide

> Related: `docs/architecture/auth-flow.md`, `docs/diagrams/auth-sequence.md`, `docs/coding-guidelines/07-error-handling.md`

---

## 1. Business Use Case

The authentication system provides two ways for clients to prove identity:

1. **JWT (human users):** Register → login → receive short-lived access token (15 min) + long-lived refresh token (7 days). The refresh token rotates on every use (single-use), preventing replay attacks. On password change, all refresh tokens are revoked.

2. **API Key (machine-to-machine):** A user creates a named API key via the dashboard. The raw key is shown once; the bcrypt hash is stored. On every request, the client sends `Authorization: ApiKey <raw-key>` and the system compares it against stored hashes by prefix lookup.

---

## 2. Flow Diagram

See `docs/diagrams/auth-sequence.md` for full mermaid sequence diagrams.

```
Register/Login → tokens issued → client stores tokens
Client request → JwtAuthGuard → JwtStrategy validates access token
Access token expired → POST /auth/refresh → new token pair
API Key request → JwtAuthGuard → ApiKeyStrategy validates raw key → bcrypt compare
```

---

## 3. Code Structure

```
src/modules/auth/
├── auth.module.ts            # Registers JwtModule, JwtStrategy, ApiKeyStrategy, JwtAuthGuard (APP_GUARD)
├── auth.controller.ts        # /auth: register, login, refresh, change-password
├── auth.service.ts           # Business logic for all JWT auth operations
├── api-keys.controller.ts    # /auth/api-keys: create, list, revoke
├── api-keys.service.ts       # Business logic for API key lifecycle
├── strategies/
│   ├── jwt.strategy.ts       # Passport JWT — verifies access token, extracts payload
│   └── api-key.strategy.ts   # Passport custom — bcrypt compare, lastUsedAt update
├── guards/
│   └── jwt-auth.guard.ts     # Global guard; checks @Public() before delegating to strategies
└── dto/
    ├── register.dto.ts
    ├── login.dto.ts
    ├── refresh-token.dto.ts
    ├── change-password.dto.ts
    └── create-api-key.dto.ts
```

---

## 4. Key Methods

### AuthService

| Method | Description |
|--------|-------------|
| `register(dto)` | Hash password, create User + RefreshToken, sign token pair |
| `login(dto)` | Find user by email, bcrypt compare, check status, issue tokens |
| `refreshTokens(token)` | Verify refresh JWT, revoke old token, issue new pair |
| `changePassword(userId, dto)` | Bcrypt compare current, hash new, revoke all refresh tokens |

### ApiKeysService

| Method | Description |
|--------|-------------|
| `create(userId, dto)` | Generate random key, store hash + prefix, return raw key once |
| `findAll(userId)` | List all ACTIVE keys (hash not returned) |
| `revoke(userId, keyId)` | Set `status = REVOKED` — key is immediately invalid |

### JwtAuthGuard Logic

```typescript
canActivate(context) {
  if (isPublicRoute) return true;
  try {
    return jwtStrategy.validate(); // try JWT first
  } catch {
    return apiKeyStrategy.validate(); // fall back to API key
  }
}
```

---

## 5. Error Cases

| Scenario | Error Code | HTTP Status |
|----------|-----------|-------------|
| Email already registered | `DAT0003` | 409 |
| Wrong email or password | `AUT0006` | 401 |
| Account suspended | `AUT0004` | 403 |
| Account locked | `AUT0005` | 423 |
| Access token expired | `AUT0002` | 401 |
| Refresh token invalid/revoked | `AUT0003` | 401 |
| API key invalid | `AUT0003` | 401 |
| API key not found | `DAT0001` | 404 |

---

## 6. Configuration

| Variable | Purpose |
|----------|---------|
| `JWT_ACCESS_SECRET` | Signs access tokens — must be ≥ 32 chars |
| `JWT_ACCESS_EXPIRATION` | Access token TTL (default `15m`) |
| `JWT_REFRESH_SECRET` | Signs refresh tokens — must be ≥ 32 chars |
| `JWT_REFRESH_EXPIRATION` | Refresh token TTL (default `7d`) |
| `API_KEY_ENCRYPTION_SECRET` | Used in API key hashing pipeline — ≥ 32 chars |
| `BCRYPT_ROUNDS` | Password + API key hash cost factor (default `12`) |

See `docs/infrastructure/02-environment-configuration.md` for the full env var reference.
