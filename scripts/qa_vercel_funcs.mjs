/* Local QA: exercise every serverless function with stub req/res before deploy.
   The ask test performs a REAL keyless GLM call. Run from the project root:
     node scripts/qa_vercel_funcs.mjs
*/
import ask from '../api/ask.mjs';
import health from '../api/health.mjs';
import packs from '../api/packs.mjs';
import packSlug from '../api/pack/[slug].mjs';
import exp from '../api/export.mjs';
import job from '../api/job/[id].mjs';
import dl from '../api/download/[id].mjs';
import gen from '../api/generate.mjs';

function stubRes() {
  const out = { statusCode: 0, body: null };
  out.status = c => { out.statusCode = c; return out; };
  out.json = o => { out.body = o; return out; };
  out.redirect = (c, u) => { out.statusCode = c; out.body = u; return out; };
  return out;
}
function stubReq(method, bodyObj) {
  const enc = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
  return {
    method,
    body: bodyObj === undefined ? undefined : bodyObj,
    async *[Symbol.asyncIterator]() { if (bodyObj !== undefined) yield enc; },
  };
}
let fail = 0;
function check(name, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
  if (!cond) fail++;
}

const r1 = stubRes(); await health(stubReq('GET'), r1);
check('health ok', r1.statusCode === 200 && r1.body.ok === true);

const r2 = stubRes(); await packs(stubReq('GET'), r2);
check('packs lists bundled x12 / 660s',
  r2.statusCode === 200 && r2.body.packs?.[0]?.slug === 'bundled'
  && r2.body.packs?.[0]?.chapters === 12 && r2.body.packs?.[0]?.total === 660,
  JSON.stringify(r2.body.packs?.[0]));

const r3 = stubRes(); await packSlug({ method: 'GET', query: { slug: 'bundled' } }, r3);
check('pack/bundled payload 12 scenes with html',
  r3.statusCode === 200 && r3.body.scenes?.length === 12
  && r3.body.scenes[0].html.includes('render(') && r3.body.total === 660);
const r3b = stubRes();
packSlug({ method: 'GET', query: { slug: 'nope' } }, r3b);
check('pack/unknown -> 404', r3b.statusCode === 404);

const r4 = stubRes(); await exp(stubReq('POST', { pack: 'bundled' }), r4);
check('export bundled -> static-master jobId',
  r4.statusCode === 200 && r4.body.jobId === 'static-master');
const r4b = stubRes(); await exp(stubReq('POST', { pack: 'some-pack' }), r4b);
check('export generated -> 503 with hint', r4b.statusCode === 503 && /companion server/.test(r4b.body.error));

const r5 = stubRes(); await job({ method: 'GET', query: { id: 'static-master' } }, r5);
check('job/static-master done + instant master url',
  r5.statusCode === 200 && r5.body.status === 'done'
  && r5.body.result.url === '/render/how_machines_learn_to_read_720p.mp4'
  && r5.body.result.instant === true && r5.body.result.size > 20e6);
const r5b = stubRes(); await job({ method: 'GET', query: { id: 'zzz' } }, r5b);
check('job/unknown -> 404', r5b.statusCode === 404);

const r6 = stubRes(); await dl({ method: 'GET', query: { id: 'static-master' } }, r6);
check('download/static-master -> 307 to master',
  r6.statusCode === 307 && r6.body === '/render/how_machines_learn_to_read_720p.mp4');

const r7 = stubRes(); await gen(stubReq('POST', { prompt: 'hi' }), r7);
check('generate short prompt -> 400', r7.statusCode === 400, r7.body?.error);

/* real generation (SDK tier in this sandbox; env-LLM tier on Vercel):
   plan -> write scenes -> validate -> assemble a playable pack */
console.log('  (generate: real LLM run — takes up to ~60 s)');
const r7g = stubRes();
await gen(stubReq('POST', { prompt: 'Why do magnets attract and repel? A tiny lesson on fields, for curious kids.', scenes: 2 }), r7g);
const gp = r7g.body?.pack;
check('generate -> pack JSON (2 scenes, autoplay-off, valid html)',
  r7g.statusCode === 200 && r7g.body.ok === true
  && gp && gp.scenes?.length === 2 && gp.total > 0
  && gp.scenes.every(s => s.html.includes('__scene')
                          && s.html.includes('autoplay off')
                          && s.html.length > 4000),
  r7g.statusCode === 200
    ? `"${gp.title}" ${gp.total}s · scene1 ${(gp.scenes?.[0]?.html || '').length}B · audio ${gp.scenes.reduce((a, s) => a + (s.audio?.length || 0), 0)} clips`
    : JSON.stringify(r7g.body).slice(0, 160));

const r8 = stubRes();
await ask(stubReq('POST', { question: 'What is a knob?', chapter: 0, t: 30,
                             pack: 'bundled', history: [] }), r8);
check('ask (sdk/env-llm when available)',
  r8.statusCode === 200 && typeof r8.body.answer === 'string'
  && r8.body.answer.length > 20 && typeof r8.body.mode === 'string',
  r8.statusCode === 200 ? `mode=${r8.body.mode}: ${r8.body.answer.slice(0, 80)}…` : r8.body?.error);

/* force the offline path exactly as a bare Vercel deployment hits it */
process.env.HF_TUTOR_FORCE_FALLBACK = '1';
const r8f = stubRes();
await ask(stubReq('POST', { question: 'Why does the neuron squash the sum with a sigmoid?',
                            chapter: 2, t: 130, pack: 'bundled' }), r8f);
check('ask forced fallback -> chapter script',
  r8f.statusCode === 200 && r8f.body.mode === 'fallback'
  && /Chapter 3\/12/.test(r8f.body.answer) && r8f.body.answer.length > 100,
  `mode=${r8f.body.mode}: ${(r8f.body.answer || '').slice(0, 80)}…`);
delete process.env.HF_TUTOR_FORCE_FALLBACK;

const r9 = stubRes();
await ask(stubReq('POST', { question: 'hi', pack: 'ghost-pack' }), r9);
check('ask unknown pack -> 404', r9.statusCode === 404);

const r10 = stubRes(); await ask(stubReq('POST', { question: '' }), r10);
check('ask empty question -> 400', r10.statusCode === 400);

console.log(fail ? `\nRESULT: ${fail} FAIL` : '\nRESULT: ALL PASS');
process.exit(fail ? 1 : 0);
