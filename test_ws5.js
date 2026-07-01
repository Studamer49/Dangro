const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;
  console.log('Token:', token ? 'OK' : 'FAIL');

  const ws = new WebSocket('ws://localhost:3000');
  let initReceived = false;
  
  ws.on('open', () => {
    console.log('Sending auth...');
    ws.send(JSON.stringify({ type: 'auth', token }));
  });
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    
    // Log raw message info
    console.log('RAW len=' + text.length + ' start=' + text.substring(0, 50));
    
    try {
      const msg = JSON.parse(text);
      console.log('  -> type:', msg.type);
      
      if (msg.type === 'init' && !initReceived) {
        initReceived = true;
        console.log('Connected, will send message in 2s...');
        setTimeout(() => {
          const payload = JSON.stringify({ type: 'friend:request', username: 'friendtest2', _t: Date.now() });
          console.log('SENDING:', payload);
          ws.send(payload);
        }, 2000);
      }
    } catch(e) {
      console.log('CLIENT PARSE ERROR:', e.message);
    }
  });
  
  ws.on('error', err => console.log('WS error:', err.message));
  
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
}

main();
