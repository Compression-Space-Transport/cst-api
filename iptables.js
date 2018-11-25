'use strict';

const { getS3 } = require('./s3');

const iptstateKey = 'status-files/iptstate.txt';
const messagesKey = 'status-files/messages';

function tryRegex(regex, string) {
  const result = regex.exec(string);
  if(result) {
    return result[1];
  }
  return null;
}

function mapNullable(nullable, func) {
  if(nullable) {
    return func(nullable);
  }
  return nullable;
}

function parseBlockMessage(line) {
  const year = new Date().getFullYear();
  const timestamp = mapNullable(tryRegex(/^([A-Za-z]+\s[0-9]+\s[^\s]+)/, line), dateStr => {
    const partialDate = new Date(dateStr)
    partialDate.setFullYear(year);
    return Number(partialDate);
  });
  const source = tryRegex(/SRC=([^\s]+)/, line);
  const destination = tryRegex(/DST=([^\s]+)/, line);
  const protocol = tryRegex(/PROTO=([^\s]+)/, line);
  const ttl = mapNullable(tryRegex(/TTL=([^\s]+)/, line), parseInt);

  const common = { timestamp, source, destination, protocol, ttl, line, };

  if(protocol === 'ICMP') {
    const icmp = {
      type: tryRegex(/TYPE=([^\s]+)/, line),
    };
    return Object.assign({}, common, icmp);
  } else {
    const message = {
      sourcePort: mapNullable(tryRegex(/SPT=([^\s]+)/, line), parseInt),
      destPort: mapNullable(tryRegex(/DPT=([^\s]+)/, line), parseInt),
    };
    return Object.assign({}, common, message);
  }
}

function getBlockedRequests() {
  return getS3({ key: messagesKey })
    .then(body => body.split('\n')
      .filter(line => line.indexOf('IPTables Blocked') !== -1)
      .map(line => line.trim())
      .map(parseBlockMessage));
}

module.exports.getBlockedRequests = (event, context, callback) => {
  getBlockedRequests().then(body => callback(null, body));
}

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
  getIptstate().then(body => callback(null, body));
}
