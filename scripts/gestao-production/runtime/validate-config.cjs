'use strict';
const path = require('node:path');
const hosts = new Set(['orcaprogestaocontratual.com.br', 'www.orcaprogestaocontratual.com.br']);
// Pure validation: never connects, starts an application or prints configuration values.
function validateConfig(env) {
  const errors = [];
  for (const [key, value] of Object.entries({ NODE_ENV: 'production', GESTAO_ENABLED: 'true', GESTAO_STANDALONE: 'true', ORCAPRO_ENABLED: 'false', INFRA_ENABLED: 'false', COOKIE_SECURE: 'true', GESTAO_STRIPE_MODE: 'live' })) {
    if (env[key] !== value) errors.push(key);
  }
  function origin(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && hosts.has(u.hostname) && !u.username && !u.password && !u.port && u.pathname === '/' && !u.search && !u.hash; } catch { return false; }
  }
  if (!origin(env.WEB_BASE_URL)) errors.push('WEB_BASE_URL');
  const cors = String(env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!cors.length || cors.some(x => !origin(x))) errors.push('CORS_ORIGINS');
  const email = String(env.GESTAO_ADMIN_EMAIL || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /example\.(test|invalid|com)$/.test(email)) errors.push('GESTAO_ADMIN_EMAIL');
  const ids = String(env.GESTAO_ADMIN_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!ids.length || ids.some(x => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x))) errors.push('GESTAO_ADMIN_USER_IDS');
  function database(value, key) {
    try { const u = new URL(value); if (u.protocol !== 'mysql:' || !u.hostname || !u.username || u.pathname.length < 2) throw new Error(); return `${u.hostname.toLowerCase()}:${u.port || '3306'}/${decodeURIComponent(u.pathname.slice(1))}`; } catch { errors.push(key); return null; }
  }
  const own = database(env.GESTAO_DATABASE_URL, 'GESTAO_DATABASE_URL');
  database(env.DATABASE_URL, 'DATABASE_URL');
  if (!own || env.DATABASE_URL !== env.GESTAO_DATABASE_URL) errors.push('DATABASE_URL/GESTAO_DATABASE_URL');
  for (const key of ['GESTAO_SOURCE_ORCAPRO_AUTH_URL', 'GESTAO_SOURCE_INFRA_AUTH_URL', 'GESTAO_SOURCE_INFRA_DATA_URL']) {
    if (database(env[key], key) === own) errors.push(key + ':isolation');
  }
  const storage = env.GESTAO_STORAGE_ROOT || '';
  if (!path.isAbsolute(storage) || /(^|[\\/])(public|public_html|www)([\\/]|$)/i.test(storage)) errors.push('GESTAO_STORAGE_ROOT');
  if (String(env.JWT_ACCESS_SECRET || '').length < 32) errors.push('JWT_ACCESS_SECRET');
  for (const key of ['GESTAO_STRIPE_SECRET_KEY', 'GESTAO_STRIPE_WEBHOOK_SECRET', 'GESTAO_STRIPE_PRICE_ID', 'GESTAO_STRIPE_PORTAL_CONFIGURATION_ID', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD_FILE', 'EMAIL_FROM']) {
    if (!String(env[key] || '').trim()) errors.push(key);
  }
  if (env.EMAIL_PROVIDER !== 'smtp' || !['465', '587'].includes(String(env.SMTP_PORT))) errors.push('SMTP');
  return [...new Set(errors)];
}
module.exports = { validateConfig };
