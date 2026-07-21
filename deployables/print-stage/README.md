# Print Stage

Standalone print portal, queue worker, and printer handoff tooling.

## OpenBao AppRole Minting

Admins with `owner`, `openbao_admin`, or `infra_admin` can open `/admin/approles` to mint a read-only AppRole credential file for worker machines.

The server needs one OpenBao admin credential configured. Prefer a tightly-scoped admin AppRole over a long-lived root token:

```env
BAO_ADDR=https://bao.example.com
BAO_KV_MOUNT=kv
BAO_APPROLE_AUTH_PATH=approle
BAO_ADMIN_ROLE_ID=...
BAO_ADMIN_SECRET_ID=...
```

`BAO_ADMIN_TOKEN` is also supported for controlled break-glass use.

The web UI does not accept arbitrary policy text. It creates a policy that can read exactly one KV v2 secret path, creates or updates the named AppRole, and returns `openbao-approle.env` once. Install that file on the worker machine as `/config/openbao-approle.env`.

The current default preset points workers at `print/prod` because that path already contains the queue S3 credentials. After a narrower `print-worker/prod` secret is seeded, change `BAO_SECRET_PATH_PRINT_WORKER` to `print-worker/prod`.

## Host Orca LAN Bridge

The Docker worker polls the queue, but the actual Bambu LAN handoff must run on
the Windows host where OrcaSlicer and its Bambu networking plugin are installed.
Build the host helper from inside an OrcaSlicer checkout:

```powershell
Set-Location C:\website\Print-Farm\deployables\print-stage
.\scripts\build-orca-lan-print-target.ps1 -OrcaRoot C:\website\OrcaSlicer -AllowInsecureHashPinnedDownloads
```

`-AllowInsecureHashPinnedDownloads` is only for Orca's dependency download
phase on machines where CMake cannot find a CA bundle. Orca's dependency
archives are still checked against the SHA hashes in Orca's CMake files.

Run the host bridge beside Docker:

```powershell
Set-Location C:\website\Print-Farm\deployables\print-stage
$env:ORCA_LAN_WRAPPER="C:\website\Print-Farm\deployables\print-stage\orca-lan-wrapper\bin\OrcaSlicer_lan_print.exe"
$env:ORCA_LAN_BRIDGE_OUTBOX_HOST_DIR="C:\website\Print-Farm\deployables\print-stage\worker-outbox"
npm run host:orca-bridge
```

For a bridge smoke test before the C++ helper is compiled:

```powershell
$env:ORCA_LAN_DRY_RUN="1"
npm run host:orca-bridge
```

The container downloads queued `.gcode.3mf` files into `/outbox`, which is
bind-mounted to `.\worker-outbox`. It then POSTs the printer details and file
path to `http://host.docker.internal:47831/print`. The host bridge translates
the path and launches `ORCA_LAN_WRAPPER`.

## People And Permissions

Admins with `owner` or `identity_hr_manager` can open `/admin/people` to search for users by email and assign or remove allowlisted Keycloak client roles.

The server needs Keycloak admin access:

```env
KEYCLOAK_ADMIN_REALM=master
KEYCLOAK_ADMIN_CLIENT_ID=admin-cli
KEYCLOAK_ADMIN_CLIENT_SECRET=...
```

Password-based admin credentials are also supported with `KEYCLOAK_ADMIN_USERNAME` and `KEYCLOAK_ADMIN_PASSWORD`, but a service-account client is preferred.

The assignable role list is controlled by:

```env
KEYCLOAK_MANAGEABLE_ROLES=viewer,editor,media_admin,technician,print_admin,config_admin,openbao_admin,infra_admin,identity_hr_manager
```

## Password Emails

Password recovery goes through the app endpoint at `/api/auth/recover`.
Signed-in users can request a password-change email from `/account/security`,
which calls `/api/auth/change-password-email`.

Both flows check the user in Keycloak, reserve one daily email quota event in
S3, create a short-lived one-time reset token in S3, and send the reset link
through Resend's HTTPS API. The quota is intentionally conservative: if quota
state cannot be written, no password email is sent.

The default daily hard limit is `95` total outbound email events per UTC day.
By default one event is reserved for an owner alert, so user-facing password
emails stop at `94`; the alert email consumes event `95`.

Resend can be configured in OpenBao with:

```powershell
$env:RESEND_API_KEY = "<resend-api-key>"
$env:RESEND_FROM_EMAIL = "no-reply@mg.example.com"
node scripts\configure-resend-openbao.mjs --bootstrap-env C:\path\to\openbao-bootstrap.env
```

This writes the equivalent Keycloak SMTP settings into `keycloak/prod`:

```env
KEYCLOAK_SMTP_HOST=smtp.resend.com
KEYCLOAK_SMTP_PORT=465
KEYCLOAK_SMTP_FROM=no-reply@mg.example.com
KEYCLOAK_SMTP_USER=resend
KEYCLOAK_SMTP_PASSWORD=<RESEND_API_KEY>
KEYCLOAK_SMTP_SSL=true
KEYCLOAK_SMTP_STARTTLS=false
KEYCLOAK_SMTP_AUTH=true
KEYCLOAK_LOGIN_RESET_PASSWORD_ALLOWED=true
RESEND_API_KEY=<RESEND_API_KEY>
RESEND_FROM_EMAIL=no-reply@mg.example.com
EMAIL_DAILY_LIMIT=95
EMAIL_DAILY_ALERT_RECIPIENT_LIMIT=4
EMAIL_DAILY_ALERT_RESERVE=true
PASSWORD_RESET_TOKEN_S3_PREFIX=private/system/password-reset-tokens
PASSWORD_RESET_TOKEN_TTL_MINUTES=30
```

For isolated print storage, set `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`,
`S3_PRIVATE_BUCKET`, and optionally `S3_PROJECT_KEY_PREFIX=print/prod` from
the print deployment secrets. Do not hard-code the portfolio media endpoint in
the print compose file; the print app and worker should read their own S3
configuration from `/etc/print/deploy.env` or OpenBao.

`scripts/sync-keycloak-realm-auth.mjs` applies those settings to Keycloak
during print deploy. When the daily limit is reached, the app sends one alert
email to at most four `SUPERADMIN_EMAILS`/`owner` users recommending either
upgrading Resend/payment or implementing a self-hosted mail relay.

The sync script keeps Keycloak's public "forgot password" action enabled by
default (`KEYCLOAK_LOGIN_RESET_PASSWORD_ALLOWED=true`), but the print app's
`/auth/recover` page does not rely on Keycloak SMTP. It routes recovery through
the S3 quota gate, sends through Resend HTTPS, then uses Keycloak admin
`reset-password` only after the one-time app token is verified.
