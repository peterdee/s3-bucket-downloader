import {
  access,
  mkdir,
} from 'node:fs/promises';
import { cpus } from 'node:os';
import { fork } from 'node:child_process';

import {
  DESTINATION,
  MAX_KEYS,
  TIME_LABEL,
  WORKER_EVENTS,
} from './utilities/constants.js';
import log, { time, timeEnd } from './utilities/console.js';
import s3, { BUCKET } from './utilities/s3.js';

const WORKERS_NUMBER = cpus().length;

let counter = 0;
let currentToken = '';
let finishedWorkers = [];
let firstToken = '';
const workers = [];

async function listObjects() {
  const params = {
    Bucket: BUCKET,
    MaxKeys: MAX_KEYS,
  };
  if (currentToken) {
    params.ContinuationToken = currentToken;
  }
  const {
    Contents: list = [],
    NextContinuationToken: token = '',
  } = await s3.listObjectsV2(params).promise();
  if (list.length === 0 || firstToken === token) {
    // TODO: investigate the condition above
    log('Done!');
    timeEnd(TIME_LABEL);
    return process.exit(0);
  }

  currentToken = token;
  if (!firstToken) {
    firstToken = token;
  }

  if (list.length === 0) {
    return listObjects();
  }

  const keysPerWorker = Math.ceil(list.length / WORKERS_NUMBER);
  workers.forEach((worker, index) => {
    const offset = index * keysPerWorker;
    const tasks = list.slice(offset, offset + keysPerWorker);

    worker.send({
      list: tasks,
      workerId: index + 1,
    });
  });
  return null;
}

function registerEvents(worker) {
  worker.on(
    'message',
    ({
      event = '',
      fileName = '',
      workerId = null,
    }) => {
      if (event && event === WORKER_EVENTS.count) {
        counter += 1;
        log(`File: ${counter} | Worker: ${workerId} | ${fileName}`);
      }
      if (event && event === WORKER_EVENTS.done) {
        finishedWorkers.push(workerId);
        if (finishedWorkers.length === WORKERS_NUMBER) {
          finishedWorkers = [];
          return listObjects();
        }
      }
      return null;
    },
  );
}

function createWorkers() {
  for (let i = 0; i < WORKERS_NUMBER; i += 1) {
    const worker = fork(`${process.cwd()}/utilities/worker.js`);
    registerEvents(worker);
    workers.push(worker);
  }
}

async function launch() {
  time(TIME_LABEL);
  createWorkers();
  try {
    await access(DESTINATION);

    return listObjects();
  } catch (error) {
    if (error.code && error.code === 'ENOENT') {
      await mkdir(DESTINATION);
      log(`Created directory for downloaded files: ${DESTINATION}`);

      return listObjects();
    }
    throw error;
  }
}

launch();
