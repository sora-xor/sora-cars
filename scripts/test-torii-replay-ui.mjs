/** Chromium UI/SDK/OPFS transport tests against explicit local HTTP counterparts.
 * These counterparts do not authenticate a ledger or produce a native proof.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { decodeGameVerificationRequestV1, encodeGameVerificationRequestV1, parseGameExecutionReportV1 } from '@iroha/iroha-js/game-proof-worker';
import { encodeGameReplayEvidenceV1, decodeGameReplayExportRequestV1 } from '@iroha/iroha-js/game-replay';
const project = fileURLToPath(new URL('..', import.meta.url));
const output = process.env.SORA_CARS_TEST_OUTPUT;
const computation = process.env.SORA_CARS_TEST_COMPUTATION ?? 'street';
assert.ok(['street', 'stock_race'].includes(computation), 'Synthetic UI computation must be street or stock_race');
assert.ok(output && isAbsolute(output), 'Provide a fresh absolute SORA_CARS_TEST_OUTPUT directory');
await mkdir(output, { recursive: false });
const report = { scope: 'Actual Chromium UI, SDK and disk-backed OPFS; local protocol counterparts only, no authenticated Torii ledger, native proof or settlement', computation, request_scope: 'Synthetic computation-dispatch request; other fields come from retained Street codec fixture. This is not native Stock producer evidence.', status: 'running', checks: [], requests: [], errors: [], cleanup: {} };
const fixture = new URL('../test/fixtures/game-finalized-v1/', import.meta.resolve('@iroha/iroha-js/game-proof-worker'));
const baseRequest = decodeGameVerificationRequestV1(await readFile(new URL('request.nrt', fixture)));
const requestBytes = Buffer.from(encodeGameVerificationRequestV1({ ...baseRequest, computation: { kind: computation, value: null } })), request = decodeGameVerificationRequestV1(requestBytes);
const nativeReport = parseGameExecutionReportV1(await readFile(new URL('report.json', fixture), 'utf8'));
const evidence = { transcript: { batches: [{ start_tick: 0, inputs: [[1, 2, 3]] }], dnf_events: [] }, current_reveals: [], current_commitments: [] };
const evidenceBytes = Buffer.from(encodeGameReplayEvidenceV1(evidence));
await writeFile(join(output, 'request.nrt'), requestBytes, { flag: 'wx' });
await writeFile(join(output, 'evidence.nrt'), evidenceBytes, { flag: 'wx' });
await writeFile(join(output, 'evidence-scope.txt'), 'Synthetic codec-only public evidence. It is not accepted ledger history.\n', { flag: 'wx' });
let mode = 'success', appOrigin, torii, worker, vite, browser;
const seen = [], bodies = [], jobs = new Map();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(r => setTimeout(r, ms));
function cors(res) { res.setHeader('Access-Control-Allow-Origin', appOrigin);res.setHeader('Access-Control-Allow-Methods', 'POST,PUT,GET,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers', 'content-type');res.setHeader('Access-Control-Expose-Headers','content-encoding,content-range,x-content-type-options'); }
async function body(req) { const chunks=[]; for await(const c of req)chunks.push(c);return Buffer.concat(chunks); }
const listen = async server => { server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`; };
function workerStatus(id,phase) {
  const result={protocol:'iroha-game-worker-v1',id,status:phase,replay_path:`/v1/jobs/${id}/replay`,status_path:`/v1/jobs/${id}`};
  if(phase==='complete')Object.assign(result,{proof_path:`/v1/jobs/${id}/proof`,report:{...nativeReport,computation:request.computation,revision:Number(request.revision),carrier_height:Number(request.target_height),proof_bytes:3,replay_bytes:80}});
  return result;
}
try {
  // Reserve an ephemeral port for Vite, close the reservation, then start the owned child.
  const reservation=createServer();const viteOrigin=await listen(reservation);await new Promise(r=>reservation.close(r));appOrigin=viteOrigin;
  torii=createServer(async(req,res)=>{
    cors(res);if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const bytes=await body(req);const value=decodeGameReplayExportRequestV1(bytes);assert.deepEqual(value,{request,evidence});
    seen.push('torii');report.requests.push({kind:'torii',method:req.method,path:req.url,bytes:bytes.length,sha256:sha(bytes),cookie:req.headers.cookie??null});
    const headers={'Content-Type':'application/octet-stream','Content-Length':mode==='truncated'?'81':'80','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(mode==='unavailable'){res.writeHead(404);res.end();return;}
    res.writeHead(200,headers);
    if(mode==='stalled'){res.write(new Uint8Array(40));return;}
    res.end(new Uint8Array(80));
  });
  const toriiOrigin=await listen(torii);
  worker=createServer(async(req,res)=>{
    cors(res);if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const bytes=await body(req);res.setHeader('Content-Type','application/json');
    if(req.method==='POST'&&req.url==='/v1/jobs'){
      assert.deepEqual(bytes,requestBytes);seen.push('reserve');const id=(jobs.size+1).toString(16).padStart(64,'0');jobs.set(id,'awaiting_upload');res.writeHead(202);res.end(JSON.stringify(workerStatus(id,'awaiting_upload')));return;
    }
    const match=/^\/v1\/jobs\/([a-f0-9]{64})(\/replay)?$/.exec(req.url??'');assert.ok(match);const id=match[1];
    if(req.method==='PUT') {assert.equal(match[2],'/replay');seen.push('upload');assert.equal(bytes.length,80);bodies.push(Buffer.from(bytes));jobs.set(id,'complete');res.writeHead(202);res.end(JSON.stringify(workerStatus(id,'running')));return;}
    if(req.method==='DELETE'){jobs.set(id,'cancelling');res.writeHead(202);res.end(JSON.stringify(workerStatus(id,'cancelling')));return;}
    res.writeHead(200);res.end(JSON.stringify(workerStatus(id,jobs.get(id))));
  });
  const workerOrigin=await listen(worker);
  vite=spawn(process.execPath,[join(project,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',new URL(appOrigin).port,'--strictPort'],{cwd:project,stdio:['ignore','pipe','pipe']});
  let viteLog='';for(const stream of [vite.stdout,vite.stderr])stream.on('data',data=>{viteLog+=data;});
  for(let i=0;;i++){try{if((await fetch(appOrigin)).ok)break;}catch{}assert.ok(i<100,'Vite did not start');await delay(100);}
  browser=await chromium.launch({headless:true});
  async function pageFor(name){const context=await browser.newContext({viewport:{width:1440,height:1100}});const page=await context.newPage();
    page.on('pageerror',error=>report.errors.push(`${name}: ${error.message}`));
    await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw new Error('Folder saving is not exercised in this source-only test');};});
    await page.goto(appOrigin+'/#/prove');await page.locator('#native-proof-form').waitFor();
    await page.locator('#native-replay-source').selectOption('torii');
    await page.locator('#native-request-file').setInputFiles(join(output,'request.nrt'));await page.locator('#native-evidence-file').setInputFiles(join(output,'evidence.nrt'));
    await page.locator('#native-torii-origin').fill(toriiOrigin);await page.locator('#native-worker-origin').fill(workerOrigin);
    const fields={'native-network-id':request.network_id,'native-context-id':request.trusted_context_id,'native-first-height':String(request.first_height),'native-target-height':String(request.target_height),'native-block-hash':request.target_block_hash,'native-session-id':request.session_id,'native-revision':String(request.revision),'native-terminal-tick':String(request.terminal_tick)};
    for(const[id,value]of Object.entries(fields))await page.locator('#'+id).fill(value);
    await page.locator('#native-mode').selectOption(request.mode.kind);await page.locator('#native-computation').selectOption(computation);await page.locator('#native-pins-reviewed').check();return{context,page};
  }
  async function stageCount(page){return page.evaluate(async()=>{const root=await navigator.storage.getDirectory();const names=[];for await(const[name]of root.entries())names.push(name);return names.filter(name=>name.startsWith('sora-cars-replay-')).length;});}
  async function waitClean(page){await page.waitForFunction(async()=>{const root=await navigator.storage.getDirectory();for await(const[name]of root.entries())if(name.startsWith('sora-cars-replay-'))return false;return true;},{timeout:10000});}
  const success=await pageFor('success');
  await success.page.locator('#native-replay-source').scrollIntoViewIfNeeded();
  await success.page.screenshot({path:join(output,'torii-source-desktop.png'),fullPage:true});
  await success.page.setViewportSize({width:390,height:844});await success.page.locator('#native-replay-source').scrollIntoViewIfNeeded();await success.page.screenshot({path:join(output,'torii-source-mobile.png'),fullPage:true});await success.page.setViewportSize({width:1440,height:1100});
  await success.page.locator('#native-proof-start').click();await success.page.waitForFunction(()=>document.querySelector('#native-proof-status')?.getAttribute('data-phase')==='complete');
  assert.deepEqual(seen,['torii','reserve','upload']);assert.equal(await stageCount(success.page),1);assert.match(await success.page.locator('.native-proof-assurance').innerText(),/ENDPOINT-REPORTED/);
  assert.equal(JSON.parse(await success.page.evaluate(()=>window.render_game_to_text())).nativeProof.computation,computation);
  assert.match(await success.page.locator('#native-proof-report').innerText(),computation==='stock_race'?/ストックレース/:/ストリート/);
  assert.equal(bodies[0].length,80);await success.page.screenshot({path:join(output,'torii-source-complete.png'),fullPage:true});
  await success.page.locator('#native-proof-cancel').click();await waitClean(success.page);report.checks.push('complete Torii download precedes exact original request reservation and staged replay upload; cancellation removes owned disk file');await success.context.close();
  for(const testMode of ['pins','computation','unavailable','stalled','navigation']){
    mode=testMode==='navigation'?'stalled':testMode;const t=await pageFor(testMode);const before=seen.length;
    if(testMode==='pins'){await t.page.locator('#native-revision').fill('99');await t.page.locator('#native-pins-reviewed').check();}
    if(testMode==='computation'){await t.page.locator('#native-computation').selectOption(computation==='stock_race'?'street':'stock_race');assert.equal(await t.page.locator('#native-pins-reviewed').isChecked(),false);await t.page.locator('#native-pins-reviewed').check();}
    await t.page.locator('#native-proof-start').click();
    if(['stalled','navigation'].includes(testMode)){
      await t.page.waitForFunction(()=>document.querySelector('#native-proof-status')?.getAttribute('data-phase')==='fetching');
      while(seen.length===before)await delay(10);
      if(testMode==='navigation')await t.page.goto(appOrigin+'/#/');else await t.page.locator('#native-proof-cancel').click();
      await waitClean(t.page);assert.deepEqual(seen.slice(before),['torii']);
    }else{await t.page.waitForFunction(()=>document.querySelector('#native-proof-status')?.getAttribute('data-phase')==='failed');assert.deepEqual(seen.slice(before),['pins','computation'].includes(testMode)?[]:['torii']);await waitClean(t.page);}
    report.checks.push(`${testMode}: no worker reservation or upload; no retained partial replay`);await t.context.close();
  }
  const skillClient=join(project,'output/playwright/native-proof-game-client/client.mjs');
  const skillSource='/Users/takemiyamakoto/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js';
  assert.equal(sha(await readFile(skillClient)),sha(await readFile(skillSource)));
  const gameClient=spawn(process.execPath,[skillClient,'--url',appOrigin+'/#/prove','--actions-json',JSON.stringify({steps:[{buttons:[],frames:6}]}),'--iterations','1','--screenshot-dir',join(output,'game-client')],{cwd:project,stdio:['ignore','pipe','pipe']});
  let gameLog='';for(const stream of[gameClient.stdout,gameClient.stderr])stream.on('data',data=>{gameLog+=data;});
  const [gameExit]=await once(gameClient,'exit');await writeFile(join(output,'game-client.log'),gameLog,{flag:'wx'});assert.equal(gameExit,0);report.cleanup.gameClient={exitCode:gameExit};
  assert.deepEqual(report.errors,[]);assert.ok(report.requests.every(r=>r.cookie===null));report.status='pass';report.upload_sha256=sha(bodies[0]);
  await writeFile(join(output,'vite.log'),viteLog,{flag:'wx'});
} catch(error){report.status='fail';report.failure=error.stack;throw error;}
finally{
  if(browser){await browser.close();report.cleanup.browser=true;}
  for(const[name,server]of[['torii',torii],['worker',worker]])if(server){server.closeAllConnections();await new Promise(r=>server.close(r));report.cleanup[name]=true;}
  if(vite){if(vite.exitCode===null){vite.kill('SIGTERM');await once(vite,'exit');}report.cleanup.vite={exitCode:vite.exitCode,signalCode:vite.signalCode};}
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify(report));
