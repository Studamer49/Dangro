const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;

  // Test: Open connection, send auth, and ONLY friend request
  const ws = new WebSocket('ws://localhost:3000');
  let initReceived = false;
  
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
  });
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    try {
      const msg = JSON.parse(text);
      console.log('RECV:', msg.type, msg.message || '');
      
      if (msg.type === 'init' && !initReceived) {
        initReceived = true;
        console.log('Sending friend:request...');
        ws.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
      }
      
      if (msg.type === 'friend:request:sent') {
        console.log('SUCCESS!');
        process.exit(0);
      }
    } catch(e) {
      console.log('PARSE ERROR:', e.message);
    }
  });
  
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
}

main();
