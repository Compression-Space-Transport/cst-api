'use strict';

const { getS3, setS3, } = require('./s3');

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

function getInterfaceKey({ ifName }) {
  return `${KeyPrefix}${ifName}`;
}

function getInterface({ ifName }) {
  const key = getInterfaceKey({ ifName });
  return getS3({ key }).then(parseInterface);
}

module.exports.getInterface = ({ path: { ifName } }, context, callback) => {
  getInterface({ ifName }).then(config =>
    callback(null, { ifName, config }))
  .catch(err => callback(err, null));
}

function serializeInterface(interfaceConfig) {
  return Object.keys(interfaceConfig).map(key => `${key}=${interfaceConfig[key]}`).join('\n');
}

function setInterface({ ifName, interfaceConfig }) {
  const serializedConfig = serializeInterface(interfaceConfig);
  console.log('body', serializedConfig);
  const key = getInterfaceKey({ ifName });
  return setS3({ key, body: serializedConfig });
}

/**
 * Expects JSON object in body with parameters such as TYPE, BOOTPROTO, DEFROUTE, ...
 */
module.exports.setInterface = ({ path: { ifName }, body: interfaceConfig, }, context, callback) => {
  return setInterface({ ifName, interfaceConfig  })
    .then(res => callback(null, { ifName, res }));
}
