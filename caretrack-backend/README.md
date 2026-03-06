# CareTrack Backend

Node.js + Express + PostgreSQL backend for the CareTrack nursing home admissions and clinical task management system. Designed for deployment on **Microsoft Azure** with HIPAA compliance in mind.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Local Development Setup](#local-development-setup)
4. [Azure Production Setup](#azure-production-setup)
5. [API Reference](#api-reference)
6. [Wiring to the React Frontend](#wiring-to-the-react-frontend)
7. [HIPAA Compliance Checklist](#hipaa-compliance-checklist)
8. [Security Notes](#security-notes)

---

## Architecture Overview

```
React Frontend (Azure Static Web Apps)
        │
        │ HTTPS (TLS 1.2+)
        ▼
Express API (Azure App Service)
        │
        ├── Azure Database for PostgreSQL – Flexible Server
        │     Encryption at rest, private VNet, SSL enforced
        │
        ├── Azure Key Vault
        │     JWT secret, DB password, connection strings
        │
        └── Azure Blob Storage
              Immutable HIPAA audit logs
```

---

## Project Structure

```
caretrack-backend/
├── src/
│   ├── server.js                  # Express app entry point
│   ├── routes/
│   │   └── index.js               # All route definitions
│   ├── controllers/
│   │   ├── authController.js      # Login, logout, password change
│   │   ├── patientsController.js  # Patient CRUD, admit, discharge
│   │   ├── tasksController.js     # Task assign, complete, notes
│   │   └── usersController.js     # User management (admin only)
│   ├── middleware/
│   │   ├── auth.js                # JWT verification, role guards
│   │   ├── audit.js               # HIPAA audit logger
│   │   └── errorHandler.js        # Centralized error handling
│   ├── db/
│   │   └── pool.js                # PostgreSQL connection pool
│   └── api-client.js              # Drop into your React frontend
├── migrations/
│   ├── 001_initial_schema.sql     # Full DB schema
│   ├── run.js                     # Migration runner
│   └── seed.js                    # Dev seed data
├── logs/                          # Local audit logs (auto-created)
├── .env.example                   # Environment variable template
└── package.json
```

---

## Local Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+ running locally (or use Docker)

### 1. Install dependencies
```bash
npm install
```

### 2. Create your `.env` file
```bash
cp .env.example .env
```

Edit `.env` with your local PostgreSQL credentials:
```
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=caretrack
DB_USER=postgres
DB_PASSWORD=your_local_password
DB_SSL=false
JWT_SECRET=generate_a_64_byte_hex_string_here
ALLOWED_ORIGINS=http://localhost:5173
```

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Create the database
```bash
psql -U postgres -c "CREATE DATABASE caretrack;"
```

### 4. Run migrations
```bash
npm run migrate
```

### 5. Seed demo data
```bash
npm run seed
```

Demo credentials created by the seed:
| Role      | Username  | Password         |
|-----------|-----------|------------------|
| Physician | dr.smith  | CareTrack2026!   |
| Physician | dr.patel  | CareTrack2026!   |
| Admin     | admin     | CareTrack2026!   |
| Admin     | j.garcia  | CareTrack2026!   |

### 6. Start the server
```bash
npm run dev     # Development (with nodemon auto-reload)
npm start       # Production
```

API will be available at `http://localhost:3001/api`

---

## Azure Production Setup

### Step 1: Create an Azure PostgreSQL Flexible Server

```bash
az postgres flexible-server create \
  --resource-group caretrack-rg \
  --name caretrack-db \
  --location eastus \
  --admin-user caretrackadmin \
  --admin-password "YOUR_STRONG_PASSWORD" \
  --sku-name Standard_B2ms \
  --tier Burstable \
  --version 15 \
  --storage-size 32 \
  --backup-retention 35 \
  --geo-redundant-backup Enabled \
  --public-access None
```

**Important settings to verify in the Azure portal:**
- ✅ SSL enforcement: **Required**
- ✅ Backup retention: **35 days** (HIPAA recommends 6 years — configure long-term backup separately)
- ✅ Private endpoint or VNet integration: **Enabled**
- ✅ Azure Defender for PostgreSQL: **Enabled**

### Step 2: Create Azure Key Vault

```bash
az keyvault create \
  --name caretrack-vault \
  --resource-group caretrack-rg \
  --location eastus \
  --enable-purge-protection true \
  --retention-days 90
```

Store your secrets:
```bash
az keyvault secret set --vault-name caretrack-vault --name "JWT-SECRET" --value "your_jwt_secret"
az keyvault secret set --vault-name caretrack-vault --name "DB-PASSWORD" --value "your_db_password"
```

### Step 3: Create Azure Blob Storage for Audit Logs

```bash
az storage account create \
  --name caretrackaudit \
  --resource-group caretrack-rg \
  --location eastus \
  --sku Standard_GRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2

az storage container create \
  --name caretrack-audit-logs \
  --account-name caretrackaudit \
  --public-access off
```

Enable immutability policy (HIPAA requires tamper-proof audit logs):
```bash
az storage container immutability-policy create \
  --account-name caretrackaudit \
  --container-name caretrack-audit-logs \
  --period 2557   # 7 years in days (HIPAA requirement)
```

### Step 4: Deploy to Azure App Service

```bash
az appservice plan create \
  --name caretrack-plan \
  --resource-group caretrack-rg \
  --sku B2 \
  --is-linux

az webapp create \
  --name caretrack-api \
  --resource-group caretrack-rg \
  --plan caretrack-plan \
  --runtime "NODE:18-lts"
```

Enable Managed Identity (so App Service can pull secrets from Key Vault without credentials in code):
```bash
az webapp identity assign \
  --name caretrack-api \
  --resource-group caretrack-rg

# Grant the identity access to Key Vault
az keyvault set-policy \
  --name caretrack-vault \
  --object-id $(az webapp identity show --name caretrack-api --resource-group caretrack-rg --query principalId -o tsv) \
  --secret-permissions get list
```

Set App Service environment variables (reference Key Vault using `@Microsoft.KeyVault(...)` syntax):
```bash
az webapp config appsettings set \
  --name caretrack-api \
  --resource-group caretrack-rg \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    DB_HOST=caretrack-db.postgres.database.azure.com \
    DB_NAME=caretrack \
    DB_USER=caretrackadmin \
    DB_SSL=true \
    DB_PASSWORD="@Microsoft.KeyVault(VaultName=caretrack-vault;SecretName=DB-PASSWORD)" \
    JWT_SECRET="@Microsoft.KeyVault(VaultName=caretrack-vault;SecretName=JWT-SECRET)" \
    JWT_EXPIRES_IN=8h \
    ALLOWED_ORIGINS=https://your-app.azurestaticapps.net \
    AZURE_STORAGE_CONNECTION_STRING="your_storage_connection_string" \
    AZURE_AUDIT_CONTAINER=caretrack-audit-logs
```

### Step 5: Run migrations against Azure PostgreSQL

```bash
# Temporarily whitelist your IP to run migrations
az postgres flexible-server firewall-rule create \
  --resource-group caretrack-rg \
  --name caretrack-db \
  --rule-name temp-deploy \
  --start-ip-address YOUR_IP \
  --end-ip-address YOUR_IP

# Run migrations
DB_HOST=caretrack-db.postgres.database.azure.com \
DB_USER=caretrackadmin \
DB_PASSWORD=YOUR_PASSWORD \
DB_SSL=true \
node migrations/run.js

# Remove the temporary firewall rule
az postgres flexible-server firewall-rule delete \
  --resource-group caretrack-rg \
  --name caretrack-db \
  --rule-name temp-deploy
```

---

## API Reference

All endpoints are prefixed with `/api`.

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | None | Login — returns JWT |
| POST | `/auth/logout` | Required | Logout (logs event) |
| GET | `/auth/me` | Required | Get current user |
| POST | `/auth/change-password` | Required | Change own password |

**Login request:**
```json
{ "username": "dr.smith", "password": "CareTrack2026!" }
```
**Login response:**
```json
{
  "token": "eyJhbG...",
  "user": { "id": "...", "username": "dr.smith", "role": "physician", "fullName": "Dr. James Smith" },
  "expiresIn": "8h"
}
```

### Patients

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/patients` | Both | List patients (physicians scoped to own) |
| GET | `/patients/:id` | Both | Get patient detail |
| POST | `/patients` | Both | Create patient |
| PATCH | `/patients/:id` | Admin | Update patient |
| POST | `/patients/:id/admit` | Admin | Mark In House |
| POST | `/patients/:id/discharge` | Admin | Discharge + cancel tasks |
| DELETE | `/patients/:id` | Admin | Remove pending patient |

**Query params for GET /patients:** `?status=inhouse&physician=dr.smith&location=Sunrise+Care+Center`

### Tasks

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/patients/:id/tasks` | Both | List tasks for patient |
| POST | `/patients/:id/tasks` | Admin | Create/upsert task |
| PATCH | `/patients/:id/tasks/:taskId/assign` | Admin | Assign task |
| PATCH | `/patients/:id/tasks/:taskId/complete` | Physician | Mark complete |
| PATCH | `/patients/:id/tasks/:taskId/note` | Admin | Update note |

### Users (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List all users |
| POST | `/users` | Create user |
| PATCH | `/users/:id` | Update user |
| POST | `/users/:id/reset-password` | Reset a user's password |

---

## Wiring to the React Frontend

1. Copy `src/api-client.js` into your React project as `src/api.js`

2. Add to your frontend `.env`:
   ```
   VITE_API_URL=http://localhost:3001/api
   ```

3. Update `handleLogin` in `App.jsx`:
   ```js
   import { auth, patients, tasks, setToken, clearToken } from "./api";

   async function handleLogin({ username, password }) {
     try {
       const { token, user } = await auth.login(username, password);
       setToken(token);                       // store JWT in memory
       setUser(user);
       const { patients: pts } = await patients.list();
       setAdmissions(pts.map(mapPatient));    // map snake_case → camelCase
     } catch (err) {
       setError(err.message);
     }
   }
   ```

4. Replace in-memory state mutations with API calls:
   ```js
   // Promote to in-house
   async function promoteToInhouse(id) {
     await patients.admit(id);
     const { patients: pts } = await patients.list();
     setAdmissions(pts.map(mapPatient));
   }

   // Discharge
   async function dischargePatient(id) {
     await patients.discharge(id);
     setAdmissions(prev => prev.filter(a => a.id !== id));
     setDischargeId(null);
   }

   // Complete task
   async function completeTask(patientId, taskId) {
     await tasks.complete(patientId, taskId);
     // refresh task list for this patient
   }
   ```

5. Map DB field names (snake_case) to the existing frontend shape (camelCase):
   ```js
   function mapPatient(p) {
     return {
       id: p.id,
       first: p.first_name,
       last: p.last_name,
       dob: p.dob,
       room: p.room,
       arrival: p.arrival_at,
       dx: p.diagnosis,
       notes: p.notes,
       status: p.status,
       admitTs: p.admit_ts ? new Date(p.admit_ts).getTime() : null,
       physician: p.physician_username,
       location: p.location,
     };
   }
   ```

---

## HIPAA Compliance Checklist

### ✅ Implemented in this backend
- [x] All PHI access/modification events are audit-logged (who, what, when, from where)
- [x] Role-based access control enforced server-side (not just in the UI)
- [x] Physicians scoped to their own patients server-side
- [x] Passwords hashed with bcrypt (12 rounds minimum)
- [x] JWT sessions expire after 8 hours
- [x] Timing-safe login (prevents username enumeration)
- [x] Helmet.js security headers (HSTS, CSP, etc.)
- [x] Rate limiting on all endpoints, stricter on login
- [x] Request body size capped (512KB)
- [x] No PHI in server logs (Morgan configured for header-only logging in production)
- [x] SSL required for database connections
- [x] Soft-delete for discharged patients (PHI retained for 6 years per HIPAA)
- [x] Audit logs shipped to Azure Blob Storage with immutability policy

### 🔲 Required before production go-live
- [ ] Sign a Business Associate Agreement (BAA) with Microsoft Azure
- [ ] Sign a BAA with any other vendors (email, SMS notification providers, etc.)
- [ ] Enable Azure Defender for PostgreSQL
- [ ] Configure private VNet between App Service and PostgreSQL (no public DB endpoint)
- [ ] Enable Azure Private Endpoint for Blob Storage
- [ ] Set up Azure Monitor alerts for failed logins and unusual access patterns
- [ ] Enable App Service access restrictions (IP allowlist if applicable)
- [ ] Configure session timeout and re-authentication in the frontend
- [ ] Implement MFA for all user accounts
- [ ] Conduct a risk analysis (required by HIPAA Security Rule §164.308(a)(1))
- [ ] Document your policies and procedures
- [ ] Train all staff on HIPAA requirements
- [ ] Schedule annual HIPAA audits

---

## Security Notes

**JWT tokens are stored in memory only** in the provided API client — not in `localStorage` or cookies. This means the token is lost on page refresh (user must re-login). This is intentional and appropriate for PHI-handling applications. For a better UX, consider a short-lived httpOnly cookie with CSRF protection instead.

**Passwords must be at least 12 characters.** Enforce complexity requirements in your organization's password policy.

**Audit logs are immutable in Azure Blob Storage** with a 7-year retention policy, satisfying the HIPAA requirement to retain PHI-related documentation for 6 years.

**Never commit `.env` to source control.** All production secrets must be stored in Azure Key Vault and referenced via Managed Identity.
