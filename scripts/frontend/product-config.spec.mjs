import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { authenticatedLoginDestination, exitDestination, loginConfiguration, loginDestination, resolveProductConfig, stripeDestination } from '../../apps/web/src/lib/product-config.ts';
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

test('development OrçaPro login uses email authentication while maintenance and general selection require an organization', () => {
  assert.deepEqual(loginConfiguration('/orcapro-infraestrutura', false), {
    destination: '/orcapro-infraestrutura', requiresOrganization: false, endpoint: '/infraestrutura/auth/login',
  });
  assert.deepEqual(loginConfiguration('/orcapro', false), {
    destination: '/orcapro', requiresOrganization: false, endpoint: '/auth/orcapro/login',
  });
  for (const destination of ['/dashboard', '/programas']) {
    assert.deepEqual(loginConfiguration(destination, false), {
      destination, requiresOrganization: true, endpoint: '/auth/login',
    });
  }
  for (const destination of ['/dashboard', '/orcapro', '/orcapro-infraestrutura', '/programas']) {
    assert.deepEqual(loginConfiguration(destination, true), {
      destination: '/orcapro', requiresOrganization: false, endpoint: '/auth/orcapro/login',
    });
  }
});

test('OrçaPro login can resume an unpaid checkout without being sent to the other program selector', () => {
  for (const orcaproOnly of [false, true]) {
    const { destination } = loginConfiguration('/orcapro', orcaproOnly);
    for (const maintenanceAccess of [false, true, undefined]) {
      for (const orcaproEnabled of [false, undefined]) {
        assert.equal(authenticatedLoginDestination(destination, { maintenanceAccess, orcaproEnabled }), '/orcapro/assinatura');
      }
      assert.equal(authenticatedLoginDestination(destination, { maintenanceAccess, orcaproEnabled: true }), '/orcapro');
    }
  }
  assert.equal(authenticatedLoginDestination('/dashboard', { maintenanceAccess: false }), '/programas');
  assert.equal(authenticatedLoginDestination('/dashboard', { maintenanceAccess: true }), '/dashboard');
  assert.equal(authenticatedLoginDestination('/programas', { maintenanceAccess: false }), '/programas');
});

function renderLogin(orcaproOnly, next) {
  const source = readFileSync(fileURLToPath(new URL('../../apps/web/src/app/login/page.tsx', import.meta.url)), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const runtimeRequire = createRequire(import.meta.url);
  const module = { exports: {} };
  const require = path => {
    if (path === 'next/navigation') return { useRouter: () => ({ replace() {}, refresh() {} }), useSearchParams: () => ({ get: () => next }) };
    if (path === 'next/link') return { __esModule: true, default: props => React.createElement('a', props) };
    if (path === '@/components/loading') return { LoadingPanel: () => null };
    if (path === '@/lib/api') return { apiFetch: () => { throw new Error('Rendering must not authenticate'); }, ApiError: Error };
    if (path === '@/lib/product-config') return {
      ORCAPRO_ONLY: orcaproOnly,
      PRODUCT_NAME: orcaproOnly ? 'OrçaPro' : 'Gestão de Prédios',
      PRODUCT_DOMAIN: orcaproOnly ? 'orcaproobras.com.br' : 'gestaodepredios.com.br',
      loginDestination: value => loginDestination(value, orcaproOnly),
      loginConfiguration: value => loginConfiguration(value, orcaproOnly),
      authenticatedLoginDestination,
      exitDestination: () => 'https://orcaproobras.com.br/',
    };
    return runtimeRequire(path);
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require });
  return renderToStaticMarkup(React.createElement(module.exports.default));
}

test('development login renders the program selector and hides the organization only for OrçaPro', () => {
  const orcapro = renderLogin(false, '/orcapro');
  assert.match(orcapro, /id="program"/);
  assert.doesNotMatch(orcapro, /id="tenantSlug"/);
  assert.match(orcapro, /Entrar no OrçaPro/);
  assert.match(orcapro, /Não é necessário informar a organização/);
  assert.match(orcapro, /href="\/orcapro\/cadastro"/);
  for (const next of ['/dashboard', '/programas']) {
    const organization = renderLogin(false, next);
    assert.match(organization, /id="program"/);
    assert.match(organization, /id="tenantSlug"[^>]*required=""/);
    assert.match(organization, /Acesse sua organização/);
  }
  const production = renderLogin(true, '/programas');
  assert.doesNotMatch(production, /id="program"|id="tenantSlug"/);
  assert.match(production, /Entrar no OrçaPro/);
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
