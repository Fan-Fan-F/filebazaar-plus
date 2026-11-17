const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');

const PORT = 9789;
const serverProcess = spawn('node', ['dist/cli.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    CHARGE_URL: 'mock',
    TOKEN_SECRET: 'testsecret1234567890abcdef1234567890abcdef',
    BASE_DIR: 'test-files'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
serverProcess.stdout.on('data', d => { serverOutput += d.toString(); });
serverProcess.stderr.on('data', d => { serverOutput += d.toString(); });

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    const req = http.request(opts, res => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(data).toString('utf-8'),
          rawBody: Buffer.concat(data)
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('Waiting for FileBazaar server to boot on port ' + PORT + '...');
  let connected = false;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    try {
      const res = await request('/');
      if (res.statusCode === 200) {
        connected = true;
        break;
      }
    } catch (_) {}
  }
  if (!connected) {
    console.error('Server failed to start. Logs:\n', serverOutput);
    serverProcess.kill();
    process.exit(1);
  }
  console.log('Server started successfully!');

  // Test 1: Storefront file list & HTML charset
  console.log('Testing Test 1: Directory list & charset...');
  const dirRes = await request('/');
  assert.strictEqual(dirRes.statusCode, 200);
  assert(dirRes.body.includes('meta charset="utf-8"'), 'Must have correct meta charset');
  assert(dirRes.body.includes('hello.txt'), 'Must list hello.txt');
  assert(dirRes.body.includes('photo.png'), 'Must list photo.png');
  assert(dirRes.body.includes('dir-search'), 'Must include file filter input');
  console.log('✓ Test 1 passed: Storefront directory listing, UTF-8 charset, search filter verified.');

  // Test 2: Security check - Path traversal & hidden files access
  console.log('Testing Test 2: Path traversal & hidden files security...');
  const secRes1 = await request('/_filebazaar.yaml');
  assert.strictEqual(secRes1.statusCode, 403, 'Must forbid _filebazaar.yaml access');
  const secRes2 = await request('/../package.json');
  assert.strictEqual(secRes2.statusCode, 403, 'Must forbid directory traversal');
  console.log('✓ Test 2 passed: Path traversal and hidden/internal file access strictly forbidden (403).');

  // Test 3: File details page & CSRF token & button
  console.log('Testing Test 3: File detail & checkout form...');
  const fileRes = await request('/hello.txt');
  assert.strictEqual(fileRes.statusCode, 200);
  assert(fileRes.body.includes('action="_invoice"'), 'Must include invoice creation form');
  const csrfMatch = fileRes.body.match(/name="_csrf" value="([^"]+)"/);
  assert(csrfMatch, 'Must contain CSRF token');
  const csrfToken = csrfMatch[1];
  const cookieHeader = fileRes.headers['set-cookie'] ? fileRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : '';
  console.log('✓ Test 3 passed: File detail page loaded with CSRF token and custom button.');

  // Test 4: Image preview generation via GM fallback
  console.log('Testing Test 4: Image preview generation via GM fallback...');
  const imgPreviewRes = await request('/photo.png?preview');
  assert.strictEqual(imgPreviewRes.statusCode, 200);
  assert.strictEqual(imgPreviewRes.headers['content-type'], 'image/png');
  assert(imgPreviewRes.rawBody.length > 500, 'Preview image length must be valid');
  console.log('✓ Test 4 passed: Image preview generated successfully without canvas native binary crash (size: ' + imgPreviewRes.rawBody.length + ' bytes).');

  // Test 5: Invoice creation (POST /_invoice)
  console.log('Testing Test 5: Invoice creation (POST /_invoice)...');
  const postData = 'file=' + encodeURIComponent('hello.txt') + '&_csrf=' + encodeURIComponent(csrfToken);
  const invoiceRes = await request('/_invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'Cookie': cookieHeader
    },
    body: postData
  });
  assert(invoiceRes.statusCode === 302 || invoiceRes.statusCode === 201, 'Invoice creation response must redirect or be 201');
  const redirectLoc = invoiceRes.headers['location'];
  assert(redirectLoc && redirectLoc.includes('?invoice='), 'Location must contain invoice parameter');
  const invoiceId = redirectLoc.split('?invoice=')[1];
  console.log('✓ Test 5 passed: Lightning invoice created successfully with ID: ' + invoiceId);

  // Test 6: Checkout page rendering
  console.log('Testing Test 6: Checkout page UX...');
  const checkoutRes = await request('/hello.txt?invoice=' + invoiceId, {
    headers: { 'Cookie': cookieHeader }
  });
  assert.strictEqual(checkoutRes.statusCode, 200);
  assert(checkoutRes.body.includes('Copy Invoice'), 'Must have Copy Invoice button');
  assert(checkoutRes.body.includes('retryLongpoll'), 'Must have safe retry backoff for longpoll');
  assert(checkoutRes.body.includes('Open in Wallet'), 'Must have wallet pay button');
  assert(checkoutRes.body.includes('[Demo] Simulate Pay'), 'Must have simulate pay button in mock mode');
  
  const checkoutCsrfMatch = checkoutRes.body.match(/name="_csrf" value="([^"]+)"/);
  assert(checkoutCsrfMatch, 'Checkout page must contain CSRF token');
  const checkoutCsrf = checkoutCsrfMatch[1];
  console.log('✓ Test 6 passed: Checkout page UX enhancements verified.');

  // Test 7 & 8: Simulate payment & status update
  console.log('Testing Test 7 & 8: Payment simulation and access token issue...');
  const payBody = '_csrf=' + encodeURIComponent(checkoutCsrf);
  const payRes = await request('/_invoice/' + invoiceId + '/mock-pay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(payBody),
      'Cookie': cookieHeader,
      'Referer': 'http://127.0.0.1:' + PORT + '/hello.txt?invoice=' + invoiceId
    },
    body: payBody
  });
  assert.strictEqual(payRes.statusCode, 302);

  // Verify invoice paid and redirected to token
  const afterPayRes = await request('/hello.txt?invoice=' + invoiceId, {
    headers: { 'Cookie': cookieHeader }
  });
  assert.strictEqual(afterPayRes.statusCode, 302);
  const tokenLoc = afterPayRes.headers['location'];
  assert(tokenLoc && tokenLoc.includes('?token='), 'Must redirect to token url');
  const token = tokenLoc.split('?token=')[1];
  console.log('✓ Test 7 & 8 passed: Payment confirmed and HMAC access token issued: ' + token);

  // Test 9 & 10: Access and download paid digital file
  console.log('Testing Test 9 & 10: File download and access page...');
  const accessPageRes = await request('/hello.txt?token=' + encodeURIComponent(token), {
    headers: { 'Cookie': cookieHeader }
  });
  console.log('accessPageRes status:', accessPageRes.statusCode);
  console.log('accessPageRes body:\n', accessPageRes.body);
  assert.strictEqual(accessPageRes.statusCode, 200);
  assert(accessPageRes.body.includes('Copy Access Link'), 'Must contain Copy Access Link button');
  assert(accessPageRes.body.includes('download'), 'Must contain download link');

  const downloadRes = await request('/hello.txt?token=' + token + '&download', {
    headers: { 'Cookie': cookieHeader }
  });
  assert.strictEqual(downloadRes.statusCode, 200);
  assert.strictEqual(downloadRes.body, 'Hello, this is a secret paid digital file contents!\n');
  console.log('✓ Test 9 & 10 passed: Paid file downloaded successfully with valid HMAC token!');

  console.log('\n=========================================');
  console.log('ALL 10 VERIFICATION TESTS PASSED PERFECTLY!');
  console.log('=========================================');
  serverProcess.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('Test execution failed:', err);
  serverProcess.kill();
  process.exit(1);
});
