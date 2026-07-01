const WebSocket = require('ws');

async function test() {
  // Login
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  console.log('Login:', res.token ? 'OK' : 'FAIL');
  const token = res.token;

  // Connect fresh
  const ws = new WebSocket('ws://localhost:3000');
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    try {
      const msg = JSON.parse(text);
      console.log('RECV:', msg.type, msg.message || '');
      
      if (msg.type === 'init') {
        console.log('Connected, userId:', msg.user.id);
        // Send friend request
        console.log('\nSending friend:request for friendtest2...');
        ws.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
      }
      
      if (msg.type === 'friend:request:sent') {
        console.log('SUCCESS: friend request sent to', msg.to?.username);
        ws.close();
        process.exit(0);
      }
      
      if (msg.type === 'error') {
        console.log('ERROR:', msg.message);
        ws.close();
        process.exit(1);
      }
    } catch(e) {
      console.log('PARSE ERROR:', text.substring(0, 200));
    }
  });

  ws.on('open', () => {
    console.log('Sending auth...');
    ws.send(JSON.stringify({ type: 'auth', token }));
  });

  ws.on('error', err => console.log('WS error:', err.message));

  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
}

test();
