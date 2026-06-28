<p align="center">
<picture>
       <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/supabase/supabase/master/packages/common/assets/images/supabase-logo-wordmark--dark.svg">
       <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/supabase/supabase/master/packages/common/assets/images/supabase-logo-wordmark--light.svg">
       <img alt="Supabase Logo" width="300" src="https://raw.githubusercontent.com/supabase/supabase/master/packages/common/assets/images/logo-preview.jpg">
</picture>
</p>

<h1 align="center">Supabase Self-Hosted for Easypanel</h1>

<p align="center">
  A clean, production-ready Supabase stack with MinIO (S3-compatible storage) designed for Easypanel deployment.
</p>

---

## Overview

This is a streamlined Docker Compose configuration for self-hosted [Supabase](https://supabase.com), optimized for [Easypanel](https://easypanel.io) deployment. It includes all core Supabase services plus **MinIO** for S3-compatible object storage.

## Services

| Service | Description | Port |
|---------|-------------|------|
| **Studio** | Web dashboard for managing your Supabase project | - |
| **Kong** | API Gateway routing all requests | 8000, 8443 |
| **Auth** | JWT-based authentication (GoTrue) | - |
| **PostgREST** | RESTful API for PostgreSQL | - |
| **Realtime** | WebSocket for database changes | - |
| **Storage** | File storage API (S3 via MinIO) | - |
| **imgproxy** | Image transformation server | - |
| **postgres-meta** | PostgreSQL management API | - |
| **Edge Functions** | Deno-based serverless functions | - |
| **PostgreSQL** | Primary database (v17) | 5432 |
| **Supavisor** | Connection pooler | 6543 |
| **MinIO** | S3-compatible object storage | 9000, 9001 |
| **MinIO Init** | Auto-creates the storage bucket | - |

## Prerequisites

- [Git](https://git-scm.com/)
- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2+
- [Node.js](https://nodejs.org/) (for key generation)

## Quick Start

### 1. Clone and configure

```bash
# Clone or copy this folder to your server
cd supabase-clean-easypanel

# Create your .env file
cp .env.example .env
```

### 2. Generate JWT keys

```bash
# Edit generate-keys.js and set your JWT_SECRET
# Then run:
node generate-keys.js
```

Copy the generated `ANON_KEY` and `SERVICE_ROLE_KEY` to your `.env` file.

### 3. Configure environment

Open `.env` and update **all** default values:

```bash
# Required changes
POSTGRES_PASSWORD=<your-secure-password>
JWT_SECRET=<your-32-char-secret>
DASHBOARD_USERNAME=<your-username>
DASHBOARD_PASSWORD=<your-secure-password>
SECRET_KEY_BASE=<random-64-char-string>
VAULT_ENC_KEY=<your-32-char-key>
PG_META_CRYPTO_KEY=<your-32-char-key>
```

### 4. Start the stack

```bash
docker compose up -d
```

### 5. Access the dashboard

Open `http://your-server:8000` in your browser.

- **Username:** `supabase` (or your `DASHBOARD_USERNAME`)
- **Password:** `this_password_is_insecure_and_should_be_updated` (or your `DASHBOARD_PASSWORD`)

## Configuration

### URLs

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPABASE_PUBLIC_URL` | `http://localhost:8000` | Public URL for the API |
| `API_EXTERNAL_URL` | `http://localhost:8000` | External URL for Auth callbacks |
| `SITE_URL` | `http://localhost:3000` | Site URL for Auth |

### Ports

| Variable | Default | Description |
|----------|---------|-------------|
| `KONG_HTTP_PORT` | `8000` | HTTP API port |
| `KONG_HTTPS_PORT` | `8443` | HTTPS API port |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POOLER_PROXY_PORT_TRANSACTION` | `6543` | Transaction pooler port |

### Storage (MinIO)

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIO_ROOT_USER` | `supa-storage` | MinIO access key |
| `MINIO_ROOT_PASSWORD` | `secret1234` | MinIO secret key |
| `GLOBAL_S3_BUCKET` | `stub` | S3 bucket name |

MinIO Console is available at `http://your-server:9001`.

### Auth

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_EMAIL_SIGNUP` | `true` | Allow email signups |
| `ENABLE_EMAIL_AUTOCONFIRM` | `true` | Auto-confirm emails |
| `ENABLE_PHONE_SIGNUP` | `true` | Allow phone signups |
| `ENABLE_PHONE_AUTOCONFIRM` | `true` | Auto-confirm phone OTP |

### SMTP (Email)

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_SENDER_NAME=Supabase
SMTP_ADMIN_EMAIL=admin@example.com
```

## Database

The PostgreSQL 17 database includes:

- **Schemas:** `public`, `storage`, `graphql_public`, `_realtime`, `_analytics`, `_supavisor`
- **Extensions:** `pg_net` (for webhooks/Edge Functions)
- **Roles:** `anon`, `authenticated`, `service_role`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `supabase_functions_admin`

### Connecting

```bash
# Direct connection (via Supavisor session mode)
psql postgresql://postgres:<password>@your-server:5432/postgres

# Transaction mode (via Supavisor)
psql postgresql://postgres:<password>@your-server:6543/postgres
```

## Production Checklist

Before deploying to production:

- [ ] Change ALL default passwords in `.env`
- [ ] Generate strong `JWT_SECRET` (32+ characters)
- [ ] Generate strong `SECRET_KEY_BASE` (64 characters)
- [ ] Configure SMTP for email authentication
- [ ] Set correct `SUPABASE_PUBLIC_URL` and `API_EXTERNAL_URL`
- [ ] Set up TLS/SSL (use Caddy or Nginx reverse proxy)
- [ ] Configure proper backup strategy for PostgreSQL
- [ ] Review CORS settings
- [ ] Restrict MinIO access (change default credentials)
- [ ] Set `DISABLE_SIGNUP=true` if needed

## Updating

```bash
# Check for updates
docker compose pull

# Restart with new images
docker compose down
docker compose up -d
```

> **Always backup your database before updating.**

## Troubleshooting

### Services not starting

```bash
# Check logs
docker compose logs -f [service-name]

# Check health status
docker compose ps
```

### Database connection issues

```bash
# Verify PostgreSQL is ready
docker compose exec db pg_isready -U postgres

# Reset database (WARNING: destroys data)
docker compose down -v
docker compose up -d
```

### Permission issues

```bash
# Fix volume permissions
sudo chown -R 1000:1000 ./volumes
```

## Useful Commands

```bash
# View all logs
docker compose logs -f

# Enter a container
docker compose exec db bash

# Run psql
docker compose exec db psql -U postgres

# Stop all services
docker compose down

# Stop and remove volumes (destroys data)
docker compose down -v
```

## Architecture

```
                    ┌─────────────┐
                    │    Client   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    Kong     │ :8000
                    │ API Gateway │ :8443
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
│     Auth      │  │    PostgREST  │  │    Storage    │
│   (GoTrue)    │  │               │  │  + imgproxy   │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼──────┐
                    │ PostgreSQL  │
                    │     db      │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    MinIO    │
                    │   (S3)      │
                    └─────────────┘
```

## Credits

Based on the official [Supabase Docker configuration](https://github.com/supabase/supabase/tree/master/docker), simplified and optimized for Easypanel deployment.

## License

Apache 2.0 - See [LICENSE](https://opensource.org/licenses/Apache-2.0)
