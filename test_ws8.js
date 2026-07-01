const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;
  console.log('Token OK\n');

  console.log('=== Sequential test: auth -> wait for init -> friend request ===');
  const ws = new WebSocket('ws://localhost:3000');
  let step = 0;
  
  ws.on('open', () => {
    console.log('Step 1: Sending auth...');
    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    }, 500); // Wait 500ms after open to send auth
  });
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    try {
      const msg = JSON.parse(text);
      console.log('RECV:', msg.type);
      
      if (msg.type === 'init') {
        console.log('Step 3: init received, waiting 3s before sending friend request');
        step = 2;
        setTimeout(() => {
          console.log('Step 4: Sending friend request for friendtest2...');
          ws.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
        }, 3000);
      }
      
      if (msg.type === 'friend:request:sent') {
        console.log('SUCCESS! Request sent to', msg.to?.username);
        ws.close();
        setTimeout(() => process.exit(0), 500);
      }
      
      if (msg.type === 'error') {
        console.log('ERROR:', msg.message);
      }
      
      if (msg.type === 'connected') {
        console.log('Step 2: connected');
      }
    } catch(e) {
      console.log('PARSE ERROR:', e.message);
    }
  });
  
  ws.on('error', err => console.log('WS error:', err.message));
  
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 20000);
}

main();
