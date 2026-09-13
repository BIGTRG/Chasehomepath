/**
 * In-app video rooms: browser-to-browser WebRTC with this API as the signaling relay.
 * Signaling is Server-Sent Events (down) + POST (up), so it rides the existing
 * HTTPS proxy with no WebSocket upgrade config. Media never touches the server.
 *
 * Rooms are in-memory per API process (single instance today). ICE: STUN only for
 * now; a coturn TURN server on the Hetzner fleet is the planned next step for
 * members behind strict NATs (see docs/RUNBOOK.md).
 */
import { randomUUID } from 'node:crypto';

const rooms = new Map(); // roomCode -> Map(peerId -> { res, user, name })

export const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

function room(code) {
  if (!rooms.has(code)) rooms.set(code, new Map());
  return rooms.get(code);
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(code, event, data, exceptPeer) {
  for (const [pid, p] of room(code)) if (pid !== exceptPeer) send(p.res, event, data);
}

/** Attach an SSE stream for a peer. Returns the peerId. */
export function join(code, user, res, { name, role }) {
  const peerId = randomUUID();
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();
  const r = room(code);
  const peers = [...r.entries()].map(([id, p]) => ({ peerId: id, name: p.name, role: p.role }));
  r.set(peerId, { res, user, name, role });
  send(res, 'welcome', { peerId, peers, iceServers: ICE_SERVERS });
  broadcast(code, 'peer-joined', { peerId, name, role }, peerId);

  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  res.on('close', () => {
    clearInterval(ping);
    r.delete(peerId);
    if (r.size === 0) rooms.delete(code);
    else broadcast(code, 'peer-left', { peerId });
  });
  return peerId;
}

/** Relay an SDP offer/answer or ICE candidate to one peer (or everyone). */
export function signal(code, fromPeer, { to, type, payload }) {
  const r = rooms.get(code);
  if (!r || !r.has(fromPeer)) return false;
  const msg = { from: fromPeer, type, payload };
  if (to) {
    const target = r.get(to);
    if (!target) return false;
    send(target.res, 'signal', msg);
  } else {
    broadcast(code, 'signal', msg, fromPeer);
  }
  return true;
}

export function roomSize(code) {
  return rooms.get(code)?.size ?? 0;
}
