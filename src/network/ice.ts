/** User-selected NAT traversal. Credentials stay in browser memory and never enter game evidence. */
export function parseIceServers(text: string): RTCIceServer[] {
  if (new TextEncoder().encode(text).byteLength > 16 * 1024) throw new Error('Connection server settings exceed 16 KiB.');
  const value: unknown = text.trim() ? JSON.parse(text) : [];
  if (!Array.isArray(value) || value.length > 8) throw new Error('Configure at most eight STUN/TURN servers.');
  return value.map(server => {
    if (!server || typeof server !== 'object' || Array.isArray(server) || Object.keys(server).some(key => !['urls', 'username', 'credential'].includes(key))) throw new Error('Connection servers accept only urls, username and credential.');
    const urls: unknown[] = typeof server.urls === 'string' ? [server.urls] : server.urls;
    if (!Array.isArray(urls) || urls.length < 1 || urls.length > 8) throw new Error('Each connection server needs one to eight URLs.');
    const validated = urls.map(raw => {
      if (typeof raw !== 'string' || raw.length > 512) throw new Error('Invalid connection server URL.');
      const match = /^(stun|stuns|turn|turns):([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/.exec(raw);
      if (!match || match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535) || match[1]!.startsWith('stun') && match[4]) throw new Error('Use a STUN/TURN host and optional port; TURN may specify transport=udp or tcp.');
      return raw;
    });
    if ((server.username === undefined) !== (server.credential === undefined)) throw new Error('Supply both TURN username and credential.');
    if (server.username !== undefined && (typeof server.username !== 'string' || !server.username || server.username.length > 512 || typeof server.credential !== 'string' || !server.credential || server.credential.length > 2048 || validated.some(url => url.startsWith('stun')))) throw new Error('Credentials require TURN URLs and bounded nonempty username/password strings.');
    return { urls: validated, ...(server.username === undefined ? {} : { username: server.username, credential: server.credential }) };
  });
}

export function iceConfiguration(servers: RTCIceServer[], relayOnly: boolean): RTCConfiguration {
  const iceServers = parseIceServers(JSON.stringify(servers));
  if (relayOnly && !iceServers.some(server => (server.urls as string[]).some(url => /^turns?:/.test(url)))) throw new Error('Relay-only connections need a configured TURN server.');
  return { iceServers, iceTransportPolicy: relayOnly ? 'relay' : 'all' };
}
