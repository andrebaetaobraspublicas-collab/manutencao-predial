import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { exitDestination, loginDestination, resolveProductConfig, stripeDestination } from '../../apps/web/src/lib/product-config.ts';
import { stripeSubscriptionConfirmed } from '../../apps/web/src/lib/stripe-status.ts';

test('checkout confirmation requires a current effective Stripe period, without treating a manual grant as online payment', () => {
  const now = Date.parse('2026-10-03T15:00:00Z');
  const active = { billingSource: 'STRIPE', status: 'ACTIVE', currentPeriodEnd: '2026-11-03T15:00:00Z' };
  assert.equal(stripeSubscriptionConfirmed(active, now), true);
  assert.equal(stripeSubscriptionConfirmed({ ...active, status: 'TRIALING' }, now), true);
  assert.equal(stripeSubscriptionConfirmed({ ...active, currentPeriodEnd: '2026-10-03T15:00:00Z' }, now), false);
  assert.equal(stripeSubscriptionConfirmed({ ...active, currentPeriodEnd: '2026-10-02T15:00:00Z' }, now), false);
  assert.equal(stripeSubscriptionConfirmed({ ...active, currentPeriodEnd: null }, now), false);
  assert.equal(stripeSubscriptionConfirmed({ ...active, currentPeriodEnd: 'invalid' }, now), false);
  assert.equal(stripeSubscriptionConfirmed({ ...active, billingSource: 'MANUAL' }, now), false);
  assert.equal(stripeSubscriptionConfirmed({ ...active, status: 'PAST_DUE' }, now), false);
  assert.equal(stripeSubscriptionConfirmed(null, now), false);
});

test('development preserves existing program destinations and local logout even with marketing configured', () => {
  const development = resolveProductConfig({ orcaproOnly: 'false', marketingUrl: 'https://orcaproobras.com.br/' });
  assert.equal(exitDestination('/login?next=/programas', development), '/login?next=/programas');
  assert.equal(loginDestination('/programas', false), '/programas');
  assert.equal(loginDestination('/orcapro', false), '/orcapro');
  assert.equal(loginDestination('/dashboard', false), '/dashboard');
});

test('production exit goes to marketing and login cannot be redirected to another program or arbitrary URL', () => {
  const production = resolveProductConfig({ orcaproOnly: 'true' });
  assert.equal(exitDestination('/login', production), 'https://orcaproobras.com.br/');
  for (const next of [null, '/dashboard', '/programas', '//other.example', 'https://other.example', '/orcapro']) {
    assert.equal(loginDestination(next, true), '/orcapro');
  }
  assert.equal(loginDestination('https://other.example', false), '/dashboard');
});

test('marketing configuration rejects credentials, unsafe schemes and login/tracking parameters', () => {
  for (const marketingUrl of ['javascript:alert(1)', 'http://orcaproobras.com.br/', 'https://user:secret@orcaproobras.com.br/', 'https://orcaproobras.com.br/?next=https://other.example', 'https://orcaproobras.com.br/#login', 'https://orcaproobras.com.br/login']) {
    assert.throws(() => resolveProductConfig({ orcaproOnly: 'true', marketingUrl }));
  }
});

test('Stripe redirect accepts only exact checkout and portal hosts over HTTPS', () => {
  assert.equal(stripeDestination('https://checkout.stripe.com/c/pay/cs_example'), 'https://checkout.stripe.com/c/pay/cs_example');
  assert.equal(stripeDestination('https://billing.stripe.com/p/session/example'), 'https://billing.stripe.com/p/session/example');
  for (const url of [null, 'javascript:alert(1)', 'http://checkout.stripe.com/', 'https://checkout.stripe.com.evil.example/', 'https://checkout.stripe.com@evil.example/', 'https://user:secret@checkout.stripe.com/', 'https://checkout.stripe.com:444/']) assert.throws(() => stripeDestination(url));
});

function logoutFixture(apiFetch) {
  const source = readFileSync(fileURLToPath(new URL('../../apps/web/src/lib/end-session.ts', import.meta.url)), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const replacements = [];
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports,
    require: path => path === './api' ? { apiFetch } : { exitDestination: () => 'https://orcaproobras.com.br/' },
    window: { location: { replace: url => replacements.push(url) } },
  });
  vm.runInContext(compiled, context);
  return { endSession: module.exports.endSession, replacements };
}

test('logout awaits server cookie revocation before leaving the application', async () => {
  let acknowledge;
  const requests = [];
  const pending = new Promise(resolve => { acknowledge = resolve; });
  const fixture = logoutFixture((path, options) => { requests.push({ path, options }); return pending; });
  const ended = fixture.endSession();
  await Promise.resolve();
  assert.deepEqual(fixture.replacements, []);
  assert.equal(requests[0].path, '/auth/logout');
  assert.equal(requests[0].options.method, 'POST');
  acknowledge(); await ended;
  assert.deepEqual(fixture.replacements, ['https://orcaproobras.com.br/']);
});

test('failed logout keeps the page and returns an error instead of pretending the session ended', async () => {
  const fixture = logoutFixture(async () => { throw new Error('Network unavailable'); });
  await assert.rejects(fixture.endSession(), /Network unavailable/);
  assert.deepEqual(fixture.replacements, []);
});
