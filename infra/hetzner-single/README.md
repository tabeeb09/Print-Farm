# Hetzner Single-VPS Bootstrap

This layout provisions one Hetzner Cloud VPS for CAId/OpenBao/Keycloak, RustFS, and the website stack. It is the lowest-cost deployment shape and routes services internally through the CAId Caddy gateway.

## One Command

From the repository root:

```powershell
.\scripts\bootstrap-hetzner-project.ps1 --config infra\hetzner-single\bootstrap.config.example.json
```

If you downloaded a Google OAuth client JSON from Google Cloud Console, pass it directly instead of manually copying the client ID and secret:

```powershell
.\scripts\bootstrap-hetzner-project.ps1 --config .\my-bootstrap.config.json --google-client-secrets-file "C:\Users\This PC\Downloads\client_secret.json"
```

On Linux/macOS:

```sh
./scripts/bootstrap-hetzner-project.sh --config infra/hetzner-single/bootstrap.config.example.json
```

Copy `bootstrap.config.example.json` to a private local file and edit it for each project. Keep reusable non-secret parameters there, such as domain, public hostnames, Hetzner location, server size, repo URL, branch, and owner email.

The script still prompts for the Hetzner Cloud API token and master setup password unless you deliberately put them in the config file. Prefer entering sensitive values interactively.

## Required Human Inputs

- `hcloudToken`: Hetzner Cloud API token, created in the Hetzner Cloud Console under the target project.
- `masterSetupPassword`: password used to encrypt the local recovery bundle.
- `baseDomain`: DNS zone used to derive `auth`, `bao`, `app`, `media`, `oauth2`, and `rustfs-admin` subdomains.
- `appHost`: public hostname for the website, for example `oi.loftrop.com`.
- `adminCidr`: IP/CIDR allowed to access SSH and protected admin services. Use `auto` to detect your current public IP and convert it to `/32`.
- `websiteRepoUrl`: Git repository to clone for the website project.
- `googleClientId` and `googleClientSecret`: optional, only required if Google login is enabled. Prefer `--google-client-secrets-file` if you have the Google-downloaded JSON file.
- `dnsProvider`: set to `cloudflare` to let the bootstrapper create/update the DNS records after Terraform returns the VPS IP.
- `cloudflareApiToken`: optional in the config file; if `dnsProvider=cloudflare` and this is blank, the script prompts for it. The token needs `Zone:DNS:Edit` and `Zone:Zone:Read` on the `loftrop.com` zone.

For Google OAuth with `appHost=oi.loftrop.com`, use:

```text
Authorized JavaScript origin: https://oi.loftrop.com
Authorized redirect URI: https://oi.loftrop.com/api/auth/callback/google
```

Generated output is written under `.generated/hetzner/`, which is ignored by git.

After Terraform creates the VPS, the bootstrapper prints the required DNS `A` records and waits for them to resolve before continuing. This is necessary because the VPS IP is only known after provisioning.

If `dnsProvider=cloudflare`, the bootstrapper updates those DNS records automatically before the DNS wait step. The Cloudflare token is also passed into CAId and stored in OpenBao at `kv/data/cloudflare/prod`.
