const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class TokenManager {
  constructor({ authSettings, users }) {
    if(!authSettings) {
      throw 'Auth settings required';
    }
    if(!users) {
      throw 'Users required';
    }

    this.authSettings = authSettings;
    this.users = users;
  }

  createToken(payload) {
    const { jwt: { password, algorithm, expiresIn } } = this.authSettings;
    return jwt.sign(payload, password, { algorithm, expiresIn, });
  }

  verifyToken(token) {
    const { jwt: { password, algorithm, } } = this.authSettings;
    const { subject, iat } = jwt.verify(token, password, { algorithms: [algorithm] })
    if(!this.users[subject]) {
      throw 'User does not exist';
    }
    return { subject, iat };
  }

  checkPassword({ subject, password, }) {
    const user = this.users[subject];
    if(!user) {
      return Promise.resolve(false);
    }
    const { passwordHash } = user;
    return bcrypt.compare(password, passwordHash);
  }
}

module.exports = TokenManager;
