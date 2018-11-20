'use strict';

const { getS3 } = require('./s3');

const KeyPrefix = 'desired-configs/etc/sysconfig/network-scripts/ifcfg-';

function parseInterface(interfaceConfig) {
  return interfaceConfig.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const splitLine = line.split('=');
      if(splitLine.length == 2) {
        const [key, value] = splitLine;
        return {[key]: value};
      }
      throw 'Unable to parse config line ' + line;
    })
    .reduce((a,b) => Object.assign(a,b), {});
}

function getInterface({ ifName }) {
  const key = `${KeyPrefix}${ifName}`;
  return getS3({ key }).then(parseInterface);
}

module.exports.getInterface = ({ pathParameters: { ifName } }, context, callback) => {
  getInterface({ ifName }).then(config => {
    const response = { statusCode: 200, body: JSON.stringify({ ifName, config }) };
    callback(null, response);
  })
  .catch(err => callback(err, null));
}

module.exports.setInterface = ({ pathParameters: { ifName } }, context, callback) => {
  //TODO: setInterface

}
