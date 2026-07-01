const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;
  console.log('Token:', token ? 'OK' : 'FAIL');

  // Test 1: New connection, send friend request immediately after auth, before init is received
  console.log('\n=== Test 1: Single connection, sequential sends ===');
  const ws1 = new WebSocket('ws://localhost:3000');
  
  ws1.on('open', () => {
    console.log('Sending auth...');
    ws1.send(JSON.stringify({ type: 'auth', token }));
  });
  
  let msgCount = 0;
  ws1.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    msgCount++;
    
    try {
      const msg = JSON.parse(text);
      console.log('Msg #' + msgCount + ' type:', msg.type);
      
      if (msg.type === 'connected') {
        // Send friend request immediately after connected, before init
        console.log('Sending friend request immediately...');
        ws1.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
      }
      
      if (msg.type === 'friend:request:sent') {
        console.log('SUCCESS! Request sent to', msg.to?.username);
      }
      
      if (msg.type === 'error') {
        console.log('ERROR:', msg.message);
      }
    } catch(e) {
      console.log('PARSE ERROR:', e.message, 'text:', text.substring(0, 100));
    }
  });
  
  ws1.on('error', err => console.log('WS error:', err.message));

  // Test 2: Use raw binary Buffer to send
  setTimeout(async () => {
    console.log('\n=== Test 2: Sending with Buffer ===');
    const ws2 = new WebSocket('ws://localhost:3000');
    
    ws2.on('open', () => {
      const payload = Buffer.from(JSON.stringify({ type: 'auth', token }), 'utf8');
      console.log('Sending auth as Buffer, len:', payload.length);
      ws2.send(payload);
    });
    
    ws2.on('message', (raw) => {
      const text = typeof raw === 'string' ? raw : raw.toString();
      try {
        const msg = JSON.parse(text);
        console.log('WS2 type:', msg.type);
        
        if (msg.type === 'connected') {
          const payload = Buffer.from(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }), 'utf8');
          console.log('WS2 Sending friend request as Buffer, len:', payload.length);
          ws2.send(payload);
        }
        
        if (msg.type === 'friend:request:sent') {
          console.log('WS2 SUCCESS! Request sent to', msg.to?.username);
        }
        
        if (msg.type === 'error') {
          console.log('WS2 ERROR:', msg.message);
        }
        
        if (msg.type === 'init') {
          console.log('WS2 init received, userId:', msg.user?.id);
        }
      } catch(e) {
        console.log('WS2 PARSE ERROR:', e.message);
      }
    });
    
    ws2.on('error', err => console.log('WS2 error:', err.message));
  }, 3000);
  
  setTimeout(() => { console.log('\nDONE'); process.exit(0); }, 15000);
}

main();
