// Simple test: create a local WS server and test sending two messages
const http = require('http');
const { WebSocketServer } = require('ws');
const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let count = 0;
  ws.on('message', (raw) => {
    count++;
    console.log(`Server received message #${count}:`, typeof raw, Buffer.isBuffer(raw), raw.toString());
    try {
      const msg = JSON.parse(raw.toString());
      console.log('  Parsed:', JSON.stringify(msg).substring(0, 100));
      ws.send(JSON.stringify({ response: 'ok', count }));
    } catch(e) {
      console.log('  PARSE ERROR:', e.message);
      ws.send(JSON.stringify({ response: 'error', message: e.message }));
    }
  });
  ws.send(JSON.stringify({ type: 'welcome' }));
});

server.listen(3099, () => {
  console.log('Test server on port 3099');
  
  // Now connect as client
  const WebSocket = require('ws');
  const client = new WebSocket('ws://localhost:3099');
  
  client.on('open', () => {
    console.log('\nClient opened');
    console.log('Sending message 1...');
    client.send(JSON.stringify({ type: 'auth', token: 'test' }));
    console.log('Sending message 2...');
    client.send(JSON.stringify({ type: 'friend:request', username: 'test' }));
  });
  
  let respCount = 0;
  client.on('message', (raw) => {
    respCount++;
    const text = typeof raw === 'string' ? raw : raw.toString();
    console.log(`Client received #${respCount}:`, text.substring(0, 200));
    
    if (respCount >= 3) {
      console.log('\nTest complete!');
      client.close();
      server.close();
      process.exit(0);
    }
  });
  
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 5000);
});
