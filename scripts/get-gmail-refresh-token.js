#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const REDIRECT_PORT = Number(process.env.GMAIL_OAUTH_PORT || 3000);
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`;

function loadDotEnv(filePath = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing .env file at ${filePath}`);
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} in .env`);
  return value;
}

function openBrowser(url) {
  const platform = os.platform();
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {
    console.warn('Could not open the browser automatically. Open this URL manually:');
    console.warn(url);
  });
  child.unref();
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

function waitForAuthorizationCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url, REDIRECT_URI);
      if (requestUrl.pathname !== '/oauth2callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const error = requestUrl.searchParams.get('error');
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`Authorization failed: ${error}`);
        server.close();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }

      const code = requestUrl.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authorization code.');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Authorization complete</h1><p>You can close this tab and return to your terminal.</p>');
      server.close();
      resolve(code);
    });

    server.on('error', reject);
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      console.log(`Waiting for Google OAuth callback at ${REDIRECT_URI}`);
    });
  });
}

async function main() {
  loadDotEnv();

  const clientId = requireEnv('GMAIL_CLIENT_ID');
  const clientSecret = requireEnv('GMAIL_CLIENT_SECRET');
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  console.log('Opening your browser for Gmail read-only authorization...');
  console.log('If prompted by Google, choose the account whose Gmail you want to read.');
  console.log(`Requested scope: ${SCOPES[0]}`);

  const codePromise = waitForAuthorizationCode();
  openBrowser(authorizationUrl);
  console.log('Authorize access in your browser.');
  console.log(`Manual URL, if needed: ${authorizationUrl}`);

  let code;
  if (process.stdin.isTTY) {
    console.log('After authorization, this script will capture the callback automatically.');
    code = await codePromise;
  } else {
    console.log('Non-interactive stdin detected; waiting for the browser callback.');
    code = await codePromise;
  }

  if (!code) {
    code = await ask('Paste the authorization code here: ');
  }

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh_token. Revoke the app grant in your Google Account, then rerun this script.');
  }

  console.log('\n=== Gmail refresh token ===');
  console.log(tokens.refresh_token);
  console.log('=== End Gmail refresh token ===\n');
  console.log('Copy the refresh_token above into GitHub Secrets as GMAIL_REFRESH_TOKEN.');
  console.log('Keep it private; it grants read-only access to the authorized Gmail account.');
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
