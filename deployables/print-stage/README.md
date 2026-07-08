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
