'use strict';

const { getS3 } = require('./s3');

const systemDataKey = 'status-files/system-data.json';
const iptstateKey = 'status-files/iptstate.txt';

module.exports.getSystem = (event, context, callback) => {
  getS3({ key: systemDataKey }).then(body => {
    const response = {
      statusCode: 200,
      body,
    };

    callback(null, response);
  })
  .catch(error => callback(error, null));
};

function getIptstate() {
  return getS3({ key: iptstateKey })
    .then(body => 
      body.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => line.split(/\s+/))
        .slice(1)
    )
    .then(lines => {
      const [header, ...rest] = lines;
      const cleanHeader = header.map(col => col.trim()).filter(col => col.length > 0);
      return rest.map(cols => {
        var obj = {};
        cleanHeader.forEach((name, index) => obj[name] = cols[index]);
        return obj;
      })
      .map(connection => {
        if(connection.Prt !== 'tcp') {
          connection['TTL'] = connection.State;
          delete connection['State'];
          return connection;
        }
        return connection;
      });
    });
}

module.exports.getIptstate = (event, context, callback) => {
  getIptstate()
    .then(JSON.stringify)
    .then(body => callback(null, { statusCode: 200, body }));
}
