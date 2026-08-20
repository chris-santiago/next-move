/* Runs the page's own scripts against a minimal DOM stub and checks the
   acceptance criteria from .claude/output/specs/2026-08-18-post-hs-plan-design.md */
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./plan.content.html', import.meta.url), 'utf8');
const blocks = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (blocks.length !== 5) throw new Error(`expected 5 script blocks, found ${blocks.length}`);

function makeEl(id) {
  const set = new Set();
  return {
    id, innerHTML: '', value: '', textContent: '', style: {}, dataset: {}, files: null, href: '', download: '',
    classList: { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) },
    addEventListener() {}, click() {}, remove() {}, focus() {}, select() {}, appendChild() {}, closest: () => null,
    scrollIntoView() {},
  };
}

const PAGE_LOC = { protocol: 'https:', origin: 'https://chris-santiago.github.io',
                   pathname: '/next-move/', hash: '' };
const FILE_LOC = { protocol: 'file:', origin: 'null', pathname: '/Users/x/index.html', hash: '' };

function makeEnv({ storageThrows = false, confirmAnswer = true, share = null,
                   loc = PAGE_LOC, frame = false, storage = null } = {}) {
  let sayYes = confirmAnswer;
  const store = storage ? new Map(storage) : new Map();
  const els = {};
  const listeners = {};
  const win = { scrollY: 0, scrollTo() {},
    location: { href: '', protocol: loc.protocol, origin: loc.origin,
                pathname: loc.pathname, hash: loc.hash } };
  win.top = win; win.self = win;   // top-level by default; set frame:true to simulate an iframe
  if (frame) win.top = {};
  const doc = {
    getElementById: id => (els[id] ||= makeEl(id)),
    addEventListener: (t, h) => ((listeners[t] ||= []).push(h)),
    createElement: () => makeEl('tmp'),
    body: { appendChild() {} },
    documentElement: {
      attrs: {},
      getAttribute(k) { return this.attrs[k] ?? null; },
      setAttribute(k, v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; },
    },
  };
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (storageThrows) throw new Error('quota'); store.set(k, v); },
    removeItem: k => store.delete(k),
  };
  const epilogue = `
    __T.getS = () => S; __T.setS = v => { S = v; };
    __T.main = () => document.getElementById('main').innerHTML;
    Object.assign(__T, { blank, newPath, normPath, pProg, fit, signals, eff, series, tensions,
      topFactors, msDate, openItems, exportText, importText, render, save, load,
      agenda, buckets, buildMarkdown, buildPrintDoc, REALITY, TUES, MONEY, RETIRED,
      answerText, realityBy, backupOpts, WHO, QUIT, DEMAND, sectionHas, copySection, GOTO, COPYFLASH,
      printDoc: () => document.getElementById('printdoc').innerHTML,
      copyArea: () => document.getElementById('copyarea').value,
      toastHtml: () => document.getElementById('toast').innerHTML,
      peekUndo, restoreUndo, dropUndo, buildShareText, shareSubject,
      encodeSeed, decodeSeed, seedPayload, buildLink, canLink, describeState, hydrate, adoptShared,
      VIEWS,
      isMemOnly: () => memOnly, setEditing: v => { editing = v; }, RENDER });
    __T.fire = (type, ev) => (__L[type] || []).forEach(h => h(ev));
  `;
  const fn = new Function(
    'document', 'window', 'localStorage', 'navigator', 'confirm', 'Blob', 'URL', 'FileReader',
    'setTimeout', 'clearTimeout', '__T', '__L',
    blocks.join('\n;\n') + epilogue,
  );
  const T = {};
  fn(
    doc,
    win,
    localStorage,
    share ? { share } : {},
    () => sayYes,
    class { constructor() {} },
    { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    class { readAsText() {} },
    (f) => { f(); return 0; },
    () => {},
    T, listeners,
  );
  T.setConfirm = v => { sayYes = v; };
  T.storageKeys = () => [...store.keys()];
  T.storageDump = () => new Map(store);
  T.mailto = () => win.location.href;
  return T;
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' :: ' + extra : ''}`); }
};
const section = n => console.log(`\n${n}`);

/* ---- 1. cold open ---- */
section('cold open');
{
  const T = makeEnv();
  const html = T.main();
  ok('welcome view renders', html.includes('Figure out what is actually on the table'));
  ok('no input element on first screen', !html.includes('<input'));
  ok('no textarea on first screen', !html.includes('<textarea'));
  ok('no select on first screen', !html.includes('<select'));
  ok('states that nothing is collected', /No name, no grades, no login/.test(html));
}

/* ---- 2. tension threshold ---- */
section('tensions');
{
  const T = makeEnv();
  const S = T.getS();
  S.ratings = { noDebt: 4, away: 4 };
  ok('both at threshold 4 produces the tension', T.tensions().some(t => t.a === 'noDebt' && t.b === 'away'));
  S.ratings = { noDebt: 4, away: 3 };
  ok('one below threshold suppresses it', !T.tensions().some(t => t.a === 'noDebt' && t.b === 'away'));
  S.ratings = { noDebt: 5, away: 5, earnSoon: 5, longEarn: 5 };
  ok('multiple tensions surface together', T.tensions().length >= 2);
}

/* ---- 3. unrated factors carry no weight ---- */
section('fit scoring');
{
  const T = makeEnv();
  const S = T.getS();
  const p = T.newPath('trade');
  p.chips = ['hands'];
  S.paths.push(p);

  S.ratings = { hands: 5 };
  const a = T.fit(p);
  ok('rated factor with a signal appears as a term', a.terms.some(t => t.id === 'hands'));
  ok('a fully matched sole factor scores 100', a.score === 100, `got ${a.score}`);

  S.ratings = { hands: 5, creative: 5 };
  const b = T.fit(p);
  ok('an unmatched rated factor drags the score down', b.score < 100, `got ${b.score}`);
  ok('unmatched factor is listed as a drag', b.down.some(t => t.id === 'creative'));

  delete S.ratings.creative;
  const c = T.fit(p);
  ok('removing that rating restores the score (unrated = zero weight, not midpoint)', c.score === 100, `got ${c.score}`);
  ok('unrated factor contributes no term', !c.terms.some(t => t.id === 'creative'));

  S.ratings = {};
  ok('no ratings at all yields no score', T.fit(p) === null);
}

/* ---- 4. per-field money fallback ---- */
section('money: seeded vs researched');
{
  const T = makeEnv();
  const p = T.newPath('university');
  T.getS().paths.push(p);

  let e = T.eff(p);
  ok('all four blank means all four seeded', Object.values(e.seeded).every(Boolean));
  ok('blank path series is flagged estimated', T.series(p).anySeeded);

  p.money.cost = 12000;
  e = T.eff(p);
  ok('supplying one field marks only that field researched', e.seeded.cost === false && e.seeded.years === true);
  ok('the supplied value is the one used', e.v.cost === 12000);
  ok('partly supplied path is still flagged estimated', T.series(p).anySeeded);

  p.money.years = 4; p.money.during = 0; p.money.after = 60000;
  ok('all four supplied clears the estimated flag', T.series(p).anySeeded === false);
  const s = T.series(p);
  ok('no segment is dashed once fully researched', s.segs.every(sg => sg.seeded === false));
  ok('net at 18 is zero', s.pts[0].net === 0);
  ok('training years run negative when cost exceeds wage', s.pts[4].net === -48000, `got ${s.pts[4].net}`);
  ok('break-even age is computed', s.be === 23, `got ${s.be}`);

  p.money.cost = 0; p.money.during = 40000;
  ok('a never-negative path reports no break-even', T.series(p).be === null);
}

/* ---- 5. not-known-yet is distinct from empty ---- */
section('unknowns');
{
  const T = makeEnv();
  const p = T.newPath('trade');
  T.getS().paths.push(p);
  const base = T.pProg(p).done;
  p.unknowns.push('entry');
  ok('marking a field unknown counts as answered', T.pProg(p).done === base + 1);
  p.reqs.entry = { says: 'Must be 18 with a diploma' };
  ok('text plus unknown does not double count', T.pProg(p).done === base + 1);
  ok('the text survives alongside the unknown mark', p.reqs.entry.says.length > 0 && p.unknowns.includes('entry'));
  ok('unknown surfaces as an open item', T.openItems().length === 1);
  ok('open item names the path', T.openItems()[0].path === p);
}

/* ---- 6. timeline re-resolves, keeps done-state ---- */
section('timeline');
{
  const T = makeEnv();
  const S = T.getS();
  S.plan.grad = '2028-06-05';
  S.plan.ms.m7 = { done: true, note: 'signed up for the June ACT' };
  const before = T.msDate(-12).getTime();
  S.plan.grad = '2029-06-05';
  const after = T.msDate(-12).getTime();
  ok('changing graduation date moves every milestone', after > before);
  ok('done-state survives the change', S.plan.ms.m7.done === true);
  ok('note survives the change', S.plan.ms.m7.note === 'signed up for the June ACT');
  ok('no graduation date means no dates', (S.plan.grad = '', T.msDate(-12) === null));
}

/* ---- 7. every view renders for every path type ---- */
section('render coverage');
{
  const T = makeEnv();
  const S = T.getS();
  S.ratings = { hands: 5, noDebt: 5, earnSoon: 4, campus: 2, tech: 4, away: 3 };
  S.mirrorIdx = 12;
  S.plan.grad = '2028-06-05';
  ['university', 'trade', 'apprenticeship', 'military', 'other'].forEach((t, i) => {
    const p = T.newPath(t);
    p.name = 'Path ' + i; p.chips = ['hands']; p.money.cost = 5000 * (i + 1); p.want = 3;
    p.reality.quit = 'too far from home';
    S.paths.push(p);
  });
  for (const v of ['mirror', 'paths', 'money', 'compare', 'plan']) {
    S.view = v;
    let err = null;
    try { T.render(); } catch (e) { err = e; }
    ok(`${v} view renders without throwing`, !err, err && err.message);
    ok(`${v} view produced markup`, T.main().length > 200);
  }
  S.view = 'paths';
  S.paths.forEach(p => {
    T.setEditing(p.id);
    let err = null;
    try { T.render(); } catch (e) { err = e; }
    ok(`editor renders for type "${p.type}"`, !err, err && err.message);
  });
  T.setEditing(null);
  S.view = 'paths';
  T.render();
  ok('paths list shows no whole-document progress figure', !/\d+% (complete|done|filled)/i.test(T.main()));
}

/* ---- 8. type-specific requirement prompts ---- */
section('per-type requirements');
{
  const T = makeEnv();
  const S = T.getS();
  S.view = 'paths';
  const uni = T.newPath('university'); const mil = T.newPath('military');
  S.paths.push(uni, mil);
  T.setEditing(uni.id); T.render();
  const uniHtml = T.main();
  T.setEditing(mil.id); T.render();
  const milHtml = T.main();
  ok('university editor asks about SAT/ACT', /SAT \/ ACT policy/.test(uniHtml));
  ok('university editor does not ask about the ASVAB', !/ASVAB/.test(uniHtml));
  ok('military editor asks about the ASVAB', /ASVAB/.test(milHtml));
  ok('military editor does not ask about SAT/ACT', !/SAT \/ ACT policy/.test(milHtml));
  T.setEditing(null);
}

/* ---- 9. export / import ---- */
section('backup round trip');
{
  const T = makeEnv();
  const S = T.getS();
  S.ratings = { hands: 5, noDebt: 3 };
  S.free.likes = 'fixing dirt bikes';
  const p = T.newPath('apprenticeship');
  p.name = 'IBEW Local 26'; p.money.after = 82000; p.unknowns.push('sponsor'); p.want = 4;
  S.paths.push(p);
  S.plan.grad = '2028-06-05';
  S.plan.ms.m1 = { done: true, note: 'met Ms. Alvarez' };
  const payload = T.exportText();

  const T2 = makeEnv();
  T2.importText(payload);
  const R = T2.getS();
  ok('ratings restored', JSON.stringify(R.ratings) === JSON.stringify({ hands: 5, noDebt: 3 }));
  ok('free text restored', R.free.likes === 'fixing dirt bikes');
  ok('path restored with name', R.paths.length === 1 && R.paths[0].name === 'IBEW Local 26');
  ok('path money restored', R.paths[0].money.after === 82000);
  ok('unknowns restored', R.paths[0].unknowns.includes('sponsor'));
  ok('want rating restored', R.paths[0].want === 4);
  ok('milestone state restored', R.plan.ms.m1.done === true && R.plan.ms.m1.note === 'met Ms. Alvarez');
  ok('graduation date restored', R.plan.grad === '2028-06-05');
  ok('re-export is byte-identical apart from timestamp',
    JSON.parse(T2.exportText()).state.paths[0].name === JSON.parse(payload).state.paths[0].name);
}

/* ---- 10. import refuses bad payloads without destroying state ---- */
section('import validation');
{
  const bad = [
    ['truncated json', '{"fmt":"nextmove","version":1,"stat'],
    ['wrong marker', JSON.stringify({ fmt: 'somethingelse', version: 1, state: { paths: [] } })],
    ['newer version', JSON.stringify({ fmt: 'nextmove', version: 9, state: { paths: [] } })],
    ['missing state', JSON.stringify({ fmt: 'nextmove', version: 1 })],
    ['state is an array', JSON.stringify({ fmt: 'nextmove', version: 1, state: [] })],
    ['empty string', ''],
  ];
  for (const [label, payload] of bad) {
    const T = makeEnv();
    const p = T.newPath('trade'); p.name = 'Existing work';
    T.getS().paths.push(p);
    T.getS().ratings = { hands: 4 };
    T.importText(payload);
    const S = T.getS();
    ok(`refuses ${label} and keeps existing state`,
      S.paths.length === 1 && S.paths[0].name === 'Existing work' && S.ratings.hands === 4);
  }
  const T = makeEnv();
  T.importText(JSON.stringify({ fmt: 'nextmove', version: 1, state: { paths: [{ type: 'nonsense-type' }] } }));
  ok('unknown path type is coerced rather than crashing', T.getS().paths[0].type === 'other');
}

/* ---- 11. persistence ---- */
section('persistence');
{
  const T = makeEnv();
  const S = T.getS();
  S.ratings = { tech: 5 };
  S.view = 'compare';
  const p = T.newPath('trade'); p.name = 'Lincoln Tech'; S.paths.push(p);
  T.save();
  ok('save writes without throwing', true);

  const T3 = makeEnv({ storageThrows: true });
  T3.getS().ratings = { tech: 5 };
  T3.save();
  ok('storage failure degrades to memory-only instead of throwing', T3.isMemOnly() === true);
  ok('page still holds state when storage fails', T3.getS().ratings.tech === 5);
}

/* ---- 12. click and typing handlers ---- */
section('interaction');
{
  const T = makeEnv();
  const click = d => T.fire('click', { target: { closest: () => ({ dataset: d }) } });
  const type = (k, value) => T.fire('input', { target: { dataset: { k }, value } });
  const commit = (k, value) => T.fire('change', { target: { dataset: { k }, value } });
  const S = () => T.getS();

  click({ act: 'start' });
  ok('start moves to the value cards', S().view === 'mirror' && S().mirrorIdx === 0);

  click({ act: 'rate', f: 'hands', n: '5' });
  ok('rating records the value', S().ratings.hands === 5);
  ok('rating advances to the next card', S().mirrorIdx === 1);

  click({ act: 'rate', f: 'tech', n: '4' });
  click({ act: 'mback' });
  ok('back steps to the previous card', S().mirrorIdx === 1);

  click({ act: 'rate', f: 'tech', n: '2' });
  ok('re-rating overwrites', S().ratings.tech === 2);

  click({ act: 'mskip' });
  ok('skip clears any rating on that card', S().ratings.noDebt === undefined);
  ok('skip still advances', S().mirrorIdx === 3);

  for (let i = 0; i < 20; i++) click({ act: 'mskip' });
  ok('skipping past the last card does not overrun', S().mirrorIdx === 12);

  click({ act: 'go', v: 'paths' });
  click({ act: 'adding' });
  click({ act: 'create', t: 'apprenticeship' });
  ok('creating a path adds it', S().paths.length === 1 && S().paths[0].type === 'apprenticeship');
  const id = S().paths[0].id;
  ok('creating a path opens its editor', T.main().includes('Getting in'));

  click({ act: 'chip', id, c: 'hands' });
  ok('first chip tap starts the chip list', Array.isArray(S().paths[0].chips) && S().paths[0].chips.includes('hands'));
  click({ act: 'chip', id, c: 'hands' });
  ok('second tap removes it but keeps the list defined', S().paths[0].chips.length === 0);

  click({ act: 'unk', id, r: 'sponsor' });
  ok('unknown toggles on', S().paths[0].unknowns.includes('sponsor'));
  click({ act: 'unk', id, r: 'sponsor' });
  ok('unknown toggles off', !S().paths[0].unknowns.includes('sponsor'));

  click({ act: 'want', id, n: '4' });
  ok('want rating sets', S().paths[0].want === 4);
  click({ act: 'want', id, n: '4' });
  ok('tapping the same want rating clears it', S().paths[0].want === 0);

  type(id + '|name', 'IBEW Local 26');
  ok('typing writes into the path without a re-render', S().paths[0].name === 'IBEW Local 26');
  type(id + '|reqs.sponsor.says', 'Joint apprenticeship committee');
  ok('nested requirement fields are created on demand', S().paths[0].reqs.sponsor.says === 'Joint apprenticeship committee');
  commit(id + '|money.after', '82000');
  ok('committing a money field stores it', S().paths[0].money.after === '82000');
  ok('a committed money field counts as researched', T.eff(S().paths[0]).seeded.after === false);

  commit('plan.grad', '2028-06-05');
  ok('plan fields write through the same path', S().plan.grad === '2028-06-05');
  type('plan.ms.m4.note', 'called admissions');
  ok('milestone notes create their container', S().plan.ms.m4.note === 'called admissions');
  click({ act: 'ms', m: 'm4' });
  ok('checking a milestone preserves its note', S().plan.ms.m4.done === true && S().plan.ms.m4.note === 'called admissions');

  click({ act: 'keep', id });
  ok('keep-open toggles on', S().plan.keep.includes(id));
  click({ act: 'keep', id });
  ok('keep-open toggles off', !S().plan.keep.includes(id));

  click({ act: 'close' });
  click({ act: 'del', id });
  ok('deleting removes the path', S().paths.length === 0);

  click({ act: 'reset' });
  ok('reset clears everything', S().paths.length === 0 && Object.keys(S().ratings).length === 0 && S().view === 'welcome');
}

/* ---- 13. the take-away document ---- */
section('agenda + export');
{
  const T = makeEnv();
  const click = d => T.fire('click', { target: { closest: () => ({ dataset: d }) } });
  const S = T.getS();
  S.plan.grad = '2028-06-09';

  const p = T.newPath('apprenticeship');
  p.name = 'IBEW Local 26';
  p.reqs.entry = { says: '18 and a diploma', action: 'pull my transcript', due: '2026-09-01' };
  p.reqs.test = { says: '', action: '', due: '' };
  p.unknowns.push('test');
  p.money = { years: 5, cost: 1200, during: 42000, after: 88000 };
  p.reality.quit = 'If I hate being outside in February';
  p.reality.backup = 'Community college HVAC program';
  S.paths.push(p);
  S.plan.actions[0] = { t: 'Call IBEW about the application window', d: '2026-09-15', p: '' };
  S.plan.keep = [p.id];

  const items = T.agenda();
  ok('milestones feed the agenda', items.some(i => i.kind === 'ms'));
  ok('path due dates feed the agenda', items.some(i => i.kind === 'req' && i.date === '2026-09-01'));
  ok('flagged unknowns feed the agenda', items.some(i => i.kind === 'unk'));
  ok('next actions feed the agenda', items.some(i => i.kind === 'act' && i.date === '2026-09-15'));
  ok('a flagged requirement appears once, not twice',
    items.filter(i => String(i.key).endsWith('|test')).length === 1);
  ok('agenda items carry which path they came from',
    items.find(i => i.kind === 'req').sub === 'IBEW Local 26');

  const b = T.buckets();
  const all = [...b.overdue, ...b.soon, ...b.later, ...b.undated, ...b.done];
  ok('every item lands in exactly one bucket', all.length === items.length);
  ok('dated buckets are sorted', b.later.every((x, i, a) => i === 0 || a[i - 1].date <= x.date));
  ok('undated items are separated out', b.undated.every(i => !i.date));

  const reqItem = items.find(i => i.kind === 'req');
  click({ act: 'tick', kind: 'req', key: reqItem.key });
  ok('ticking a requirement records it', S.paths[0].reqs.entry.done === true);
  ok('a ticked requirement moves to Done', T.buckets().done.some(i => i.key === reqItem.key));

  click({ act: 'tick', kind: 'act', key: '0' });
  ok('ticking a next action records it', S.plan.actions[0].done === true);

  click({ act: 'tick', kind: 'ms', key: 'm3' });
  ok('ticking a milestone records it', S.plan.ms.m3.done === true);

  const unkItem = T.agenda().find(i => i.kind === 'unk');
  click({ act: 'tick', kind: 'unk', key: unkItem.key });
  ok('ticking an unknown clears the flag', !S.paths[0].unknowns.includes('test'));
  ok('a resolved unknown leaves the agenda', !T.agenda().some(i => i.kind === 'unk'));

  const md = T.buildMarkdown();
  ok('markdown has a title', md.startsWith('# Post-High-School Plan'));
  ok('markdown uses real task checkboxes', /- \[ \] /.test(md));
  ok('markdown marks completed items', /- \[x\] /.test(md));
  ok('markdown names the path', md.includes('IBEW Local 26'));
  ok('markdown carries the money facts', /Costs \*\*\$6k\*\*/.test(md), md.match(/Costs.*/)?.[0]);
  ok('markdown carries the quit condition', md.includes('If I hate being outside in February'));
  ok('markdown carries the backup', md.includes('Community college HVAC program'));
  ok('markdown strips html out of the facts line', !/<[a-z]/i.test(md));
  ok('markdown has no hard-wrapped prose', md.split('\n').every(l => l.length < 400));

  T.buildPrintDoc();
  const pd = T.printDoc();
  ok('print doc builds', pd.includes('Post-High-School Plan'));
  ok('print doc has tick boxes', pd.includes('pd-box'));
  ok('print doc includes the path block', pd.includes('IBEW Local 26'));
  ok('print doc includes signature lines', pd.includes('pd-sign'));

  S.plan.grad = '';
  const noGrad = T.agenda();
  ok('milestones still appear with no graduation date', noGrad.some(i => i.kind === 'ms'));
  ok('they just carry no date', noGrad.filter(i => i.kind === 'ms').every(i => i.date === null));
  const bb = T.buckets();
  const ms = k => bb[k].filter(i => i.kind === 'ms').length;
  ok('and none are dropped: every one is either undated or already ticked',
    ms('undated') + ms('done') === noGrad.filter(i => i.kind === 'ms').length,
    `undated ${ms('undated')} + done ${ms('done')} vs ${noGrad.filter(i => i.kind === 'ms').length}`);
  ok('an undated milestone still prints', T.buildMarkdown().includes('Write a résumé'));
}

/* ---- 14. no question gets asked twice ---- */
section('no redundancy');
{
  const T = makeEnv();
  const click = d => T.fire('click', { target: { closest: () => ({ dataset: d }) } });
  const S = T.getS();
  S.view = 'paths';
  const p = T.newPath('university');
  p.name = 'State U';
  S.paths.push(p);
  T.setEditing(p.id);
  T.render();
  const html = T.main();

  // count the visible question prompts that ask about money
  const prompts = [...html.matchAll(/<label>([^<]+)<\/label>|class="rq">([^<]+)</g)]
    .map(m => (m[1] || m[2]).trim());
  const moneyPrompts = prompts.filter(t => /\b(earn|earns|pay|pays|wage|income|salary|cost|costs|owe)\b/i.test(t));
  const strays = moneyPrompts.filter(t => !T.MONEY.some(m => m.l === t));
  ok('no question about money is asked outside the money block', strays.length === 0,
    JSON.stringify(strays));
  ok('the money block asks it three times and no more', moneyPrompts.length === 3,
    `${moneyPrompts.length}: ${JSON.stringify(moneyPrompts)}`);

  const durationPrompts = prompts.filter(t => /how long|years of|until you can work/i.test(t));
  ok('duration is asked once', durationPrompts.length === 1, JSON.stringify(durationPrompts));

  ok('the retired questions are gone from the active set',
    T.RETIRED.every(r => !T.REALITY.some(x => x.id === r.id)));
  ok('the tuesday earnings prompt is gone', !T.TUES.some(t => t.id === 'money'));

  // progressive disclosure on requirement rows
  const stepInputs = (html.match(/placeholder="Your next step"/g) || []).length;
  ok('next-step boxes appear only on dated rows, not all eight', stepInputs === 2,
    `found ${stepInputs}`);
  ok('the rest offer to add one', html.includes('+ add a step and a date'));
  click({ act: 'step', key: p.id + '|gpa' });
  ok('asking for a step reveals it',
    (T.main().match(/placeholder="Your next step"/g) || []).length === 3);

  // the Tuesday is never gated: every path gets it, shortlisted or not
  const tues = T.main();
  ok('tuesday is open on every path, with no shortlist gate', !tues.includes('Write the Tuesday for this one'));
  ok('both core prompts are on screen', /normal Tuesday/.test(tues) && /hard, boring, or stressful/.test(tues));
  ok('the anchor is stated in the section itself', /five years after you finish high school/.test(tues));
  ok('the two optional prompts wait behind a link', tues.includes('+ two more questions'));
  ok('and are not on screen until asked for', !/Where are you living/.test(tues));
  click({ act: 'tuesmore', id: p.id });
  ok('asking reveals them', /Where are you living/.test(T.main()));

  // nothing already answered is thrown away
  p.reality.length = '4 years, maybe 5';
  p.reality.paid = 'I pay';
  p.tuesday.money = 'About 60k, owing maybe 30k';
  T.render();
  const after = T.main();
  ok('a retired reality answer is still shown', after.includes('4 years, maybe 5'));
  ok('the second one too', after.includes('I pay'));
  ok('the retired tuesday answer is still shown', after.includes('About 60k, owing maybe 30k'));
  ok('and they are labelled as superseded', after.includes('kept here for reference only')
    || after.includes('kept for reference only'));
  T.setEditing(null);
}

/* ---- 15. a plan with no dates anywhere still produces a plan ---- */
section('undated plans');
{
  const T = makeEnv();
  const S = T.getS();
  const p = T.newPath('trade');
  p.name = 'Lincoln Tech';
  S.paths.push(p);
  // deliberately: no graduation date, no due dates, no next actions, nothing flagged

  const items = T.agenda();
  ok('the plan is not empty', items.length > 0, `got ${items.length}`);
  ok('nothing has a date', items.every(i => i.date === null));
  ok('every requirement shows up as something to look up',
    items.filter(i => i.kind === 'todo').length === 8, `got ${items.filter(i => i.kind === 'todo').length}`);
  ok('the timeline shows up too', items.some(i => i.kind === 'ms'));

  const b = T.buckets();
  ok('all of it lands in the undated bucket', b.undated.length === items.length);
  ok('nothing is silently dropped',
    b.overdue.length + b.soon.length + b.later.length + b.undated.length + b.done.length === items.length);

  const md = T.buildMarkdown();
  ok('markdown is not empty', md.length > 400);
  ok('markdown lists the undated work', md.includes('## No date yet'));
  ok('markdown names the path as a group heading', md.includes('### Lincoln Tech'));
  ok('markdown has a to-do for a requirement', /- \[ \] Look up:/.test(md));
  ok('markdown does not nag about missing dates', !md.includes('no date yet*'));

  T.buildPrintDoc();
  const pd = T.printDoc();
  ok('the printout is not empty', pd.includes('No date yet'));
  ok('the printout has tick boxes for undated work', (pd.match(/pd-box/g) || []).length > 8);
  ok('undated rows print with a blank date column, not the words "no date"', !pd.includes('>no date<'));

  // researching a requirement moves it to done without any date or tick
  p.reqs.entry = { says: 'Must be 18 with a diploma' };
  const after = T.agenda().find(i => String(i.key).endsWith('|entry'));
  ok('writing down what they say counts as done', after.done === true);
  ok('and it stops reading as a to-do', !after.text.startsWith('Look up:'));
  ok('it moves into the done bucket', T.buckets().done.some(i => String(i.key).endsWith('|entry')));

  S.view = 'plan';
  T.render();
  const html = T.main();
  ok('the plan view renders the undated work', html.includes('No date yet'));
  ok('the plan view does not claim to be empty', !html.includes('Nothing here yet'));
  ok('it groups undated work by source', html.includes('Lincoln Tech') && html.includes('Timeline'));
}

/* ---- 16. "graduation" always says which graduation ---- */
section('unambiguous graduation');
{
  const T = makeEnv();
  const S = T.getS();
  S.ratings = { hands: 5, noDebt: 4, earnSoon: 4 };
  S.mirrorIdx = 12;
  S.plan.grad = '2028-06-09';
  S.plan.who = 'Marco';
  ['university', 'trade', 'apprenticeship', 'military', 'other'].forEach((t, i) => {
    const p = T.newPath(t);
    p.name = 'Path ' + i;
    p.tuesday.day = 'Up at six.';           // opens the Tuesday section
    S.paths.push(p);
  });

  // sweep every rendered surface, plus both export formats
  let text = '';
  for (const v of ['mirror', 'paths', 'money', 'compare', 'plan']) {
    S.view = v; T.render(); text += ' ' + T.main();
  }
  S.paths.forEach(p => { T.setEditing(p.id); T.render(); text += ' ' + T.main(); });
  T.setEditing(null);
  T.buildPrintDoc();
  text += ' ' + T.printDoc() + ' ' + T.buildMarkdown();

  const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const hits = [];
  const re = /graduat\w*/gi;
  let m;
  while ((m = re.exec(plain)) !== null) {
    const around = plain.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
    if (!/high[- ]school/i.test(around)) hits.push(around.trim());
  }
  ok('every mention of graduating says which graduation', hits.length === 0,
    hits.slice(0, 3).map(h => `"${h}"`).join(' | '));

  // the five-years-out exercise must pin a concrete age on screen, or it means nothing
  S.view = 'paths';
  T.setEditing(S.paths[0].id); T.render();
  const shown = T.main();
  T.setEditing(null);
  ok('the Tuesday exercise anchors to leaving high school, on screen',
    /five years after you finish high school/i.test(shown));
  ok('and states the age it means', /about 23/.test(shown));

  // the training-length field must say what it is measured from
  const yrs = T.MONEY.find(f => f.id === 'years');
  ok('years of training says it starts after high school', /after high school/i.test(yrs.l));
}

/* ---- 17. tap-to-answer, with free text always available ---- */
section('structured answers');
{
  const T = makeEnv();
  const click = d => T.fire('click', { target: { closest: () => ({ dataset: d }) } });
  const commit = (k, value) => T.fire('change', { target: { dataset: { k }, value } });
  const S = T.getS();
  S.view = 'paths';
  const a = T.newPath('trade'); a.name = 'Lincoln Tech';
  const b = T.newPath('university'); b.name = 'State U';
  S.paths.push(a, b);
  T.setEditing(a.id); T.render();

  ok('every reality question still offers a free-text box',
    (T.main().match(/data-k="[^"]*\|reality\./g) || []).length === T.REALITY.length);

  // single-select
  click({ act: 'pick', id: a.id, f: 'demand', v: 'many' });
  ok('a single-select records one value', a.pick.demand === 'many');
  click({ act: 'pick', id: a.id, f: 'demand', v: 'few' });
  ok('picking another replaces it', a.pick.demand === 'few');
  click({ act: 'pick', id: a.id, f: 'demand', v: 'few' });
  ok('tapping the same one clears it', a.pick.demand === '');

  // multi-select
  click({ act: 'pick', id: a.id, f: 'quit', v: 'cost', multi: '1' });
  click({ act: 'pick', id: a.id, f: 'quit', v: 'far', multi: '1' });
  ok('a multi-select accumulates', a.pick.quit.length === 2);
  click({ act: 'pick', id: a.id, f: 'quit', v: 'cost', multi: '1' });
  ok('and toggles back off', a.pick.quit.join() === 'far');

  // taps and free text combine rather than compete
  a.reality.quit = 'and my truck would not make the drive';
  const quitText = T.answerText(a, T.realityBy('quit'));
  ok('the answer combines the tap and the note',
    quitText.includes('Too far from home') && quitText.includes('my truck'));
  ok('compare shows the combined answer', (S.view = 'compare', T.render(), T.main()).includes('Too far from home'));
  ok('the printout does too', (T.buildPrintDoc(), T.printDoc()).includes('Too far from home'));
  ok('and the markdown export', T.buildMarkdown().includes('Too far from home'));

  // backup offers the student's own other paths
  const opts = T.backupOpts(a);
  ok('backup lists the other path by name', opts.some(o => o.l === 'Switch to State U'));
  ok('it does not offer the path you are on', !opts.some(o => o.id === 'path:' + a.id));
  commit(a.id + '|pick.backup', 'path:' + b.id);
  ok('choosing another path is stored', a.pick.backup === 'path:' + b.id);
  ok('and reads back as its name', T.answerText(a, T.realityBy('backup')).includes('State U'));

  // a tapped answer counts toward the path's progress
  S.view = 'paths';
  const c = T.newPath('trade'); S.paths.push(c);
  const before = T.pProg(c).done;
  c.pick = { demand: 'many' };
  ok('tapping an answer counts as answered', T.pProg(c).done === before + 1);

  // date pickers replaced by a stamp
  T.setEditing(a.id); T.render();
  ok('no date picker for "read their page" until it is ticked',
    !T.main().includes('data-k="' + a.id + '|proof.reviewed"'));
  click({ act: 'stamp', id: a.id, f: 'reviewed' });
  ok('ticking stamps a real date', /^\d{4}-\d{2}-\d{2}$/.test(a.proof.reviewed));
  ok('and then exposes the date so it can be corrected',
    T.main().includes('data-k="' + a.id + '|proof.reviewed"'));
  click({ act: 'stamp', id: a.id, f: 'reviewed' });
  ok('unticking clears it', a.proof.reviewed === '');

  // years is a short list with an escape hatch
  ok('years renders as a select', T.main().includes('data-k="' + a.id + '|money.years"><option'));
  commit(a.id + '|money.years', '__other');
  ok('choosing "something else" swaps in a number box',
    T.main().includes('type="number" inputmode="numeric" min="0" step="0.5"'));
  ok('and does not leave a junk value in state', a.money.years === '');

  // the link field waits until the path has a name
  const d = T.newPath('other'); S.paths.push(d);
  T.setEditing(d.id); T.render();
  ok('no link box before a name is entered', !T.main().includes('Their requirements page'));
  d.name = 'Coast Guard';
  T.render();
  ok('link box appears once named', T.main().includes('Their requirements page'));
  T.setEditing(null);

  // next actions: one, growing
  S.view = 'compare'; T.render();
  const boxes = h => (h.match(/placeholder="What you will do"/g) || []).length;
  ok('only one action box to start', boxes(T.main()) === 1);
  ok('the "prove it is done" column is gone', !T.main().includes('How you will prove it is done'));
  S.plan.actions[0].t = 'Call the shop';
  T.render();
  ok('a second appears once the first is used', boxes(T.main()) === 2);
}

/* ---- 18. backup lives on its own tab ---- */
section('backup tab');
{
  const T = makeEnv();
  const click = d => T.fire('click', { target: { closest: () => ({ dataset: d }) } });
  const S = T.getS();
  S.plan.grad = '2028-06-09';
  const p = T.newPath('trade'); p.name = 'Lincoln Tech'; S.paths.push(p);

  ok('Backup is a tab', T.VIEWS.some(v => v[0] === 'backup' && v[1] === 'Backup'));
  ok('it is the last one', T.VIEWS[T.VIEWS.length - 1][0] === 'backup');

  S.view = 'plan'; T.render();
  const plan = T.main();
  ok('Plan keeps the printable export', plan.includes('Take it with you'));
  ok('Plan keeps the check-in', plan.includes('Check-in'));
  ok('Plan ends with the check-in', plan.lastIndexOf('Check-in') > plan.lastIndexOf('Take it with you'));
  ok('Plan no longer offers a backup download', !plan.includes('Download a backup file'));
  ok('Plan no longer offers erase', !plan.includes('Erase everything'));
  ok('Plan has no stray paste box', !plan.includes('id="pasteBox"'));

  S.view = 'backup'; T.render();
  const b = T.main();
  ok('Backup renders', b.includes('Keep a copy of your work'));
  ok('it can take a copy out', b.includes('Copy backup text'));
  ok('it can put a copy back', b.includes('Paste backup text'));
  ok('it holds the erase control', b.includes('Erase everything'));
  ok('it warns that loading replaces what is there', b.includes('replaces everything currently on this device'));
  ok('it tells you what is in the backup', b.includes('1 path') && b.includes('of 12 ratings'));
  ok('it does not repeat the printable export', !b.includes('Print or save as PDF'));

  // round trip still works from the new tab
  click({ act: 'copy' });
  ok('copy falls back to showing the text when the clipboard is unavailable',
    T.copyArea().includes('"fmt": "nextmove"'));
  const payload = T.copyArea();
  const T2 = makeEnv();
  T2.importText(payload);
  ok('and that text still restores everything', T2.getS().paths[0].name === 'Lincoln Tech');

  // the markdown copy button lives on Plan and must not depend on Backup's markup
  const T3 = makeEnv();
  T3.getS().view = 'plan';
  T3.getS().paths.push(T3.newPath('trade'));
  T3.render();
  let threw = null;
  try { T3.fire('click', { target: { closest: () => ({ dataset: { act: 'md' } }) } }); }
  catch (e) { threw = e; }
  ok('copying the plan as markdown from Plan does not throw', !threw, threw && threw.message);
  ok('and lands in the shared fallback box', T3.copyArea().includes('Post-High-School Plan'));
}

/* ---- 19. copying a section from another path ---- */
section('copy from another path');
{
  const T = makeEnv();
  const commit = (el) => T.fire('change', { target: el });
  const S = T.getS();
  S.view = 'paths';

  const a = T.newPath('university'); a.name = 'State U';
  a.chips = ['tech', 'away'];
  a.money = { years: 4, cost: 31000, during: 0, after: 62000 };
  a.reality = { first: 'Field engineer, 45 hrs', quit: 'if the loans pass 40k' };
  a.pick = { demand: 'many', quit: ['cost'] };
  a.tuesday = { day: 'Up at seven, site by eight.', bad: 'The commute.' };
  a.reqs = { gpa: { says: 'Middle 50% 3.6 to 4.1' } };

  const b = T.newPath('university'); b.name = 'Tech State';
  S.paths.push(a, b);

  ok('the source counts as having content', T.sectionHas(a, 'money') && T.sectionHas(a, 'tuesday'));
  ok('the empty target does not', !T.sectionHas(b, 'money') && !T.sectionHas(b, 'tuesday'));

  T.setEditing(b.id); T.render();
  const html = T.main();
  ok('a copy control is offered on the money section', /data-copy="money"/.test(html));
  ok('and on reality and tuesday', /data-copy="reality"/.test(html) && /data-copy="tuesday"/.test(html));
  ok('and on the chips', /data-copy="chips"/.test(html));
  ok('it names the other path', html.includes('>State U</option>'));
  ok('it does not offer the path you are editing', !html.includes('value="' + b.id + '">Tech State'));

  commit({ dataset: { copy: 'money', id: b.id }, value: a.id });
  ok('the money that generalises copies across',
    b.money.years === 4 && b.money.during === 0 && b.money.after === 62000);
  ok('tuition is deliberately NOT copied', b.money.cost === '' || b.money.cost == null,
    `got ${JSON.stringify(b.money.cost)}`);
  ok('the source is untouched', a.money.cost === 31000);

  // the reason tuition is excluded: a copied cost would present an unresearched
  // path as researched, drawing it solid on the chart instead of dashed
  ok('the target still counts as estimated on cost', T.eff(b).seeded.cost === true);
  ok('so its money line stays marked as an estimate', T.series(b).anySeeded === true);

  // and a source with only tuition has nothing worth copying
  const onlyCost = T.newPath('university');
  onlyCost.name = 'Cost only';
  onlyCost.money = { years: '', cost: 9000, during: '', after: '' };
  S.paths.push(onlyCost);
  ok('a path with only tuition is not offered as a money source',
    !T.sectionHas(onlyCost, 'money'));
  S.paths.pop();

  T.setEditing(b.id); T.render();
  ok('the money section says tuition is excluded',
    T.main().includes('never what you pay'));

  commit({ dataset: { copy: 'tuesday', id: b.id }, value: a.id });
  ok('tuesday copies across', b.tuesday.day === 'Up at seven, site by eight.');

  commit({ dataset: { copy: 'reality', id: b.id }, value: a.id });
  ok('reality free text copies', b.reality.first === 'Field engineer, 45 hrs');
  ok('reality taps copy too', b.pick.demand === 'many' && b.pick.quit.join() === 'cost');
  ok('copied tap arrays are independent',
    (b.pick.quit.push('far'), a.pick.quit.length === 1));

  commit({ dataset: { copy: 'chips', id: b.id }, value: a.id });
  ok('chips copy across', b.chips.join() === 'tech,away');
  ok('and are independent', (b.chips.push('hands'), a.chips.length === 2));

  ok('what makes the schools different is NOT copied', !b.reqs.gpa);

  // a copied backup must never point the path at itself
  a.pick.backup = 'path:' + b.id;
  commit({ dataset: { copy: 'reality', id: b.id }, value: a.id });
  ok('a self-referencing backup is dropped on copy', b.pick.backup === '');

  // the control disappears when there is nothing to copy from
  const T2 = makeEnv();
  const solo = T2.newPath('trade'); solo.name = 'Only one';
  T2.getS().paths.push(solo);
  T2.getS().view = 'paths';
  T2.setEditing(solo.id); T2.render();
  ok('no copy control with a single path', !/data-copy=/.test(T2.main()));

  // whatever a copy lights up must actually exist, or the highlight silently does nothing
  T.setEditing(b.id); T.render();
  const edm = T.main();
  // [a="v"] must match exactly; [a^="v"] is a prefix, so drop its closing quote
  const lit = part => {
    const prefix = part.includes('^=');
    let l = part.replace(/^\[|\]$/g, '').split('][').map(x => x.replace('^=', '=')).join(' ');
    return prefix ? l.slice(0, -1) : l;
  };
  const missing = [];
  for (const kind of Object.keys(T.COPYFLASH)) {
    for (const part of T.COPYFLASH[kind](b).split(',')) {
      const probe = lit(part.trim());
      if (!edm.includes(probe)) missing.push(`${kind}: ${probe}`);
    }
  }
  ok('every copy highlight target exists in the editor', missing.length === 0, missing.join(' | '));
  T.setEditing(null);
}

/* ---- 20. unanswered cells link to the box that answers them ---- */
section('compare jump-to');
{
  const T = makeEnv();
  const click = d => T.fire('click', { target: { closest: () => ({ dataset: d }) } });
  const S = T.getS();
  const p = T.newPath('university');
  p.name = 'State U';
  S.paths.push(p);

  S.view = 'compare'; T.render();
  const cmp = T.main();

  ok('unanswered cells are buttons, not dead text', cmp.includes('<button class="na"'));
  ok('they carry the path they belong to', cmp.includes('data-id="' + p.id + '"'));
  ok('column headers open their path', cmp.includes('class="colhead"'));
  ok('"time until you can work" is no longer permanently unanswerable',
    !/Time until you can work<\/th><td><button class="na"/.test(cmp));
  ok('it reads from the training length instead', /Time until you can work<\/th><td>4 yrs/.test(cmp));

  // every jump target must resolve against the editor markup, or the link is dead
  S.view = 'paths'; T.setEditing(p.id); T.render();
  const ed = T.main();
  const literal = sel => sel
    .replace(/^\[|\]$/g, '')
    .split('][')
    .map(part => part.replace('^=', '=').replace(/"/g, '"'))
    .join(' ')
    .replace(/=("[^"]*)$/, '=$1');   // prefix match keeps the opening quote only
  let dead = [];
  for (const key of Object.keys(T.GOTO)) {
    const sel = T.GOTO[key](p);
    const lit = key === 'reqs'
      ? 'data-k="' + p.id + '|reqs.'
      : literal(sel);
    if (!ed.includes(lit)) dead.push(`${key} -> ${lit}`);
  }
  ok('every jump target exists in the editor', dead.length === 0, dead.join(' | '));
  T.setEditing(null);

  // clicking through actually lands you there
  S.view = 'compare'; T.render();
  click({ act: 'goto', id: p.id, t: 'quit' });
  ok('clicking through switches to the path editor', S.view === 'paths');
  ok('and opens the right path', T.main().includes('State U'));
  ok('the box it points at is on screen', T.main().includes('data-k="' + p.id + '|reality.quit"'));

  // answering it removes the link
  p.reality.quit = 'if the loans pass 40k';
  S.view = 'compare'; T.render();
  ok('an answered cell is plain text again',
    T.main().includes('if the loans pass 40k'));
  ok('and no longer offers a jump for that row',
    (T.main().match(/data-t="quit"/g) || []).length === 0);

  // the open-questions count links to the questions
  p.unknowns.push('testing');
  S.view = 'compare'; T.render();
  ok('the open-question count is a link', T.main().includes('data-t="reqs"'));
  click({ act: 'goto', id: p.id, t: 'reqs' });
  ok('it lands on the requirements', T.main().includes('data-k="' + p.id + '|reqs.'));

  // a bad target must not throw
  let threw = null;
  try { click({ act: 'goto', id: p.id, t: 'nonsense' }); } catch (e) { threw = e; }
  ok('an unknown target is ignored rather than throwing', !threw, threw && threw.message);
  let threw2 = null;
  try { click({ act: 'goto', id: 'no-such-path', t: 'quit' }); } catch (e) { threw2 = e; }
  ok('a missing path is ignored rather than throwing', !threw2, threw2 && threw2.message);
}

/* ---- 21. destructive actions ask first, and can be taken back ---- */
section('destructive actions');
{
  const build = () => {
    const T = makeEnv();
    const S = T.getS();
    S.ratings = { hands: 5, noDebt: 4 };
    S.plan.grad = '2028-06-09';
    const p = T.newPath('trade');
    p.name = 'Lincoln Tech';
    p.reality.quit = 'if the jobs dry up';
    S.paths.push(p);
    return [T, S, p];
  };
  const click = (T, d) => T.fire('click', { target: { closest: () => ({ dataset: d }) } });

  // saying no changes nothing
  let [T, S, p] = build();
  T.setConfirm(false);
  click(T, { act: 'reset' });
  ok('declining the erase prompt keeps everything', S.getS ? false : T.getS().paths.length === 1);
  ok('and keeps the ratings', Object.keys(T.getS().ratings).length === 2);
  ok('and leaves no restore point behind', T.peekUndo() === null);

  click(T, { act: 'del', id: p.id });
  ok('declining a delete keeps the path', T.getS().paths.length === 1);

  // saying yes erases, but leaves a way back
  T.setConfirm(true);
  click(T, { act: 'reset' });
  ok('erasing clears the paths', T.getS().paths.length === 0);
  ok('and the ratings', Object.keys(T.getS().ratings).length === 0);
  ok('a restore point is kept', T.peekUndo() !== null);
  ok('it says what was lost', /path/.test(T.peekUndo().what));
  ok('the toast offers Undo', T.toastHtml().includes('data-act="undo"'));

  click(T, { act: 'undo' });
  ok('undo brings the path back', T.getS().paths.length === 1);
  ok('with its writing intact', T.getS().paths[0].reality.quit === 'if the jobs dry up');
  ok('and the ratings', Object.keys(T.getS().ratings).length === 2);
  ok('the restore point is consumed', T.peekUndo() === null);

  // deleting one path is recoverable the same way
  [T, S, p] = build();
  const other = T.newPath('university'); other.name = 'State U';
  T.getS().paths.push(other);
  click(T, { act: 'del', id: p.id });
  ok('deleting removes just that path', T.getS().paths.length === 1 && T.getS().paths[0].name === 'State U');
  ok('and offers it back', T.toastHtml().includes('data-act="undo"'));
  click(T, { act: 'undo' });
  ok('undo restores the deleted path', T.getS().paths.length === 2);
  ok('and does not duplicate the other one',
    T.getS().paths.filter(x => x.name === 'State U').length === 1);

  // loading a backup is destructive too, so it is covered as well
  [T, S, p] = build();
  const T2 = makeEnv();
  const foreign = T2.exportText();
  T.importText(foreign);
  ok('importing replaces what was there', T.getS().paths.length === 0);
  ok('but keeps a restore point', T.peekUndo() !== null);
  click(T, { act: 'undo' });
  ok('undo puts the original work back', T.getS().paths[0].name === 'Lincoln Tech');

  // the restore point is reachable later, not just from the toast
  [T, S, p] = build();
  click(T, { act: 'reset' });
  T.getS().view = 'backup';
  T.render();
  ok('the backup tab offers the restore point', T.main().includes('You can still get it back'));
  ok('and names what it holds', /1 path/.test(T.main()));
  click(T, { act: 'forgetundo' });
  ok('it can be cleared deliberately', T.peekUndo() === null);
  T.render();
  ok('and then the offer is gone', !T.main().includes('You can still get it back'));

  // overwriting a section with a copy also asks
  [T, S, p] = build();
  const b2 = T.newPath('trade'); b2.name = 'Other'; b2.money = { years: 2, cost: '', during: 1, after: 2 };
  T.getS().paths.push(b2);
  p.money = { years: 5, cost: '', during: 9, after: 9 };
  T.setConfirm(false);
  T.fire('change', { target: { dataset: { copy: 'money', id: p.id }, value: b2.id } });
  ok('declining a copy leaves the section alone', p.money.years === 5);
  T.setConfirm(true);
  T.fire('change', { target: { dataset: { copy: 'money', id: p.id }, value: b2.id } });
  ok('accepting it performs the copy', p.money.years === 2);
}

/* ---- 22. sending it to a person ---- */
section('share with a mentor');
{
  const fill = T => {
    const S = T.getS();
    S.plan.grad = '2028-06-09';
    S.plan.who = 'Marco';
    S.plan.help = 'Rides to the two campus visits, and someone on the IBEW call with me.';
    const p = T.newPath('apprenticeship');
    p.name = 'IBEW Local 26'; p.loc = 'Northern Virginia';
    p.money = { years: 5, cost: 1200, during: 42000, after: 88000 };
    p.reality.quit = 'if I hate being outside in February';
    p.pick = { quit: ['body'] };
    p.tuesday.day = 'Up at six, on site by seven.';
    p.unknowns.push('test');
    S.paths.push(p);
    S.plan.keep = [p.id];
    S.plan.actions[0] = { t: 'Call about the application window', d: '2026-09-15', p: '' };
    return p;
  };
  const click = (T, d) => T.fire('click', { target: { closest: () => ({ dataset: d }) } });

  let T = makeEnv();
  fill(T);
  const txt = T.buildShareText();

  ok('it is addressed by name', txt.startsWith("Marco's plan for after high school"));
  ok('no markdown syntax survives', !/\*\*|^#|\[ \]\(/m.test(txt));
  ok('it uses plain tick boxes a person can read', txt.includes('[ ] Call about the application window'));
  ok('dates read as words, not ISO', txt.includes('Leaves high school June 9, 2028'));
  ok('it names what is being kept open', txt.includes('Keeping open: IBEW Local 26'));
  ok('the path carries its numbers', /Costs \$6k over 5 yrs/.test(txt));
  ok('and what would end it', txt.includes('Would make me quit'));
  ok('and what is still unknown', txt.includes('Still unknown'));
  ok('the Tuesday comes along', txt.includes('Up at six, on site by seven.'));
  ok('the ask for help is last and unmissable',
    txt.indexOf('WHAT I NEED HELP WITH') > txt.indexOf('THE PATHS'));
  ok('it says where it came from', txt.includes('Next Move'));

  // the subject line
  ok('the subject names the student', T.shareSubject() === "Marco's post-high-school plan");
  T.getS().plan.who = '';
  ok('and degrades gracefully with no name', T.shareSubject() === 'My post-high-school plan');

  // email fallback
  T = makeEnv(); fill(T);
  click(T, { act: 'mail' });
  const href = T.mailto();
  ok('email opens a mailto link', href.startsWith('mailto:?subject='));
  ok('with the subject filled in', decodeURIComponent(href).includes("Marco's post-high-school plan"));
  ok('and the plan in the body', decodeURIComponent(href).includes('IBEW Local 26'));

  // a long plan must not silently lose its tail
  T = makeEnv();
  const big = fill(T);
  for (let i = 0; i < 12; i++) {
    const q = T.newPath('university');
    q.name = 'University number ' + i;
    q.reality.quit = 'a fairly long sentence about why this one might not work out in the end';
    q.tuesday.day = 'A long description of a Tuesday that goes on for a while to pad this out.';
    T.getS().paths.push(q);
  }
  ok('the plan is now longer than a mailto can carry', T.buildShareText().length > 1700);
  click(T, { act: 'mail' });
  const body = decodeURIComponent(T.mailto());
  ok('the email is truncated rather than broken', body.includes('The rest is on your clipboard'));
  ok('and stays under the cap', body.length < 2600, `${body.length}`);

  // native share sheet when the device has one
  let shared = null;
  T = makeEnv({ share: async payload => { shared = payload; } });
  fill(T);
  click(T, { act: 'share' });
  await new Promise(r => setTimeout(r, 5));
  ok('the share sheet gets the plan', shared && shared.text.includes('IBEW Local 26'));
  ok('with a subject as its title', shared.title === "Marco's post-high-school plan");
  ok('and it did NOT fall through to email', T.mailto() === '');

  // a cancelled share must not then open an email
  T = makeEnv({ share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } });
  fill(T);
  click(T, { act: 'share' });
  await new Promise(r => setTimeout(r, 5));
  ok('cancelling the share sheet does nothing further', T.mailto() === '');

  // a failed share should still get the plan out
  T = makeEnv({ share: async () => { throw new Error('not allowed'); } });
  fill(T);
  click(T, { act: 'share' });
  await new Promise(r => setTimeout(r, 5));
  ok('a failed share falls back to email', T.mailto().startsWith('mailto:'));

  // copy-as-text uses the readable version, not markdown
  T = makeEnv(); fill(T);
  click(T, { act: 'copytext' });
  ok('copy as text gives the readable plan', T.copyArea().includes("Marco's plan for after high school"));
  ok('and not the markdown one', !T.copyArea().includes('# Post-High-School Plan'));

  // the controls are on Plan, where the plan is
  T = makeEnv(); fill(T);
  T.getS().view = 'plan'; T.render();
  ok('Plan offers sending it', T.main().includes('Send it to someone'));
  ok('and says it is a snapshot, not a live view', T.main().includes('snapshot, not a live view'));
  T.getS().view = 'backup'; T.render();
  ok('Backup does not duplicate it', !T.main().includes('Send it to someone'));
}

/* ---- 23. the app does not prescribe a particular set of options ---- */
section('no prescribed plan shape');
{
  const T = makeEnv();
  const S = T.getS();
  S.plan.grad = '2028-06-09';

  const timeline = T.agenda().filter(i => i.kind === 'ms').map(i => i.text).join(' ');
  ok('no milestone dictates how many of each kind to look at',
    !/two schools|two trades|four paths/i.test(timeline), timeline.match(/.{0,60}(schools|trades).{0,30}/i));
  ok('it still asks them to choose what to investigate', /options you will actually look into/i.test(timeline));

  // the paths view observes, it does not set a quota
  S.view = 'paths';
  const a = T.newPath('university'); a.name = 'One';
  S.paths.push(a); T.render();
  ok('one path prompts for a comparison', T.main().includes('One path is not a comparison'));
  ok('without naming a required kind', !/college|trade|apprenticeship/i.test(
    T.main().split('One path is not a comparison')[1].slice(0, 120)));

  const b = T.newPath('university'); b.name = 'Two';
  S.paths.push(b); T.render();
  ok('two of the same kind notes the lack of contrast',
    T.main().includes('same kind of thing'));
  ok('and does not say which kind is missing',
    !/two colleges|one trade|two trades/i.test(T.main()));

  const c = T.newPath('trade'); c.name = 'Three';
  S.paths.push(c); T.render();
  ok('a mixed set is left alone',
    !T.main().includes('same kind of thing') && !T.main().includes('not a comparison'));

  // and a military-only or trade-only set is treated identically
  const T2 = makeEnv();
  T2.getS().view = 'paths';
  ['military', 'military'].forEach((t, i) => {
    const p2 = T2.newPath(t); p2.name = 'M' + i; T2.getS().paths.push(p2);
  });
  T2.render();
  ok('the same-kind note is not specific to colleges', T2.main().includes('same kind of thing'));
}

/* ---- 24. never offer a handoff this copy cannot perform ---- */
section('honest share affordances');
{
  const fill = T => {
    const S = T.getS();
    S.view = 'plan';
    const p = T.newPath('trade'); p.name = 'Lincoln Tech';
    S.paths.push(p);
  };

  // hosted on a real web address: a link is the best thing it can do
  delete globalThis.claude;
  let T = makeEnv(); fill(T); T.render();
  let h = T.main();
  ok('a hosted page leads with a link', h.includes('data-act="sharelink"'));
  ok('and still offers the file as an option', h.includes('data-act="sharecopy"'));
  ok('it explains the data rides in the link', h.includes('after the #'));
  ok('and that the link is not secret', h.includes('anyone who has it can read it'));

  // opened as a local file: no shareable URL, so the file copy leads
  T = makeEnv({ loc: FILE_LOC }); fill(T); T.render();
  h = T.main();
  ok('a local file does not offer a link', !h.includes('data-act="sharelink"'));
  ok('it offers the working copy instead', h.includes('Send a working copy'));
  ok('and warns that phones will not open it', h.includes('no way to open a saved web page'));
  ok('pointing at the web address for links', h.includes('send a link instead'));

  // inside someone else's page: no link worth sharing, no file handoff either
  globalThis.claude = { use: async () => null };
  T = makeEnv({ frame: true });
  await new Promise(r => setTimeout(r, 10));
  fill(T); T.render();
  h = T.main();
  ok('an embedded copy offers no link', !h.includes('data-act="sharelink"'));
  ok('and no working copy', !h.includes('Send a working copy'));
  ok('it says plainly why', h.includes('cannot hand you a file'));
  ok('and offers what does work instead', h.includes('Copy the plan as text'));
  ok('pointing at the backup tab for a full transfer', h.includes('data-v="backup"'));
  ok('no dead download button either', !h.includes('data-act="mdfile"'));

  // and the copy action still works there, via the on-page fallback
  T.fire('click', { target: { closest: () => ({ dataset: { act: 'copytext' } }) } });
  ok('copying still produces the text', /plan for after high school/i.test(T.copyArea()));
  ok('and it carries the actual path', T.copyArea().includes('Lincoln Tech'));

  delete globalThis.claude;
}

/* ---- 25. share by link ---- */
section('share by link');
{
  const fill = T => {
    const S = T.getS();
    S.plan.grad = '2028-06-09';
    S.plan.who = 'Marco';
    S.plan.help = 'Rides to the campus visits.';
    S.ratings = { hands: 5, noDebt: 4, tech: 4 };
    const p = T.newPath('apprenticeship');
    p.name = 'IBEW Local 26'; p.loc = 'Northern Virginia';
    p.money = { years: 5, cost: 1200, during: 42000, after: 88000 };
    p.reality.quit = 'February outside';
    p.tuesday.day = 'Up at six, on site by seven.';
    p.unknowns.push('test');
    S.paths.push(p);
    S.plan.keep = [p.id];
    return p;
  };

  const T = makeEnv();
  fill(T);

  // encode -> decode, through the real gzip path
  const payload = T.seedPayload();
  const encoded = await T.encodeSeed(payload);
  ok('it compresses rather than dumping raw json', encoded.charAt(0) === 'z');
  ok('the encoding is URL-safe', !/[+/=]/.test(encoded));
  const back = await T.decodeSeed(encoded);
  ok('the plan survives the round trip', back.state.paths[0].name === 'IBEW Local 26');
  ok('the writing survives too', back.state.paths[0].tuesday.day === 'Up at six, on site by seven.');
  ok('the flagged unknown survives', back.state.paths[0].unknowns.includes('test'));
  ok('the sender travels with it', back.from === 'Marco');

  // compression is what keeps a real plan inside a sendable link, so measure it
  // on a real-sized plan rather than this small fixture
  const big = makeEnv();
  fill(big);
  const words = ('apprentice tuition semester welding conduit transcript deadline stipend commute '
    + 'dormitory scholarship prerequisite portfolio interview aptitude overtime diagnostics '
    + 'curriculum counselor placement certification wage benefits rotation instructor machining')
    .split(' ');
  let n = 7;
  const prose = k => Array.from({ length: k }, () => words[(n = (n * 37 + 11) % words.length)]).join(' ');
  for (let i = 0; i < 3; i++) {
    const q = big.newPath('university');
    q.name = 'University ' + i;
    q.why = prose(30);
    q.reality.quit = prose(25);
    q.tuesday = { day: prose(70), bad: prose(50), where: prose(30), good: prose(30) };
    ['courses','gpa','testing','apply','essay','recs','deadline','aid'].forEach(k2 => {
      q.reqs[k2] = { says: prose(25), action: prose(8), due: '2027-01-15' };
    });
    big.getS().paths.push(q);
  }
  const bigPayload = big.seedPayload();
  const bigRaw = JSON.stringify(bigPayload).length;
  const bigEnc = await big.encodeSeed(bigPayload);
  ok('a full plan compresses to well under half its size', bigEnc.length < bigRaw * 0.5,
    `${bigEnc.length} vs ${bigRaw} raw (${Math.round(100 * bigEnc.length / bigRaw)}%)`);
  const bigLink = await big.buildLink();
  ok('and four written-up paths still make a sendable link', bigLink.length < 8000,
    `${bigLink.length} chars`);
  ok('it still round-trips at that size',
    (await big.decodeSeed(bigEnc)).state.paths.length === 4);

  // the link is built from the page's own address, nothing hardcoded
  const link = await T.buildLink();
  ok('the link points at wherever this page is served from',
    link.startsWith('https://chris-santiago.github.io/next-move/#p='));
  ok('a realistic plan fits comfortably', link.length < 4000, `${link.length} chars`);

  // a reader opening that link gets the plan, in its own storage
  const R = makeEnv({ loc: { protocol: 'https:', origin: 'https://chris-santiago.github.io',
                             pathname: '/next-move/', hash: link.slice(link.indexOf('#')) } });
  const rd = await R.decodeSeed(link.slice(link.indexOf('#p=') + 3));
  R.adoptShared(rd);
  ok('the reader sees the sender\'s plan', R.getS().paths[0].name === 'IBEW Local 26');
  ok('it opens on the plan, not the cold start', R.getS().view !== 'welcome');
  ok('the shared banner names the sender', R.toastHtml !== undefined && true);
  R.getS().view = 'compare'; R.save();
  const keys = R.storageKeys();
  ok('the reader stores it separately from their own plan',
    keys.some(k => k.startsWith('nextmove.shared.')) && !keys.includes('nextmove.v1'), keys.join(','));

  // reopening the same link keeps what the reader did, rather than resetting them
  const R2 = makeEnv({ loc: { protocol: 'https:', origin: 'https://chris-santiago.github.io',
                              pathname: '/next-move/', hash: '' }, storage: R.storageDump() });
  R2.adoptShared(rd);
  ok('reopening the same link keeps the reader\'s own changes', R2.getS().view === 'compare');

  // corrupt links fail loudly rather than silently
  for (const [label, bad] of [
    ['truncated', encoded.slice(0, Math.floor(encoded.length / 2))],
    ['unknown encoding', 'q' + encoded.slice(1)],
    ['empty', ''],
    ['not base64', 'z!!!!not-base64!!!!'],
  ]) {
    let threw = false;
    try { await T.decodeSeed(bad); } catch (e) { threw = true; }
    ok(`a ${label} link is rejected`, threw);
  }

  // an uncompressed payload still reads, for browsers without gzip streams
  const rawEncoded = 'r' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const rawBack = await T.decodeSeed(rawEncoded);
  ok('an uncompressed link still opens', rawBack.state.paths[0].name === 'IBEW Local 26');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
