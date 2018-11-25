const { getS3 } = require('./s3');
const TokenManager = require('./TokenManager');

const USER_KEY = 'auth/users.json';
const AUTH_SETTINGS_KEY = 'auth/settings.json';

var tokenManager = null;

function getTokenManager() {
  if(tokenManager) {
    return Promise.resolve(tokenManager);
  }
  return Promise.all([getS3({ key: USER_KEY }), getS3({ key: AUTH_SETTINGS_KEY })])
    .then(results => results.map(result => JSON.parse(result)))
    .then(([users, authSettings]) => {
      console.log('Creating new token manager', { users, authSettings });
      tokenManager = new TokenManager({ authSettings, users });
      return tokenManager;
    });
} 

module.exports.genToken = ({ path: { subject }, body: { password }, }, context, callback) => {
  getTokenManager()
    .then(tokenManager => tokenManager.checkPassword({ subject, password }))
    .then(authorized => {
      if(!authorized) {
        throw 'Unauthorized';
      }
    })
    .then(() => tokenManager.createToken({ subject }))
    .then(token => ({ token }))
    .then(body => callback(null, body))
    .catch(err => {
      console.error('Failed to generate token', err);
      callback(err);
    });
}

const createPolicy = ({ principalId = 'user', effect, resource }) => ({
  principalId,
  policyDocument: {
    Version: '2012-10-17',
    Statement: [{
      Action: 'execute-api:Invoke',
      Effect: effect,
      Resource: resource,
    }],
  },
});

module.exports.authorize = ({ authorizationToken, methodArn, }, context, callback) => {
  if(!authorizationToken) {
    return callback('Unauthorized');
  }

  const token = authorizationToken.split(' ').pop();
  getTokenManager().then(tokenManager => {
    const { subject, iat } = tokenManager.verifyToken(token)
    const resource = methodArn.split('/')[0] + '/*'; // Allow access to all resources for now
    console.log('verified token for subject', subject, resource)

    callback(null, createPolicy({ effect: 'allow', resource }));
  });
};
