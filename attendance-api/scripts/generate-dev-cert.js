#!/usr/bin/env node
/**
 * Generates a self-signed TLS certificate for local/LAN development.
 *
 * Phone browsers only expose the camera and GPS on a "secure context" (HTTPS or
 * localhost), so reaching the kiosk at http://<lan-ip>:3000 leaves the camera
 * blocked. This certificate covers localhost plus every LAN address of this
 * machine, which lets phones load the kiosk over HTTPS.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CERT_DIR = path.join(process.cwd(), 'certs');
const KEY_FILE = path.join(CERT_DIR, 'dev-key.pem');
const CERT_FILE = path.join(CERT_DIR, 'dev-cert.pem');

const OPENSSL_CANDIDATES = [
  'openssl',
  'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'usr', 'bin', 'openssl.exe'),
  '/usr/bin/openssl',
  '/usr/local/bin/openssl',
  '/opt/homebrew/bin/openssl',
];

function findOpenssl() {
  for (const candidate of OPENSSL_CANDIDATES) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Try the next location.
    }
  }
  return null;
}

function lanAddresses() {
  const found = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const family = entry.family === 'IPv4' || entry.family === 4;
      if (!family || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      if (!found.includes(entry.address)) found.push(entry.address);
    }
  }
  return found;
}

function main() {
  const openssl = findOpenssl();
  if (!openssl) {
    console.error(
      'OpenSSL was not found. Install OpenSSL (Git for Windows bundles it) and re-run,\n' +
        'or set HTTPS_KEY_PATH and HTTPS_CERT_PATH to a certificate you already have.',
    );
    process.exit(1);
  }

  const ips = lanAddresses();
  const hosts = ['localhost', os.hostname()].filter(Boolean);
  const sans = [
    ...hosts.map((h) => `DNS:${h}`),
    'IP:127.0.0.1',
    'IP:::1',
    ...ips.map((ip) => `IP:${ip}`),
  ].join(',');

  fs.mkdirSync(CERT_DIR, { recursive: true });
  const configFile = path.join(CERT_DIR, 'dev-openssl.cnf');
  fs.writeFileSync(
    configFile,
    [
      '[req]',
      'distinguished_name = dn',
      'x509_extensions = v3_req',
      'prompt = no',
      '[dn]',
      'CN = Face Attendance Dev',
      '[v3_req]',
      'basicConstraints = CA:FALSE',
      'keyUsage = digitalSignature, keyEncipherment',
      'extendedKeyUsage = serverAuth',
      `subjectAltName = ${sans}`,
      '',
    ].join('\n'),
  );

  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      // Browsers reject self-signed leaf certificates valid for more than 825 days.
      '-days',
      '825',
      '-keyout',
      KEY_FILE,
      '-out',
      CERT_FILE,
      '-config',
      configFile,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  fs.rmSync(configFile, { force: true });

  console.log('Created development certificate:');
  console.log(`  key  ${KEY_FILE}`);
  console.log(`  cert ${CERT_FILE}`);
  console.log(`  valid for ${sans}`);
  console.log('\nStart the API with HTTPS_ENABLED=true, then open the kiosk on your phone at:');
  const httpsPort = process.env.HTTPS_PORT || 3443;
  for (const ip of ips.length ? ips : ['<lan-ip>']) {
    console.log(`  https://${ip}:${httpsPort}`);
  }
  console.log(
    '\nThe certificate is self-signed, so the phone shows a warning the first time.\n' +
      'Choose "Advanced" then "Proceed" (Chrome) or "Show Details" then "visit this website" (Safari).',
  );
}

main();
