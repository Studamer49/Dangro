const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;

  const ws = new WebSocket('ws://localhost:3000');
  let testNum = 0;
  
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
  });
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    try {
      const msg = JSON.parse(text);
      
      if (testNum === 0 && msg.type === 'connected') {
        // Send first test message
        console.log('Test 1: Sending simple test message after connected...');
        ws.send(JSON.stringify({ type: 'ping', _test: true }));
        testNum++;
      }
      
      if (testNum === 1) {
        console.log('Response to test 1:', msg.type, msg.message || '');
        if (msg.type === 'error') {
          // Check if the issue is with all second messages
          console.log('Second message failed!');
        }
        testNum++;
      }
      
      if (msg.type === 'init') {
        console.log('Init received. User ID:', msg.user?.id);
        console.log('Test 2: Will send friend request now...');
        ws.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
        testNum = 3;
      }
      
      if (testNum === 3 && msg.type !== 'init') {
        console.log('Response to friend request:', msg.type, msg.message || '');
        if (msg.type === 'friend:request:sent') {
          console.log('SUCCESS!');
        }
        ws.close();
        setTimeout(() => process.exit(0), 500);
      }
      
    } catch(e) {
      console.log('PARSE ERROR:', e.message);
    }
  });
  
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
}

main();
