const WebSocket = require('ws');

async function main() {
  // Login first
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  console.log('Login:', res.token ? 'OK token=' + res.token.substring(0, 20) : 'FAIL');
  const token = res.token;

  const ws = new WebSocket('ws://localhost:3000');
  
  ws.on('open', () => {
    console.log('Sending auth...');
    ws.send(JSON.stringify({ type: 'auth', token }));
  });
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    try {
      const msg = JSON.parse(text);
      console.log('RECV:', msg.type);
      
      if (msg.type === 'friend:request:sent') {
        console.log('SUCCESS! Request sent to', msg.to?.username);
        process.exit(0);
      }
      
      if (msg.type === 'friend:accepted') {
        console.log('SUCCESS! Accepted:', msg.friend?.username);
        process.exit(0);
      }
      
      if (msg.type === 'init') {
        // Wait 1 second then send friend request
        console.log('Will send friend request in 1s...');
        setTimeout(() => {
          console.log('Sending friend:request for friendtest2...');
          ws.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
        }, 1000);
      }
      
      if (msg.type === 'error') {
        console.log('ERROR:', msg.message);
        if (msg.message === 'Invalid message format') {
          console.log('This is weird - trying again with different approach...');
          // Try sending raw string
          ws.send('{"type":"friend:request","username":"friendtest2"}');
        }
      }
    } catch(e) {
      console.log('PARSE ERROR:', text.substring(0, 200));
    }
  });
  
  ws.on('error', err => console.log('WS error:', err.message));
  
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
}

main();
