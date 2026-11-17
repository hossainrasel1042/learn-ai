

import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { WebSocket } from 'ws';
import pg from 'pg';

import { createTestUser, API_BASE } from './_testAuth.js';

const CDP_HTTP = 'http://localhost:9222';
const BASE = 'http://localhost:3000';
const FAKE_PORT = 9911;

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const info = (m) => console.log(`  – ${m}`);
const section = (m) => console.log(`\n--- ${m} ---`);





let ws;
let msgId = 0;
const pending = new Map();
const networkLog = [];

async function connectCdp() {
    const targets = await (await fetch(`${CDP_HTTP}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no Chrome page target found on :9222');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
        ws.on('open', res);
        ws.on('error', rej);
    });
    ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
            return;
        }
        if (msg.method === 'Network.requestWillBeSent') {
            const r = msg.params.request;
            networkLog.push({
                method: r.method,
                url: r.url,
                postData: r.postData || null,
            });
        }
    });
}

function send(method, params = {}) {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id);
                reject(new Error(`timeout: ${method}`));
            }
        }, 30000);
    });
}

async function evaluate(expression) {
    const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    }
    return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(expr, label, timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            if (await evaluate(expr)) return true;
        } catch {  }
        await sleep(250);
    }
    throw new Error(`timeout waiting for: ${label}`);
}

async function navigate(url) {
    await send('Page.navigate', { url });
    await sleep(1500);
}

async function setInputValue(selector, value) {
    const done = await evaluate(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    if (!done) throw new Error(`could not set ${selector}`);
}


async function clickButton(text) {
    return evaluate(`
      (function() {
        var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
        for (var i = 0; i < btns.length; i++) {
          if ((btns[i].innerText || '').trim() === ${JSON.stringify(text)}) { btns[i].click(); return true; }
        }
        return false;
      })()
    `);
}






const fake = {

    matchOnQueue: null,

    matchOnJoin: null,

    answers: [],

    leaves: [],

    queues: [],

    joins: [],

    pushScore: null,

    pushEnded: null,

    holdScore: false,

    heldScore: null,
};

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: { origin: '*', credentials: true },
    serveClient: false,
});

function makeQuestions(matchId, count = 3) {
    const out = [];
    for (let i = 1; i <= count; i += 1) {
        out.push({
            id: `q${i}`,
            matchId,
            position: i,
            prompt: `Probe question ${i}?`,
            optionA: `A${i}`,
            optionB: `B${i}`,
            optionC: `C${i}`,
            optionD: `D${i}`,
            tags: ['probe'],
            difficulty: 'easy',
        });
    }
    return out;
}


function makeMatchPayload() {
    return {
        matchId: MATCH_ID,
        courseId: COURSE_ID,
        questionCount: 3,
        durationMs: 600000,
        questions: makeQuestions(MATCH_ID, 3),
        opponent: { id: OPPONENT_ID, levelScore: 1200 },
        you: user.userId,
    };
}

io.on('connection', (socket) => {
    socket.on('battle:queue', (payload) => {
        fake.queues.push(payload);
        if (fake.matchOnQueue) {
            socket.emit('battle:matched', fake.matchOnQueue);
        }
    });
    socket.on('battle:join', (payload) => {
        fake.joins.push(payload);
        if (fake.matchOnJoin) {
            socket.emit('battle:matched', fake.matchOnJoin);
        }
    });
    socket.on('battle:answer', (payload) => {
        fake.answers.push(payload);



        const frame = fake.pushScore || {
            matchId: MATCH_ID,
            scores: { [user.userId]: 1, [OPPONENT_ID]: 0 },
            lastAnswer: {
                userId: user.userId,
                questionId: payload.questionId,
                isCorrect: true,
            },
        };
        if (fake.holdScore) {


            fake.heldScore = frame;
            return;
        }
        socket.emit('battle:score', frame);
    });
    socket.on('battle:leave', (payload) => {
        fake.leaves.push(payload);
    });
    socket.on('battle:cancel', () => {});
    socket.on('battle:ping', () => {});
});

await new Promise((r) => httpServer.listen(FAKE_PORT, r));





const stamp = Date.now();
const email = `playui-${stamp}@example.com`;
const password = 'Probe!Passw0rd123';

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();
const user = await createTestUser(email, password, db);


const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const OPPONENT_ID = '33333333-3333-4333-8333-333333333333';
const COURSE_ID = 'f24a95cc-b58b-447d-8049-3dd60b5ef344';

async function seedMatch() {


    await db.query(
        `INSERT INTO public.profiles (id, email, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [OPPONENT_ID, `playui-opp-${stamp}@example.com`, 'Probe Opponent'],
    );
    await db.query(
        `INSERT INTO public.quiz_battle_matches
           (id, course_id, player_one, player_two, status,
            level_at_match_one, level_at_match_two, started_at)
         VALUES ($1, $2, $3, $4, 'in_progress', 1000, 1200, now())
         ON CONFLICT (id) DO NOTHING`,
        [MATCH_ID, COURSE_ID, user.userId, OPPONENT_ID],
    );

    for (let i = 1; i <= 3; i += 1) {
        await db.query(
            `INSERT INTO public.quiz_battle_questions
               (match_id, position, prompt, option_a, option_b, option_c, option_d,
                correct, explanation, tags, difficulty)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'A', 'because', ARRAY['probe'], 'easy')
             ON CONFLICT DO NOTHING`,
            [MATCH_ID, i, `Probe question ${i}?`, `A${i}`, `B${i}`, `C${i}`, `D${i}`],
        );
    }
}

async function clearMatch() {
    await db.query(`DELETE FROM public.quiz_battle_answers WHERE match_id = $1`, [MATCH_ID]);
    await db.query(`DELETE FROM public.quiz_battle_questions WHERE match_id = $1`, [MATCH_ID]);
    await db.query(`DELETE FROM public.quiz_battle_matches WHERE id = $1`, [MATCH_ID]);
    await db.query(`DELETE FROM public.profiles WHERE id = $1`, [OPPONENT_ID]);
}


const wsRedirectScript = `
  (function() {
    var RealWS = window.WebSocket;
    window.__wsLog = [];
    function FakeWS(url, protocols) {
      var real = new RealWS(String(url).replace('localhost:8000', 'localhost:${FAKE_PORT}'), protocols);
      window.__wsLog.push(String(url));
      return real;
    }
    FakeWS.prototype = RealWS.prototype;

    FakeWS.prototype = RealWS.prototype;
    FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
    window.WebSocket = FakeWS;

    window.__activeIntervals = 0;
    window.__intervalStacks = [];
    var realSetInterval = window.setInterval;
    var realClearInterval = window.clearInterval;
    var live = new Set();
    var stacks = new Map();
    window.setInterval = function(fn, ms) {
      var h = realSetInterval.apply(window, arguments);
      live.add(h);
      stacks.set(h, new Error('interval').stack || '');
      window.__activeIntervals = live.size;
      return h;
    };
    window.clearInterval = function(h) {
      live.delete(h);
      stacks.delete(h);
      window.__activeIntervals = live.size;
      return realClearInterval.apply(window, arguments);
    };
    window.__intervalStacks = function() {
      var out = [];
      stacks.forEach(function(stack, h) { out.push({ handle: String(h), stack: stack }); });
      return out;
    };

    window.__activeTimeouts = 0;
    window.__timeoutStacks = [];
    var realSetTimeout = window.setTimeout;
    var realClearTimeout = window.clearTimeout;
    var liveT = new Set();
    var tStacks = new Map();
    window.setTimeout = function(fn, ms) {
      var args = arguments;
      var h = realSetTimeout.apply(window, [function() {
        liveT.delete(h);
        tStacks.delete(h);
        window.__activeTimeouts = liveT.size;
        if (typeof args[0] === 'function') {
          return args[0].apply(window, Array.prototype.slice.call(args, 2));
        }
        return undefined;
      }, ms]);
      liveT.add(h);
      tStacks.set(h, new Error('timeout').stack || '');
      window.__activeTimeouts = liveT.size;
      return h;
    };
    window.clearTimeout = function(h) {
      liveT.delete(h);
      tStacks.delete(h);
      window.__activeTimeouts = liveT.size;
      return realClearTimeout.apply(window, arguments);
    };
    window.__timeoutStacks = function() {
      var out = [];
      tStacks.forEach(function(stack, h) { out.push({ handle: String(h), stack: stack }); });
      return out;
    };
  })();
`;

let redirectId;

async function signIn(asEmail = email) {
    await navigate(`${BASE}/auth`);
    await waitFor(`!!document.querySelector('input[type="password"]')`, 'the login form');
    await setInputValue('input[type="email"]', asEmail);
    await setInputValue('input[type="password"]', password);
    await sleep(300);
    await evaluate(`document.querySelector('form button[type="submit"]').click();`);
    for (let i = 0; i < 40; i += 1) {
        await sleep(250);
        try {
            if (await evaluate(`location.pathname !== '/auth'`)) break;
        } catch {  }
    }
}


async function currentQuestionIndex() {
    return evaluate(`
      (function() {
        var el = document.querySelector('h2');
        if (!el) return null;
        var m = /Probe question (\\d+)\\?/.exec(el.textContent || '');
        return m ? parseInt(m[1], 10) : null;
      })()
    `);
}


async function optionsEnabled() {
    return evaluate(`
      (function() {
        var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
        var n = 0, disabled = 0, texts = [];
        for (var i = 0; i < btns.length; i++) {
          var t = (btns[i].innerText || '').trim();
          if (/^A[ABC]?\\d?/.test(t) || /^B[ABC]?\\d?/.test(t) ||
              /^C[ABC]?\\d?/.test(t) || /^D[ABC]?\\d?/.test(t)) {
            if (/[ABCD]\\d/.test(t)) {
              n++;
              texts.push(t);
              if (btns[i].disabled) disabled++;
            }
          }
        }
        return { count: n, disabled: disabled, texts: texts };
      })()
    `);
}


async function clickOption(optionText) {
    return evaluate(`
      (function() {
        var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
        for (var i = 0; i < btns.length; i++) {
          if ((btns[i].innerText || '').indexOf(${JSON.stringify(optionText)}) !== -1) {
            btns[i].click();
            return (btns[i].innerText || '').trim();
          }
        }
        return false;
      })()
    `);
}


async function selectFirstCourse() {
    return evaluate(`
      (function() {
        var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
        for (var i = 0; i < btns.length; i++) {
          var t = (btns[i].innerText || '').trim();
          if (t.indexOf('CSE') !== -1 || t.indexOf('Introduction') !== -1) {
            btns[i].click();
            return t.slice(0, 40);
          }
        }
        return false;
      })()
    `);
}


async function openBell() {
    await evaluate(`
      (function() {
        var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
        for (var i = 0; i < btns.length; i++) {
          if ((btns[i].getAttribute('aria-label') || '') === 'Notifications') {
            btns[i].click();
            return true;
          }
        }
        return false;
      })()
    `);
    await sleep(800);
    const isOpen = await evaluate(`
      document.body.innerText.includes('Battle notifications')
    `);
    if (!isOpen) {
        await evaluate(`
          (function() {
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            for (var i = 0; i < btns.length; i++) {
              if ((btns[i].getAttribute('aria-label') || '') === 'Notifications') {
                btns[i].click();
                return true;
              }
            }
            return false;
          })()
        `);
        await sleep(800);
    }
    return evaluate(`document.body.innerText.includes('Battle notifications')`);
}

try {
    await seedMatch();
    await connectCdp();
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    const stub = await send('Page.addScriptToEvaluateOnNewDocument', {
        source: wsRedirectScript,
    });
    redirectId = stub.identifier;

    await signIn();
    if ((await evaluate('location.pathname')) === '/auth') {
        throw new Error('could not sign in');
    }


    section('A. the play page loads the profile, the courses and the match history');

    {
        await navigate(`${BASE}/play`);
        await waitFor(`document.body.innerText.includes('Real-time 1v1 Quiz Battle')`, 'the play page');
        await sleep(800);

        const body = await evaluate('document.body.innerText');
        if (body.includes('Level score:')) ok('the battle profile is rendered');
        else bad('the battle profile is rendered', 'no "Level score:" on the page');

        if (body.includes('Find opponent')) ok('the "Find opponent" button renders');
        else bad('the "Find opponent" button renders', 'button missing');

        if (body.includes('Recent matches')) ok('the recent-matches section renders');
        else bad('the recent-matches section renders', 'section missing');





        const hasEmpty = body.includes('No matches yet.');
        const hasRow = body.includes('in_progress') || body.includes('finished');
        if (hasEmpty || hasRow) ok('the match history renders a real state');
        else bad('the match history renders a real state', body.slice(0, 300));
    }


    section('B. "Find opponent" queues, and a match pulls the player into the room');

    {

        const matchPayload = makeMatchPayload();
        fake.matchOnQueue = matchPayload;


        fake.matchOnJoin = matchPayload;
        fake.queues.length = 0;
        fake.joins.length = 0;

        await navigate(`${BASE}/play`);
        await waitFor(`document.body.innerText.includes('Find opponent')`, 'the play page');
        await sleep(600);

        const picked = await selectFirstCourse();
        if (picked) ok(`a course was selected (${picked})`);
        else bad('a course was selected', 'no course button found');
        await sleep(300);

        const clicked = await clickButton('Find opponent');
        if (!clicked) {
            bad('"Find opponent" was clicked', 'button not found');
        } else {
            ok('"Find opponent" was clicked');
        }



        await waitFor(`location.pathname.startsWith('/play/match/')`, 'the match room', 20000);
        const url = await evaluate('location.href');
        if (url.includes('11111111-1111-4111-8111-111111111111')) {
            ok(`the player was routed into the match room (${url})`);
        } else {
            bad('the player was routed into the match room', url);
        }

        if (fake.queues.length === 1) ok('the course was sent to the server');
        else bad('the course was sent to the server', `${fake.queues.length} queue events`);
    }


    section('C. the match room joins the match and the options are clickable');

    {




        if (fake.joins.length >= 1) {
            ok('the room asked the server to join the match');
        } else {
            bad('the room asked the server to join the match', `${fake.joins.length} join events`);
        }


        await sleep(4500);

        const body = await evaluate('document.body.innerText');
        if (!body.includes('Waiting for the match to start')) {
            ok('the room is not stuck on "Waiting for the match to start…"');
        } else {
            bad('the room is not stuck on "Waiting for the match to start…"', 'still waiting');
        }

        const qIndex = await currentQuestionIndex();
        if (qIndex === 1) ok('the first question is displayed');
        else bad('the first question is displayed', `question index = ${qIndex}`);

        const opts = await optionsEnabled();
        if (opts.count === 4) ok('all four options are rendered');
        else bad('all four options are rendered', `${opts.count} option buttons`);

        if (opts.count === 4 && opts.disabled === 0) {
            ok('the options are clickable once the match is live');
        } else {
            bad(
                'the options are clickable once the match is live',
                `${opts.disabled} of ${opts.count} disabled`,
            );
        }
    }


    section('D. answering a question does not skip the next one');






    {

        fake.pushScore = {
            matchId: MATCH_ID,
            scores: { [user.userId]: 1, [OPPONENT_ID]: 0 },
            lastAnswer: { userId: user.userId, questionId: 'q1', isCorrect: true },
        };
        fake.answers.length = 0;

        await clickOption('A1');
        await sleep(1200);

        if (fake.answers.length === 1) ok('the answer was sent to the server');
        else bad('the answer was sent to the server', `${fake.answers.length} answers`);

        const after = await currentQuestionIndex();
        if (after === 2) {
            ok('the view advanced to the NEXT question (it did not skip one)');
        } else {
            bad(
                'the view advanced to the NEXT question (it did not skip one)',
                `showing question ${after} (expected 2)`,
            );
        }



        fake.pushScore = {
            matchId: MATCH_ID,
            scores: { [user.userId]: 1, [OPPONENT_ID]: 1 },
            lastAnswer: { userId: OPPONENT_ID, questionId: 'q1', isCorrect: true },
        };

        io.sockets.sockets.forEach((s) => s.emit('battle:score', fake.pushScore));
        await sleep(1200);

        const afterOpp = await currentQuestionIndex();
        if (afterOpp === 2) {
            ok("the opponent's answer did not move the player's question");
        } else {
            bad(
                "the opponent's answer did not move the player's question",
                `question went 2 -> ${afterOpp}`,
            );
        }
    }


    section('E. a score frame for a DIFFERENT match is ignored');





    {
        const before = await currentQuestionIndex();


        fake.pushScore = {
            matchId: '99999999-9999-4999-8999-999999999999',
            scores: { 'someone-else': 5 },
            lastAnswer: { userId: 'someone-else', questionId: 'qX', isCorrect: true },
        };



        io.sockets.sockets.forEach((s) => s.emit('battle:score', fake.pushScore));
        await sleep(1200);

        const after = await currentQuestionIndex();
        if (after === before) {
            ok('a score frame for another match did not move the question');
        } else {
            bad(
                'a score frame for another match did not move the question',
                `question went ${before} -> ${after}`,
            );
        }


        const scoreText = await evaluate(`
          (function() {
            var t = document.body.innerText;
            var m = t.match(/You\\s*(\\d+)[\\s\\S]*?Opp\\s*(\\d+)/);
            return m ? { mine: m[1], opp: m[2] } : null;
          })()
        `);
        if (scoreText && scoreText.mine === '1') {
            ok('the score shown is still this player\'s score');
        } else {
            bad(
                'the score shown is still this player\'s score',
                `score panel = ${JSON.stringify(scoreText)}`,
            );
        }
    }


    section('F. "Back" leaves the match instead of abandoning it silently');




    {
        fake.leaves.length = 0;
        fake.pushScore = null;

        const clicked = await clickButton('Back');
        if (!clicked) {
            bad('the "Back" control was clicked', 'button not found');
        } else {
            ok('the "Back" control was clicked');
        }
        await sleep(2000);

        if (fake.leaves.length >= 1) {
            ok('leaving the room emitted battle:leave');
        } else {
            bad('leaving the room emitted battle:leave', `${fake.leaves.length} leave events`);
        }
    }


    section('G. opening the room URL directly works, and the result screen shows the outcome');

    {



        fake.joins.length = 0;
        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await sleep(4500);

        if (fake.joins.length >= 1) {
            ok('a directly-opened room asked the server to join');
        } else {
            bad('a directly-opened room asked the server to join', `${fake.joins.length} join events`);
        }

        const qIndex = await currentQuestionIndex();
        if (qIndex !== null) {
            ok('a directly-opened room shows the questions');
        } else {
            bad('a directly-opened room shows the questions', 'no question on screen');
        }

        fake.pushEnded = {
            matchId: MATCH_ID,
            winner: user.userId,
            reason: 'time_up',
            scores: { [user.userId]: 7, [OPPONENT_ID]: 3 },
        };

        io.sockets.sockets.forEach((s) => s.emit('battle:ended', fake.pushEnded));
        await sleep(1500);

        const body = await evaluate('document.body.innerText');
        if (body.includes('You win!')) ok('the win screen renders');
        else bad('the win screen renders', body.slice(0, 300));

        if (body.includes('Time up')) ok('the end reason is shown');
        else bad('the end reason is shown', 'no "Time up" on the page');

        if (/\b7\b/.test(body) && /\b3\b/.test(body)) ok('both scores are shown');
        else bad('both scores are shown', body.slice(0, 300));
    }


    section('H. a socket error does not leave the page stuck on "Searching…"');

    {
        await navigate(`${BASE}/play`);
        await waitFor(`document.body.innerText.includes('Find opponent')`, 'the play page');
        await sleep(600);

        fake.matchOnQueue = null;
        fake.queues.length = 0;

        await selectFirstCourse();
        await sleep(300);
        await clickButton('Find opponent');
        await sleep(800);

        const queued = await evaluate(`document.body.innerText.includes('Searching for an opponent')`);
        if (queued) ok('the matchmaking overlay shows while queued');
        else bad('the matchmaking overlay shows while queued', 'overlay missing');


        io.sockets.sockets.forEach((s) => s.emit('battle:error', { message: 'queue failed' }));
        await sleep(1200);

        const afterError = await evaluate('document.body.innerText');
        if (afterError.includes('queue failed')) {
            ok('the error is shown to the player');
        } else {
            bad('the error is shown to the player', afterError.slice(0, 300));
        }

        if (!afterError.includes('Searching for an opponent')) {
            ok('the page is not stuck on "Searching…"');
        } else {
            bad('the page is not stuck on "Searching…"', 'the overlay is still up');
        }
    }


    section('I. navigating away mid-countdown does not leak a timer');



















    {
        await navigate(`${BASE}/play`);
        await waitFor(`document.body.innerText.includes('Find opponent')`, 'the play page');
        await sleep(800);

        const matchPayload = makeMatchPayload();
        fake.matchOnQueue = matchPayload;
        fake.matchOnJoin = matchPayload;


        await selectFirstCourse();
        await sleep(300);
        await clickButton('Find opponent');
        await waitFor(`location.pathname.startsWith('/play/match/')`, 'the match room', 20000);



        await sleep(4500);
        const settled = await evaluate(`window.__activeIntervals || 0`);







        await clickButton('Back');
        await waitFor(`location.pathname === '/play'`, 'the play page', 20000);
        await sleep(500);

        await selectFirstCourse();
        await sleep(300);
        await clickButton('Find opponent');
        await waitFor(`location.pathname.startsWith('/play/match/')`, 'the match room again', 20000);
        await sleep(4500);

        const after = await evaluate(`window.__activeIntervals || 0`);




        if (after <= settled) {
            ok(`no timer leaked on navigation (${settled} -> ${after} intervals)`);
        } else {
            const stacks = await evaluate(`(window.__intervalStacks ? window.__intervalStacks() : [])`);
            const fromHook = stacks.filter((s) => /use-battle-match|startElapsedTimer/.test(s.stack));
            const shown = (fromHook.length ? fromHook : stacks);
            const detail = shown
                .map((s) => s.stack.split('\n').slice(1, 3).join(' | '))
                .join('\n        ');
            bad('no timer leaked on navigation',
                `the interval count grew from ${settled} to ${after} after the countdown window\n        ${detail}`);
        }
    }


    section('J. a double-click does not answer the same question twice');






    {
        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question 1')`, 'the match room');
        await sleep(1500);

        const before = await currentQuestionIndex();
        const answersBefore = fake.answers.length;







        const clicked = await evaluate(`
          (function() {
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            for (var i = 0; i < btns.length; i++) {
              if ((btns[i].innerText || '').indexOf('A1') !== -1) {
                btns[i].click(); btns[i].click(); btns[i].click();
                return true;
              }
            }
            return false;
          })()
        `);
        if (!clicked) {
            bad('only one answer was sent for the burst', 'no option button was found');
        }
        await sleep(2500);

        const after = await currentQuestionIndex();
        const answers = fake.answers.length - answersBefore;

        if (answers <= 1) {
            ok(`only one answer was sent for the burst (${answers} answer(s))`);
        } else {
            bad('only one answer was sent for the burst',
                `${answers} answers were emitted for the same question`);
        }

        if (after === before + 1) {
            ok('the question advanced exactly once');
        } else {
            bad('the question advanced exactly once',
                `question went ${before} -> ${after}`);
        }
    }


    section('K. a re-join resumes at the FIRST unanswered question');







    {
        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question 1')`, 'the match room');
        await sleep(1500);



        const payload = makeMatchPayload();
        payload.answeredPositions = [1];
        payload.scores = { [user.userId]: 1, [OPPONENT_ID]: 0 };
        fake.matchOnJoin = payload;
        fake.matchOnQueue = null;



        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);

        const idx = await currentQuestionIndex();
        if (idx === 2) {
            ok('the player resumed at the first UNANSWERED question (Q2)');
        } else {
            bad('the player resumed at the first UNANSWERED question (Q2)',
                `the room shows question ${idx}`);
        }



        const payload2 = makeMatchPayload();
        payload2.answeredPositions = [1, 3];
        payload2.scores = { [user.userId]: 2, [OPPONENT_ID]: 0 };
        fake.matchOnJoin = payload2;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);

        const idx2 = await currentQuestionIndex();
        if (idx2 === 2) {
            ok('the player resumed at the GAP in a non-contiguous answer set (Q2)');
        } else {
            bad('the player resumed at the GAP in a non-contiguous answer set (Q2)',
                `the room shows question ${idx2}`);
        }

        fake.matchOnJoin = null;
    }


    section('L. a recoverable socket error does not disable "Find opponent"');






    {
        await navigate(`${BASE}/play`);
        await waitFor(`document.body.innerText.includes('Find opponent')`, 'the play page');
        await sleep(800);

        fake.matchOnQueue = null;
        fake.queues.length = 0;

        await selectFirstCourse();
        await sleep(300);
        await clickButton('Find opponent');
        await sleep(800);


        io.sockets.sockets.forEach((s) => s.emit('battle:error', {
            message: 'that is not the current question',
            fatal: false,
        }));
        await sleep(1200);

        const btn = await evaluate(`
          (function() {
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            for (var i = 0; i < btns.length; i++) {
              if ((btns[i].innerText || '').indexOf('Find opponent') !== -1) {
                return { found: true, disabled: !!btns[i].disabled };
              }
            }
            return { found: false, disabled: null };
          })()
        `);
        if (btn.found && btn.disabled === false) {
            ok('"Find opponent" is still enabled after a recoverable error');
        } else if (!btn.found) {
            bad('"Find opponent" is still enabled after a recoverable error',
                'the button is not on the page');
        } else {
            bad('"Find opponent" is still enabled after a recoverable error',
                'the button is permanently disabled — the page needs a hard reload');
        }





        fake.matchOnJoin = makeMatchPayload();
        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);

        io.sockets.sockets.forEach((s) => s.emit('battle:error', {
            message: 'that is not the current question',
            fatal: false,
        }));
        await sleep(1500);

        const stillPlaying = await evaluate(`
          (function() {
            var text = document.body.innerText || '';
            return {
              hasQuestion: text.indexOf('Question') !== -1,
              hasTryAgain: /Try again/i.test(text),
              snippet: text.replace(/\\s+/g, ' ').slice(0, 300),
            };
          })()
        `);
        if (stillPlaying.hasQuestion && !stillPlaying.hasTryAgain) {
            ok('a recoverable error inside a match leaves the question on screen');
        } else {
            bad('a recoverable error inside a match leaves the question on screen',
                `question=${stillPlaying.hasQuestion} tryAgain=${stillPlaying.hasTryAgain}\n        ${stillPlaying.snippet}`);
        }
    }


    section('M. the inactivity bar shows the SERVER\'s number, not a local counter');






    {







        const payload = makeMatchPayload();
        payload.inactivitySec = { [user.userId]: 45, [OPPONENT_ID]: 12 };
        fake.matchOnJoin = payload;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);

        const bars = await evaluate(`
          (function() {
            var text = document.body.innerText || '';




            var mine = /Inactivity budget[^0-9]*(\\d+)s\\s*\\/\\s*60s/.exec(text);
            var opp = /Opponent\\s*(\\d+)s/.exec(text);
            return {
              mine: mine ? mine[1] : null,
              opp: opp ? opp[1] : null,
              snippet: text.replace(/\\s+/g, ' ').slice(0, 400),
            };
          })()
`);
        if (bars.mine === '45') {
            ok('the player\'s inactivity bar shows the server\'s number (45s / 60s)');
        } else {
            bad('the player\'s inactivity bar shows the server\'s number (45s / 60s)',
                `got ${bars.mine === null ? 'no match' : bars.mine + 's'}\n        ${bars.snippet}`);
        }
        if (bars.opp === '12') {
            ok('the opponent\'s inactivity bar shows the server\'s number (12s)');
        } else {
            bad('the opponent\'s inactivity bar shows the server\'s number (12s)',
                `got ${bars.opp === null ? 'no match' : bars.opp + 's'}\n        ${bars.snippet}`);
        }

        fake.matchOnJoin = null;
    }


    section('N. clicking an option is refused after the deadline');




    {


        const expired = makeMatchPayload();
        expired.durationMs = 1;
        expired.questions = makeQuestions(MATCH_ID, 3);
        fake.matchOnJoin = expired;
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);

        const answersBefore = fake.answers.length;
        const clicked = await evaluate(`
          (function() {
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            for (var i = 0; i < btns.length; i++) {
              if ((btns[i].innerText || '').indexOf('A1') !== -1) {
                btns[i].click();
                return true;
              }
            }
            return false;
          })()
        `);
        await sleep(1500);

        const emitted = fake.answers.length - answersBefore;
        if (!clicked) {
            bad('an answer past the deadline is not sent', 'no option button was found');
        } else if (emitted === 0) {
            ok('an answer past the deadline is not sent');
        } else {
            bad('an answer past the deadline is not sent',
                `${emitted} answer(s) were emitted after the deadline`);
        }

        fake.matchOnJoin = null;
    }


    section('O. the room asks the server to join ONCE');








    {
        fake.joins.length = 0;
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(4500);




        const joins = fake.joins.length;
        if (joins === 1) {
            ok('the room asked the server to join exactly once');
        } else {
            bad('the room asked the server to join exactly once',
                `${joins} join events were emitted`);
        }





        const idx = await currentQuestionIndex();
        if (idx !== null) {
            ok('a duplicated join did not restart the countdown');
        } else {
            bad('a duplicated join did not restart the countdown',
                'the room is not showing a question');
        }

        fake.matchOnJoin = null;
    }


    section('P. a re-join does NOT hand the player extra time');









    {


        const startedAt = Date.now() - 9 * 60 * 1000;
        const payload = makeMatchPayload();
        payload.startedAt = startedAt;
        payload.durationMs = 10 * 60 * 1000;
        fake.matchOnJoin = payload;
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);



        const elapsed = await evaluate(`
          (function() {
            var m = /(\\d+)s elapsed/.exec(document.body.innerText || '');
            return m ? parseInt(m[1], 10) : null;
          })()
        `);
        if (elapsed !== null && elapsed >= 530) {
            ok(`the elapsed time comes from the server's start time (${elapsed}s)`);
        } else {
            bad("the elapsed time comes from the server's start time",
                `the room shows ${elapsed}s (expected ~540s)`);
        }










        const answersBefore = fake.answers.length;
        await clickOption('A1');
        await sleep(1200);

        const answers = fake.answers.slice(answersBefore);
        if (answers.length === 1 && answers[0].timeSeconds <= 30) {
            ok(`the answer reports the time to answer, not the elapsed match time (${answers[0].timeSeconds}s)`);
        } else {
            bad('the answer reports the time to answer, not the elapsed match time',
                `answers = ${JSON.stringify(answers)}`);
        }

        fake.matchOnJoin = null;
    }


    section('Q. a recoverable error is VISIBLE inside the room');





    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);

        io.sockets.sockets.forEach((s) => s.emit('battle:error', {
            message: 'that is not the current question',
            fatal: false,
        }));
        await sleep(1200);

        const notice = await evaluate(`
          (function() {
            var el = document.querySelector('[role="status"]');
            var text = document.body.innerText || '';
            return {
              hasNotice: !!el,
              noticeText: el ? (el.innerText || '').trim() : null,
              hasQuestion: text.indexOf('Probe question') !== -1,
              hasTryAgain: /Try again/i.test(text),
              snippet: text.replace(/\\s+/g, ' ').slice(0, 300),
            };
          })()
        `);

        if (notice.hasNotice && /not the current question/.test(notice.noticeText || '')) {
            ok('the recoverable error is shown to the player');
        } else {
            bad('the recoverable error is shown to the player',
                `notice = ${JSON.stringify(notice.noticeText)}\n        ${notice.snippet}`);
        }

        if (notice.hasQuestion && !notice.hasTryAgain) {
            ok('the recoverable error did not tear down the question');
        } else {
            bad('the recoverable error did not tear down the question',
                `question=${notice.hasQuestion} tryAgain=${notice.hasTryAgain}\n        ${notice.snippet}`);
        }

        fake.matchOnJoin = null;
    }


    section('R. the "Try again" button actually retries');







    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);


        io.sockets.sockets.forEach((s) => s.emit('battle:error', {
            message: 'The match could not be loaded. Try again.',
        }));
        await sleep(1200);

        const hasTryAgain = await evaluate(`/Try again/i.test(document.body.innerText || '')`);
        if (!hasTryAgain) {
            bad('the "Try again" panel is shown after a fatal error',
                'the panel did not appear');
        } else {
            ok('the "Try again" panel is shown after a fatal error');
        }


        fake.joins.length = 0;
        const clicked = await clickButton('Try again');
        await sleep(1200);

        if (!clicked) {
            bad('the "Try again" button re-asks the server for the briefing',
                'the button was not found');
        } else if (fake.joins.length >= 1) {
            ok(`the "Try again" button re-asks the server for the briefing (${fake.joins.length} join)`);
        } else {
            bad('the "Try again" button re-asks the server for the briefing',
                'the click emitted nothing — the button is dead');
        }

        fake.matchOnJoin = null;
    }


    section('S. leaving the room by navigating away tells the server');







    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);

        fake.leaves.length = 0;









        const navigated = await evaluate(`
          (function() {
            var links = Array.prototype.slice.call(document.querySelectorAll('a[href="/"]'));
            if (!links.length) return false;
            links[0].click();
            return true;
          })()
        `);
        if (!navigated) {
            bad('navigating away from the room emitted battle:leave',
                'no client-side link was found to click');
        }
        await waitFor(`location.pathname !== '/play/match/' + ${JSON.stringify(MATCH_ID)}`, 'the home page', 20000);
        await sleep(1500);

        if (fake.leaves.length >= 1) {
            ok('navigating away from the room emitted battle:leave');
        } else {
            bad('navigating away from the room emitted battle:leave',
                `${fake.leaves.length} leave events — the match keeps running with the player absent`);
        }
    }


    section('T. the answer time is the TIME TO ANSWER, not the elapsed match time');






    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(3000);

        const before = fake.answers.length;
        await clickOption('A1');
        await sleep(1200);

        const answers = fake.answers.slice(before);
        if (answers.length !== 1) {
            bad('the answer reports the time taken to answer',
                `${answers.length} answers were emitted`);
        } else if (answers[0].timeSeconds <= 30) {
            ok(`the answer reports the time taken to answer (${answers[0].timeSeconds}s)`);
        } else {
            bad('the answer reports the time taken to answer',
                `timeSeconds = ${answers[0].timeSeconds} — that is the elapsed MATCH time, not the answer time`);
        }

        fake.matchOnJoin = null;
    }


    section('U. the inactivity bar follows the server, frame by frame');






    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);


        io.sockets.sockets.forEach((s) => s.emit('battle:inactivity', {
            matchId: MATCH_ID,
            inactivitySec: { [user.userId]: 33, [OPPONENT_ID]: 7 },
        }));
        await sleep(1200);

        const bars = await evaluate(`
          (function() {
            var text = document.body.innerText || '';
            var mine = /Inactivity budget[^0-9]*(\\d+)s\\s*\\/\\s*60s/.exec(text);
            var opp = /Opponent\\s*(\\d+)s/.exec(text);
            return {
              mine: mine ? mine[1] : null,
              opp: opp ? opp[1] : null,
            };
          })()
        `);
        if (bars.mine === '33') {
            ok('the inactivity bar follows the server\'s per-second push (33s / 60s)');
        } else {
            bad('the inactivity bar follows the server\'s per-second push (33s / 60s)',
                `got ${bars.mine === null ? 'no match' : bars.mine + 's'}`);
        }
        if (bars.opp === '7') {
            ok('the opponent\'s inactivity bar follows the server too (7s)');
        } else {
            bad('the opponent\'s inactivity bar follows the server too (7s)',
                `got ${bars.opp === null ? 'no match' : bars.opp + 's'}`);
        }

        fake.matchOnJoin = null;
    }


    section('V. the replay page tells the player which side THEY were');









    {


        await db.query(
            `UPDATE public.quiz_battle_matches
                SET status = 'finished', winner = $2, ended_reason = 'completed'
              WHERE id = $1`,
            [MATCH_ID, OPPONENT_ID],
        );

        const qids = await db.query(
            `SELECT id FROM public.quiz_battle_questions
              WHERE match_id = $1 ORDER BY position`,
            [MATCH_ID],
        );
        const [pq1, pq2, pq3] = qids.rows.map((r) => r.id);
        await db.query(
            `DELETE FROM public.quiz_battle_answers WHERE match_id = $1`,
            [MATCH_ID],
        );

        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'A', true, 4)`,
            [MATCH_ID, user.userId, pq1],
        );


        for (const qid of [pq1, pq2, pq3]) {
            await db.query(
                `INSERT INTO public.quiz_battle_answers
                   (match_id, user_id, question_id, selected, is_correct, time_seconds)
                 VALUES ($1, $2, $3, 'A', true, 3)`,
                [MATCH_ID, OPPONENT_ID, qid],
            );
        }

        await navigate(`${BASE}/play/match/${MATCH_ID}/replay`);
        await waitFor(
            `document.body.innerText.includes('Question')`,
            'the replay page',
            20000,
        );
        await sleep(1500);

        const replay = await evaluate(`
          (function() {
            var text = document.body.innerText || '';
            return {
              text: text.replace(/\\s+/g, ' ').slice(0, 1200),
              showsYouWon: /You won/i.test(text),
              showsYouLost: /You lost/i.test(text),
              noAnswerRows: /No answer/i.test(text),
              scoreSection: /You:/.test(text),
            };
          })()
        `);

        if (replay.showsYouLost) {
            ok('the replay page knows the caller LOST (they answered fewer)');
        } else {
            bad('the replay page knows the caller LOST (they answered fewer)',
                `the outcome was not "You lost" — the page said: ${replay.text.slice(0, 200)}`);
        }
        if (replay.showsYouWon) {
            bad('the replay page does NOT tell the loser they won',
                'the page said "You won" — it picked the wrong side');
        } else {
            ok('the replay page does NOT tell the loser they won');
        }
        if (!replay.noAnswerRows) {
            ok('the replay page finds the player\'s own answer (the answers are shaped)');
        } else {
            bad('the replay page finds the player\'s own answer (the answers are shaped)',
                `the page rendered "No answer" — the lookup found nothing: ${replay.text.slice(0, 200)}`);
        }


        const myScore = await evaluate(`
          (function() {
            var m = /You:\\s*(\\d+)/.exec(document.body.innerText || '');
            return m ? parseInt(m[1], 10) : null;
          })()
        `);
        if (myScore === 1) {
            ok('the replay page shows the CALLER\'s score (1), not the opponent\'s (3)');
        } else {
            bad('the replay page shows the CALLER\'s score (1), not the opponent\'s (3)',
                `the "You:" score is ${myScore}`);
        }


        await db.query(
            `UPDATE public.quiz_battle_matches
                SET status = 'in_progress', winner = NULL, ended_reason = NULL
              WHERE id = $1`,
            [MATCH_ID],
        );
        await db.query(`DELETE FROM public.quiz_battle_answers WHERE match_id = $1`, [MATCH_ID]);
    }


    section('W. every answer carries the id of the question on screen');













    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);




        const answersBefore = fake.answers.length;
        for (const opt of ['A1', 'A2', 'A3']) {
            await clickOption(opt);
            await sleep(1200);
        }
        await sleep(800);

        const answers = fake.answers.slice(answersBefore);
        const ids = answers.map((a) => a.questionId);
        const expected = ['q1', 'q2', 'q3'];

        if (ids.length === 3 && ids.every((id, i) => id === expected[i])) {
            ok(`every answer carried the question that was on screen (${ids.join(', ')})`);
        } else {
            bad('every answer carried the question that was on screen',
                `answers = ${JSON.stringify(ids)}, expected ${expected.join(', ')}`);
        }



        const seen = new Set();
        const duplicate = answers.find((a) => {
            if (seen.has(a.questionId)) return true;
            seen.add(a.questionId);
            return false;
        });
        if (!duplicate) {
            ok('no answer re-used a question id the player had already answered');
        } else {
            bad('no answer re-used a question id the player had already answered',
                `the duplicate answer was ${JSON.stringify(duplicate)}`);
        }

        fake.matchOnJoin = null;
    }


    section('X. a recoverable error is cleared once the answer succeeds');




    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);


        io.sockets.sockets.forEach((s) => s.emit('battle:error', {
            message: 'that is not the current question',
            fatal: false,
        }));
        await sleep(1000);

        const shown = await evaluate(`
          (function() {
            var el = document.querySelector('[role="status"]');
            return { hasNotice: !!el, text: el ? (el.innerText || '').trim() : null };
          })()
        `);
        if (shown.hasNotice) ok('the recoverable error is on screen before the answer');
        else bad('the recoverable error is on screen before the answer', JSON.stringify(shown));


        await clickOption('A1');
        await sleep(1500);

        const after = await evaluate(`
          (function() {
            var el = document.querySelector('[role="status"]');
            return { hasNotice: !!el, text: el ? (el.innerText || '').trim() : null };
          })()
        `);
        if (!after.hasNotice) {
            ok('the stale error banner is cleared once the answer succeeds');
        } else {
            bad('the stale error banner is cleared once the answer succeeds',
                `the banner is still there: ${JSON.stringify(after.text)}`);
        }

        fake.matchOnJoin = null;
    }


    section('Y. leaving the room emits battle:leave exactly ONCE');










    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);

        fake.leaves.length = 0;




        await clickButton('Back');
        await sleep(2000);

        const leaves = fake.leaves.slice();
        if (leaves.length === 1) {
            ok('the departure emitted exactly one battle:leave');
        } else if (leaves.length === 0) {
            bad('the departure emitted exactly one battle:leave',
                'no battle:leave was emitted — the match keeps running with the player absent');
        } else {
            bad('the departure emitted exactly one battle:leave',
                `${leaves.length} leave events — the latch did not suppress the duplicate`);
        }

        fake.matchOnJoin = null;
    }


    section('Z. the replay page survives a match with NO questions');




    {

        await db.query(`DELETE FROM public.quiz_battle_questions WHERE match_id = $1`, [MATCH_ID]);

        await navigate(`${BASE}/play/match/${MATCH_ID}/replay`);
        await waitFor(
            `document.body.innerText.includes('Question') || document.body.innerText.includes('no questions')`,
            'the replay page',
            20000,
        );
        await sleep(1500);

        const replay = await evaluate(`
          (function() {
            var text = document.body.innerText || '';
            return {
              hasEmptyState: /no questions to review/i.test(text),
              hasHeader: /Match replay/.test(text),
              text: text.replace(/\\s+/g, ' ').slice(0, 400),
            };
          })()
        `);

        if (replay.hasHeader) {
            ok('the replay page still renders its header with no questions');
        } else {
            bad('the replay page still renders its header with no questions',
                replay.text);
        }

        if (replay.hasEmptyState) {
            ok('the replay page shows an empty state instead of a blank screen');
        } else {
            bad('the replay page shows an empty state instead of a blank screen',
                replay.text);
        }


        for (let i = 1; i <= 3; i += 1) {
            await db.query(
                `INSERT INTO public.quiz_battle_questions
                   (match_id, position, prompt, option_a, option_b, option_c, option_d,
                    correct, explanation, tags, difficulty)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'A', 'because', ARRAY['probe'], 'easy')
                 ON CONFLICT DO NOTHING`,
                [MATCH_ID, i, `Probe question ${i}?`, `A${i}`, `B${i}`, `C${i}`, `D${i}`],
            );
        }
    }


    section('AA. a re-join does NOT reset the elapsed counter to zero');








    {
        const startedAt = Date.now() - 4 * 60 * 1000;
        const payload = makeMatchPayload();
        payload.startedAt = startedAt;
        payload.durationMs = 10 * 60 * 1000;
        fake.matchOnJoin = payload;
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);

        const first = await evaluate(`
          (function() {
            var m = /(\\d+)s elapsed/.exec(document.body.innerText || '');
            return m ? parseInt(m[1], 10) : null;
          })()
        `);
        if (first !== null && first >= 230) {
            ok(`the elapsed counter starts at the server's elapsed time (${first}s)`);
        } else {
            bad('the elapsed counter starts at the server\'s elapsed time',
                `the room shows ${first}s (expected ~240s)`);
        }







        io.sockets.sockets.forEach((s) => s.emit('battle:matched', payload));
        await sleep(4500);

        const second = await evaluate(`
          (function() {
            var m = /(\\d+)s elapsed/.exec(document.body.innerText || '');
            return m ? parseInt(m[1], 10) : null;
          })()
        `);
        if (second !== null && second >= 230) {
            ok(`the re-join did NOT reset the elapsed counter (${second}s)`);
        } else {
            bad('the re-join did NOT reset the elapsed counter',
                `the room shows ${second}s after the re-join (expected ~240s)`);
        }

        fake.matchOnJoin = null;
    }


    section('AB. the answer timer restarts only when a NEW question is shown');











    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);



        const answersBefore = fake.answers.length;
        await clickOption('A1');
        await sleep(1200);
        await clickOption('A2');
        await sleep(1200);



        await sleep(4000);
        await clickOption('A3');
        await sleep(1200);

        const afterLast = fake.answers.slice(answersBefore);
        const lastAnswer = afterLast[afterLast.length - 1];
        if (!lastAnswer) {
            bad('the last question records the time it was on screen',
                'no answer was emitted for the last question');
        } else if (lastAnswer.timeSeconds >= 3) {
            ok(`the last question records the time it was on screen (${lastAnswer.timeSeconds}s)`);
        } else {
            bad('the last question records the time it was on screen',
                `timeSeconds = ${lastAnswer.timeSeconds} — expected >= 3s`);
        }





        await sleep(4000);
        await clickOption('A3');
        await sleep(1200);

        const afterRetry = fake.answers.slice(answersBefore);
        const retry = afterRetry[afterRetry.length - 1];
        if (!retry) {
            bad('a repeat attempt on the last question is timed from the question being shown',
                'no answer was emitted for the repeat attempt');
        } else if (retry.timeSeconds >= 7) {
            ok(`a repeat attempt on the last question is timed from the question being shown (${retry.timeSeconds}s)`);
        } else {
            bad('a repeat attempt on the last question is timed from the question being shown',
                `timeSeconds = ${retry.timeSeconds} — the timer was restarted by the previous answer (expected >= 7s)`);
        }

        fake.matchOnJoin = null;
    }


    section('AC. the rate-limit hint\'s auto-clear timer does not outlive the page');









    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);



        const before = await evaluate(`window.__activeTimeouts || 0`);



        io.sockets.sockets.forEach((s) => s.emit('battle:rate-limit-rejected', {
            action: 'queue',
            retryAfterMs: 4000,
        }));
        await sleep(500);

        const during = await evaluate(`window.__activeTimeouts || 0`);
        if (during > before) {
            ok(`the rate-limit rejection scheduled an auto-clear timer (${before} -> ${during})`);
        } else {
            bad('the rate-limit rejection scheduled an auto-clear timer',
                `the pending timeout count did not grow (${before} -> ${during})`);
        }



        await clickButton('Back');
        await waitFor(`location.pathname === '/play'`, 'the play page', 20000);
        await sleep(800);

        const after = await evaluate(`window.__activeTimeouts || 0`);



        if (after <= before) {
            ok(`the auto-clear timer was cleared on unmount (${before} -> ${after})`);
        } else {
            const stacks = await evaluate(`(window.__timeoutStacks ? window.__timeoutStacks() : [])`);
            const fromHook = stacks.filter((s) => /use-battle-match|rateLimit|onRateLimit/.test(s.stack));
            const shown = (fromHook.length ? fromHook : stacks);
            const detail = shown
                .map((s) => s.stack.split('\n').slice(1, 3).join(' | '))
                .join('\n        ');
            bad('the auto-clear timer was cleared on unmount',
                `the pending timeout count grew from ${before} to ${after}\n        ${detail}`);
        }

        fake.matchOnJoin = null;
    }


    section('AD. being routed into the match room does NOT leave the match');












    {
        const matchPayload = makeMatchPayload();
        fake.matchOnQueue = matchPayload;
        fake.matchOnJoin = matchPayload;
        fake.queues.length = 0;
        fake.joins.length = 0;
        fake.leaves.length = 0;

        await navigate(`${BASE}/play`);
        await waitFor(`document.body.innerText.includes('Find opponent')`, 'the play page');
        await sleep(600);

        await selectFirstCourse();
        await sleep(300);
        await clickButton('Find opponent');



        await waitFor(`location.pathname.startsWith('/play/match/')`, 'the match room', 20000);
        await sleep(2000);

        const leaves = fake.leaves.slice();
        if (leaves.length === 0) {
            ok('being routed into the room did NOT emit battle:leave');
        } else {
            bad('being routed into the room did NOT emit battle:leave',
                `${leaves.length} leave event(s) — the server ends the match and awards the win to the opponent`);
        }

        fake.matchOnQueue = null;
        fake.matchOnJoin = null;
    }


    section('AE. the end reason says WHO ended the match');














    {
        fake.matchOnJoin = makeMatchPayload();
        fake.matchOnQueue = null;

        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room', 20000);
        await sleep(2500);


        io.sockets.sockets.forEach((s) => s.emit('battle:ended', {
            matchId: MATCH_ID,
            winner: user.userId,
            reason: 'inactivity_forfeit',
            scores: { [user.userId]: 5, [OPPONENT_ID]: 1 },
        }));
        await sleep(1500);

        const won = await evaluate('document.body.innerText');
        if (/Opponent forfeited/i.test(won)) {
            ok('a forfeit the opponent caused is reported as the opponent\'s');
        } else {
            bad('a forfeit the opponent caused is reported as the opponent\'s',
                won.slice(0, 300));
        }


        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room (again)', 20000);
        await sleep(2500);

        io.sockets.sockets.forEach((s) => s.emit('battle:ended', {
            matchId: MATCH_ID,
            winner: OPPONENT_ID,
            reason: 'inactivity_forfeit',
            scores: { [user.userId]: 1, [OPPONENT_ID]: 5 },
        }));
        await waitFor(`/You lose/.test(document.body.innerText || '')`, 'the result card', 15000);
        await sleep(500);

        const lost = await evaluate('document.body.innerText');
        if (/You forfeited/i.test(lost)) {
            ok('a forfeit the CALLER caused is reported as the player\'s own');
        } else {
            bad('a forfeit the CALLER caused is reported as the player\'s own',
                `body = ${JSON.stringify(lost.slice(0, 300))}`);
        }


        await navigate(`${BASE}/play/match/${MATCH_ID}`);
        await waitFor(`document.body.innerText.includes('Question')`, 'the match room (third)', 20000);
        await sleep(2500);

        io.sockets.sockets.forEach((s) => s.emit('battle:ended', {
            matchId: MATCH_ID,
            winner: OPPONENT_ID,
            reason: 'player_left',
            scores: { [user.userId]: 1, [OPPONENT_ID]: 5 },
        }));
        await waitFor(`/You lose/.test(document.body.innerText || '')`, 'the result card', 15000);
        await sleep(500);

        const left = await evaluate('document.body.innerText');
        if (/You left/i.test(left)) {
            ok('a match the CALLER left is reported as the player\'s own doing');
        } else {
            bad('a match the CALLER left is reported as the player\'s own doing',
                `body = ${JSON.stringify(left.slice(0, 300))}`);
        }

        fake.matchOnJoin = null;
    }


    section('AF. "Play with a friend" — the modal, the invite and the bell');


    {
        const friendEmail = `playui-friend-${stamp}@example.com`;
        const friend = await createTestUser(friendEmail, password, db);
        const friendCodeRes = await fetch(`${API_BASE}/quiz-battle/friend-code`, {
            headers: { Authorization: `Bearer ${friend.token}` },
        });
        const friendCode = friendCodeRes.ok
            ? (await friendCodeRes.json()).friendCode
            : null;

        if (friendCode && /^\d{8}$/.test(friendCode)) {
            ok(`the friend account has an 8-digit friend code (${friendCode})`);
        } else {
            bad('the friend account has an 8-digit friend code', String(friendCode));
        }

        await navigate(`${BASE}/play`);
        await waitFor(`document.body.innerText.includes('Real-time 1v1 Quiz Battle')`, 'the play page');
        await sleep(800);

        const opened = await clickButton('Play with a friend');
        if (opened) ok('"Play with a friend" opens the modal');
        else bad('"Play with a friend" opens the modal', 'the button was not found');

        await waitFor(
            `!!document.querySelector('#friend-code')`,
            'the invite modal',
        );
        await sleep(600);

        const modalText = await evaluate('document.body.innerText');
        if (modalText.includes('Introduction')) {
            ok('the modal lists the courses in the picker');
        } else {
            bad('the modal lists the courses in the picker', modalText.slice(0, 300));
        }

        const disabledBefore = await evaluate(
            `!!document.querySelector('#friend-code') && document.querySelector('#friend-code').disabled`,
        );
        if (disabledBefore) ok('the friend-code field is disabled until a course is chosen');
        else bad('the friend-code field is disabled until a course is chosen');

        await evaluate(`
          (function() {
            var el = document.querySelector('#friend-code');
            var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, '12ab34cd56ef78');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()
        `);
        await sleep(400);
        const stripped = await evaluate(`document.querySelector('#friend-code').value`);
        if (stripped === '12345678') ok('a non-digit is stripped from the friend code');
        else bad('a non-digit is stripped from the friend code', `value = ${JSON.stringify(stripped)}`);

        networkLog.length = 0;
        const picked = await evaluate(`
          (function() {
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            for (var i = 0; i < btns.length; i++) {
              var t = (btns[i].innerText || '').trim();
              if (t.indexOf('Introduction') !== -1) { btns[i].click(); return true; }
            }
            return false;
          })()
        `);
        if (picked) ok('a course can be picked inside the modal');
        else bad('a course can be picked inside the modal');

        await sleep(400);
        await setInputValue('#friend-code', friendCode || '00000000');
        await sleep(400);

        const sendBtnEnabled = await evaluate(`
          (function() {
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            for (var i = 0; i < btns.length; i++) {
              if ((btns[i].innerText || '').indexOf('Send invitation') !== -1) return !btns[i].disabled;
            }
            return false;
          })()
        `);
        if (sendBtnEnabled) ok('"Send invitation" is enabled once a course and a code are set');
        else bad('"Send invitation" is enabled once a course and a code are set');

        networkLog.length = 0;
        await clickButton('Send invitation');
        await sleep(2500);

        const inviteReq = networkLog.find(
            (r) => r.method === 'POST' && r.url.includes('/quiz-battle/invites'),
        );
        if (inviteReq) {
            ok('submitting the modal issues POST /quiz-battle/invites');
            let body = null;
            try { body = JSON.parse(inviteReq.postData || 'null'); } catch { }
            if (
                body
                && typeof body.courseId === 'string'
                && body.courseId.length === 36
                && body.friendCode === friendCode
            ) {
                ok(`the invite body carries the course and the friend code (${body.courseId})`);
            } else {
                bad('the invite body carries the course and the friend code',
                    `body = ${inviteReq.postData}`);
            }
        } else {
            bad('submitting the modal issues POST /quiz-battle/invites',
                `requests = ${JSON.stringify(networkLog.map((r) => r.method + ' ' + r.url))}`);
        }

        const sentInvite = await db.query(
            `SELECT id FROM public.quiz_battle_invites
              WHERE sender_id = $1 AND invitee_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [user.userId, friend.userId],
        );
        const inviteId = sentInvite.rows[0]?.id;

        if (!inviteId) {
            bad('the invitation row was written for the AF5-AF8 checks');
        }

        await signIn(friendEmail);
        if ((await evaluate('location.pathname')) === '/auth') {
            bad('the browser can sign in as the invitee');
        } else {
            ok('the browser can sign in as the invitee');
        }

        await navigate(`${BASE}/play`);
        await waitFor(`document.body.innerText.includes('Real-time 1v1 Quiz Battle')`, 'the play page');
        await sleep(1500);

        const bellOpened = await openBell();
        if (bellOpened) ok('the notification bell opens');
        else bad('the notification bell opens');

        await waitFor(
            `document.body.innerText.includes('A friend wants to battle')`,
            'the invitation in the bell',
            15000,
        );
        await sleep(500);

        const inviteCard = await evaluate('document.body.innerText');
        if (inviteCard.includes("Let's play")) ok('the invitation shows a "Let\'s play" button');
        else bad('the invitation shows a "Let\'s play" button');
        if (inviteCard.includes('No play')) ok('the invitation shows a "No play" button');
        else bad('the invitation shows a "No play" button');
        if (inviteCard.includes(`playui-${stamp}`)) {
            ok('the invitation names the sender');
        } else {
            bad('the invitation names the sender',
                `the bell text does not contain "playui-${stamp}": ${inviteCard.slice(0, 400)}`);
        }

        networkLog.length = 0;
        await clickButton('No play');
        await sleep(2000);
        const declineReq = networkLog.find(
            (r) => r.method === 'POST' && r.url.includes('/decline'),
        );
        if (declineReq) ok('"No play" issues POST /invites/:id/decline');
        else bad('"No play" issues POST /invites/:id/decline',
            `requests = ${JSON.stringify(networkLog.map((r) => r.method + ' ' + r.url))}`);

        await sleep(1200);
        const afterDecline = await evaluate('document.body.innerText');
        if (!afterDecline.includes("Let's play")) {
            ok('the invitation disappears from the bell after it is declined');
        } else {
            bad('the invitation disappears from the bell after it is declined');
        }

        const declinedRow = await db.query(
            `SELECT status, decline_reason FROM public.quiz_battle_invites WHERE id = $1`,
            [inviteId],
        );
        if (declinedRow.rows[0]?.status === 'declined') {
            ok('the invitation row is declined after "No play"');
        } else {
            bad('the invitation row is declined after "No play"',
                JSON.stringify(declinedRow.rows[0]));
        }

        if (inviteId) {
            await db.query(
                `UPDATE public.quiz_battle_invites
                    SET status = 'pending', decline_reason = NULL, responded_at = NULL
                  WHERE id = $1`,
                [inviteId],
            );
            await db.query(
                `UPDATE public.quiz_battle_invite_notifications SET read_at = NULL
                  WHERE invite_id = $1 AND kind = 'invite'`,
                [inviteId],
            );

            networkLog.length = 0;
            await navigate(`${BASE}/play`);
            await sleep(1500);
            await evaluate(`
              (function() {
                var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
                for (var i = 0; i < btns.length; i++) {
                  if ((btns[i].getAttribute('aria-label') || '') === 'Notifications') {
                    btns[i].click(); return true;
                  }
                }
                return false;
              })()
            `);
            await waitFor(
                `document.body.innerText.includes("Let's play")`,
                'the restored invitation in the bell',
                15000,
            );
            await sleep(500);

            await clickButton("Let's play");
            await sleep(3000);

            const acceptReq = networkLog.find(
                (r) => r.method === 'POST' && r.url.includes('/accept'),
            );
            if (acceptReq) ok('"Let\'s play" issues POST /invites/:id/accept');
            else bad('"Let\'s play" issues POST /invites/:id/accept',
                `requests = ${JSON.stringify(networkLog.map((r) => r.method + ' ' + r.url))}`);

            const stayed = await evaluate('location.pathname');
            if (stayed === '/play' || stayed.startsWith('/play/match/')) {
                ok('a refused accept does not leave the play page in a broken state');
            } else {
                bad('a refused accept does not leave the play page in a broken state', stayed);
            }

            await sleep(1200);
            const gone = await evaluate('document.body.innerText');
            if (!gone.includes("Let's play")) {
                ok('the invitation leaves the bell after a refused accept');
            } else {
                bad('the invitation leaves the bell after a refused accept');
            }
        }

        await navigate(`${BASE}/profile`);
        await waitFor(`document.body.innerText.includes('Profile code')`, 'the profile page');
        await sleep(1500);

        const profileCode = await evaluate(`
          (function() {
            var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
            for (var i = 0; i < inputs.length; i++) {
              var v = inputs[i].value || '';
              if (/^\\d{8}$/.test(v)) return v;
            }
            return null;
          })()
        `);
        if (profileCode) ok(`the profile page shows the 8-digit friend code (${profileCode})`);
        else bad('the profile page shows the 8-digit friend code');

        const hasCopy = await evaluate(`
          (function() {
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            for (var i = 0; i < btns.length; i++) {
              var t = (btns[i].getAttribute('title') || '');
              if (t.indexOf('Copy') !== -1) return true;
            }
            return false;
          })()
        `);
        if (hasCopy) ok('the friend code has a copy button');
        else bad('the friend code has a copy button');

        networkLog.length = 0;
        const changed = await clickButton('Change');
        if (changed) ok('the "Change" button is present on the profile page');
        else bad('the "Change" button is present on the profile page');

        await sleep(2500);
        const regenReq = networkLog.find(
            (r) => r.method === 'POST' && r.url.includes('/friend-code/regenerate'),
        );
        if (regenReq) ok('"Change" issues POST /quiz-battle/friend-code/regenerate');
        else bad('"Change" issues POST /quiz-battle/friend-code/regenerate',
            `requests = ${JSON.stringify(networkLog.map((r) => r.method + ' ' + r.url))}`);

        await sleep(1500);
        const newProfileCode = await evaluate(`
          (function() {
            var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
            for (var i = 0; i < inputs.length; i++) {
              var v = inputs[i].value || '';
              if (/^\\d{8}$/.test(v)) return v;
            }
            return null;
          })()
        `);
        if (newProfileCode && newProfileCode !== profileCode) {
            ok('the displayed friend code changes after "Change"');
        } else {
            bad('the displayed friend code changes after "Change"',
                `${profileCode} -> ${newProfileCode}`);
        }

        const currentCodeRes = await fetch(`${API_BASE}/quiz-battle/friend-code`, {
            headers: { Authorization: `Bearer ${friend.token}` },
        });
        const currentCode = currentCodeRes.ok
            ? (await currentCodeRes.json()).friendCode
            : null;

        await db.query(
            `UPDATE public.quiz_battle_invites
                SET status = 'declined', decline_reason = 'declined', responded_at = now()
              WHERE invitee_id = $1 AND status = 'pending'`,
            [friend.userId],
        );

        const freshInviteRes = currentCode
            ? await fetch(`${API_BASE}/quiz-battle/invites`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`,
                },
                body: JSON.stringify({ courseId: COURSE_ID, friendCode: currentCode }),
            })
            : { ok: false, status: 0, json: async () => null };
        const freshInvite = freshInviteRes.ok ? await freshInviteRes.json() : null;
        if (freshInvite?.inviteId) {
            ok('a fresh invitation was sent for the socket test');
        } else {
            bad('a fresh invitation was sent for the socket test',
                `status ${freshInviteRes.status}`);
        }

        await db.query(
            `DELETE FROM public.quiz_battle_invite_notifications
              WHERE invite_id = $1`,
            [freshInvite?.inviteId],
        );

        await navigate(`${BASE}/play`);
        await waitFor(`document.body.innerText.includes('Real-time 1v1 Quiz Battle')`, 'the play page');
        await sleep(1500);

        await openBell();
        const beforeSocket = await evaluate('document.body.innerText');
        if (!beforeSocket.includes("Let's play")) {
            ok('the bell has no actionable invitation before the socket event');
        } else {
            bad('the bell has no actionable invitation before the socket event',
                beforeSocket.slice(0, 400));
        }

        await db.query(
            `INSERT INTO public.quiz_battle_invite_notifications
               (user_id, invite_id, kind, payload)
             VALUES ($1, $2, 'invite', $3::jsonb)`,
            [
                friend.userId,
                freshInvite?.inviteId,
                JSON.stringify({
                    inviteId: freshInvite?.inviteId,
                    courseId: COURSE_ID,
                    courseName: 'Introduction to C',
                    senderId: user.userId,
                    senderName: 'Probe Friend',
                    senderFriendCode: currentCode,
                    expiresAt: new Date(Date.now() + 600000).toISOString(),
                }),
            ],
        );

        io.sockets.sockets.forEach((s) => s.emit('battle:invite', {
            id: freshInvite?.inviteId || `probe-invite-${stamp}`,
            inviteId: freshInvite?.inviteId || `probe-invite-${stamp}`,
            kind: 'invite',
            payload: {
                inviteId: freshInvite?.inviteId || `probe-invite-${stamp}`,
                courseId: COURSE_ID,
                courseName: 'Introduction to C',
                senderId: user.userId,
                senderName: 'Probe Friend',
                senderFriendCode: currentCode,
                expiresAt: new Date(Date.now() + 600000).toISOString(),
            },
            createdAt: new Date().toISOString(),
        }));

        await sleep(3000);

        await openBell();
        await sleep(800);
        const afterSocket = await evaluate('document.body.innerText');

        if (afterSocket.includes('Battle notifications')) {
            ok('the bell is open after the socket event');
        } else {
            bad('the bell is open after the socket event');
        }

        if (afterSocket.includes('A friend wants to battle')) {
            ok('the battle:invite socket event adds the invitation to the bell (no reload)');
        } else {
            bad('the battle:invite socket event adds the invitation to the bell (no reload)',
                afterSocket.slice(0, 400));
        }
        if (afterSocket.includes("Let's play") && afterSocket.includes('No play')) {
            ok('the socket-driven invitation carries both inline buttons');
        } else {
            bad('the socket-driven invitation carries both inline buttons',
                afterSocket.slice(0, 400));
        }

        const freshIsActionable = await db.query(
            `SELECT status FROM public.quiz_battle_invites WHERE id = $1`,
            [freshInvite?.inviteId],
        );
        if (freshIsActionable.rows[0]?.status === 'pending') {
            ok('the fresh invitation is pending, so the socket event surfaced it');
        } else {
            bad('the fresh invitation is pending, so the socket event surfaced it',
                `status = ${freshIsActionable.rows[0]?.status}`);
        }

        await db.query(
            `DELETE FROM public.quiz_battle_invite_notifications
              WHERE user_id IN ($1, $2)`,
            [user.userId, friend.userId],
        );
        await db.query(
            `DELETE FROM public.quiz_battle_invites
              WHERE sender_id IN ($1, $2) OR invitee_id IN ($1, $2)`,
            [user.userId, friend.userId],
        );
        await db.query(`DELETE FROM public.profiles WHERE id = $1`, [friend.userId]);
    }
} catch (e) {
    bad('the suite ran to completion', e.message);
    console.error(e);
} finally {

    section('Cleanup');
    try {
        if (redirectId) {
            await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: redirectId });
        }
        await db.query('DELETE FROM public.profiles WHERE id = $1', [user.userId]);
        await clearMatch();


        await db.query(
            `DELETE FROM public.quiz_battle_answers
              WHERE match_id IN (
                SELECT id FROM public.quiz_battle_matches
                 WHERE player_one IN (SELECT id FROM public.profiles WHERE email LIKE 'playui-%' OR email LIKE 'dbg%-%')
                    OR player_two IN (SELECT id FROM public.profiles WHERE email LIKE 'playui-%' OR email LIKE 'dbg%-%')
              )`,
        );
        await db.query(
            `DELETE FROM public.quiz_battle_matches
              WHERE player_one IN (SELECT id FROM public.profiles WHERE email LIKE 'playui-%' OR email LIKE 'dbg%-%')
                 OR player_two IN (SELECT id FROM public.profiles WHERE email LIKE 'playui-%' OR email LIKE 'dbg%-%')`,
        );
        await db.query(
            `DELETE FROM public.quiz_battle_profiles
              WHERE user_id IN (SELECT id FROM public.profiles WHERE email LIKE 'playui-%' OR email LIKE 'dbg%-%')`,
        );
        await db.query(
            `DELETE FROM public.profiles WHERE email LIKE 'playui-%' OR email LIKE 'dbg%-%'`,
        );
        const leftover = await db.query(
            `SELECT COUNT(*)::int c FROM public.profiles WHERE email LIKE 'playui-%' OR email LIKE 'dbg%-%'`,
        );
        if (leftover.rows[0].c === 0) ok('no test profiles left behind');
        else bad('no test profiles left behind', `${leftover.rows[0].c} left`);
    } catch (e) {
        bad('cleanup', e.message);
    }
    await db.end();
    io.close();
    httpServer.close();
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  play 1v1 UI suite: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
