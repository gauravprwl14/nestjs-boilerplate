# Auth Sequence Diagrams

<!-- DOC-SYNC: Diagram updated on 2026-04-17. Database calls now route through AuthCredentialsDbService/UsersDbService instead of direct Prisma. Participants labelled "PG" (PostgreSQL) are still conceptually correct at sequence level but the internal path is AS → *DbService → *DbRepository → PG. Please verify visual accuracy before committing. -->

> For the architecture context behind these flows, see `docs/architecture/auth-flow.md`.

## Register

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant M as Middleware
    participant AC as AuthController
    participant AS as AuthService
    participant PG as PostgreSQL

    C->>M: POST /api/v1/auth/register
    M->>M: RequestId, SecurityHeaders, RateLimit
    M->>AC: { email, password, firstName, lastName }
    AC->>AC: ZodValidationPipe validates body
    AC->>AS: register(dto)
    AS->>PG: SELECT user WHERE email = dto.email
    PG-->>AS: null
    AS->>AS: bcrypt.hash(password, 12 rounds)
    AS->>PG: INSERT user
    AS->>PG: INSERT refresh_token
    AS->>AS: jwt.sign access + refresh tokens
    AS-->>AC: AuthResult { user, accessToken, refreshToken }
    AC-->>C: 201 { success: true, data: AuthResult }
```

## Login

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant AC as AuthController
    participant AS as AuthService
    participant PG as PostgreSQL

    C->>AC: POST /api/v1/auth/login { email, password }
    AC->>AS: login(dto)
    AS->>PG: SELECT user WHERE email AND deletedAt IS NULL
    PG-->>AS: User
    AS->>AS: bcrypt.compare(password, passwordHash)
    alt wrong password
        AS-->>C: 401 AUT0006 InvalidCredentials
    end
    AS->>AS: checkStatus (SUSPENDED → AUT0004, LOCKED → AUT0005)
    AS->>PG: INSERT refresh_token
    AS->>AS: jwt.sign tokens
    AS-->>AC: AuthResult
    AC-->>C: 200 { success: true, data: AuthResult }
```

## Refresh Token

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant AC as AuthController
    participant AS as AuthService
    participant PG as PostgreSQL

    C->>AC: POST /api/v1/auth/refresh { refreshToken }
    AC->>AS: refreshTokens(token)
    AS->>AS: jwt.verify(token, REFRESH_SECRET)
    AS->>PG: SELECT refresh_token WHERE token AND revokedAt IS NULL
    alt not found or revoked
        AS-->>C: 401 AUT0003 TokenInvalid
    end
    AS->>PG: UPDATE refresh_token SET revokedAt = NOW()
    AS->>PG: INSERT new refresh_token
    AS->>AS: jwt.sign new token pair
    AS-->>AC: TokenPair
    AC-->>C: 200 { success: true, data: TokenPair }
```

## API Key Authentication

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant Guard as JwtAuthGuard
    participant AKS as ApiKeyStrategy
    participant PG as PostgreSQL
    participant Handler as Controller Handler

    C->>Guard: GET /api/v1/todo-lists\nAuthorization: ApiKey <raw>
    Guard->>AKS: canActivate → validate(req)
    AKS->>AKS: extract prefix from raw key
    AKS->>PG: SELECT api_key WHERE prefix AND status = ACTIVE
    PG-->>AKS: ApiKey record
    AKS->>AKS: bcrypt.compare(raw, keyHash)
    alt invalid key
        AKS-->>C: 401 AUT0003 TokenInvalid
    end
    AKS->>PG: UPDATE api_key SET lastUsedAt = NOW()
    AKS-->>Guard: { id: userId, role }
    Guard-->>Handler: proceeds with req.user
    Handler-->>C: 200 response
```
