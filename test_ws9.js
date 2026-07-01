const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;
  console.log('Token OK\n');

  // Test: Open two connections
  // Connection 1: authenticate and stay open
  // Connection 2: send only friend request
  console.log('=== Test: Two connections ===');
  
  const ws1 = new WebSocket('ws://localhost:3000');
  ws1.on('open', () => {
    ws1.send(JSON.stringify({ type: 'auth', token }));
  });
  ws1.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'init') {
        console.log('WS1: Connected, userId:', msg.user.id);
        
        // Now open WS2 which will also auth
        console.log('Opening WS2...');
        const ws2 = new WebSocket('ws://localhost:3000');
        ws2.on('open', () => {
          // Don't auth, just send friend request
          // But auth is needed for ws.userId
          console.log('WS2: Sending auth + friend request together...');
          ws2.send(JSON.stringify({ type: 'auth', token }));
          ws2.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
        });
        ws2.on('message', (raw2) => {
          const text2 = typeof raw2 === 'string' ? raw2 : raw2.toString();
          try {
            const msg2 = JSON.parse(text2);
            console.log('WS2 RECV:', msg2.type, msg2.message || '');
            
            if (msg2.type === 'friend:request:sent') {
              console.log('SUCCESS!');
              ws1.close();
              ws2.close();
              setTimeout(() => process.exit(0), 500);
            }
          } catch(e) {
            console.log('WS2 PARSE ERROR:', e.message);
          }
        });
      }
    } catch(e) {
      console.log('WS1 PARSE ERROR:', e.message);
    }
  });
  
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
}

main();
