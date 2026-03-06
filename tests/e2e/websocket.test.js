const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-ws-secret';
let server, wss, port;

beforeAll((done) => {
  const app = express();
  server = http.createServer(app);
  const { WebSocketServer } = require('ws');
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token) {
      try { jwt.verify(token, JWT_SECRET); } catch {}
    }
    ws.send(JSON.stringify({ event: 'connected', timestamp: new Date().toISOString() }));
  });

  server.listen(0, () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  if (wss) wss.close();
  if (server) server.close(done); else done();
});

/**
 * Connect WS and buffer messages so we never miss the initial one
 */
function connectWs(token) {
  const WebSocket = require('ws');
  const url = token
    ? `ws://localhost:${port}/ws?token=${token}`
    : `ws://localhost:${port}/ws`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws._msgBuffer = [];
    ws.on('message', (data) => ws._msgBuffer.push(JSON.parse(data.toString())));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

/**
 * Wait for a message (checks buffer first)
 */
function waitMsg(ws, timeout = 3000) {
  if (ws._msgBuffer.length > 0) return Promise.resolve(ws._msgBuffer.shift());
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('msg timeout')), timeout);
    const check = () => {
      if (ws._msgBuffer.length > 0) { clearTimeout(t); resolve(ws._msgBuffer.shift()); }
    };
    const origPush = ws._msgBuffer.push.bind(ws._msgBuffer);
    ws._msgBuffer.push = (...args) => { const r = origPush(...args); check(); return r; };
    check();
  });
}

const validToken = jwt.sign({ id: 'admin', username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const userToken = jwt.sign({ id: 'user', username: 'user', role: 'user' }, JWT_SECRET, { expiresIn: '1h' });

describe('WebSocket', () => {
  test('connects and receives connected event', async () => {
    const ws = await connectWs(validToken);
    const msg = await waitMsg(ws);
    expect(msg.event).toBe('connected');
    expect(msg.timestamp).toBeTruthy();
    ws.close();
  });

  test('connects without token', async () => {
    const ws = await connectWs(null);
    const msg = await waitMsg(ws);
    expect(msg.event).toBe('connected');
    ws.close();
  });

  test('connects with invalid token (still connects)', async () => {
    const ws = await connectWs('bad-token');
    const msg = await waitMsg(ws);
    expect(msg.event).toBe('connected');
    ws.close();
  });

  test('receives connected event with timestamp', async () => {
    const ws = await connectWs(validToken);
    const msg = await waitMsg(ws);
    expect(new Date(msg.timestamp).getTime()).toBeGreaterThan(0);
    ws.close();
  });

  test('handles multiple simultaneous connections', async () => {
    const ws1 = await connectWs(validToken);
    const ws2 = await connectWs(userToken);
    const msg1 = await waitMsg(ws1);
    const msg2 = await waitMsg(ws2);
    expect(msg1.event).toBe('connected');
    expect(msg2.event).toBe('connected');
    ws1.close();
    ws2.close();
  });

  test('clean disconnect', async () => {
    const ws = await connectWs(validToken);
    await waitMsg(ws);
    await new Promise((resolve) => {
      ws.on('close', resolve);
      ws.close();
    });
  });
});
