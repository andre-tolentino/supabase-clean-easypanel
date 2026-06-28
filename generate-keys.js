const crypto = require('crypto');

// ============================================================
// ALTERE O JWT_SECRET ABAIXO PARA O MESMO VALOR DO .env
// ============================================================
const JWT_SECRET = 'your-super-secret-jwt-token-with-at-least-32-characters-long';

function createJWT(payload) {
  const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = header + '.' + body;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}

const now = Math.floor(Date.now() / 1000);
const exp = now + 31536000;

console.log('ANON_KEY=' + createJWT({role:'anon',iss:'supabase-self-hosted',iat:now,exp}));
console.log('SERVICE_ROLE_KEY=' + createJWT({role:'service_role',iss:'supabase-self-hosted',iat:now,exp}));
