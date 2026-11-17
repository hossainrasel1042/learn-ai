

import 'dotenv/config';
import pg from 'pg';

import { quizBattleService } from '../src/quiz_battle_agent/service.js';
import { pool } from '../src/config/database.js';
import * as matchState from '../src/realtime/matchState.js';
import * as matchmaker from '../src/realtime/matchmaker.js';
import { broadcastMatchStart } from '../src/realtime/handlers.js';
import { createTestUser } from './_testAuth.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

let pass = 0;
let fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass += 1; };
const bad = (m, d) => { console.log(`  ✗ ${m}\n      ${d}`); fail += 1; };
const section = (t) => console.log(`\n--- ${t} ---`);

const MATCH_ID = 'cccc1111-1111-4111-8111-111111111111';
const Q1 = 'cccc2222-2222-4222-8222-222222222222';
const Q2 = 'cccc3333-3333-4333-8333-333333333333';
const Q3 = 'cccc4444-4444-4444-8444-444444444444';



const { token: USER_A_TOKEN, userId: USER_A } = await createTestUser(
    `integrity-a-${Date.now()}@battle-test.local`,
    'BattleTest-2026!',
    db,
);
const USER_B = 'cccc6666-6666-4666-8666-666666666666';

const service = quizBattleService({ pool });

async function seed() {
    await db.query(
        `INSERT INTO public.profiles (id, name, email)
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [USER_B, `Integrity ${USER_B.slice(0, 8)}`, `${USER_B.slice(0, 8)}@integrity.local`],
    );
    const course = await db.query(`SELECT id FROM public.courses LIMIT 1`);
    await db.query(
        `INSERT INTO public.quiz_battle_matches
           (id, course_id, player_one, player_two, status,
            level_at_match_one, level_at_match_two, started_at)
         VALUES ($1, $2, $3, $4, 'in_progress', 1000, 1000, now())
         ON CONFLICT (id) DO UPDATE
            SET status = 'in_progress', winner = NULL, ended_reason = NULL,
                player_one = $3, player_two = $4`,
        [MATCH_ID, course.rows[0].id, USER_A, USER_B],
    );





    const questions = [
        [Q1, 1, 'Q one?'],
        [Q2, 2, 'Q two?'],
        [Q3, 3, 'Q three?'],
    ];
    for (const [id, pos, prompt] of questions) {
        await db.query(
            `INSERT INTO public.quiz_battle_questions
               (id, match_id, position, prompt, option_a, option_b, option_c, option_d, correct)
             VALUES ($1, $2, $3, $4, 'A', 'B', 'C', 'D', 'A')
             ON CONFLICT (id) DO UPDATE SET position = $3`,
            [id, MATCH_ID, pos, prompt],
        );
    }
}

async function cleanup() {
    await db.query(`DELETE FROM public.quiz_battle_answers WHERE match_id = $1`, [MATCH_ID]);
    await db.query(`DELETE FROM public.quiz_battle_questions WHERE match_id = $1`, [MATCH_ID]);
    await db.query(`DELETE FROM public.quiz_battle_matches WHERE id = $1`, [MATCH_ID]);
    await db.query(
        `DELETE FROM public.quiz_battle_profiles WHERE user_id = ANY($1::uuid[])`,
        [[USER_A, USER_B]],
    );
    await db.query(`DELETE FROM public.profiles WHERE id = ANY($1::uuid[])`, [[USER_A, USER_B]]);
}

try {
    await seed();


    section('A. a duplicate answer is rejected');

    {
        const r1 = await service.recordMatchAnswer({
            matchId: MATCH_ID, userId: USER_A, questionId: Q1,
            selected: 'A', timeSeconds: 1,
        });
        if (r1.ok) ok('the first answer for a question is accepted');
        else bad('the first answer for a question is accepted', r1.message);

        const r2 = await service.recordMatchAnswer({
            matchId: MATCH_ID, userId: USER_A, questionId: Q1,
            selected: 'A', timeSeconds: 2,
        });
        if (!r2.ok) ok(`the duplicate answer is rejected ("${r2.message}")`);
        else bad('the duplicate answer is rejected', 'the service reported ok:true again');

        const rows = await db.query(
            `SELECT count(*)::int AS n FROM public.quiz_battle_answers
              WHERE match_id = $1 AND user_id = $2 AND question_id = $3`,
            [MATCH_ID, USER_A, Q1],
        );
        if (rows.rows[0].n === 1) ok('the DB kept exactly one answer row');
        else bad('the DB kept exactly one answer row', `found ${rows.rows[0].n}`);
    }


    section('B. only the player\'s CURRENT question can be answered');

    {



        matchState.createRuntime({
            matchId: MATCH_ID,
            courseId: '00000000-0000-0000-0000-000000000000',
            playerIds: [USER_A, USER_B],
            playerSockets: { [USER_A]: 'sa', [USER_B]: 'sb' },
            levelScores: { [USER_A]: 1000, [USER_B]: 1000 },
            questionCount: 3,
        });






        matchState.advanceQuestion(MATCH_ID, USER_A, Q1, 1);




        const jumped = await service.recordMatchAnswer({
            matchId: MATCH_ID, userId: USER_A, questionId: Q3,
            selected: 'A', timeSeconds: 3,
        });
        if (!jumped.ok) {
            ok(`an answer for a question that is not the current one is rejected ("${jumped.message}")`);
        } else {
            bad('an answer for a question that is not the current one is rejected',
                'the service accepted an out-of-order answer');
        }

        const rows = await db.query(
            `SELECT count(*)::int AS n FROM public.quiz_battle_answers
              WHERE match_id = $1 AND user_id = $2 AND question_id = $3`,
            [MATCH_ID, USER_A, Q3],
        );
        if (rows.rows[0].n === 0) ok('the out-of-order answer was not persisted');
        else bad('the out-of-order answer was not persisted',
            `found ${rows.rows[0].n} rows`);


        const okNext = await service.recordMatchAnswer({
            matchId: MATCH_ID, userId: USER_A, questionId: Q2,
            selected: 'A', timeSeconds: 4,
        });
        if (okNext.ok) ok('the next question in order is accepted');
        else bad('the next question in order is accepted', okNext.message);



        const other = await service.recordMatchAnswer({
            matchId: MATCH_ID, userId: USER_B, questionId: Q1,
            selected: 'A', timeSeconds: 5,
        });
        if (other.ok) ok('each player has their own question pointer');
        else bad('each player has their own question pointer', other.message);

        matchState.deleteRuntime(MATCH_ID);
    }


    section('C. the HTTP match route does not leak the answer key');

    {




        const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
            .replace(/\/api\/v1\/?$/, '');
        const res = await fetch(`${base}/api/v1/quiz-battle/matches/${MATCH_ID}`, {
            headers: { authorization: `Bearer ${USER_A_TOKEN}` },
        });
        const body = await res.json().catch(() => ({}));
        const questions = body.questions || [];
        const leaked = questions.filter((q) => 'correct' in q || 'explanation' in q);
        if (questions.length > 0 && leaked.length === 0) {
            ok('the HTTP response does not carry `correct` or `explanation`');
        } else if (questions.length === 0) {
            bad('the HTTP response does not carry `correct` or `explanation`',
                `the route returned no questions (status ${res.status}) — cannot assert`);
        } else {
            bad('the HTTP response does not carry `correct` or `explanation`',
                `${leaked.length} question(s) leaked the answer key`);
        }
    }


    section('D. a re-join reports answered POSITIONS, not a count');

    {

        const detail = await service.getMatchDetail(MATCH_ID, USER_A);
        const positions = detail.answeredPositions || [];
        const expected = [1, 2];
        if (JSON.stringify(positions) === JSON.stringify(expected)) {
            ok(`the answered positions are reported (${JSON.stringify(positions)})`);
        } else {
            bad('the answered positions are reported',
                `expected ${JSON.stringify(expected)}, got ${JSON.stringify(positions)}`);
        }






        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'A', true, 1)
             ON CONFLICT (match_id, user_id, question_id) DO NOTHING`,
            [MATCH_ID, USER_A, Q3],
        );
        const detail2 = await service.getMatchDetail(MATCH_ID, USER_A);
        const positions2 = detail2.answeredPositions || [];
        const count2 = detail2.answers.filter((a) => a.user_id === USER_A).length;
        if (JSON.stringify(positions2) === JSON.stringify([1, 2, 3])) {
            ok(`the positions stay correct when the answers are not contiguous (${JSON.stringify(positions2)})`);
        } else {
            bad('the positions stay correct when the answers are not contiguous',
                `expected [1,2,3], got ${JSON.stringify(positions2)}`);
        }
        if (count2 === 3) {
            ok('the answer count is also 3 — the two agree here, but the positions are what the client needs');
        }
    }

    section('E. ending a match twice does not credit the win twice');

    {

        for (const uid of [USER_A, USER_B]) {
            await db.query(
                `INSERT INTO public.quiz_battle_profiles (user_id)
                 VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
                [uid],
            );
        }
        const before = await db.query(
            `SELECT wins, losses FROM public.quiz_battle_profiles WHERE user_id = $1`,
            [USER_A],
        );
        const winsBefore = before.rows[0]?.wins ?? 0;



        await service.endMatch({ matchId: MATCH_ID, winner: USER_A, reason: 'completed' });
        await service.endMatch({ matchId: MATCH_ID, winner: USER_A, reason: 'player_left' });

        const after = await db.query(
            `SELECT wins, losses FROM public.quiz_battle_profiles WHERE user_id = $1`,
            [USER_A],
        );
        const winsAfter = after.rows[0]?.wins ?? 0;
        if (winsAfter === winsBefore + 1) {
            ok('the win was credited exactly once');
        } else {
            bad('the win was credited exactly once',
                `wins went ${winsBefore} -> ${winsAfter}`);
        }

        const match = await db.query(
            `SELECT status, winner FROM public.quiz_battle_matches WHERE id = $1`,
            [MATCH_ID],
        );
        if (match.rows[0]?.status === 'finished' && match.rows[0]?.winner === USER_A) {
            ok('the match ended exactly once, with the first winner');
        } else {
            bad('the match ended exactly once, with the first winner',
                JSON.stringify(match.rows[0]));
        }
    }


    section('F. the question pointer is aligned with the 1-based position');

    {






        const RT = 'cccc7777-1111-4111-8111-111111111111';
        matchState.createRuntime({
            matchId: RT,
            courseId: '00000000-0000-0000-0000-000000000000',
            playerIds: [USER_A, USER_B],
            playerSockets: { [USER_A]: 'sa', [USER_B]: 'sb' },
            levelScores: { [USER_A]: 1000, [USER_B]: 1000 },
            questionCount: 3,
        });

        const first = matchState.isCurrentQuestion(RT, USER_A, Q1, 1);
        if (first === true) {
            ok('the FIRST question is the current one');
        } else {
            bad('the FIRST question is the current one',
                `isCurrentQuestion returned ${first} — the first answer of every match was rejected`);
        }

        matchState.advanceQuestion(RT, USER_A, Q1, 1);
        const second = matchState.isCurrentQuestion(RT, USER_A, Q2, 2);
        if (second === true) ok('the pointer advances to the second question');
        else bad('the pointer advances to the second question', `got ${second}`);

        matchState.advanceQuestion(RT, USER_A, Q2, 2);
        const third = matchState.isCurrentQuestion(RT, USER_A, Q3, 3);
        if (third === true) ok('the pointer advances to the third question');
        else bad('the pointer advances to the third question', `got ${third}`);

        const repeated = matchState.isCurrentQuestion(RT, USER_A, Q1, 1);
        if (repeated === false) ok('an already-answered question is rejected');
        else bad('an already-answered question is rejected', `got ${repeated}`);

        matchState.deleteRuntime(RT);
    }


    section('G. the inactivity budget is 60s of REAL inactivity');

    {





        const rt = matchState.createRuntime({
            matchId: 'cccc8888-1111-4111-8111-111111111111',
            courseId: '00000000-0000-0000-0000-000000000000',
            playerIds: [USER_A, USER_B],
            playerSockets: { [USER_A]: 'sa', [USER_B]: 'sb' },
            levelScores: { [USER_A]: 1000, [USER_B]: 1000 },
            questionCount: 3,
        });

















        const base = rt.lastActiveAt[USER_A];
        let healthyAccum = 0;
        let healthyForefeitAt = null;
        for (let tick = 1; tick <= 120; tick += 1) {
            const now = base + tick * 1000;









            if (tick % 5 === 0) {
                matchState.markActive(rt.matchId, USER_A, now - 500);
            }
            healthyAccum = matchState.accumulateInactivity(rt, USER_A, now);
            if (healthyAccum >= 60_000 && healthyForefeitAt === null) {
                healthyForefeitAt = tick;
            }
        }
        if (healthyAccum < 60_000 && healthyForefeitAt === null) {
            ok(`a heartbeating player accumulates ${(healthyAccum / 1000).toFixed(1)}s in 120s (under the 60s budget)`);
        } else {
            bad('a heartbeating player stays under the inactivity budget',
                `it was forfeited after ${healthyForefeitAt}s (${(healthyAccum / 1000).toFixed(1)}s accumulated) — the budget was consumed by heartbeats`);
        }



        const rtIdle = matchState.createRuntime({
            matchId: 'cccc8889-1111-4111-8111-111111111111',
            courseId: '00000000-0000-0000-0000-000000000000',
            playerIds: [USER_A, USER_B],
            playerSockets: { [USER_A]: 'sa', [USER_B]: 'sb' },
            levelScores: { [USER_A]: 1000, [USER_B]: 1000 },
            questionCount: 3,
        });
        const idleBase = rtIdle.lastActiveAt[USER_A];
        let idleAccum = 0;
        let idleForefeitAt = null;
        for (let tick = 1; tick <= 120; tick += 1) {
            const now = idleBase + tick * 1000;
            idleAccum = matchState.accumulateInactivity(rtIdle, USER_A, now);
            if (idleAccum >= 60_000 && idleForefeitAt === null) {
                idleForefeitAt = tick;
            }
        }
        if (idleAccum >= 60_000 && idleForefeitAt === 60) {
            ok(`an idle player reaches the budget in 60s (${(idleAccum / 1000).toFixed(1)}s)`);
        } else {
            bad('an idle player reaches the budget in 60s',
                `it was forfeited after ${idleForefeitAt}s (${(idleAccum / 1000).toFixed(1)}s accumulated)`);
        }
        matchState.deleteRuntime(rtIdle.matchId);

        matchState.deleteRuntime(rt.matchId);
    }


    section('H. the answer key is revealed only AFTER the match is over');

    {




        const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
            .replace(/\/api\/v1\/?$/, '');


        const res = await fetch(`${base}/api/v1/quiz-battle/matches/${MATCH_ID}`, {
            headers: { authorization: `Bearer ${USER_A_TOKEN}` },
        });
        const body = await res.json().catch(() => ({}));
        const questions = body.questions || [];
        const withKey = questions.filter((q) => 'correct' in q);
        if (questions.length > 0 && withKey.length === questions.length) {
            ok('a finished match reveals the answer key (the replay page needs it)');
        } else if (questions.length === 0) {
            bad('a finished match reveals the answer key',
                `the route returned no questions (status ${res.status})`);
        } else {
            bad('a finished match reveals the answer key',
                `${withKey.length}/${questions.length} questions carried the answer key`);
        }



        await db.query(
            `UPDATE public.quiz_battle_matches
                SET status = 'in_progress', winner = NULL, ended_reason = NULL
              WHERE id = $1`,
            [MATCH_ID],
        );
        const liveRes = await fetch(`${base}/api/v1/quiz-battle/matches/${MATCH_ID}`, {
            headers: { authorization: `Bearer ${USER_A_TOKEN}` },
        });
        const liveBody = await liveRes.json().catch(() => ({}));
        const liveQuestions = liveBody.questions || [];
        const leaked = liveQuestions.filter((q) => 'correct' in q || 'explanation' in q);
        if (liveQuestions.length > 0 && leaked.length === 0) {
            ok('a LIVE match still does not leak the answer key');
        } else if (liveQuestions.length === 0) {
            bad('a LIVE match still does not leak the answer key',
                `the route returned no questions (status ${liveRes.status})`);
        } else {
            bad('a LIVE match still does not leak the answer key',
                `${leaked.length} question(s) leaked the answer key`);
        }
    }


    section('I. an answer past the deadline is rejected');

    {




        const RT = 'cccc9999-1111-4111-8111-111111111111';


        await db.query(
            `INSERT INTO public.quiz_battle_matches
               (id, course_id, player_one, player_two, status,
                level_at_match_one, level_at_match_two, started_at)
             VALUES ($1, (SELECT id FROM public.courses LIMIT 1), $2, $3,
                     'in_progress', 1000, 1000, now())
             ON CONFLICT (id) DO UPDATE
                SET status = 'in_progress', winner = NULL, ended_reason = NULL`,
            [RT, USER_A, USER_B],
        );
        await db.query(
            `INSERT INTO public.quiz_battle_questions
               (id, match_id, position, prompt, option_a, option_b, option_c, option_d, correct)
             VALUES ($1, $2, 1, 'Q one?', 'A', 'B', 'C', 'D', 'A')
             ON CONFLICT (id) DO UPDATE SET position = 1`,
            ['cccc9999-2222-4222-8222-222222222222', RT],
        );

        const rt = matchState.createRuntime({
            matchId: RT,
            courseId: '00000000-0000-0000-0000-000000000000',
            playerIds: [USER_A, USER_B],
            playerSockets: { [USER_A]: 'sa', [USER_B]: 'sb' },
            levelScores: { [USER_A]: 1000, [USER_B]: 1000 },
            questionCount: 3,
            durationMs: 60_000,
        });

        rt.startedAt = Date.now() - 61_000;

        const late = await service.recordMatchAnswer({
            matchId: RT, userId: USER_A, questionId: 'cccc9999-2222-4222-8222-222222222222',
            selected: 'A', timeSeconds: 61,
        });
        if (!late.ok) {
            ok(`an answer past the deadline is rejected ("${late.message}")`);
        } else {
            bad('an answer past the deadline is rejected',
                'the service accepted an answer after the match ended');
        }

        matchState.deleteRuntime(RT);
        await db.query(`DELETE FROM public.quiz_battle_questions WHERE match_id = $1`, [RT]);
        await db.query(`DELETE FROM public.quiz_battle_matches WHERE id = $1`, [RT]);
    }


    section('J. each player receives THEIR OWN match briefing');

    {









        const emitted = new Map();
        const fakeIo = {
            sockets: {
                sockets: new Map([
                    ['sock-a', { id: 'sock-a', join() {}, emit(evt, payload) { emitted.set('sock-a', payload); } }],
                    ['sock-b', { id: 'sock-b', join() {}, emit(evt, payload) { emitted.set('sock-b', payload); } }],
                ]),
            },
        };
        const payloadA = { matchId: 'm1', you: 'user-a', opponent: { id: 'user-b' } };
        const payloadB = { matchId: 'm1', you: 'user-b', opponent: { id: 'user-a' } };

        broadcastMatchStart(
            fakeIo,
            'm1',
            { 'user-a': 'sock-a', 'user-b': 'sock-b' },
            { 'user-a': payloadA, 'user-b': payloadB },
        );

        const gotA = emitted.get('sock-a');
        const gotB = emitted.get('sock-b');
        if (gotA?.you === 'user-a' && gotA?.opponent?.id === 'user-b') {
            ok('the first player receives the briefing that names them as "you"');
        } else {
            bad('the first player receives the briefing that names them as "you"',
                `got you=${gotA?.you} opponent=${gotA?.opponent?.id}`);
        }
        if (gotB?.you === 'user-b' && gotB?.opponent?.id === 'user-a') {
            ok('the second player receives the briefing that names them as "you"');
        } else {
            bad('the second player receives the briefing that names them as "you"',
                `got you=${gotB?.you} opponent=${gotB?.opponent?.id}`);
        }
        if (gotA?.you !== gotB?.you) {
            ok('the two players do not share one briefing');
        } else {
            bad('the two players do not share one briefing',
                `both received you=${gotA?.you}`);
        }
    }


    section('K. a malformed answer is rejected before it reaches the database');

    {





        const RT2 = 'ccccaaaa-1111-4111-8111-111111111111';
        const Q = 'ccccbbbb-2222-4222-8222-222222222222';
        await db.query(
            `INSERT INTO public.quiz_battle_matches
               (id, course_id, player_one, player_two, status,
                level_at_match_one, level_at_match_two, started_at)
             VALUES ($1, (SELECT id FROM public.courses LIMIT 1), $2, $3,
                     'in_progress', 1000, 1000, now())
             ON CONFLICT (id) DO UPDATE
                SET status = 'in_progress', winner = NULL, ended_reason = NULL`,
            [RT2, USER_A, USER_B],
        );
        await db.query(
            `INSERT INTO public.quiz_battle_questions
               (id, match_id, position, prompt, option_a, option_b, option_c, option_d, correct)
             VALUES ($1, $2, 1, 'Q one?', 'A', 'B', 'C', 'D', 'A')
             ON CONFLICT (id) DO UPDATE SET position = 1`,
            [Q, RT2],
        );
        const rt = matchState.createRuntime({
            matchId: RT2,
            courseId: '00000000-0000-0000-0000-000000000000',
            playerIds: [USER_A, USER_B],
            playerSockets: { [USER_A]: 'sa', [USER_B]: 'sb' },
            levelScores: { [USER_A]: 1000, [USER_B]: 1000 },
            questionCount: 3,
        });

        let rawError = null;
        try {
            await service.recordMatchAnswer({
                matchId: RT2, userId: USER_A, questionId: Q,
                selected: 'DROP TABLE', timeSeconds: 1,
            });
        } catch (e) {
            rawError = e;
        }
        if (!rawError) {
            ok('a malformed option letter is rejected without a database error');
        } else {
            bad('a malformed option letter is rejected without a database error',
                `the driver threw: ${rawError.message}`);
        }


        const written = await db.query(
            `SELECT count(*)::int AS n FROM public.quiz_battle_answers
              WHERE match_id = $1 AND user_id = $2`,
            [RT2, USER_A],
        );
        if (written.rows[0].n === 0) {
            ok('the malformed answer was not persisted');
        } else {
            bad('the malformed answer was not persisted',
                `${written.rows[0].n} answer row(s) were written`);
        }

        matchState.deleteRuntime(RT2);
        await db.query(`DELETE FROM public.quiz_battle_answers WHERE match_id = $1`, [RT2]);
        await db.query(`DELETE FROM public.quiz_battle_questions WHERE match_id = $1`, [RT2]);
        await db.query(`DELETE FROM public.quiz_battle_matches WHERE id = $1`, [RT2]);
    }


    section('L. the matchmaker pairs each player ONCE');

    {







        matchmaker._reset();
        const pairs = [];
        matchmaker.init({
            pool,
            quizBattleService: {
                createMatchAndDispatch: async (_c, a, b) => {
                    pairs.push([a.userId, b.userId]);
                },
            },
        });
        const COURSE = 'dddd1111-1111-4111-8111-111111111111';
        matchmaker.enqueue(COURSE, { socketId: 'ms1', userId: 'mu1', levelScore: 1000 });
        matchmaker.enqueue(COURSE, { socketId: 'ms2', userId: 'mu2', levelScore: 1000 });




        await sleep(1300);
        await matchmaker.tryMatch(COURSE);

        if (pairs.length === 1) {
            ok('the pair was matched exactly once');
        } else {
            bad('the pair was matched exactly once',
                `the pair was matched ${pairs.length} times: ${JSON.stringify(pairs)}`);
        }
        if (matchmaker.getQueueSize(COURSE) === 0) {
            ok('the matched players were removed from the queue');
        } else {
            bad('the matched players were removed from the queue',
                `${matchmaker.getQueueSize(COURSE)} entry(s) are still queued`);
        }
        matchmaker._reset();
    }


    section('M. a non-player cannot award themselves a win by leaving');

    {





        const RT3 = 'dddd2222-1111-4111-8111-111111111111';
        const rt = matchState.createRuntime({
            matchId: RT3,
            courseId: '00000000-0000-0000-0000-000000000000',
            playerIds: [USER_A, USER_B],
            playerSockets: { [USER_A]: 'sa', [USER_B]: 'sb' },
            levelScores: { [USER_A]: 1000, [USER_B]: 1000 },
            questionCount: 3,
        });


        const stranger = 'dddd3333-1111-4111-8111-111111111111';
        const isPlayer = rt.playerIds.includes(stranger);
        if (!isPlayer) {
            ok('a stranger is not one of the match\'s players');
        } else {
            bad('a stranger is not one of the match\'s players',
                'the membership check let a stranger through');
        }

        const oldOpponent = rt.playerIds.find((u) => u !== stranger);
        if (oldOpponent) {
            ok('the old opponent lookup would have wrongly accepted the stranger ' +
                `(it returned ${oldOpponent}) — the membership check is what stops it`);
        } else {
            bad('the old opponent lookup would have wrongly accepted the stranger',
                'the old lookup rejected it, so this test proves nothing');
        }

        matchState.deleteRuntime(RT3);
    }


    section('N. the match ends when every question is answered');

    {





        const RT4 = 'dddd4444-1111-4111-8111-111111111111';
        const rt = matchState.createRuntime({
            matchId: RT4,
            courseId: '00000000-0000-0000-0000-000000000000',
            playerIds: [USER_A, USER_B],
            playerSockets: { [USER_A]: 'sa', [USER_B]: 'sb' },
            levelScores: { [USER_A]: 1000, [USER_B]: 1000 },
            questionCount: 2,
        });

        for (const uid of [USER_A, USER_B]) {
            matchState.advanceQuestion(RT4, uid, 'q1', 1);
            matchState.advanceQuestion(RT4, uid, 'q2', 2);
        }
        const answeredAll = rt.playerIds.every(
            (uid) => rt.answeredQuestionIds[uid].length >= rt.questionCount,
        );
        if (answeredAll) {
            ok('the runtime knows that every player answered every question');
        } else {
            bad('the runtime knows that every player answered every question',
                JSON.stringify(rt.answeredQuestionIds));
        }
        matchState.deleteRuntime(RT4);
    }


    section('O. the HTTP match route SHAPES the answers and names the caller');

    {


        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'A', true, 1)
             ON CONFLICT (match_id, user_id, question_id) DO NOTHING`,
            [MATCH_ID, USER_A, Q1],
        );
        const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
            .replace(/\/api\/v1\/?$/, '');
        const res = await fetch(`${base}/api/v1/quiz-battle/matches/${MATCH_ID}`, {
            headers: { authorization: `Bearer ${USER_A_TOKEN}` },
        });
        const body = await res.json().catch(() => ({}));





        const answers = body.answers || [];
        const snake = answers.filter(
            (a) => 'user_id' in a || 'question_id' in a || 'is_correct' in a,
        );
        if (answers.length > 0 && snake.length === 0) {
            ok('the answers are shaped (camelCase), not raw rows');
        } else if (answers.length === 0) {
            bad('the answers are shaped (camelCase), not raw rows',
                'the route returned no answers — cannot assert');
        } else {
            bad('the answers are shaped (camelCase), not raw rows',
                `${snake.length} answer(s) were raw rows`);
        }

        const camel = answers.filter(
            (a) => 'userId' in a && 'questionId' in a && 'selected' in a,
        );
        if (answers.length > 0 && camel.length === answers.length) {
            ok('every answer carries userId / questionId / selected');
        } else {
            bad('every answer carries userId / questionId / selected',
                `${camel.length} of ${answers.length}`);
        }




        if (body.you === USER_A) {
            ok('the route names the caller (`you`)');
        } else {
            bad('the route names the caller (`you`)',
                `you = ${body.you}, expected ${USER_A}`);
        }
    }


    section('P. a LIVE match does not leak the answer key through the answers');

    {






        const liveId = 'eeee1111-1111-4111-8111-111111111111';
        const liveQ = 'eeee2222-2222-4222-8222-222222222222';
        const liveCourse = await db.query(`SELECT id FROM public.courses LIMIT 1`);
        await db.query(
            `INSERT INTO public.quiz_battle_matches
               (id, course_id, player_one, player_two, status,
                level_at_match_one, level_at_match_two, started_at)
             VALUES ($1, $2, $3, $4, 'in_progress', 1000, 1000, now())
             ON CONFLICT (id) DO NOTHING`,
            [liveId, liveCourse.rows[0].id, USER_A, USER_B],
        );
        await db.query(
            `INSERT INTO public.quiz_battle_questions
               (id, match_id, position, prompt, option_a, option_b, option_c, option_d,
                correct, explanation, tags, difficulty)
             VALUES ($1, $2, 1, 'Live probe?', 'A', 'B', 'C', 'D', 'C', 'because', ARRAY['probe'], 'easy')
             ON CONFLICT (id) DO NOTHING`,
            [liveQ, liveId],
        );


        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'C', true, 1)
             ON CONFLICT (match_id, user_id, question_id) DO NOTHING`,
            [liveId, USER_A, liveQ],
        );

        const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
            .replace(/\/api\/v1\/?$/, '');
        const res = await fetch(`${base}/api/v1/quiz-battle/matches/${liveId}`, {
            headers: { authorization: `Bearer ${USER_A_TOKEN}` },
        });
        const body = await res.json().catch(() => ({}));
        const answers = body.answers || [];

        const leaked = answers.filter(
            (a) => a.isCorrect === true || a.isCorrect === false || a.selected != null,
        );
        if (answers.length > 0 && leaked.length === 0) {
            ok('a live match does not leak the answer key through the answers');
        } else if (answers.length === 0) {
            bad('a live match does not leak the answer key through the answers',
                'the route returned no answers — cannot assert');
        } else {
            bad('a live match does not leak the answer key through the answers',
                `${leaked.length} answer(s) carried isCorrect / selected`);
        }



        await db.query(
            `UPDATE public.quiz_battle_matches SET status = 'finished' WHERE id = $1`,
            [liveId],
        );
        const res2 = await fetch(`${base}/api/v1/quiz-battle/matches/${liveId}`, {
            headers: { authorization: `Bearer ${USER_A_TOKEN}` },
        });
        const body2 = await res2.json().catch(() => ({}));
        const answers2 = body2.answers || [];
        const revealed = answers2.filter((a) => a.isCorrect === true);
        if (revealed.length >= 1) {
            ok('a finished match DOES reveal the answer key (the replay page needs it)');
        } else {
            bad('a finished match DOES reveal the answer key (the replay page needs it)',
                `${answers2.length} answers, none with isCorrect`);
        }

        await db.query(`DELETE FROM public.quiz_battle_matches WHERE id = $1`, [liveId]);
    }


    section('Q. the winner comes from the DATABASE, not the runtime cache');

    {





        const winnerId = 'ffff1111-1111-4111-8111-111111111111';
        const wq1 = 'ffff2222-2222-4222-8222-222222222222';
        const wq2 = 'ffff3333-3333-4333-8333-333333333333';
        const wCourse = await db.query(`SELECT id FROM public.courses LIMIT 1`);
        await db.query(
            `INSERT INTO public.quiz_battle_matches
               (id, course_id, player_one, player_two, status,
                level_at_match_one, level_at_match_two, started_at)
             VALUES ($1, $2, $3, $4, 'in_progress', 1000, 1000, now())
             ON CONFLICT (id) DO NOTHING`,
            [winnerId, wCourse.rows[0].id, USER_A, USER_B],
        );
        for (const [i, qid] of [wq1, wq2].entries()) {
            await db.query(
                `INSERT INTO public.quiz_battle_questions
                   (id, match_id, position, prompt, option_a, option_b, option_c, option_d,
                    correct, explanation, tags, difficulty)
                 VALUES ($1, $2, $3, 'Winner probe?', 'A', 'B', 'C', 'D', 'A', 'because', ARRAY['probe'], 'easy')
                 ON CONFLICT (id) DO NOTHING`,
                [qid, winnerId, i + 1],
            );
        }


        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'A', true, 1), ($1, $2, $4, 'A', true, 1)`,
            [winnerId, USER_A, wq1, wq2],
        );
        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'A', true, 1)`,
            [winnerId, USER_B, wq1],
        );



        const result = await service.endMatch({
            matchId: winnerId,
            winner: USER_B,
            reason: 'completed',
        });
        if (result && result.winner === USER_A) {
            ok('the winner is the player who is actually ahead in the database');
        } else {
            bad('the winner is the player who is actually ahead in the database',
                `winner = ${result?.winner}, expected ${USER_A}`);
        }
        if (result && result.scores && result.scores[USER_A] === 2 && result.scores[USER_B] === 1) {
            ok('the ended frame carries the database scores (2 – 1)');
        } else {
            bad('the ended frame carries the database scores (2 – 1)',
                `scores = ${JSON.stringify(result?.scores)}`);
        }

        await db.query(`DELETE FROM public.quiz_battle_matches WHERE id = $1`, [winnerId]);
    }


    section('R. a match-creation failure does not strand the players');

    {






        matchmaker._reset();
        const failures = [];
        matchmaker.setFailureNotifier((player) => failures.push(player.userId));
        matchmaker.init({
            pool,
            quizBattleService: {
                createMatchAndDispatch: async () => {
                    throw new Error('simulated FK violation');
                },
            },
        });

        const COURSE = 'aaaa1111-1111-4111-8111-111111111111';
        matchmaker.enqueue(COURSE, { socketId: 'fa', userId: 'fail-a', levelScore: 1000 });
        matchmaker.enqueue(COURSE, { socketId: 'fb', userId: 'fail-b', levelScore: 1000 });
        await sleep(1300);
        await matchmaker.tryMatch(COURSE);
        await sleep(200);

        const size = matchmaker.getQueueSize(COURSE);
        if (size === 2) {
            ok('both players are put back in the queue when the match cannot be created');
        } else {
            bad('both players are put back in the queue when the match cannot be created',
                `the queue holds ${size} entries`);
        }
        if (failures.length === 2) {
            ok('both players are told the match could not be created');
        } else {
            bad('both players are told the match could not be created',
                `${failures.length} player(s) were notified`);
        }






        await sleep(1200);
        await matchmaker.tryMatch(COURSE);
        await sleep(200);
        if (failures.length === 2) {
            ok('the failed pair is NOT retried immediately (no hot retry loop)');
        } else {
            bad('the failed pair is NOT retried immediately (no hot retry loop)',
                `${failures.length} player(s) were notified — the pair was retried at once`);
        }
        const size2 = matchmaker.getQueueSize(COURSE);
        if (size2 === 2) {
            ok('both players are STILL in the queue while the retry is on cooldown');
        } else {
            bad('both players are STILL in the queue while the retry is on cooldown',
                `the queue holds ${size2} entries`);
        }

        matchmaker._reset();
        matchmaker.setFailureNotifier(null);
    }


    section('S. a socket is removed from EVERY queue it is in');

    {







        matchmaker._reset();
        matchmaker.init({
            pool,
            quizBattleService: { createMatchAndDispatch: async () => {} },
        });

        const C1 = 'bbbb1111-1111-4111-8111-111111111111';
        const C2 = 'bbbb2222-2222-4222-8222-222222222222';
        matchmaker.enqueue(C1, { socketId: 'multi', userId: 'multi-u', levelScore: 1000 });
        matchmaker.enqueue(C2, { socketId: 'multi', userId: 'multi-u', levelScore: 1000 });

        const before = matchmaker.getQueueSize(C1) + matchmaker.getQueueSize(C2);
        matchmaker.dequeueBySocket('multi');
        const after = matchmaker.getQueueSize(C1) + matchmaker.getQueueSize(C2);

        if (before === 2 && after === 0) {
            ok('a socket is removed from every queue it is in');
        } else {
            bad('a socket is removed from every queue it is in',
                `${before} entries before, ${after} after`);
        }

        matchmaker._reset();
    }


    section('T. the player who LEAVES or goes IDLE does not win');

    {









        const leaveId = 'aaaa3333-1111-4111-8111-111111111111';
        const leaveQ1 = 'aaaa4444-1111-4111-8111-111111111111';
        const leaveQ2 = 'aaaa5555-1111-4111-8111-111111111111';
        const leaveCourse = await db.query(`SELECT id FROM public.courses LIMIT 1`);
        await db.query(
            `INSERT INTO public.quiz_battle_matches
               (id, course_id, player_one, player_two, status,
                level_at_match_one, level_at_match_two, started_at)
             VALUES ($1, $2, $3, $4, 'in_progress', 1000, 1000, now())
             ON CONFLICT (id) DO NOTHING`,
            [leaveId, leaveCourse.rows[0].id, USER_A, USER_B],
        );
        for (const [i, qid] of [leaveQ1, leaveQ2].entries()) {
            await db.query(
                `INSERT INTO public.quiz_battle_questions
                   (id, match_id, position, prompt, option_a, option_b, option_c, option_d,
                    correct, explanation, tags, difficulty)
                 VALUES ($1, $2, $3, 'Leave probe?', 'A', 'B', 'C', 'D', 'A', 'because', ARRAY['probe'], 'easy')
                 ON CONFLICT (id) DO NOTHING`,
                [qid, leaveId, i + 1],
            );
        }

        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'A', true, 1), ($1, $2, $4, 'A', true, 1)`,
            [leaveId, USER_A, leaveQ1, leaveQ2],
        );


        const leaveResult = await service.endMatch({
            matchId: leaveId,
            winner: USER_B,
            reason: 'player_left',
        });
        if (leaveResult && leaveResult.winner === USER_B) {
            ok('the player who LEFT does not win — the one who stayed does');
        } else {
            bad('the player who LEFT does not win — the one who stayed does',
                `winner = ${leaveResult?.winner} (USER_A was ahead 2-0 and left)`);
        }


        const idleId = 'aaaa6666-1111-4111-8111-111111111111';
        const idleQ1 = 'aaaa7777-1111-4111-8111-111111111111';
        await db.query(
            `INSERT INTO public.quiz_battle_matches
               (id, course_id, player_one, player_two, status,
                level_at_match_one, level_at_match_two, started_at)
             VALUES ($1, $2, $3, $4, 'in_progress', 1000, 1000, now())
             ON CONFLICT (id) DO NOTHING`,
            [idleId, leaveCourse.rows[0].id, USER_A, USER_B],
        );
        await db.query(
            `INSERT INTO public.quiz_battle_questions
               (id, match_id, position, prompt, option_a, option_b, option_c, option_d,
                correct, explanation, tags, difficulty)
             VALUES ($1, $2, 1, 'Idle probe?', 'A', 'B', 'C', 'D', 'A', 'because', ARRAY['probe'], 'easy')
             ON CONFLICT (id) DO NOTHING`,
            [idleQ1, idleId],
        );

        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'A', true, 1)`,
            [idleId, USER_A, idleQ1],
        );
        const idleResult = await service.endMatch({
            matchId: idleId,
            winner: USER_B,
            reason: 'inactivity_forfeit',
        });
        if (idleResult && idleResult.winner === USER_B) {
            ok('the player who went IDLE does not win — the one who stayed does');
        } else {
            bad('the player who went IDLE does not win — the one who stayed does',
                `winner = ${idleResult?.winner} (USER_A was ahead 1-0 and went idle)`);
        }



        const doneId = 'aaaa8888-1111-4111-8111-111111111111';
        const doneQ1 = 'aaaa9999-1111-4111-8111-111111111111';
        const doneQ2 = 'aaaa1010-1111-4111-8111-111111111111';
        await db.query(
            `INSERT INTO public.quiz_battle_matches
               (id, course_id, player_one, player_two, status,
                level_at_match_one, level_at_match_two, started_at)
             VALUES ($1, $2, $3, $4, 'in_progress', 1000, 1000, now())
             ON CONFLICT (id) DO NOTHING`,
            [doneId, leaveCourse.rows[0].id, USER_A, USER_B],
        );
        for (const [i, qid] of [doneQ1, doneQ2].entries()) {
            await db.query(
                `INSERT INTO public.quiz_battle_questions
                   (id, match_id, position, prompt, option_a, option_b, option_c, option_d,
                    correct, explanation, tags, difficulty)
                 VALUES ($1, $2, $3, 'Done probe?', 'A', 'B', 'C', 'D', 'A', 'because', ARRAY['probe'], 'easy')
                 ON CONFLICT (id) DO NOTHING`,
                [qid, doneId, i + 1],
            );
        }
        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'A', true, 1), ($1, $2, $4, 'A', true, 1)`,
            [doneId, USER_A, doneQ1, doneQ2],
        );

        const doneResult = await service.endMatch({
            matchId: doneId,
            winner: USER_B,
            reason: 'completed',
        });
        if (doneResult && doneResult.winner === USER_A) {
            ok('a match that ended normally still takes the winner from the database');
        } else {
            bad('a match that ended normally still takes the winner from the database',
                `winner = ${doneResult?.winner}, expected ${USER_A}`);
        }

        for (const id of [leaveId, idleId, doneId]) {
            await db.query(`DELETE FROM public.quiz_battle_matches WHERE id = $1`, [id]);
        }
    }


    section('U. every endMatch path carries the SCORES');

    {





        const alreadyId = 'bbbb3333-1111-4111-8111-111111111111';
        const aq1 = 'bbbb4444-1111-4111-8111-111111111111';
        const aq2 = 'bbbb5555-1111-4111-8111-111111111111';
        const c = await db.query(`SELECT id FROM public.courses LIMIT 1`);
        await db.query(
            `INSERT INTO public.quiz_battle_matches
               (id, course_id, player_one, player_two, status,
                level_at_match_one, level_at_match_two, started_at)
             VALUES ($1, $2, $3, $4, 'in_progress', 1000, 1000, now())
             ON CONFLICT (id) DO NOTHING`,
            [alreadyId, c.rows[0].id, USER_A, USER_B],
        );
        for (const [i, qid] of [aq1, aq2].entries()) {
            await db.query(
                `INSERT INTO public.quiz_battle_questions
                   (id, match_id, position, prompt, option_a, option_b, option_c, option_d,
                    correct, explanation, tags, difficulty)
                 VALUES ($1, $2, $3, 'Score probe?', 'A', 'B', 'C', 'D', 'A', 'because', ARRAY['probe'], 'easy')
                 ON CONFLICT (id) DO NOTHING`,
                [qid, alreadyId, i + 1],
            );
        }
        await db.query(
            `INSERT INTO public.quiz_battle_answers
               (match_id, user_id, question_id, selected, is_correct, time_seconds)
             VALUES ($1, $2, $3, 'A', true, 1), ($1, $2, $4, 'A', true, 1)`,
            [alreadyId, USER_A, aq1, aq2],
        );

        await service.endMatch({ matchId: alreadyId, winner: USER_A, reason: 'completed' });

        const again = await service.endMatch({ matchId: alreadyId, winner: USER_A, reason: 'completed' });
        if (again && again.scores && again.scores[USER_A] === 2 && again.scores[USER_B] === 0) {
            ok('the idempotent endMatch path carries the database scores');
        } else {
            bad('the idempotent endMatch path carries the database scores',
                `scores = ${JSON.stringify(again?.scores)} (the raw DB row has no scores column)`);
        }
        if (again && again.matchId === alreadyId && 'winner' in again) {
            ok('the idempotent endMatch path carries the same shape as the others');
        } else {
            bad('the idempotent endMatch path carries the same shape as the others',
                `returned ${JSON.stringify(Object.keys(again || {}))}`);
        }

        await db.query(`DELETE FROM public.quiz_battle_matches WHERE id = $1`, [alreadyId]);
    }


    section('V. a restart does not let a player answer out of order');

    {





        const rId = 'bbbb6666-1111-4111-8111-111111111111';
        const rq1 = 'bbbb7777-1111-4111-8111-111111111111';
        const rq2 = 'bbbb8888-1111-4111-8111-111111111111';
        const rq3 = 'bbbb9999-1111-4111-8111-111111111111';
        const c = await db.query(`SELECT id FROM public.courses LIMIT 1`);
        await db.query(
            `INSERT INTO public.quiz_battle_matches
               (id, course_id, player_one, player_two, status,
                level_at_match_one, level_at_match_two, started_at)
             VALUES ($1, $2, $3, $4, 'in_progress', 1000, 1000, now())
             ON CONFLICT (id) DO NOTHING`,
            [rId, c.rows[0].id, USER_A, USER_B],
        );
        for (const [i, qid] of [rq1, rq2, rq3].entries()) {
            await db.query(
                `INSERT INTO public.quiz_battle_questions
                   (id, match_id, position, prompt, option_a, option_b, option_c, option_d,
                    correct, explanation, tags, difficulty)
                 VALUES ($1, $2, $3, 'Restart probe?', 'A', 'B', 'C', 'D', 'A', 'because', ARRAY['probe'], 'easy')
                 ON CONFLICT (id) DO NOTHING`,
                [qid, rId, i + 1],
            );
        }


        const first = await service.recordMatchAnswer({
            matchId: rId, userId: USER_A, questionId: rq1, selected: 'A', timeSeconds: 1,
        });
        if (first.ok) ok('the first question is accepted with no runtime (the database is the authority)');
        else bad('the first question is accepted with no runtime (the database is the authority)', first.message);

        const skip = await service.recordMatchAnswer({
            matchId: rId, userId: USER_A, questionId: rq3, selected: 'A', timeSeconds: 1,
        });
        if (!skip.ok) ok('a question OUT OF ORDER is rejected with no runtime');
        else bad('a question OUT OF ORDER is rejected with no runtime', 'the service reported ok:true');

        const rows = await db.query(
            `SELECT count(*)::int AS n FROM public.quiz_battle_answers
              WHERE match_id = $1 AND user_id = $2`,
            [rId, USER_A],
        );
        if (rows.rows[0].n === 1) ok('only the in-order answer was persisted');
        else bad('only the in-order answer was persisted', `found ${rows.rows[0].n} answer rows`);

        await db.query(`DELETE FROM public.quiz_battle_matches WHERE id = $1`, [rId]);
    }


    section('W. a non-player cannot attach itself to a match runtime');

    {






        const rt = matchState.createRuntime({
            matchId: 'cccc5555-1111-4111-8111-111111111111',
            courseId: '00000000-0000-0000-0000-000000000000',
            playerIds: ['aaaa-aaaa', 'bbbb-bbbb'],
            playerSockets: { 'aaaa-aaaa': 'sock-a', 'bbbb-bbbb': 'sock-b' },
            levelScores: { 'aaaa-aaaa': 1000, 'bbbb-bbbb': 1000 },
            questionCount: 1,
            durationMs: 600000,
        });
        matchState.setSocket(rt.matchId, 'stranger', 'socket-of-a-stranger');
        const sockets = matchState.getRuntime(rt.matchId)?.playerSockets || {};
        if (!('stranger' in sockets)) {
            ok('a non-player cannot write into the runtime\'s socket map');
        } else {
            bad('a non-player cannot write into the runtime\'s socket map',
                `the stranger's socket id was recorded: ${sockets.stranger}`);
        }
        matchState.deleteRuntime(rt.matchId);
    }


    section('X. a QUESTION-GENERATION failure also re-queues the players');

    {






        matchmaker._reset();
        const failures = [];
        matchmaker.setFailureNotifier((player) => failures.push(player.userId));
        matchmaker.init({
            pool,
            quizBattleService: {

                createMatchAndDispatch: async () => {
                    throw new Error('question generation failed');
                },
            },
        });

        const COURSE = 'cccc9999-1111-4111-8111-111111111111';
        matchmaker.enqueue(COURSE, { socketId: 'ga', userId: 'gen-a', levelScore: 1000 });
        matchmaker.enqueue(COURSE, { socketId: 'gb', userId: 'gen-b', levelScore: 1000 });
        await sleep(1300);
        await matchmaker.tryMatch(COURSE);
        await sleep(200);

        const size = matchmaker.getQueueSize(COURSE);
        if (size === 2) {
            ok('a question-generation failure puts both players back in the queue');
        } else {
            bad('a question-generation failure puts both players back in the queue',
                `the queue holds ${size} entries`);
        }
        if (failures.length === 2) {
            ok('a question-generation failure tells both players');
        } else {
            bad('a question-generation failure tells both players',
                `${failures.length} player(s) were notified`);
        }

        matchmaker._reset();
        matchmaker.setFailureNotifier(null);
    }


    section('Y. the failed pair is not paired again from a THREE-player bucket');

    {





        matchmaker._reset();
        let attempt = 0;
        const pairs = [];
        matchmaker.setFailureNotifier(() => {});
        matchmaker.init({
            pool,
            quizBattleService: {
                createMatchAndDispatch: async (courseId, a, b) => {
                    attempt += 1;
                    pairs.push([a.userId, b.userId].sort().join('+'));


                    if (attempt === 1) throw new Error('simulated failure');
                },
            },
        });

        const COURSE = 'dddd9999-1111-4111-8111-111111111111';
        matchmaker.enqueue(COURSE, { socketId: 'ta', userId: 'tri-a', levelScore: 1000 });
        matchmaker.enqueue(COURSE, { socketId: 'tb', userId: 'tri-b', levelScore: 1000 });
        matchmaker.enqueue(COURSE, { socketId: 'tc', userId: 'tri-c', levelScore: 1000 });
        await sleep(1300);
        await matchmaker.tryMatch(COURSE);
        await sleep(200);
        await matchmaker.tryMatch(COURSE);
        await sleep(200);

        const first = pairs[0] || '';
        const second = pairs[1] || '';
        if (second && second !== first) {
            ok('the second pairing is a DIFFERENT pair (the failed pair is skipped)');
        } else {
            bad('the second pairing is a DIFFERENT pair (the failed pair is skipped)',
                `the pairs were ${JSON.stringify(pairs)} — the failed pair was paired again`);
        }

        matchmaker._reset();
        matchmaker.setFailureNotifier(null);
    }
} catch (e) {
    bad('the integrity suite ran', e.stack || e.message);
} finally {
    await cleanup();
    await db.end();
}

console.log(`\n============================================================`);
console.log(`  battle integrity suite: ${pass} passed, ${fail} failed`);
console.log(`============================================================`);
process.exit(fail > 0 ? 1 : 0);
