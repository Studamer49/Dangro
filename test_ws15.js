const WebSocket = require('ws');

async function main() {
  const res = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friendtest1', password: 'test123' })
  }).then(r => r.json());
  const token = res.token;

  // Test various message types
  async function testMessage(type, payload) {
    return new Promise((resolve) => {
      const ws = new WebSocket('ws://localhost:3000');
      let gotInit = false;
      
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
      });
      
      ws.on('message', (raw) => {
        const text = typeof raw === 'string' ? raw : raw.toString();
        try {
          const msg = JSON.parse(text);
          
          if (msg.type === 'init' && !gotInit) {
            gotInit = true;
            // Send test message with small delay
            setTimeout(() => {
              console.log(`Testing ${type}...`);
              ws.send(JSON.stringify(payload));
            }, 100);
          }
          
          if (gotInit && msg.type !== 'init' && msg.type !== 'connected') {
            console.log(`  Result: ${msg.type} ${msg.message || ''}`);
            ws.close();
            resolve(msg);
          }
        } catch(e) {
          console.log(`  PARSE ERROR: ${e.message}`);
        }
      });
      
      setTimeout(() => { ws.close(); resolve(null); }, 3000);
    });
  }

  console.log('Testing various message types:\n');
  
  let r;
  r = await testMessage('ping', { type: 'ping' });
  r = await testMessage('server:list', { type: 'server:list' });
  r = await testMessage('typing', { type: 'typing', chatKey: 'test', isTyping: true });
  r = await testMessage('friend:request', { type: 'friend:request', username: 'friendtest2' });
  r = await testMessage('friend:accept', { type: 'friend:accept', friendId: 'test' });
  r = await testMessage('friend:deny', { type: 'friend:deny', friendId: 'test' });
  
  console.log('\nDone');
  process.exit(0);
}

main();
