'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validateConfig } = require('./validate-config.cjs');

function loadConfiguration() {
  const file = process.env.GESTAO_ENV_FILE;
  if (!file || !path.isAbsolute(file)) throw new Error('GESTAO_ENV_FILE must identify an existing private absolute configuration file.');
  const real = fs.realpathSync(file);
  if (/(^|[\\/])(public|public_html|www)([\\/]|$)/i.test(real)) throw new Error('Configuration must be outside the public directory.');
  const values = require('dotenv').parse(fs.readFileSync(real));
  const errors = validateConfig(values);
  if (errors.length) throw new Error('Configuration prerequisites missing or invalid: ' + errors.join(', '));
  const release = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  if (release.product !== 'gestao-contratual' || !/^[a-f0-9]{40}$/.test(release.sourceCommit)) throw new Error('Invalid contractual release manifest.');
  // Existing private file is never rewritten. The running release identifies its actual source.
  Object.assign(process.env, values, { RELEASE_SHA: release.sourceCommit });
  return release;
}
function start() {
  loadConfiguration();
  require('./dist/main-gestao.js');
}
module.exports = { loadConfiguration, start };
if (require.main === module) start();
