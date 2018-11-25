'use strict';

const { getS3 } = require('./s3');

const systemDataKey = 'status-files/system-data.json';

module.exports.getSystem = (event, context, callback) => {
  getS3({ key: systemDataKey }).then(JSON.parse).then(body => {
    callback(null, body);
  })
  .catch(error => callback(error, null));
};
