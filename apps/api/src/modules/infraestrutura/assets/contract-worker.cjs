'use strict';
const {parentPort,workerData}=require('node:worker_threads');
try {const runtime=require('./legacy-runtime.cjs');parentPort.postMessage({ok:true,result:runtime.calculateProject(workerData.raw,workerData.project,{pem:workerData.pem,cycleId:workerData.cycleId})});}
catch{parentPort.postMessage({ok:false});}
