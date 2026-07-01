const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');
let sentCount = 0;

ws.on('open', () => {
  // Send multiple test messages
  ws.send('{"type":"auth","token":"test"}');
  sentCount++;
  console.log('Sent auth message');
});

ws.on('message', (raw, isBinary) => {
  console.log('typeof raw:', typeof raw);
  console.log('isBuffer:', Buffer.isBuffer(raw));
  console.log('isBinary:', isBinary);
  const text = typeof raw === 'string' ? raw : raw.toString('utf8');
  console.log('Text:', text.substring(0, 200));
  console.log('---');
  
  try {
    const msg = JSON.parse(text);
    console.log('Parsed OK, type:', msg.type);
  } catch(e) {
    console.log('Parse error:', e.message);
  }
  
  if (sentCount === 1) {
    sentCount++;
    console.log('\nSending friend request...');
    const msg = JSON.stringify({ type: 'friend:request', username: 'friendtest2' });
    console.log('Sending text:', msg);
    ws.send(msg);
  }
});

ws.on('error', err => console.log('Error:', err.message));

setTimeout(() => process.exit(0), 5000);
