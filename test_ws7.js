const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;
  console.log('Token OK\n');

  // Only send ONE message per connection, no auth
  console.log('=== Test: Send only friend request without auth ===');
  const ws = new WebSocket('ws://localhost:3000');
  
  ws.on('open', () => {
    // Send only a friend request without auth
    ws.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
  });
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    console.log('RAW:', text.substring(0, 200));
    try {
      const msg = JSON.parse(text);
      console.log('type:', msg.type, '| message:', msg.message || '');
    } catch(e) {
      console.log('PARSE ERROR:', e.message);
    }
    ws.close();
    setTimeout(() => process.exit(0), 500);
  });
  
  ws.on('error', err => console.log('WS error:', err.message));
  
  setTimeout(() => process.exit(0), 5000);
}

main();
