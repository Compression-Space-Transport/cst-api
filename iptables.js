'use strict';

const { getS3, setS3, } = require('./s3');

const iptablesKey = 'desired-configs/etc/sysconfig/iptables';
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

function tryMatch(re, str) {
  const matches = re.exec(str);
  if(!matches) {
    return [];
  }
  return matches;
}

function parseRule(rule) {
  const [, chain] = tryMatch(/-A\s([A-Z]+)\s/, rule);
  const [, protocol] = tryMatch(/\s-p\s([A-Za-z]+)/, rule);
  const [, source] = tryMatch(/\s-s\s([^\s]+)/, rule);
  const [, sourcePort] = tryMatch(/\s--sport\s([^\s]+)/, rule);
  const [, destination] = tryMatch(/\s-d\s([^\s]+)/, rule);
  const [, destinationPort] = tryMatch(/\s--dport\s([^\s]+)/, rule);
  const [, destinationIp] = tryMatch(/\s--to-destination\s([^\s]+)/, rule);
  const [,match] = tryMatch(/\s-m\s((?!state|comment|limit)[^\s]+)\s/, rule);
  const [, jump] = tryMatch(/\s-j\s([^\s]+)/, rule);
  const [, goto] = tryMatch(/\s-g\s([^\s]+)/, rule);
  const [, inInterface] = tryMatch(/\s-i\s([^\s]+)/, rule);
  const [, outInterface] = tryMatch(/\s-o\s([^\s]+)/, rule);

  const [, state] = tryMatch(/\s-m\sstate\s--state\s([^\s]+)/, rule);

  const [, limit] = tryMatch(/\s-m limit --limit\s([^\s]+)/, rule);
  const [, logPrefix] = tryMatch(/\s--log-prefix\s("[^"]+")/, rule);
  const [, tos] = tryMatch(/\s--set-tos\s([^\s]+)/, rule);
  const [, comment] = tryMatch(/\s-m\scomment\s--comment\s("[^"]+")/, rule);

  return { 
    rule,
    chain,
    protocol,
    source,
    sourcePort,
    destination,
    destinationPort,
    destinationIp,
    match,
    state,
    jump,
    goto,
    inInterface,
    outInterface,
    limit,
    logPrefix, 
    tos,
    comment,
  };
}

function parseTable(table) {
  const [name, ...body] = table.split('\n')
  // No # comments pls! Use -m comment --comment
    .filter(line => line.indexOf('#') !== 0)
    .map(lines => lines.trim());
  const chains = body.filter(line => line.indexOf(':') === 0);
  const rules = body.filter(line => line.indexOf('-A') === 0)
    .map(parseRule)
  return { name, chains, rules };
}

function parseIptablesDoc(doc) {
  const startTableRules = doc.indexOf('*');
  return doc.substring(startTableRules).split('*')
    .map(block => block.trim())
    .filter(block => block.length > 0)
    .map(parseTable)
    .reduce((obj, { name, ...rest }) => {
      obj[name] = rest;
      return obj;
    }, {})
}

function getIptablesRules() {
  return getS3({ key: iptablesKey }).then(parseIptablesDoc).then(tables => ({ tables }));
}

//getIptablesRules().then(rules => JSON.stringify(rules, null, 2)).then(console.log) //TODO: remove

module.exports.getIptablesRules = (event, context, callback) => {
  getIptablesRules().then(rules => callback(null, rules))
    .catch(err => callback(err));
}

function encodeRule({ 
    chain,
    protocol,
    source,
    sourcePort,
    destination,
    destinationPort,
    destinationIp,
    match,
    state,
    inInterface,
    outInterface,
    limit,
    logPrefix, 
    jump,
    goto,
    tos,
    comment,
  }) {
  function map2Str(str, elem) {
    if(elem) {
      return `${str} ${elem} `;
    }
    return '';
  }

  return map2Str('-A', chain) +
    map2Str('-p', protocol) +
    map2Str('-s', source) +
    map2Str('--sport', sourcePort) +
    map2Str('--dport', destinationPort) +
    map2Str('-m', match) +
    map2Str('-m state --state', state) +
    map2Str('-i', inInterface) +
    map2Str('-o', outInterface) +
    map2Str('-m limit --limit', limit) +
    map2Str('-j', jump) +
    map2Str('-g', goto) +
    map2Str('--to-destination', destinationIp) +
    map2Str('--log-prefix', logPrefix) +
    map2Str('--set-tos', tos) +
    map2Str('-m comment --comment', comment)
    .trim();
}

function encodeTable({ table, chains, rules }) {
  return `*${table}\n${chains.concat(rules.map(encodeRule)).join('\n')}\nCOMMIT`;
}

function setIptablesRules({ tables }) {
  const body = `${Object.keys(tables).map(table => encodeTable(Object.assign({ table }, tables[table]))).join('\n\n')}\n`; // newline required!
  console.log(body)
  return setS3({ key: iptablesKey, body });
}

//getIptablesRules()/*.then(rules => JSON.stringify(rules, null, 2)).then(console.log) */.then(rules => setIptablesRules(rules)); // TODO: remove and replace with functional test

module.exports.setIptablesRules = ({ body }, context, callback) => {
  setIptablesRules(body).then(rules => callback(null, body))
    .catch(err => callback(err));
}

