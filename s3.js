'use strict';

const { S3 } = require('aws-sdk');

const s3 = new S3();

const Bucket = 'compression-space-transport';

function getS3({ key }) {
  const params = {
    Bucket,
    Key: key,
  };
  return new Promise((resolve, reject) =>
    s3.getObject(params, (err, data) =>
      (err) ? reject(err) : resolve(data)))
    .then(({ Body }) => Body.toString());
}

module.exports = { getS3 };
