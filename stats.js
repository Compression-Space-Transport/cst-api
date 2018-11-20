'use strict';

const { getS3 } = require('./s3');

const key = 'status-files/system-data.json';

module.exports.getSystem = (event, context, callback) => {
  getS3({ key }).then(body => {
    const response = {
      statusCode: 200,
      body,
    };

    callback(null, response);
  })
  .catch(error => callback(error, null));
};
