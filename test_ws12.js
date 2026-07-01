const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;

  // Test: send two valid JSON messages
  const ws = new WebSocket('ws://localhost:3000');
  let count = 0;
  let errorCount = 0;
  
  ws.on('open', () => {
    console.log('Sending JSON message 1: {type:auth}...');
    ws.send(JSON.stringify({ type: 'auth', token }));
    console.log('Sending JSON message 2: {type:ping}...');
    ws.send(JSON.stringify({ type: 'ping' }));
  });
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    count++;
    
    let parsed = false;
    try {
      const msg = JSON.parse(text);
      parsed = true;
      if (msg.type === 'error') {
        errorCount++;
        console.log(`Response ${count}: ERROR - ${msg.message}`);
      } else {
        console.log(`Response ${count}: ${msg.type}`);
      }
    } catch(e) {
      console.log(`Response ${count}: PARSE ERROR: ${text.substring(0,100)}`);
    }
    
    if (count >= 4) {
      console.log(`\nTotal responses: ${count}, Errors: ${errorCount}`);
      ws.close();
      setTimeout(() => process.exit(0), 500);
    }
  });
  
  setTimeout(() => { 
    console.log(`\nTIMEOUT after ${count} responses, Errors: ${errorCount}`); 
    process.exit(1); 
  }, 5000);
}

main();
