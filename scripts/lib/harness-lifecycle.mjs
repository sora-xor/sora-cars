// Test-only ownership of returned handles. No signal or hidden-factory cleanup claim.
export async function withOwnedResources(body) {
  const owned = [];
  let closing = false, failed = false, primary, result;
  const own = (label, resource, close) => {
    if (closing || typeof close !== 'function') throw new TypeError('Register an owned handle before cleanup');
    owned.push({ label, resource, close });
    return resource;
  };
  try { result = await body(own); }
  catch (error) { failed = true; primary = error; }
  finally { closing = true; }
  const cleanup = [];
  for (const { label, resource, close } of owned.reverse()) {
    try { await close(resource); }
    catch (error) { cleanup.push(new Error(`${label} cleanup failed`, { cause: error })); }
  }
  if (cleanup.length) throw new AggregateError(failed ? [primary, ...cleanup] : cleanup,
    failed ? 'Harness failed and resource cleanup failed' : 'Resource cleanup failed',
    failed ? { cause: primary } : undefined);
  if (failed) throw primary;
  return result;
}

// ws.Server.close waits for all tracked clients. Stop new accepts first, terminate
// every owned client, and wait for actual client close events and server callback.
// A timeout reports incomplete cleanup; it does not establish an OS exit.
export async function closeWebSocketServer(server, { timeoutMs = 5000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('Positive close timeout required');
  const serverClosed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket server close timed out')), timeoutMs);
    const finish = error => { clearTimeout(timer); error ? reject(error) : resolve(); };
    try { server.close(finish); } catch (error) { finish(error); }
  });
  const clientsClosed = [...server.clients].map(client => new Promise((resolve, reject) => {
    if (client.readyState === 3) { resolve(); return; }
    const finish = error => {
      clearTimeout(timer); client.off('close', closed); client.off('error', errored);
      error ? reject(error) : resolve();
    };
    const closed = () => finish();
    const errored = error => finish(error);
    const timer = setTimeout(() => finish(new Error('Wallet client close timed out')), timeoutMs);
    client.once('close', closed); client.once('error', errored);
    try { client.terminate(); } catch (error) { finish(error); }
  }));
  const results = await Promise.allSettled([serverClosed, ...clientsClosed]);
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'Wallet WebSocket cleanup incomplete');
}
