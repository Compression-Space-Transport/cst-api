'use strict';

const dhcpdLeases = require('dhcpd-leases');
const { S3 } = require('aws-sdk');

const s3 = new S3();

const Bucket = 'compression-space-transport';
const Key = 'status-files/dhcpd.leases';

function getS3() {
  const params = {
    Bucket,
    Key,
  };
  return new Promise((resolve, reject) =>
    s3.getObject(params, (err, data) =>
      (err) ? reject(err) : resolve(data)))
    .then(({ Body }) => Body.toString());
}

// Get all leases
function getLeases() {
  return getS3()
    .then(dhcpdLeases)
}

// Get latest lease for MAC
function getLatestLease(leases) {
  const leasesPerMac = leases.reduce((obj, lease) => {
    const mac = lease['hardware ethernet']
    const macEntries = { [mac]: (obj[mac] || []).concat(lease) };
    return Object.assign(obj, macEntries);
  }, {})
  return Object.keys(leasesPerMac).map(mac =>
    leasesPerMac[mac].sort(({ starts: a }, { starts: b }) => a - b))
  .map(group => group.pop());
}

module.exports.getAll = (event, context, callback) => {
  getLeases().then(leases => {
    const response = {
      statusCode: 200,
      body: JSON.stringify({ leases }),
    };

    callback(null, response);
  })
  .catch(error => callback(error, null));
};

module.exports.getLatest = (event, context, callback) => {
  getLeases().then(getLatestLease).then(leases => {
    const response = {
      statusCode: 200,
      body: JSON.stringify({ leases }),
    };

    callback(null, response);
  })
  .catch(error => callback(error, null));
};

function isOnline(lease) {
  return lease['binding state'] === 'active';
}

module.exports.getOnline = (event, context, callback) => {
  getLeases()
    .then(getLatestLease)
    .then(leases => leases.filter(isOnline))
    .then(leases => {
      const response = {
        statusCode: 200,
        body: JSON.stringify({ leases }),
      };

      callback(null, response);
    })
    .catch(error => callback(error, null));
};


function getStatusForMac({ mac }) {
  return getLeases().then(getLatestLease)
    .then(leases => leases.filter(lease => lease['hardware ethernet'] === mac).pop())
    .then(isOnline)
    .then(online => ({ online }));
}

module.exports.getStatusForMac = ({ pathParameters: { mac } }, context, callback) => {
  getStatusForMac({ mac }).then(({ online }) => {
    const response = {
      statusCode: 200,
      body: JSON.stringify({ mac, online }),
    };

    callback(null, response);
  })
  .catch(error => callback(error, null));
};
