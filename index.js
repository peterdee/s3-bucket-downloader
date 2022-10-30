import {
  access,
  mkdir,
  writeFile,
} from 'node:fs/promises';

import log from './utilities/log.js';
import s3, { BUCKET } from './utilities/s3.js';

const DESTINATION = `${process.cwd()}/downloads`;
const MAX_KEYS = 100;

let counter = 0;
let firstToken = '';

async function download(nextContinuationToken = '') {
  const params = {
    Bucket: BUCKET,
    MaxKeys: MAX_KEYS,
  };
  if (nextContinuationToken) {
    params.ContinuationToken = nextContinuationToken;
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

  const filtered = list.filter(
    ({
      Key = '',
    }) => !Key.includes('main') && !Key.includes('preview') && !Key.includes('thumb'),
  );
  await Promise.all(filtered.map(async ({ Key = '' }) => {
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

      counter += 1;
      log(`File ${counter} > ${fileName}`);
    }
  }));

  if (!firstToken) {
    firstToken = token;
  }
  return download(token);
}

async function launch() {
  try {
    await access(DESTINATION);

    return download();
  } catch (error) {
    if (error.code && error.code === 'ENOENT') {
      await mkdir(DESTINATION);
      log(`Created directory for downloaded files: ${DESTINATION}`);

      return download();
    }
    throw error;
  }
}

launch();
