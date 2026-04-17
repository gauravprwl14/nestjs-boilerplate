# Authentication Flow

## Overview

The application supports two authentication strategies:

1. **JWT** — access token (15 min) + refresh token (7 days, single-use rotation).
2. **API Key** — hashed key stored in `api_keys` table; validated on every request via `passport-custom`.

Both are handled by Passport strategies registered in `AuthModule`.
A global `JwtAuthGuard` protects all routes except those decorated with `@Public()`.

---

## Register Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant AC as AuthController
    participant AS as AuthService
    participant DB as PostgreSQL

    C->>AC: POST /auth/register { email, password, firstName, lastName }
    AC->>AS: register(dto)
    AS->>DB: findUnique({ email })
    DB-->>AS: null (not found)
    AS->>AS: bcrypt.hash(password, 12)
    AS->>DB: create(User)
    DB-->>AS: User record
    AS->>DB: create(RefreshToken)
    DB-->>AS: RefreshToken
    AS->>AS: signAccessToken(userId, role)
    AS-->>AC: { user, accessToken, refreshToken }
    AC-->>C: 201 { success: true, data: { user, accessToken, refreshToken } }
```

---

## Login Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant AC as AuthController
    participant AS as AuthService
    participant DB as PostgreSQL

    C->>AC: POST /auth/login { email, password }
    AC->>AS: login(dto)
    AS->>DB: findUnique({ email, deletedAt: null })
    DB-->>AS: User record
    AS->>AS: bcrypt.compare(password, passwordHash)
    alt invalid password
        AS-->>AC: throw AUT0006 InvalidCredentials
        AC-->>C: 401
    end
    AS->>AS: checkAccountStatus (SUSPENDED/LOCKED/PENDING)
    AS->>DB: create(RefreshToken)
    AS->>AS: signTokenPair(userId, role)
    AS-->>AC: { user, accessToken, refreshToken }
    AC-->>C: 200 { success: true, data: ... }
```

---

## Refresh Token Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant AC as AuthController
    participant AS as AuthService
    participant DB as PostgreSQL

    C->>AC: POST /auth/refresh { refreshToken }
    AC->>AS: refreshTokens(token)
    AS->>AS: jwt.verify(token, REFRESH_SECRET)
    AS->>DB: findUnique({ token, revokedAt: null })
    DB-->>AS: RefreshToken
    AS->>DB: update RefreshToken set revokedAt = now()
    AS->>DB: create new RefreshToken
    AS->>AS: signTokenPair(userId, role)
    AS-->>AC: { accessToken, refreshToken }
    AC-->>C: 200 { success: true, data: { accessToken, refreshToken } }
```

---

## API Key Auth Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant Guard as JwtAuthGuard
    participant Strat as ApiKeyStrategy
    participant DB as PostgreSQL

    C->>Guard: GET /resource\nAuthorization: ApiKey <raw-key>
    Guard->>Strat: validate(request)
    Strat->>Strat: extract prefix from raw key
    Strat->>DB: findFirst({ prefix, status: ACTIVE })
    DB-->>Strat: ApiKey record
    Strat->>Strat: bcrypt.compare(rawKey, keyHash)
    alt invalid
        Strat-->>Guard: throw AUT0003 TokenInvalid
        Guard-->>C: 401
    end
    Strat->>DB: update lastUsedAt = now()
    Strat-->>Guard: { userId, role }
    Guard-->>C: proceeds to controller
```

---

## Token Signing

| Token | Secret env var | Expiry env var | Default expiry |
|-------|---------------|----------------|----------------|
| Access | `JWT_ACCESS_SECRET` | `JWT_ACCESS_EXPIRATION` | `15m` |
| Refresh | `JWT_REFRESH_SECRET` | `JWT_REFRESH_EXPIRATION` | `7d` |

Both secrets must be at least 32 characters (`MIN_SECRET_LENGTH` constant).
See `src/config/schemas/env.schema.ts` for validation rules.
