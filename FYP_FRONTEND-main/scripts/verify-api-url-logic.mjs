/**
 * Mirrors api.ts Android URL rules (no React Native). Run: node ./scripts/verify-api-url-logic.mjs
 */
function applyPort(base, env) {
  const port = String(env.EXPO_PUBLIC_API_PORT || '8000').trim();
  const u = new URL(/^https?:/i.test(base) ? base : `http://${base}`);
  u.port = port;
  return u.origin;
}

function emuHost(env) {
  const raw = String(env.EXPO_PUBLIC_ANDROID_EMULATOR_HOST || '').trim();
  if (raw) return raw.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  return '10.0.2.2';
}

function lanHost(env) {
  const raw = String(env.EXPO_PUBLIC_DEV_LAN_HOST || '').trim();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
}

function finalizeAndroid(url, env, isDevice) {
  const emu = emuHost(env);
  const lan = lanHost(env);
  const u = new URL(/^https?:/i.test(url) ? url : `http://${url}`);
  const h = u.hostname.toLowerCase();
  if (isDevice) {
    const bad =
      h === '127.0.0.1' || h === 'localhost' || h === '0.0.0.0' || h === emu.toLowerCase() || h === '10.0.2.2';
    if (lan && bad && h !== lan.toLowerCase()) {
      u.hostname = lan;
      return u.origin;
    }
    return url;
  }
  if (h === emu.toLowerCase()) return url;
  u.hostname = emu;
  return u.origin;
}

function fullLoginUrl(env, isDevice) {
  const port = String(env.EXPO_PUBLIC_API_PORT || '8000').trim();
  let base;
  if (String(env.EXPO_PUBLIC_API_BASE_URL || '').trim()) {
    base = applyPort(String(env.EXPO_PUBLIC_API_BASE_URL).trim(), env);
  } else if (isDevice) {
    base = lanHost(env) ? `http://${lanHost(env)}:${port}` : `http://${emuHost(env)}:${port}`;
  } else {
    base = `http://${emuHost(env)}:${port}`;
  }
  const origin = finalizeAndroid(base, env, isDevice);
  return `${origin}${env.EXPO_PUBLIC_API_PREFIX || '/api/v1'}/auth/login`;
}

const env = {
  EXPO_PUBLIC_API_PORT: '8001',
  EXPO_PUBLIC_ANDROID_EMULATOR_HOST: '10.0.2.2',
  EXPO_PUBLIC_DEV_LAN_HOST: '192.168.18.157',
  EXPO_PUBLIC_API_BASE_URL: 'http://192.168.18.157:8001',
};

const cases = [
  {
    name: 'physical + LAN base URL',
    isDevice: true,
    want: '192.168.18.157',
    forbid: '127.0.0.1',
  },
  {
    name: 'physical + broken 127 base',
    isDevice: true,
    env: { ...env, EXPO_PUBLIC_API_BASE_URL: 'http://127.0.0.1:8001' },
    want: '192.168.18.157',
    forbid: '127.0.0.1',
  },
  {
    name: 'emulator + LAN base → 10.0.2.2',
    isDevice: false,
    want: '10.0.2.2',
    forbid: '192.168.18.157',
  },
];

let failed = 0;
for (const c of cases) {
  const e = c.env || env;
  const u = fullLoginUrl(e, c.isDevice);
  const ok = u.includes(c.want) && !u.includes(c.forbid);
  if (!ok) {
    console.error('FAIL:', c.name, '→', u);
    failed++;
  } else {
    console.log('OK  :', c.name, '→', u);
  }
}

if (failed) process.exit(1);
console.log('\nAll URL logic checks passed.');
