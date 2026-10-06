// 토스 인가 코드를 검증하고 기존 Supabase 데이터 구조용 로그인 토큰을 발급합니다.

const TOSS_API_ORIGIN = 'https://apps-in-toss-api.toss.im';
const SUPABASE_FALLBACK_URL = 'https://wosbpljbdyofavsbrkyn.supabase.co';
const ALLOWED_ORIGINS = new Set([
  'https://lottobank.web.tossmini.com',
  'https://lottobank.private-web.tossmini.com',
]);

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function json(body, status = 200, origin = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

async function readJson(response, code) {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(code);
  return body;
}

async function hmacHex(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function supabaseRequest(env, path, init = {}) {
  const baseUrl = env.SUPABASE_URL || SUPABASE_FALLBACK_URL;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = new Headers(init.headers || {});
  headers.set('apikey', secret);
  headers.set('Authorization', `Bearer ${secret}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return fetch(baseUrl + path, { ...init, headers });
}

export async function onRequest(context) {
  const origin = context.request.headers.get('Origin') || '';
  if (!isAllowedOrigin(origin)) return json({ code: 'ORIGIN_NOT_ALLOWED' }, 403, origin);
  if (context.request.method === 'OPTIONS') return json({ ok: true }, 200, origin);
  if (context.request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, origin);

  const env = context.env;
  const supabaseSecret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.TOSS_MTLS || !supabaseSecret || !env.TOSS_IDENTITY_SECRET) {
    return json({ code: 'TOSS_SERVER_NOT_CONFIGURED' }, 503, origin);
  }

  try {
    const body = await context.request.json();
    const authorizationCode = String(body?.authorizationCode || '');
    const referrer = String(body?.referrer || '').toUpperCase();
    if (!authorizationCode || authorizationCode.length > 2048 || !['DEFAULT', 'SANDBOX'].includes(referrer)) {
      return json({ code: 'INVALID_LOGIN_REQUEST' }, 400, origin);
    }

    const tokenResponse = await env.TOSS_MTLS.fetch(
      `${TOSS_API_ORIGIN}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ authorizationCode, referrer }),
      }
    );
    const tokenEnvelope = await readJson(tokenResponse, 'TOSS_TOKEN_REQUEST_FAILED');
    if (tokenEnvelope.resultType !== 'SUCCESS' || !tokenEnvelope.success?.accessToken) {
      return json({ code: tokenEnvelope.error?.errorCode || 'TOSS_TOKEN_REJECTED' }, 401, origin);
    }

    const userResponse = await env.TOSS_MTLS.fetch(
      `${TOSS_API_ORIGIN}/api-partner/v1/apps-in-toss/user/oauth2/login-me`,
      { headers: { Authorization: `Bearer ${tokenEnvelope.success.accessToken}` } }
    );
    const userEnvelope = await readJson(userResponse, 'TOSS_USER_REQUEST_FAILED');
    if (userEnvelope.resultType !== 'SUCCESS' || userEnvelope.success?.userKey == null) {
      return json({ code: userEnvelope.error?.errorCode || 'TOSS_USER_REJECTED' }, 401, origin);
    }

    const identityHash = await hmacHex(String(userEnvelope.success.userKey), env.TOSS_IDENTITY_SECRET);
    const authEmail = `toss.${identityHash.slice(0, 40)}@auth.lottobank.invalid`;
    const nickname = `토스회원${identityHash.slice(0, 6)}`;
    const generateResponse = await supabaseRequest(env, '/auth/v1/admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({
        type: 'magiclink',
        email: authEmail,
        data: { nickname, auth_provider: 'toss' },
      }),
    });
    const generated = await readJson(generateResponse, 'SUPABASE_LINK_FAILED');
    const properties = generated.properties || generated.data?.properties || generated;
    const user = generated.user || generated.data?.user;
    if (!user?.id || !properties?.hashed_token) throw new Error('SUPABASE_LINK_INVALID');

    const identityResponse = await supabaseRequest(env, '/rest/v1/toss_auth_identities?on_conflict=identity_hash', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        identity_hash: identityHash,
        user_id: user.id,
        auth_email: authEmail,
        last_referrer: referrer,
        last_login_at: new Date().toISOString(),
        unlinked_at: null,
      }),
    });
    if (!identityResponse.ok) throw new Error('SUPABASE_IDENTITY_FAILED');

    return json({
      tokenHash: properties.hashed_token,
      verificationType: properties.verification_type || 'magiclink',
    }, 200, origin);
  } catch (error) {
    console.error('toss-login:', error instanceof Error ? error.message : 'unknown');
    return json({ code: error instanceof Error ? error.message : 'TOSS_LOGIN_FAILED' }, 500, origin);
  }
}
