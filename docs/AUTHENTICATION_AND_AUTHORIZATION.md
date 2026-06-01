# Authentication & Authorization

> **Auth Provider:** Supabase Auth  
> **Token Strategy:** JWT access token (in-memory) + HttpOnly refresh cookie  
> **Authorization Model:** Role-based (admin / superadmin)

---

## 1. Authentication Architecture

```mermaid
graph TD
    subgraph "Browser"
        SPA["React SPA"]
        MEM["In-Memory<br/>accessToken"]
    end

    subgraph "Backend (Express)"
        AUTH_MW["authJWT middleware"]
        AUTH_CTRL["authController"]
        ROLE_MW["roleMiddleware"]
        STATUS_MW["statusMiddleware"]
    end

    subgraph "Supabase"
        SB_AUTH["Supabase Auth"]
        SB_DB["profiles table"]
        JWKS["JWKS endpoint"]
    end

    SPA -->|"1. signInWithPassword()"| SB_AUTH
    SB_AUTH -->|"session (access + refresh)"| SPA
    SPA -->|"2. POST auth/set-refresh"| AUTH_CTRL
    AUTH_CTRL -->|"Set HttpOnly cookie"| SPA
    SPA -->|"3. Bearer token"| AUTH_MW
    AUTH_MW -->|"Verify via JWKS"| JWKS
    AUTH_MW --> ROLE_MW
    ROLE_MW --> STATUS_MW
    STATUS_MW -->|"Profile lookup"| SB_DB
```

---

## 2. Login Flow

```mermaid
sequenceDiagram
    actor User
    participant Login as Login.jsx
    participant Supabase as Supabase Auth
    participant API as Express API
    participant Cookie as HttpOnly Cookie

    User->>Login: Enter email + password
    Login->>Supabase: signInWithPassword({ email, password })
    Supabase-->>Login: { session: { access_token, refresh_token } }
    
    Login->>Login: setAccessToken(access_token) [in-memory]
    
    Login->>API: POST /auth/set-refresh { refresh_token }
    API->>Cookie: Set sb_refresh HttpOnly cookie
    API-->>Login: 200 OK
    
    Login->>API: GET /webapp/users/profiles/me [Bearer token]
    API-->>Login: { status, role, must_change_password, temp_expires_at }
    
    alt status !== "active"
        Login->>API: POST /auth/logout
        Login->>Login: setAccessToken(null)
        Login->>User: "Account on hold/inactive" error
    else must_change_password && temp not expired
        Login->>User: Redirect to /force-reset-password
    else All OK
        Login->>User: window.location.replace("/dashboard")
    end
```

---

## 3. Logout Flow

```mermaid
sequenceDiagram
    actor User
    participant Sidebar
    participant API as Express API
    participant State as App State

    User->>Sidebar: Click Logout
    
    alt Detection running
        Sidebar->>User: Show LogoutConfirmModal
        User->>Sidebar: Confirm logout
    end
    
    Sidebar->>API: POST /auth/logout (best-effort)
    Note over API: Clears HttpOnly refresh cookie
    Sidebar->>State: setAccessToken(null)
    Sidebar->>State: clearSessionState() [wipes all wf:* keys]
    Sidebar->>User: navigate("/login")
```

---

## 4. Token Lifecycle

### Access Token

| Property | Value |
|----------|-------|
| **Storage** | In-memory module variable (`src/api/axios.js`) |
| **Format** | JWT (from Supabase Auth) |
| **Lifetime** | Supabase default (~1 hour) |
| **Set on** | Login success, token refresh |
| **Cleared on** | Logout, refresh failure, manual `setAccessToken(null)` |
| **Attached** | Every request via Axios request interceptor (`Bearer {token}`) |

### Refresh Token

| Property | Value |
|----------|-------|
| **Storage** | HttpOnly cookie (`sb_refresh`) set by backend |
| **Format** | Opaque token from Supabase |
| **Lifetime** | Cookie expiry set by backend |
| **Set on** | Login → `POST /auth/set-refresh` |
| **Cleared on** | `POST /auth/logout` (backend clears cookie) |
| **Used by** | `POST /auth/refresh` endpoint (auto via 401 interceptor) |

### Token Refresh Flow

```mermaid
sequenceDiagram
    participant Axios
    participant Backend
    
    Note over Axios: Request returns 401
    Axios->>Axios: Check: not a refresh call, not already retried
    
    alt Not currently refreshing
        Axios->>Axios: isRefreshing = true
        Axios->>Backend: POST /auth/refresh (cookie sent automatically)
        Backend->>Backend: Read sb_refresh cookie
        Backend->>Backend: Use refresh token to get new access token
        Backend-->>Axios: { access_token }
        Axios->>Axios: setAccessToken(new_token)
        Axios->>Axios: Resolve all queued requests
        Axios->>Backend: Retry original request with new token
    else Already refreshing
        Axios->>Axios: Queue this request
        Note over Axios: Will retry after refresh completes
    else Refresh fails
        Axios->>Axios: setAccessToken(null)
        Axios->>Axios: clearSessionState()
        Axios->>Axios: Redirect to /login
    end
```

---

## 5. Session Lifecycle

### Session Bootstrap (on page load/refresh)

```
1. App.jsx mounts
2. Check: is current path public? (/login, /forgot-password, /reset-password, /)
   → YES: setAuthReady(true), skip refresh
   → NO: continue
3. POST /auth/refresh (HttpOnly cookie sent)
   → Success: setAccessToken(response.access_token), setAuthReady(true)
   → Failure: setAccessToken(null), setAuthReady(true)
4. Render routes based on !!getAccessToken()
```

### Session Termination

| Trigger | Actions |
|---------|---------|
| **Manual logout** | `POST /auth/logout` → `setAccessToken(null)` → `clearSessionState()` → navigate `/login` |
| **Token refresh failure** | `setAccessToken(null)` → `clearSessionState()` → redirect `/login` |
| **Tab close** | `sessionStorage` auto-clears (tab-scoped); access token lost (in-memory) |
| **Account deactivated** | Next API call → 401 → refresh fails → forced logout |

---

## 6. Route Protection

### Frontend Guards

| Guard | Mechanism | Scope |
|-------|-----------|-------|
| **Auth gate** | `!!getAccessToken()` in `App.jsx` | All `/*` routes |
| **Force-reset gate** | Separate auth check, no sidebar | `/force-reset-password` |
| **Role-based hiding** | `profile.role !== "superadmin"` | Sidebar hides Accounts & Audit |

### Backend Guards

| Middleware | File | Purpose |
|-----------|------|---------|
| `authJWT` | `middleware/authMiddleware.js` | Verifies JWT via Supabase JWKS |
| `requireSuperadmin` | `middleware/roleMiddleware.js` | Checks `profile.role === "superadmin"` |
| `requireActiveStatus` | `middleware/statusMiddleware.js` | Checks `profile.status === "active"` |

### Route-Level Protection Map

| Backend Route Group | Auth Required | Role Required |
|---------------------|:---:|:---:|
| `/api/auth` (login, set-refresh) | ✗ | — |
| `/api/auth` (logout, refresh, clear-force-reset) | ✓ | — |
| `/api/webapp` | ✓ | — |
| `/api/rasPi` | ✓ | — |
| `/api/sam` | ✓ | — |
| `/api/dashboard` | ✓ | — |
| `/api/device` | ✓ | — |
| `/api/captivePortal` | ✓ | — |
| `/api/detect` | ✓ | — |
| `/api/history` | ✓ | — |
| `/api/audit` | ✓ | superadmin |
| `/health` | ✗ | — |

---

## 7. Authorization Model (RBAC)

### Roles

| Role | Description | Count |
|------|-------------|-------|
| `admin` | Standard user — full access to scanning, detection, device management | Default |
| `superadmin` | Administrative user — all admin permissions + user management + audit logs | Limited |

### Permission Matrix

| Feature | admin | superadmin |
|---------|:-----:|:----------:|
| Dashboard | ✓ | ✓ |
| Security Assessment | ✓ | ✓ |
| Device Management | ✓ | ✓ |
| Scan History | ✓ | ✓ |
| Profile | ✓ | ✓ |
| Accounts Management | ✗ | ✓ |
| Audit Logs | ✗ | ✓ |
| Audit Export (CSV) | ✗ | ✓ |
| Activate/Deactivate Users | ✗ | ✓ |
| Issue Temp Passwords | ✗ | ✓ |

### Account Statuses

| Status | Can Login | Description |
|--------|:---------:|-------------|
| `active` | ✓ | Normal access |
| `on_hold` | ✗ | Temporarily suspended |
| `inactive` | ✗ | Deactivated (may be anonymized) |

---

## 8. Password Policies

### Password Requirements (`src/passwordValidation.js`)

| Rule | Requirement |
|------|-------------|
| Minimum length | 8 characters |
| Uppercase | At least one (A-Z) |
| Numeric | At least one (0-9) |
| Special character | At least one (`!@#$%^&*(){}:";><,.?_-`) |

### Force Reset (AUTH-009)

| Aspect | Detail |
|--------|--------|
| **Trigger** | Superadmin issues temp password → sets `must_change_password = true` + `temp_expires_at` |
| **Behavior** | User must change password before accessing the app |
| **Expiry** | If `temp_expires_at` has passed, force-reset is skipped |
| **Clear** | `POST /auth/clear-force-reset` resets the flag after password change |

---

## 9. Supabase Client Configuration

**File:** `src/lib/supabaseClient.js`

```javascript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,    // NO localStorage tokens
    autoRefreshToken: false,  // Backend handles refresh via HttpOnly cookie
    detectSessionInUrl: true, // Needed for password-reset / magic-link flows
  },
});
```

**Key Design:**
- **No browser token storage** — Supabase client is stateless by design
- **No auto-refresh** — The Express backend manages token lifecycle via cookies
- **URL detection** — Enabled for password reset flow (Supabase processes `#access_token=...` hash)

---

## 10. Security Design Decisions

| Decision | Rationale |
|----------|-----------|
| In-memory access token | Prevents XSS from reading tokens in `localStorage`/`sessionStorage` |
| HttpOnly refresh cookie | Cannot be accessed by JavaScript; CSRF mitigated by SameSite |
| No Supabase session persistence | Avoids storing tokens in browser storage |
| JWKS verification | Backend verifies JWTs against Supabase JWKS endpoint (no shared secret) |
| Status check on login | Prevents deactivated/on-hold users from accessing the app |
| Force-reset expiry check | Prevents users from being permanently trapped on force-reset page |

---

## ⚠️ Needs Verification

- **Supabase JWT expiry**: Default Supabase access token expiry is ~1 hour; verify if custom expiry is configured
- **Cookie attributes**: Verify `SameSite`, `Secure`, `HttpOnly`, `Path`, and `Max-Age` attributes on the refresh cookie
- **CORS + cookies in production**: `CROSS_ORIGIN_COOKIES=true` must be set on Railway backend for cross-origin cookie flow
- **Multi-tab behavior**: Each tab has its own in-memory access token; verify that refresh cookie sharing across tabs works correctly
