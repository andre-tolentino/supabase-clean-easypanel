#!/usr/bin/env node
/**
 * generate-all-keys.js
 *
 * Gera TODAS as credenciais do Supabase self-hosted em um unico .env pronto
 * para copiar e colar. Replica fielmente os scripts oficiais:
 *   - utils/generate-keys.sh
 *   - utils/add-new-auth-keys.sh
 *
 * Uso:
 *   node utils/generate-all-keys.js          # Imprime .env completo no terminal
 *   node utils/generate-all-keys.js > .env   # Salva direto no arquivo
 *
 * Requer: Node.js >= 16 (sem dependencias externas)
 * Fonte: https://github.com/supabase/supabase/tree/master/docker/utils
 */

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function genHex(n) {
  return crypto.randomBytes(n).toString('hex');
}

function genBase64(n) {
  return crypto.randomBytes(n).toString('base64');
}

function base64url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlString(str) {
  return base64url(Buffer.from(str));
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 1: generate-keys.sh  (segredos + legacy HS256 API keys)
// ═══════════════════════════════════════════════════════════════════════

// generate-keys.sh: jwt_secret=$(openssl rand -base64 30)
const jwtSecretBytes = crypto.randomBytes(30);
const JWT_SECRET = jwtSecretBytes.toString('base64');

// header padrao: {"alg":"HS256","typ":"JWT"}
const headerJSON = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
const headerB64 = base64urlString(headerJSON);

// gen_token: usa openssl dgst -sha256 -hmac "$jwt_secret"
// A CHAVE HMAC e a STRING JWT_SECRET (nao os bytes decodificados)
function genHS256Token(payload, secretString) {
  const payloadJSON = JSON.stringify(payload);
  const payloadB64 = base64urlString(payloadJSON);
  const signedContent = headerB64 + '.' + payloadB64;
  const sig = crypto.createHmac('sha256', secretString)
    .update(signedContent)
    .digest('base64url');
  return signedContent + '.' + sig;
}

// generate-keys.sh: iat=$(date +%s), exp=iat + 5*365*24*3600
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 5 * 365 * 24 * 3600; // 5 anos

// generate-keys.sh: iss="supabase"
const ANON_KEY = genHS256Token(
  { role: 'anon', iss: 'supabase', iat, exp },
  JWT_SECRET
);
const SERVICE_ROLE_KEY = genHS256Token(
  { role: 'service_role', iss: 'supabase', iat, exp },
  JWT_SECRET
);

// Demais segredos (generate-keys.sh)
const POSTGRES_PASSWORD = genHex(16);
const DASHBOARD_PASSWORD = genHex(16);
const SECRET_KEY_BASE = genBase64(48);        // 48 bytes = 64 chars
const VAULT_ENC_KEY = genHex(16);              // 16 bytes = 32 hex chars
const PG_META_CRYPTO_KEY = genBase64(24);      // 24 bytes = 32 chars
const LOGFLARE_PUBLIC_ACCESS_TOKEN = genBase64(24);
const LOGFLARE_PRIVATE_ACCESS_TOKEN = genBase64(24);
const S3_PROTOCOL_ACCESS_KEY_ID = genHex(16);
const S3_PROTOCOL_ACCESS_KEY_SECRET = genHex(32);
const MINIO_ROOT_PASSWORD = genHex(16);

// ═══════════════════════════════════════════════════════════════════════
// STEP 2: add-new-auth-keys.sh  (EC P-256 + opaque keys + JWKS)
// ═══════════════════════════════════════════════════════════════════════

const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwkPrivate = privateKey.export({ format: 'jwk' });
const kid = crypto.randomUUID();

// add-new-auth-keys.sh: k = Buffer.from(jwtSecret).toString("base64url")
const octKey = {
  kty: 'oct',
  k: Buffer.from(JWT_SECRET).toString('base64url'),
  alg: 'HS256'
};

// JWT_KEYS (signing: EC private + symmetric)
const jwksKeypair = [
  {
    kty: 'EC', kid, use: 'sig', key_ops: ['sign', 'verify'], alg: 'ES256',
    ext: true, crv: jwkPrivate.crv, x: jwkPrivate.x, y: jwkPrivate.y, d: jwkPrivate.d
  },
  octKey
];

// JWT_JWKS (verification: EC public + symmetric)
const jwksPublic = { keys: [
  {
    kty: 'EC', kid, use: 'sig', key_ops: ['verify'], alg: 'ES256',
    ext: true, crv: jwkPrivate.crv, x: jwkPrivate.x, y: jwkPrivate.y
  },
  octKey
]};

// signES256 (iss="supabase")
function signES256(payload) {
  const header = { alg: 'ES256', typ: 'JWT', kid };
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = b64Header + '.' + b64Payload;
  const sig = crypto.sign('SHA256', Buffer.from(data), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  }).toString('base64url');
  return data + '.' + sig;
}

const ANON_KEY_ASYMMETRIC = signES256({ role: 'anon', iss: 'supabase', iat, exp });
const SERVICE_ROLE_KEY_ASYMMETRIC = signES256({ role: 'service_role', iss: 'supabase', iat, exp });

// add-new-auth-keys.sh: generateOpaqueKey
const PROJECT_REF = 'supabase-self-hosted';
function generateOpaqueKey(prefix) {
  const random = crypto.randomBytes(17).toString('base64url').slice(0, 22);
  const intermediate = prefix + random;
  const checksum = crypto.createHash('sha256')
    .update(PROJECT_REF + '|' + intermediate)
    .digest('base64url')
    .slice(0, 8);
  return intermediate + '_' + checksum;
}

const SUPABASE_PUBLISHABLE_KEY = generateOpaqueKey('sb_publishable_');
const SUPABASE_SECRET_KEY = generateOpaqueKey('sb_secret_');

const JWT_KEYS = JSON.stringify(jwksKeypair);
const JWT_JWKS = JSON.stringify(jwksPublic);

// ═══════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════

const lines = [];
const E = (k, v) => lines.push(`${k}=${v}`);
const C = (s) => lines.push(s);

C('');
C('############');
C('# Secrets');
C('#');
C('# Gerado em ' + new Date().toISOString().slice(0, 10) + ' por utils/generate-all-keys.js');
C('#');
C('# Documentation:');
C('# https://supabase.com/docs/guides/self-hosting/docker#configuring-and-securing-supabase');
C('# https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys');
C('#');
C('############');
C('');

C('# Postgres');
E('POSTGRES_PASSWORD', POSTGRES_PASSWORD);
C('');
C('# Legacy symmetric HS256 key');
E('JWT_SECRET', JWT_SECRET);
C('# Legacy API keys (HS256-signed JWTs)');
E('ANON_KEY', ANON_KEY);
E('SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
C('');
C('# Asymmetric key pair (ES256) and opaque API keys');
C('#');
C('# Documentation:');
C('# https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys');
C('#');
C('# Opaque API key for client-side use (anon role).');
E('SUPABASE_PUBLISHABLE_KEY', SUPABASE_PUBLISHABLE_KEY);
C('# Opaque API key for server-side use (service_role). Never expose in client code.');
E('SUPABASE_SECRET_KEY', SUPABASE_SECRET_KEY);
C('');
C('# JSON array of signing JWKs (EC private + legacy symmetric).');
C('# Used by Auth.');
E('JWT_KEYS', JWT_KEYS);
C('# JWKS for token verification (EC public + legacy symmetric).');
C('# Used by PostgREST, Realtime, Storage to verify tokens.');
E('JWT_JWKS', JWT_JWKS);
C('');
C('# Access to Dashboard');
C('DASHBOARD_USERNAME=supabase');
E('DASHBOARD_PASSWORD', DASHBOARD_PASSWORD);
C('');
C('# Used by Realtime and Supavisor');
E('SECRET_KEY_BASE', SECRET_KEY_BASE);
C('');
C('# Used by Supavisor');
E('VAULT_ENC_KEY', VAULT_ENC_KEY.toUpperCase());
C('');
C('# Used by Studio to access Postgres via postgres-meta');
E('PG_META_CRYPTO_KEY', PG_META_CRYPTO_KEY);
C('');
C('# Analytics - API tokens for log ingestion/querying, and for management');
E('LOGFLARE_PUBLIC_ACCESS_TOKEN', LOGFLARE_PUBLIC_ACCESS_TOKEN);
E('LOGFLARE_PRIVATE_ACCESS_TOKEN', LOGFLARE_PRIVATE_ACCESS_TOKEN);
C('');
C('# Access to Storage via S3 protocol endpoint (see below)');
E('S3_PROTOCOL_ACCESS_KEY_ID', S3_PROTOCOL_ACCESS_KEY_ID);
E('S3_PROTOCOL_ACCESS_KEY_SECRET', S3_PROTOCOL_ACCESS_KEY_SECRET);
C('');
C('# Used internally by the API gateway - DO NOT use in any client or server code.');
C('# Pre-signed ES256 JWT "API key" for anon role.');
E('ANON_KEY_ASYMMETRIC', ANON_KEY_ASYMMETRIC);
C('# Pre-signed ES256 JWT "API key" for service_role.');
E('SERVICE_ROLE_KEY_ASYMMETRIC', SERVICE_ROLE_KEY_ASYMMETRIC);
C('');
C('');
C('############');
C('# URLs - Configure hostnames below to reflect your actual domain name');
C('############');
C('');
C('# Access to Dashboard and REST API');
C('SUPABASE_PUBLIC_URL=https://$(PRIMARY_DOMAIN)');
C('');
C('# Full external URL of the Auth service, used to construct OAuth callbacks,');
C('# SAML endpoints, and email links');
C('API_EXTERNAL_URL=https://$(PRIMARY_DOMAIN)');
C('');
C('# See also the Auth section below for Site URL and Redirect URLs configuration');
C('');
C('');
C('############');
C('# Database - Postgres configuration');
C('############');
C('');
C('# Using default user (postgres)');
C('POSTGRES_HOST=db');
C('POSTGRES_DB=postgres');
C('');
C('# Default configuration includes Supavisor exposing POSTGRES_PORT');
C('# Postgres uses POSTGRES_PORT inside the container');
C('# Documentation:');
C('# https://supabase.com/docs/guides/self-hosting/docker#accessing-postgres-through-supavisor');
C('POSTGRES_PORT=5432');
C('');
C('');
C('############');
C('# Supavisor - Database pooler');
C('############');
C('');
C('# Supavisor exposes POSTGRES_PORT and POOLER_PROXY_PORT_TRANSACTION,');
C('# POSTGRES_PORT is used for session mode pooling');
C('#');
C('# Port to use for transaction mode pooling connections');
C('POOLER_PROXY_PORT_TRANSACTION=6543');
C('');
C('# Maximum number of PostgreSQL connections Supavisor opens per pool');
C('POOLER_DEFAULT_POOL_SIZE=20');
C('');
C('# Maximum number of client connections Supavisor accepts per pool');
C('POOLER_MAX_CLIENT_CONN=100');
C('');
C('# Unique Supavisor tenant identifier');
C('# Documentation:');
C('# https://supabase.com/docs/guides/self-hosting/docker#accessing-postgres');
C('POOLER_TENANT_ID=your-tenant-id');
C('');
C('# Pool size for internal metadata storage used by Supavisor');
C('# This is separate from client connections and used only by Supavisor itself');
C('POOLER_DB_POOL_SIZE=5');
C('');
C('');
C('############');
C('# Studio - Configuration for the Dashboard');
C('############');
C('');
C('STUDIO_DEFAULT_ORGANIZATION=Default Organization');
C('STUDIO_DEFAULT_PROJECT=Default Project');
C('');
C('# Add your OpenAI API key to enable AI Assistant');
C('OPENAI_API_KEY=');
C('');
C('');
C('############');
C('# Auth - Configuration for the authentication server');
C('############');
C('');
C('## General settings');
C('');
C('# Equivalent to "Site URL" and "Redirect URLs" platform configuration options');
C('# Documentation: https://supabase.com/docs/guides/auth/redirect-urls');
C('SITE_URL=https://$(PRIMARY_DOMAIN)');
C('ADDITIONAL_REDIRECT_URLS=');
C('');
C('JWT_EXPIRY=3600');
C('DISABLE_SIGNUP=false');
C('');
C('## Mailer Config');
C('MAILER_URLPATHS_CONFIRMATION="/auth/v1/verify"');
C('MAILER_URLPATHS_INVITE="/auth/v1/verify"');
C('MAILER_URLPATHS_RECOVERY="/auth/v1/verify"');
C('MAILER_URLPATHS_EMAIL_CHANGE="/auth/v1/verify"');
C('');
C('## Email auth');
C('ENABLE_EMAIL_SIGNUP=true');
C('ENABLE_EMAIL_AUTOCONFIRM=false');
C('SMTP_ADMIN_EMAIL=admin@example.com');
C('SMTP_HOST=supabase-mail');
C('SMTP_PORT=2500');
C('SMTP_USER=fake_mail_user');
C('SMTP_PASS=fake_mail_password');
C('SMTP_SENDER_NAME=fake_sender');
C('ENABLE_ANONYMOUS_USERS=false');
C('');
C('## Phone auth');
C('ENABLE_PHONE_SIGNUP=true');
C('ENABLE_PHONE_AUTOCONFIRM=true');
C('');
C('## OAuth / Social login providers');
C('');
C('# Uncomment and fill in the providers you want to enable.');
C('# You must ALSO uncomment the matching GOTRUE_EXTERNAL_* lines in docker-compose.yml');
C('# Documentation: https://supabase.com/docs/guides/self-hosting/self-hosted-oauth');
C('# GOOGLE_ENABLED=false');
C('# GOOGLE_CLIENT_ID=');
C('# GOOGLE_SECRET=');
C('#');
C('# GITHUB_ENABLED=false');
C('# GITHUB_CLIENT_ID=');
C('# GITHUB_SECRET=');
C('#');
C('# AZURE_ENABLED=false');
C('# AZURE_CLIENT_ID=');
C('# AZURE_SECRET=');
C('');
C('# Phone / SMS provider configuration');
C('# Uncomment to configure SMS delivery for phone auth and phone MFA.');
C('# You must ALSO uncomment the matching GOTRUE_SMS_* lines in docker-compose.yml');
C('# Documentation: https://supabase.com/docs/guides/self-hosting/self-hosted-phone-mfa');
C('# SMS_PROVIDER=twilio');
C('# SMS_OTP_EXP=60');
C('# SMS_OTP_LENGTH=6');
C('# SMS_MAX_FREQUENCY=60s');
C('# SMS_TEMPLATE=Your code is {{ .Code }}');
C('#');
C('# SMS_TWILIO_ACCOUNT_SID=');
C('# SMS_TWILIO_AUTH_TOKEN=');
C('# SMS_TWILIO_MESSAGE_SERVICE_SID=');
C('#');
C('# Test OTP: map phone numbers to fixed OTP codes for development');
C('# Format: phone1:code1,phone2:code2');
C('# SMS_TEST_OTP=');
C('');
C('# Multi-factor authentication (MFA)');
C('# Uncomment to change MFA defaults.');
C('# You must ALSO uncomment the matching GOTRUE_MFA_* lines in docker-compose.yml');
C('#');
C('# App Authenticator (TOTP) - enabled by default');
C('# MFA_TOTP_ENROLL_ENABLED=true');
C('# MFA_TOTP_VERIFY_ENABLED=true');
C('#');
C('# Phone MFA - disabled by default (opt-in)');
C('# MFA_PHONE_ENROLL_ENABLED=false');
C('# MFA_PHONE_VERIFY_ENABLED=false');
C('#');
C('# Maximum MFA factors a user can enroll');
C('# MFA_MAX_ENROLLED_FACTORS=10');
C('');
C('## SAML SSO');
C('');
C('# You must ALSO uncomment the matching GOTRUE_* lines in docker-compose.yml');
C('# Documentation: https://supabase.com/docs/guides/self-hosting/self-hosted-saml-sso');
C('#');
C('# SAML_ENABLED=true');
C('# SAML_PRIVATE_KEY=<your-base64-encoded-private-key>');
C('#');
C('# Optional: accept encrypted SAML assertions from IdPs (default: false)');
C('# SAML_ALLOW_ENCRYPTED_ASSERTIONS=false');
C('#');
C('# Optional: how long relay state tokens remain valid (default: 2m0s)');
C('# SAML_RELAY_STATE_VALIDITY_PERIOD=2m0s');
C('#');
C('# Optional: override the SAML entity ID / ACS base URL');
C('# Defaults to API_EXTERNAL_URL if not set');
C('# SAML_EXTERNAL_URL=https://supabase.example.com:8000');
C('#');
C('# Optional: rate limit on the ACS endpoint (requests per second, default: 15)');
C('# SAML_RATE_LIMIT_ASSERTION=15');
C('');
C('');
C('############');
C('# Storage - Configuration for Storage (MinIO S3 backend)');
C('############');
C('');
C('# Check the S3_PROTOCOL_ACCESS_KEY_ID/SECRET above, and');
C('# refer to the documentation at:');
C('# https://supabase.com/docs/guides/self-hosting/self-hosted-s3');
C('# to learn how to configure the S3 protocol endpoint');
C('');
C('# S3 bucket when using S3 backend');
C('GLOBAL_S3_BUCKET=stub');
C('');
C('# Used for S3 protocol endpoint configuration');
C('REGION=stub');
C('');
C('# MinIO credentials (must match AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in storage service)');
C('MINIO_ROOT_USER=supa-storage');
E('MINIO_ROOT_PASSWORD', MINIO_ROOT_PASSWORD);
C('');
C('# Equivalent to project_ref as described here:');
C('# https://supabase.com/docs/guides/storage/s3/authentication#session-token');
C('STORAGE_TENANT_ID=stub');
C('');
C('');
C('############');
C('# Functions - Configuration for Edge functions');
C('############');
C('');
C('# Documentation:');
C('# https://supabase.com/docs/guides/self-hosting/self-hosted-functions');
C('');
C('# NOTE: VERIFY_JWT applies to all functions');
C('FUNCTIONS_VERIFY_JWT=false');
C('');
C('');
C('############');
C('# API - Configuration for PostgREST');
C('############');
C('');
C('# Postgres schemas exposed via the REST API');
C('PGRST_DB_SCHEMAS=public,storage,graphql_public');
C('');
C('# Max number of rows returned by a request');
C('PGRST_DB_MAX_ROWS=1000');
C('');
C('# Extra schemas added to the search_path of every request');
C('PGRST_DB_EXTRA_SEARCH_PATH=public');
C('');
C('');
C('############');
C('# API gateway');
C('############');
C('');
C('# Kong configuration variables');
C('KONG_HTTP_PORT=8000');
C('KONG_HTTPS_PORT=8443');
C('');
C('');
C('############');
C('# imgproxy');
C('############');
C('');
C('# Enable webp support');
C('IMGPROXY_AUTO_WEBP=true');
C('');

// ═══════════════════════════════════════════════════════════════════════
// Print
// ═══════════════════════════════════════════════════════════════════════

console.log(lines.join('\n'));
