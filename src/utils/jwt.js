const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "dev_refresh_secret";

function signJwt(payload, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d", ...opts });
}

function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}

function signRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "90d" });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

module.exports = { 
  signJwt, 
  verifyJwt, 
  signRefreshToken, 
  verifyRefreshToken 
};
