# Azure Key Vault + App Service — CareTrack API

Hands-on playbook for storing secrets in Key Vault and wiring them into the **CareTrack backend** (`caretrack-backend`). Your app reads normal environment variables (`process.env`), but App Service fills those variables from Key Vault references at runtime.

Replace placeholders in `{braces}` with your real names.

---

## Prerequisites

- An **Azure subscription** where you deploy the API (**App Service** on Linux recommended for this Node app).
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) logged in (`az login`).
- You know your **PostgreSQL URL** (`DATABASE_URL` with `sslmode=require`) and have generated a **JWT secret** (64+ bytes hex).

---

## 1. Variables to put in Key Vault (recommended)

CareTrack validates production config in `caretrack-backend/src/config.js`:

| Secret in Key Vault (name) | App Service setting name | Notes |
|----------------------------|-------------------------|-------|
| `CareTrack-DatabaseUrl` | `DATABASE_URL` | Single connection string including `sslmode=require` (or equivalent). Preferred if you use Supabase/pooler URLs. |
| `CareTrack-JwtSecret` | `JWT_SECRET` | **≥64 characters** in production (hex string from `randomBytes(64)` is fine). |
| `CareTrack-ResendApiKey` | `RESEND_API_KEY` | Optional; omit if you do not send invite emails. |
| `CareTrack-StorageConn` | `AZURE_STORAGE_CONNECTION_STRING` | Optional; enables immutable audit blob shipping. |

**Alternative DB layout:** If you split DB instead of `DATABASE_URL`, store `CareTrack-DbPassword` mapped to `DB_PASSWORD` (and put non-secret host/name as plain settings). Most teams using Supabase prefer one secret: full `DATABASE_URL`.

**Naming:** Key Vault allows letters, digits, `-`. Hyphenated secret names avoid confusion with env underscores.

---

## 2. Create the Key Vault

```powershell
az group create --name {rg-caretrack-prod} --location eastus

az keyvault create `
  --name {caretrack-kv-prod} `
  --resource-group {rg-caretrack-prod} `
  --location eastus `
  --enable-rbac-authorization true
```

**HIPAA-ish tip:** Pick a region that matches your BAAs/compliance stance; enable **purge protection** and **soft delete** for the vault when you finalize production (`az keyvault update`).

---

## 3. Populate secrets (first time)

**Generate JWT (run locally — do not paste into chat):**

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Set secrets in Key Vault** (CLI example — values are prompts/params, avoid echoing them in screenshots):

```powershell
$vault = "{caretrack-kv-prod}"

az keyvault secret set --vault-name $vault --name "CareTrack-JwtSecret" --value "<paste-jwt-secret>"

az keyvault secret set --vault-name $vault --name "CareTrack-DatabaseUrl" --value "<postgresql://...?sslmode=require>"

# Optional:
az keyvault secret set --vault-name $vault --name "CareTrack-ResendApiKey" --value "<re_xxxxx>"
az keyvault secret set --vault-name $vault --name "CareTrack-StorageConn" --value "<DefaultEndpointsProtocol=...>"
```

Rotate later by adding a **new version** of the same secret (`az keyvault secret set ...` again with the same `--name`). App Service resolves the latest version unless you pin a SecretVersion.

---

## 4. Managed identity on App Service

**Portal:** App Service → **Identity** → System assigned → **On**.

**CLI:**

```powershell
az webapp identity assign `
  --name {caretrack-api} `
  --resource-group {rg-caretrack-prod}

# Capture principalId:
az webapp identity show --name {caretrack-api} --resource-group {rg-caretrack-prod} -o json
```

---

## 5. Grant the app permission to **read** secrets

If the vault uses **RBAC** (`enable-rbac-authorization true`), assign Key Vault Secrets User to the app’s principal on the vault scope:

```powershell
$principalId = "<paste-system-assigned-object-id-from-previous-command>"
$vaultId = az keyvault show --name {caretrack-kv-prod} --resource-group {rg-caretrack-prod} --query id -otsv

az role assignment create `
  --role "Key Vault Secrets User" `
  --assignee-object-id $principalId `
  --assignee-principal-type ServicePrincipal `
  --scope $vaultId
```

Wait 1–5 minutes for RBAC propagation before Key Vault references show as valid in App Service.

---

## 6. App Service Configuration — Key Vault references

**Portal:** App Service → **Configuration** → **Application settings** → **New application setting**:

- **Name** = the env var CareTrack expects (e.g. `JWT_SECRET`).
- **Value** = Key Vault reference (see below).

**Reference syntax:**

```text
@Microsoft.KeyVault(VaultName={caretrack-kv-prod};SecretName=CareTrack-JwtSecret)
```

Do the same row-by-row:

| Setting name | Value (example) |
|--------------|-----------------|
| `DATABASE_URL` | `@Microsoft.KeyVault(VaultName={caretrack-kv-prod};SecretName=CareTrack-DatabaseUrl)` |
| `JWT_SECRET` | `@Microsoft.KeyVault(VaultName={caretrack-kv-prod};SecretName=CareTrack-JwtSecret)` |
| `RESEND_API_KEY` | `@Microsoft.KeyVault(VaultName={caretrack-kv-prod};SecretName=CareTrack-ResendApiKey)` *(optional)* |
| `AZURE_STORAGE_CONNECTION_STRING` | `@Microsoft.KeyVault(VaultName={caretrack-kv-prod};SecretName=CareTrack-StorageConn)` *(optional)* |

**Non-secret settings** (plain text in App Configuration — okay to stay out of Vault):

```text
NODE_ENV=production
PORT=8080
ALLOWED_ORIGINS=https://{your-static-app}.azurestaticapps.net
APP_PUBLIC_URL=https://{your-static-app}.azurestaticapps.net
DB_SSL_STRICT=true
COOKIE_SAMESITE=none
```

**Cross-domain cookies:** If the SPA runs on `{sub}.azurestaticapps.net` and the API on `{api}.azurewebsites.net`, you need `COOKIE_SAMESITE=none` and HTTPS on both (`Secure` cookie is enforced in production paths in code). Optionally set `COOKIE_DOMAIN=.yourapex.com` only if API and SPA share a registrable apex domain — **do not invent a value if you rely on unrelated Azure URLs**.

Save → **Restart** the App Service.

---

## 7. Confirm it works

1. **Configuration blade:** each Key Vault reference should show a green check (valid). Red = identity or RBAC misconfigured or wrong Vault/secret name.
2. **Log stream:** startup should **not** show `FATAL: invalid environment configuration`.
3. **Health:**  
   `GET https://{caretrack-api}.azurewebsites.net/api/health?deep=1`  
   should return `{ "status": "ok", "db": "ok", ... }`.

---

## 8. Rotation playbook (JWT, DB password, Resend)

1. **Generate or obtain** the new credential (vendor dashboard + local generator for JWT).
2. **`az keyvault secret set`** (same secret **name**) with the **new value** → creates a **new version**.
3. **Restart** App Service (or deployment slot swap) so all instances load the latest version.
4. **Vendor cleanup:** revoke the old Resend key or old DB password once traffic is stable.
5. **JWT rotate:** Expect all users to re-login once (old signatures invalid).

**Database:** If Supabase rotates the DB password, update the entire `DATABASE_URL` secret (not just password in app settings).

---

## 9. Common failures

| Symptom | Fix |
|---------|-----|
| App setting shows Key Vault reference error | Check vault name spelling, secret name spelling, Managed Identity enabled, RBAC assignment `Key Vault Secrets User` |
| App exits: JWT_SECRET must be at least 64 chars | Paste a longer secret into Vault or generate 64-byte hex |
| App exits: production DB connection must use SSL | Ensure URL contains `sslmode=require` or set `DB_SSL=true` |
| App exits: APP_PUBLIC_URL required | Set plain `APP_PUBLIC_URL` (HTTPS) |
| Cookies / CSRF / CORS in browser | Align `ALLOWED_ORIGINS`, `APP_PUBLIC_URL`, cookie SameSite/Vite API base |

---

## 10. Static Web Apps (SPA) reminder

Secrets for the **frontend** build are only **`VITE_*`** public vars (e.g. `VITE_API_BASE`). Never put JWT or DB strings in Static Web Apps. API keys stay server-side only (this App Service + Key Vault).

---

## Reference

- [App Service Key Vault references](https://learn.microsoft.com/azure/app-service/app-service-key-vault-references)
- [Use Key Vault RBAC authorization](https://learn.microsoft.com/azure/key-vault/general/rbac-guide)
