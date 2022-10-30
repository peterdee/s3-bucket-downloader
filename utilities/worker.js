import { writeFile } from 'node:fs/promises';

import {
  DESTINATION,
  ERRORS,
  WORKER_EVENTS,
} from './constants.js';
import s3, { BUCKET } from './s3.js';

process.on(
  'message',
  async ({
    list = [],
    workerId = null,
  }) => {
    if (!process.send) {
      throw new Error(ERRORS.notAWorkerProcess);
    }
    console.log('worker', workerId, list.length);

    if (list.length === 0) {
      process.send({ event: WORKER_EVENTS.done, workerId });
    }

    await Promise.all(list.map(async ({ Key = '' }) => {
      const fileName = Key.split('/').join('_');
      const data = await s3.getObject({
        Bucket: BUCKET,
        Key,
      }).promise();
      if (data && data.Body) {
        await writeFile(
          `${DESTINATION}/${fileName}`,
          data.Body,
        );

        process.send({
          event: WORKER_EVENTS.count,
          fileName,
          workerId,
        });
      }
    }));

    process.send({ event: WORKER_EVENTS.done, workerId });
  },
);
