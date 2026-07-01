const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;

  // Test: send two simple text messages and see what happens
  const ws = new WebSocket('ws://localhost:3000');
  let count = 0;
  
  ws.on('open', () => {
    console.log('Sending message 1...');
    ws.send('hello');
    console.log('Sending message 2...');
    ws.send('world');
  });
  
  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    count++;
    console.log(`Response ${count}:`, text.substring(0, 200));
    
    if (count >= 3) {
      ws.close();
      setTimeout(() => process.exit(0), 500);
    }
  });
  
  setTimeout(() => { console.log('TIMEOUT after ' + count + ' responses'); process.exit(1); }, 5000);
}

main();
