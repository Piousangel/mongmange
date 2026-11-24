#!/usr/bin/env node
// B7 느린 DB 흉내 — api ↔ Postgres 사이에 끼우는 TCP 지연 프록시(새 의존성 없음, toxiproxy 대신).
// 도커 네트워크 mong_default 안에서 돌린다(README 참고): 듣기 0.0.0.0:6432 → 위쪽 db:5432, 제어 HTTP 0.0.0.0:8163(호스트에는 127.0.0.1로만 게시).
//
// 제어(호스트에서):
//   curl '127.0.0.1:8163/set?delay=300'   DB → api 방향 조각마다 300ms 지연(= 왕복마다 +300ms)
//   curl '127.0.0.1:8163/set?hold=1'      DB 응답을 붙잡아 두고 보내지 않음(블랙홀 — 패킷 손실·멈춘 DB)
//   curl '127.0.0.1:8163/set?hold=0'      붙잡은 것을 흘려보내고 정상화
//   curl '127.0.0.1:8163/reset'           열린 연결을 모두 끊음(DB 재시작·장애 조치 흉내)
//   curl '127.0.0.1:8163/'                지금 상태
import http from 'node:http';
import net from 'node:net';

const LISTEN = Number(process.env.LISTEN_PORT ?? 6432);
const CTRL = Number(process.env.CTRL_PORT ?? 8163);
const UP_HOST = process.env.UP_HOST ?? 'db';
const UP_PORT = Number(process.env.UP_PORT ?? 5432);

const state = { delay: 0, hold: false };
const conns = new Set();

function pipeDelayed(from, to, applyDelay) {
  let releaseAt = 0;
  const held = [];
  const flush = () => {
    while (held.length) to.write(held.shift());
  };
  from.on('data', (chunk) => {
    if (!applyDelay) return void to.write(chunk);
    if (state.hold) return void held.push(chunk);
    flush();
    const at = Math.max(releaseAt, Date.now() + state.delay);
    releaseAt = at;
    const wait = at - Date.now();
    if (wait <= 0) to.write(chunk);
    else setTimeout(() => !to.destroyed && to.write(chunk), wait);
  });
  return { flush };
}

const server = net.createServer((client) => {
  const up = net.connect(UP_PORT, UP_HOST);
  const c = { client, up, flushers: [] };
  conns.add(c);
  pipeDelayed(client, up, false);
  c.flushers.push(pipeDelayed(up, client, true).flush);
  const close = () => {
    conns.delete(c);
    client.destroy();
    up.destroy();
  };
  client.on('error', close).on('close', close);
  up.on('error', close).on('close', close);
});
server.listen(LISTEN, '0.0.0.0', () => console.log(`delay-proxy :${LISTEN} → ${UP_HOST}:${UP_PORT}, 제어 :${CTRL}`));

http
  .createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/set') {
      if (u.searchParams.has('delay')) state.delay = Math.max(0, Number(u.searchParams.get('delay')) || 0);
      if (u.searchParams.has('hold')) {
        state.hold = u.searchParams.get('hold') === '1';
        if (!state.hold) for (const c of conns) for (const f of c.flushers) f();
      }
    } else if (u.pathname === '/reset') {
      for (const c of [...conns]) {
        c.client.destroy();
        c.up.destroy();
      }
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ...state, conns: conns.size }));
  })
  .listen(CTRL, '0.0.0.0');
