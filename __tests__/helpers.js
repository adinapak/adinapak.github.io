/**
 * Shared test helpers for API handler tests.
 */

function createMockRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
    send(data) {
      this.body = data;
    },
    json(data) {
      this.headers['Content-Type'] = 'application/json';
      this.body = JSON.stringify(data);
    },
  };
  return res;
}

function parsedBody(res) {
  return typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
}

module.exports = { createMockRes, parsedBody };
