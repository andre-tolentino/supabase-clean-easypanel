const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Digite o JWT_SECRET (o mesmo do seu .env): ', (jwtSecret) => {
  rl.close();

  if (!jwtSecret || jwtSecret.length < 32) {
    console.error('Erro: JWT_SECRET deve ter pelo menos 32 caracteres.');
    process.exit(1);
  }

  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwkPrivate = privateKey.export({ format: 'jwk' });
  const kid = crypto.randomUUID();

  const octKey = {
    kty: 'oct',
    k: Buffer.from(jwtSecret).toString('base64url'),
    alg: 'HS256'
  };

  const jwksKeypair = { keys: [
    { kty: 'EC', kid, use: 'sig', key_ops: ['sign', 'verify'], alg: 'ES256', ext: true,
      crv: jwkPrivate.crv, x: jwkPrivate.x, y: jwkPrivate.y, d: jwkPrivate.d },
    octKey
  ]};

  const jwksPublic = { keys: [
    { kty: 'EC', kid, use: 'sig', key_ops: ['verify'], alg: 'ES256', ext: true,
      crv: jwkPrivate.crv, x: jwkPrivate.x, y: jwkPrivate.y },
    octKey
  ]};

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

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 5 * 365 * 24 * 3600;

  const anonJwt = signES256({ role: 'anon', iss: 'supabase', iat, exp });
  const serviceJwt = signES256({ role: 'service_role', iss: 'supabase', iat, exp });

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

  const publishableKey = generateOpaqueKey('sb_publishable_');
  const secretKey = generateOpaqueKey('sb_secret_');

  console.log('');
  console.log('# ============================================');
  console.log('# Chaves Assimetricas geradas para o Supabase');
  console.log('# ============================================');
  console.log('');
  console.log('SUPABASE_PUBLISHABLE_KEY=' + publishableKey);
  console.log('SUPABASE_SECRET_KEY=' + secretKey);
  console.log('');
  console.log('ANON_KEY_ASYMMETRIC=' + anonJwt);
  console.log('SERVICE_ROLE_KEY_ASYMMETRIC=' + serviceJwt);
  console.log('');
  console.log('JWT_KEYS=' + JSON.stringify(jwksKeypair.keys));
  console.log('');
  console.log('JWT_JWKS=' + JSON.stringify(jwksPublic));
  console.log('');
  console.log('# Copie e cole os valores acima no seu .env');
});
