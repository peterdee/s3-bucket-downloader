import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

export const {
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

export default new AWS.S3();
