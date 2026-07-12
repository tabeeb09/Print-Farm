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
Run the host bridge beside Docker:

```powershell
Set-Location C:\website\Print-Farm\deployables\print-stage
$env:ORCA_LAN_WRAPPER="C:\path\to\orca-lan-helper.exe"
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
