import {
  access,
  mkdir,
  writeFile,
} from 'node:fs/promises';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';

import log from './log.js';

dotenv.config();

const {
  ACCESS_KEY,
  BUCKET,
  REGION,
  SECRET_KEY,
} = process.env; 

if (!(ACCESS_KEY && BUCKET && REGION && SECRET_KEY)) {
  throw new Error('Missing required Amazon keys!');
}

AWS.config.update({
  accessKeyId: process.env.ACCESS_KEY,
  region: process.env.REGION,
  secretAccessKey: process.env.SECRET_KEY,
});

const DESTINATION = `${process.cwd()}/downloads`;
const S3 = new AWS.S3();

let counter = 0;

async function download(nextContinuationToken = '') {
  const params = {
    Bucket: BUCKET,
    MaxKeys: 100,
  };
  if (nextContinuationToken) {
    params.ContinuationToken = nextContinuationToken;
  }

  const {
    Contents: list = [],
    NextContinuationToken: token = '',
  } = await S3.listObjectsV2(params).promise();
  if (list.length === 0) {
    return process.exit(0);
  }

  await Promise.all(list.map(async ({ Key = '' }) => {
    const fileName = Key.split('/').join('_');
    const data = await S3.getObject({
      Bucket: BUCKET,
      Key,
    }).promise();
    if (data && data.Body) {
      await writeFile(
        `${DESTINATION}/${fileName}`,
        data.Body,
      );
      counter += 1;
      log(`File ${counter} > ${fileName}`)
    }
  }));

  return download(token);
}

async function launch() {
  try {
    await access(DESTINATION);

    return download();
  } catch (error) {
    if (error.code && error.code === 'ENOENT') {
      await mkdir(DESTINATION);

      return download();
    }
    throw error;
  }
} 

launch();
