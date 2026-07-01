const WebSocket = require('ws');

const TEST_USER1 = { username: 'friendtest1', password: 'test123', displayName: 'Friend Test 1' };
const TEST_USER2 = { username: 'friendtest2', password: 'test123', displayName: 'Friend Test 2' };
const API = 'http://localhost:3000';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  return data;
}

function connectWS(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3000');
    ws.on('open', () => {
      console.log('  WS opened, sending auth');
      ws.send(JSON.stringify({ type: 'auth', token }));
    });
    ws.on('message', (raw, isBinary) => {
      const text = raw.toString();
      let msg;
      try { msg = JSON.parse(text); } catch(e) { console.log('  [PARSE ERROR]', text.substring(0, 100)); return; }
      console.log('  [WS msg] type=' + msg.type);
      if (msg.type === 'init') resolve({ ws, data: msg });
      if (msg.type === 'error') console.log('  [ERROR]', msg.message);
    });
    ws.on('error', err => {
      console.log('  [WS error]', err.message);
      reject(err);
    });
    setTimeout(() => reject(new Error('timeout')), 5000);
  });
}

function waitFor(ws, typeFilter, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const handler = raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === typeFilter) {
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    setTimeout(() => { ws.removeListener('message', handler); reject(new Error('timeout waiting for ' + typeFilter)); }, timeout);
  });
}

async function main() {
  // Clean up old test users
  console.log('=== Starting Friend Request Test ===\n');

  // Signup or login both users
  let u1 = await api('POST', '/api/signup', TEST_USER1).catch(() => null);
  if (!u1 || u1.error) u1 = await api('POST', '/api/login', { username: TEST_USER1.username, password: TEST_USER1.password });
  console.log('User1:', u1 ? 'token:' + u1.token?.substring(0, 20) : 'FAILED');

  let u2 = await api('POST', '/api/signup', TEST_USER2).catch(() => null);
  if (!u2 || u2.error) u2 = await api('POST', '/api/login', { username: TEST_USER2.username, password: TEST_USER2.password });
  console.log('User2:', u2 ? 'token:' + u2.token?.substring(0, 20) : 'FAILED');

  if (!u1 || !u1.token || !u2 || !u2.token) {
    console.log('ERROR: Could not get tokens');
    process.exit(1);
  }

  // Connect both users via WebSocket
  console.log('\nConnecting WebSockets...');
  const conn1 = await connectWS(u1.token);
  console.log('User1 connected, userId:', conn1.data.user.id);
  const conn2 = await connectWS(u2.token);
  console.log('User2 connected, userId:', conn2.data.user.id);

  // Test 1: User1 sends friend request to User2
  console.log('\n--- Test 1: Send friend request ---');
  const p1 = waitFor(conn1.ws, 'friend:request:sent');
  const p2 = waitFor(conn2.ws, 'friend:request:incoming');
  conn1.ws.send(JSON.stringify({ type: 'friend:request', username: TEST_USER2.username }));
  
  const sent = await p1;
  console.log('User1 received:', sent.type, 'to:', sent.to?.username);
  const incoming = await p2;
  console.log('User2 received:', incoming.type, 'from:', incoming.from?.username);

  // Test 2: User2 accepts friend request
  console.log('\n--- Test 2: Accept friend request ---');
  const p3 = waitFor(conn1.ws, 'friend:accepted');
  const p4 = waitFor(conn2.ws, 'friend:accepted');
  conn2.ws.send(JSON.stringify({ type: 'friend:accept', friendId: conn1.data.user.id }));
  
  const accepted1 = await p3;
  console.log('User1 friend:accepted:', accepted1.friend?.username);
  const accepted2 = await p4;
  console.log('User2 friend:accepted:', accepted2.friend?.username);

  console.log('\n=== All friend request tests PASSED ===');
  conn1.ws.close();
  conn2.ws.close();
}

main().catch(err => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});
