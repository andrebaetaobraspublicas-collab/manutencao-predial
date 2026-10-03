'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const engine = require('./engine.cjs');
try {
  const { analysis, services, events } = workerData;
  const simulation = engine.simulateMonteCarlo(analysis, services, events);
  parentPort.postMessage({ summary: simulation.resumo,
    tornado: engine.buildTornado(analysis, services, events).rows,
    expected: engine.expectedMonetaryValue(analysis, services, events) });
} catch (error) { parentPort.postMessage({ error: error.message }); }
