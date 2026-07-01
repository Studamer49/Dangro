const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;

  // Test: send auth, then wait, then send friend request
  const ws = new WebSocket('ws://localhost:3000');
  let count = 0;
  
  ws.on('open', () => {
    console.log('Sending auth...');
    ws.send(JSON.stringify({ type: 'auth', token }));
  });
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    count++;
    
    let msg;
    try { msg = JSON.parse(text); } catch(e) { 
      console.log(`Response ${count}: PARSE ERROR: ${text.substring(0,100)}`); 
      return; 
    }
    
    if (msg.type === 'error') {
      console.log(`Response ${count}: ERROR - ${msg.message}`);
    } else {
      console.log(`Response ${count}: ${msg.type}`);
    }
    
    if (msg.type === 'connected') {
      // Send a simple message that has a handler
      console.log('Sending auth (again) to test...');
      ws.send(JSON.stringify({ type: 'auth', token }));
    }
    
    if (msg.type === 'init') {
      console.log('\nWill send friend request in 1s...');
      setTimeout(() => {
        console.log('Sending friend:request...');
        ws.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
      }, 1000);
      
      setTimeout(() => {
        console.log('Sending second friend:request...');
        ws.send(JSON.stringify({ type: 'friend:request', username: 'friendtest2' }));
      }, 2000);
    }
    
    if (msg.type === 'friend:request:sent') {
      console.log('SUCCESS! Request sent to', msg.to?.username);
    }
    
    if (count >= 6) {
      ws.close();
      setTimeout(() => process.exit(0), 500);
    }
  });
  
  setTimeout(() => { console.log(`\nTIMEOUT after ${count} responses`); process.exit(1); }, 15000);
}

main();
