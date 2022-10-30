import {
  access,
  mkdir,
} from 'node:fs/promises';
import { cpus } from 'node:os';
import { fork } from 'node:child_process';

import {
  DESTINATION,
  MAX_KEYS,
  WORKER_EVENTS,
} from './utilities/constants.js';
import log from './utilities/log.js';
import s3, { BUCKET } from './utilities/s3.js';

const WORKERS_NUMBER = cpus().length;

let counter = 0;
let finishedWorkers = [];
let firstToken = '';
const workers = [];

function showCounter(fileName = '', workerId = null) {
  counter += 1;
  log(`File: ${counter} | Worker: ${workerId} | ${fileName}`);
}

function createWorkers() {
  for (let i = 0; i < WORKERS_NUMBER; i += 1) {
    const worker = fork(`${process.cwd()}/utilities/worker.js`);
    workers.push(worker);
  }
}

async function listObjects(continuationToken = '') {
  const params = {
    Bucket: BUCKET,
    MaxKeys: MAX_KEYS,
  };
  if (continuationToken) {
    params.ContinuationToken = continuationToken;
  }
  const {
    Contents: list = [],
    NextContinuationToken: token = '',
  } = await s3.listObjectsV2(params).promise();
  if (list.length === 0 || firstToken === token) {
    // TODO: investigate the condition above
    log('Done!');
    return process.exit(0);
  }

  if (!firstToken) {
    firstToken = token;
  }

  const filtered = list.filter(
    ({
      Key = '',
    }) => !Key.includes('main') && !Key.includes('preview') && !Key.includes('thumb'),
  );

  if (filtered.length === 0) {
    return listObjects(token);
  }

  const keysPerWorker = Math.ceil(filtered.length / WORKERS_NUMBER);
  workers.forEach((worker, index) => {
    const offset = index * keysPerWorker;
    const tasks = filtered.slice(offset, offset + keysPerWorker);

    // TODO: register events only once
    worker.on(
      'message',
      ({
        event = '',
        fileName = '',
        workerId = null,
      }) => {
        if (event && event === WORKER_EVENTS.count) {
          showCounter(fileName, workerId);
        }
        if (event && event === WORKER_EVENTS.done) {
          finishedWorkers.push(workerId);
          if (finishedWorkers.length === WORKERS_NUMBER) {
            finishedWorkers = [];
            return listObjects(token);
          }
        }
        return null;
      },
    );
    worker.send({
      list: tasks,
      workerId: index + 1,
    });
  });
  return null;
}

async function launch() {
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
