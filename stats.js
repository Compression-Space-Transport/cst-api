'use strict';

const { Parser } = require('xml2js');
const { getS3 } = require('./s3');

const systemDataKey = 'status-files/system-data.json';
const nmapKey = 'status-files/nmap.xml';

module.exports.getSystem = (event, context, callback) => {
  getS3({ key: systemDataKey }).then(JSON.parse).then(body => {
    callback(null, body);
  })
  .catch(error => callback(error, null));
};

const parser = new Parser({ explicitRoot: false });
function parseXML(xml) {
  return new Promise((resolve, reject) =>
    parser.parseString(xml, (err, res) => (err) ? reject(err) : resolve(res)))
    .catch(err => console.error({ err, xml }));
}

function getNmap() {
  return getS3({ key: nmapKey })
    .then(str => str.trim())
    .then(str => str.replace(/\n/g, ''))
    .then(str => str + '</nmaprun>') //HACK! nmap outputting malformed xml
    .then(parseXML)
    .then(({ host }) => host || [])
    .then(hosts => hosts.map(host => {
      const status = host.status.pop()['$']
      const address = host.address.map(({ $: { addr, addrtype } }) => ({ [addrtype]: addr })).reduce((a,b) => Object.assign(a,b), {});
      const ports = host.ports.map(({ port }) => port || [])
        .map(ports => ports.map(port => port['$']))
        .reduce((a,b) => a.concat(b), [])
      return { status, address, ports };
    }));
}

module.exports.getNmap = (event, context, callback) => {
  getNmap()
    .then(body => callback(null, body))
    .catch(error => callback(error))
};
