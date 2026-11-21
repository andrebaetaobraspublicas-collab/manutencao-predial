'use strict';
// Offline, read-only check of an explicitly supplied PRIVATE file. Does not load the API.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { validateConfig } = require('./runtime/validate-config.cjs');
const file = process.argv[2];
if (!file || !path.isAbsolute(file)) throw new Error('Usage: node preflight.cjs /absolute/private/config.env');
const requireRoot = createRequire(path.resolve(__dirname, '../../package.json'));
const errors = validateConfig(requireRoot('dotenv').parse(fs.readFileSync(file)));
if (errors.length) { console.error('Prerequisites not met: ' + errors.join(', ')); process.exitCode = 1; }
else console.log('Offline configuration syntax/isolation check passed; identity and credentials still require authorized operational validation. No connection or change performed.');
