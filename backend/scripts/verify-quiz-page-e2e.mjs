


























import 'dotenv/config';
import pg from 'pg';

import { API_BASE, createTestUser, bypassHeaders } from './_testAuth.js';

const WITH_GEMINI = process.argv.includes('--with-gemini');

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const info = (m) => console.log(`  – ${m}`);
const section = (m) => console.log(`\n--- ${m} ---`);

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `quizpage-${stamp}@e2e.local`;
const password = 'QuizPage-2026!';

let userId = null;
let token = null;
const createdSetIds = [];
let createdChatId = null;

async function api(method, path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...bypassHeaders(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {  }
    return { status: res.status, body: parsed, text, contentType: res.headers.get('content-type') };
}


function isIso(v) {
    return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

const SET_KEYS = ['id', 'userId', 'title', 'description', 'sourceType', 'sourceId',
    'questionCount', 'createdAt', 'updatedAt'];
const Q_KEYS = ['id', 'quizSetId', 'userId', 'position', 'prompt', 'optionA', 'optionB',
    'optionC', 'optionD', 'correct', 'explanation', 'tags', 'difficulty', 'createdAt'];

try {
    console.log(`\nQuizzes-page E2E against ${API_BASE}`);

    const user = await createTestUser(email, password, db);
    token = user.token;
    userId = user.userId;
    ok(`test user created (${email})`);


    section('A. create a quiz from COURSE MATERIAL');


    const { rows: courses } = await db.query(
        `SELECT c.id, c.name, c.course_no,
                count(m.id)::int AS material_count
         FROM courses c
         JOIN course_materials m ON m.course_id = c.id
         GROUP BY c.id, c.name, c.course_no
         ORDER BY material_count DESC
         LIMIT 5`,
    );
    if (courses.length === 0) {
        info('no course with materials in the database — skipping the course-source checks');
    } else {
        const course = courses[0];
        ok(`course with materials found: ${course.name} (${course.material_count} materials)`);

        const created = await api('POST', '/quiz/sets', {
            title: 'E2E Course Material Quiz',
            description: 'created by verify-quiz-page-e2e.mjs',
            sourceType: 'course',
            sourceId: course.id,
        });
        if (created.status === 201) ok('POST /quiz/sets (sourceType=course) -> 201');
        else bad('POST /quiz/sets (sourceType=course)', `${created.status} ${created.text.slice(0, 200)}`);

        const set = created.body?.set;
        if (set) {
            createdSetIds.push(set.id);
            if (set.sourceType === 'course') ok('set.sourceType is "course"');
            else bad('set.sourceType is "course"', String(set.sourceType));
            if (set.sourceId === course.id) ok('set.sourceId is the course id');
            else bad('set.sourceId is the course id', String(set.sourceId));
            if (JSON.stringify(Object.keys(set)) === JSON.stringify(SET_KEYS)) {
                ok('set keys match QuizSet');
            } else {
                bad('set keys match QuizSet', JSON.stringify(Object.keys(set)));
            }
        }




        const gen = await api('POST', `/quiz/sets/${set.id}/generate`, {
            sourceType: 'course',
            sourceId: course.id,
            questionCount: 3,
        });
        if (gen.status === 200) {
            ok('POST /quiz/sets/:id/generate (course) -> 200');
            const qs = gen.body?.questions ?? [];
            if (qs.length > 0) ok(`questions generated from course material (${qs.length})`);
            else bad('questions generated from course material', '0 questions');
        } else if (gen.status === 502) {



            ok('course source text collected (Gemini itself failed — 502, not 400)');
            info(gen.text.slice(0, 160));
        } else {
            bad('POST /quiz/sets/:id/generate (course)', `${gen.status} ${gen.text.slice(0, 220)}`);
        }


        if (gen.status === 400 && /too short or unavailable/i.test(gen.text)) {
            bad('course source text was collected', 'collector still returns no text');
        }
    }


    section('B. create a quiz from CHAT HISTORY');


    const chatTitle = `E2E Chat ${stamp}`;
    const chatIns = await api('POST', '/chat', { title: chatTitle });
    let chatId = chatIns.body?.chat?.id ?? chatIns.body?.id ?? null;
    if (!chatId) {
        info('could not create a chat — skipping the chat-source checks');
    } else {
        createdChatId = chatId;
        ok(`chat created (${chatId})`);





        const seeded = await db.query(
            `INSERT INTO chat_agent.messages (chat_id, role, content)
             VALUES ($1, 'user', $2), ($1, 'assistant', $3)
             RETURNING id`,
            [
                chatId,
                'Photosynthesis is the process by which green plants convert light energy into chemical energy stored as glucose. Chlorophyll is the pigment that absorbs light energy in the chloroplasts of plant cells.',
                'Photosynthesis happens in two stages: the light-dependent reactions in the thylakoid membrane, and the Calvin cycle in the stroma, which fixes carbon dioxide into sugar.',
            ],
        );
        ok(`${seeded.rows.length} chat messages seeded`);

        const createdChat = await api('POST', '/quiz/sets', {
            title: 'E2E Chat Quiz',
            sourceType: 'chat',
            sourceId: chatId,
        });
        if (createdChat.status === 201) ok('POST /quiz/sets (sourceType=chat) -> 201');
        else bad('POST /quiz/sets (sourceType=chat)', `${createdChat.status} ${createdChat.text.slice(0, 200)}`);

        const chatSet = createdChat.body?.set;
        if (chatSet) {
            createdSetIds.push(chatSet.id);
            if (chatSet.sourceType === 'chat') ok('set.sourceType is "chat"');
            else bad('set.sourceType is "chat"', String(chatSet.sourceType));
        }

        const genChat = await api('POST', `/quiz/sets/${chatSet.id}/generate`, {
            sourceType: 'chat',
            sourceId: chatId,
            questionCount: 2,
        });
        if (genChat.status === 200) {
            ok('POST /quiz/sets/:id/generate (chat) -> 200');
            if ((genChat.body?.questions ?? []).length > 0) ok('questions generated from chat history');
            else bad('questions generated from chat history', '0 questions');
        } else if (genChat.status === 502) {
            ok('chat source text collected (Gemini itself failed — 502, not 400)');
        } else {
            bad('POST /quiz/sets/:id/generate (chat)', `${genChat.status} ${genChat.text.slice(0, 220)}`);
        }
    }


    section('C. create a quiz from PASTED TEXT');

    const pasted = 'The Pythagorean theorem states that in a right triangle, the square of the length of the hypotenuse equals the sum of the squares of the other two sides. If the two legs measure 3 and 4 units, the hypotenuse measures 5 units. The theorem is named after the Greek mathematician Pythagoras.';
    const createdPaste = await api('POST', '/quiz/sets', {
        title: 'E2E Pasted Text Quiz',
        sourceType: 'manual',
    });
    if (createdPaste.status === 201) ok('POST /quiz/sets (sourceType=manual) -> 201');
    else bad('POST /quiz/sets (sourceType=manual)', `${createdPaste.status} ${createdPaste.text.slice(0, 200)}`);

    const pasteSet = createdPaste.body?.set;
    if (pasteSet) createdSetIds.push(pasteSet.id);

    const genPaste = await api('POST', `/quiz/sets/${pasteSet.id}/generate`, {
        sourceType: 'manual',
        text: pasted,
        questionCount: 2,
    });
    if (genPaste.status === 200) {
        ok('POST /quiz/sets/:id/generate (pasted text) -> 200');
        const qs = genPaste.body?.questions ?? [];
        if (qs.length > 0) ok(`questions generated from pasted text (${qs.length})`);
        else bad('questions generated from pasted text', '0 questions');
    } else if (genPaste.status === 502) {
        ok('pasted-text source collected (Gemini itself failed — 502, not 400)');
    } else {
        bad('POST /quiz/sets/:id/generate (pasted text)', `${genPaste.status} ${genPaste.text.slice(0, 220)}`);
    }


    section('D. create MULTIPLE quizzes and list them');

    const many = [];
    for (let i = 1; i <= 3; i++) {
        const r = await api('POST', '/quiz/sets', {
            title: `E2E Multi Quiz ${i}`,
            sourceType: 'manual',
        });
        if (r.status === 201 && r.body?.set?.id) {
            many.push(r.body.set.id);
            createdSetIds.push(r.body.set.id);
        }
    }
    if (many.length === 3) ok('3 additional quiz sets created');
    else bad('3 additional quiz sets created', `got ${many.length}`);

    const listed = await api('GET', '/quiz/sets?page=1&pageSize=50');
    if (listed.status === 200) ok('GET /quiz/sets -> 200');
    else bad('GET /quiz/sets', `${listed.status} ${listed.text.slice(0, 200)}`);

    const listIds = (listed.body?.sets ?? []).map((s) => s.id);
    const allPresent = many.every((id) => listIds.includes(id));
    if (allPresent) ok('all new sets appear in the list');
    else bad('all new sets appear in the list', `missing ${many.filter((id) => !listIds.includes(id)).length}`);

    const listedSet = (listed.body?.sets ?? [])[0];
    if (listedSet) {
        if (JSON.stringify(Object.keys(listedSet)) === JSON.stringify(SET_KEYS)) {
            ok('listed sets are shaped like QuizSet');
        } else {
            bad('listed sets are shaped like QuizSet', JSON.stringify(Object.keys(listedSet)));
        }
        if (isIso(listedSet.createdAt)) ok('listed set.createdAt is an ISO timestamp');
        else bad('listed set.createdAt is an ISO timestamp', String(listedSet.createdAt));
    }


    section('E. start a quiz, answer, finish');



    const attemptSetId = many[0];
    const seed = await db.query(
        `INSERT INTO quiz_questions
           (quiz_set_id, user_id, position, prompt, option_a, option_b, option_c, option_d,
            correct, explanation, tags, difficulty)
         VALUES
           ($1, $2, 1, 'Which theorem relates the sides of a right triangle?', 'Pythagorean',
            'Euclid', 'Fermat', 'Ceva', 'A', 'a^2 + b^2 = c^2', ARRAY['geometry'], 'easy'),
           ($1, $2, 2, 'What is the hypotenuse when the legs are 3 and 4?', '5', '6', '7', '8', 'B',
            'sqrt(9+16)=5', ARRAY['geometry'], 'medium')
         RETURNING id`,
        [attemptSetId, userId],
    );
    ok(`${seed.rows.length} questions seeded for the attempt test`);
    await db.query(
        `UPDATE quiz_sets SET question_count = (SELECT count(*)::int FROM quiz_questions WHERE quiz_set_id = $1)
         WHERE id = $1`,
        [attemptSetId],
    );

    const started = await api('POST', '/quiz/attempts', { quizSetId: attemptSetId });
    if (started.status === 201) ok('POST /quiz/attempts -> 201');
    else bad('POST /quiz/attempts', `${started.status} ${started.text.slice(0, 200)}`);

    const attempt = started.body?.attempt;
    const attemptQuestions = started.body?.questions ?? [];
    if (attempt?.id) ok('attempt created');
    else bad('attempt created', started.text.slice(0, 200));
    if (attemptQuestions.length === 2) ok('attempt carries its questions');
    else bad('attempt carries its questions', `got ${attemptQuestions.length}`);
    if (attempt && isIso(attempt.startedAt)) ok('attempt.startedAt is an ISO timestamp');
    else bad('attempt.startedAt is an ISO timestamp', String(attempt?.startedAt));


    const a1 = await api('POST', `/quiz/attempts/${attempt.id}/answers`, {
        questionId: attemptQuestions[0].id, selected: 'A', timeSeconds: 5,
    });
    if (a1.status === 201) ok('POST /quiz/attempts/:id/answers -> 201');
    else bad('POST /quiz/attempts/:id/answers', `${a1.status} ${a1.text.slice(0, 200)}`);
    if (a1.body?.isCorrect === true) ok('correct answer graded as correct');
    else bad('correct answer graded as correct', JSON.stringify(a1.body?.isCorrect));


    const dup = await api('POST', `/quiz/attempts/${attempt.id}/answers`, {
        questionId: attemptQuestions[0].id, selected: 'A', timeSeconds: 5,
    });
    if (dup.status === 201) ok('duplicate answer submission is accepted idempotently');
    else bad('duplicate answer submission', `${dup.status} ${dup.text.slice(0, 200)}`);

    const a2 = await api('POST', `/quiz/attempts/${attempt.id}/answers`, {
        questionId: attemptQuestions[1].id, selected: 'C', timeSeconds: 4,
    });
    if (a2.body?.isCorrect === false) ok('wrong answer graded as incorrect');
    else bad('wrong answer graded as incorrect', JSON.stringify(a2.body?.isCorrect));

    const readBack = await api('GET', `/quiz/attempts/${attempt.id}`);
    if ((readBack.body?.answers ?? []).length === 2) ok('attempt carries 2 answers (duplicate did not add one)');
    else bad('attempt carries 2 answers', `got ${(readBack.body?.answers ?? []).length}`);

    const finished = await api('POST', `/quiz/attempts/${attempt.id}/finish`, {
        durationSeconds: 20,
        createSrsDeck: true,
    });
    if (finished.status === 200) ok('POST /quiz/attempts/:id/finish -> 200');
    else bad('POST /quiz/attempts/:id/finish', `${finished.status} ${finished.text.slice(0, 200)}`);
    if (finished.body?.attempt?.finishedAt) ok('attempt.finishedAt is set');
    else bad('attempt.finishedAt is set', JSON.stringify(finished.body?.attempt));
    if (finished.body?.attempt?.score === 50) ok('score is 50 (1 of 2 correct)');
    else bad('score is 50 (1 of 2 correct)', String(finished.body?.attempt?.score));
    if ((finished.body?.wrongQuestions ?? []).length === 1) ok('1 wrong question reported');
    else bad('1 wrong question reported', `got ${(finished.body?.wrongQuestions ?? []).length}`);
    if (finished.body?.srsDeck?.id) ok('SRS deck created from the wrong answers');
    else bad('SRS deck created from the wrong answers', JSON.stringify(finished.body?.srsDeck));


    const refinish = await api('POST', `/quiz/attempts/${attempt.id}/finish`, { durationSeconds: 5 });
    if (refinish.status >= 400) ok('finishing an already-finished attempt is rejected');
    else bad('finishing an already-finished attempt is rejected', `got ${refinish.status}`);

    const attempts = await api('GET', `/quiz/sets/${attemptSetId}/attempts?page=1&pageSize=20`);
    if (attempts.status === 200 && (attempts.body?.attempts ?? []).length >= 1) {
        ok('GET /quiz/sets/:id/attempts lists the attempt');
    } else {
        bad('GET /quiz/sets/:id/attempts', `${attempts.status} ${attempts.text.slice(0, 200)}`);
    }

    const stats = await api('GET', '/quiz/stats');
    if (stats.status === 200) ok('GET /quiz/stats -> 200');
    else bad('GET /quiz/stats', `${stats.status} ${stats.text.slice(0, 200)}`);
    if (stats.body && 'avgScore' in stats.body && 'totalCorrect' in stats.body) {
        ok('user stats use the camelCase keys the frontend expects');
    } else {
        bad('user stats use the camelCase keys the frontend expects', JSON.stringify(stats.body));
    }


    section('F. delete a quiz (the 204 empty-body path)');

    const delTarget = many[1];
    const del = await api('DELETE', `/quiz/sets/${delTarget}`);
    if (del.status === 204) ok('DELETE /quiz/sets/:id -> 204');
    else bad('DELETE /quiz/sets/:id', `${del.status} ${del.text.slice(0, 200)}`);
    if (del.text === '') ok('delete response body is empty (this is what broke res.json())');
    else bad('delete response body is empty', JSON.stringify(del.text.slice(0, 80)));

    const afterDelete = await api('GET', `/quiz/sets/${delTarget}`);
    if (afterDelete.status === 404) ok('deleted set is gone (GET -> 404)');
    else bad('deleted set is gone', `got ${afterDelete.status}`);

    const delAgain = await api('DELETE', `/quiz/sets/${delTarget}`);
    if (delAgain.status === 404) ok('deleting a missing set -> 404');
    else bad('deleting a missing set', `got ${delAgain.status}`);


    section('G. error paths');

    const badId = await api('GET', '/quiz/sets/00000000-0000-4000-8000-000000000000');
    if (badId.status === 404) ok('GET a non-existent set -> 404');
    else bad('GET a non-existent set', `got ${badId.status}`);

    const badUuid = await api('GET', '/quiz/sets/not-a-uuid');
    if (badUuid.status === 400) ok('GET with a malformed uuid -> 400');
    else bad('GET with a malformed uuid', `got ${badUuid.status}`);

    const noTitle = await api('POST', '/quiz/sets', { description: 'no title' });
    if (noTitle.status === 400) ok('POST without a title -> 400 (zod)');
    else bad('POST without a title', `got ${noTitle.status}`);

    const badSource = await api('POST', '/quiz/sets', {
        title: 'bad source', sourceType: 'course', sourceId: 'not-a-uuid',
    });
    if (badSource.status === 400) ok('POST with a malformed sourceId -> 400 (zod)');
    else bad('POST with a malformed sourceId', `got ${badSource.status}`);

    const emptyAttempt = await api('POST', '/quiz/attempts', { quizSetId: many[2] });
    if (emptyAttempt.status === 400) ok('starting an attempt on an empty set -> 400');
    else bad('starting an attempt on an empty set', `got ${emptyAttempt.status}`);

    const anon = await fetch(`${API_BASE}/quiz/sets`, { method: 'GET' });
    if (anon.status === 401) ok('GET /quiz/sets without a token -> 401');
    else bad('GET /quiz/sets without a token', `got ${anon.status}`);


    section('H. live Gemini generation (optional, --with-gemini)');

    if (!WITH_GEMINI) {
        info('skipped (pass --with-gemini to run it)');
    } else {
        const gSet = await api('POST', '/quiz/sets', { title: 'QuizPage Gemini', sourceType: 'manual' });
        const gId = gSet.body?.set?.id;
        if (!gId) {
            bad('create the set for the Gemini run', gSet.text.slice(0, 200));
        } else {
            createdSetIds.push(gId);
            const generated = await api('POST', `/quiz/sets/${gId}/generate`, {
                sourceType: 'manual',
                text: 'Photosynthesis is the process by which green plants convert light energy into chemical energy stored as glucose. Chlorophyll is the pigment that absorbs light. The process occurs in the chloroplasts of plant cells.',
                questionCount: 3,
            });
            if (generated.status === 200) {
                ok('POST /quiz/sets/:id/generate -> 200');
                const gen = generated.body?.questions ?? [];
                if (gen.length === 3) ok('3 questions generated');
                else bad('3 questions generated', `got ${gen.length}`);
                if (JSON.stringify(Object.keys(gen[0] ?? {})) === JSON.stringify(Q_KEYS)) {
                    ok('generated questions match QuizQuestion');
                } else {
                    bad('generated questions match QuizQuestion', JSON.stringify(Object.keys(gen[0] ?? {})));
                }
            } else {
                console.log(`  – Gemini call did not succeed (status ${generated.status}); ` +
                    'not counted as a failure (free-tier quota)');
                console.log(`    ${generated.text.slice(0, 200)}`);
            }
        }
    }
} catch (e) {
    bad('fatal', e.stack || e.message);
} finally {
    console.log('\n--- cleanup ---');
    try {
        for (const id of createdSetIds) {
            await db.query('DELETE FROM public.quiz_sets WHERE id = $1', [id]).catch(() => {});
        }
        if (createdChatId) {
            await db.query('DELETE FROM chat_agent.messages WHERE chat_id = $1', [createdChatId]).catch(() => {});
            await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [createdChatId]).catch(() => {});
        }
        if (userId) await db.query('DELETE FROM public.profiles WHERE id = $1', [userId]);
        console.log('  ✓ test rows removed');
    } catch (e) {
        bad('cleanup', e.message);
    }
    await db.end();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
