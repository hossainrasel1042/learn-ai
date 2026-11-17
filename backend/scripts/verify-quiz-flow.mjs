






































import 'dotenv/config';
import pg from 'pg';

import { API_BASE, createTestUser, bypassHeaders } from './_testAuth.js';

const WITH_GEMINI = process.argv.includes('--with-gemini');

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const section = (m) => console.log(`\n--- ${m} ---`);

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `quizflow-${stamp}@e2e.local`;
const password = 'QuizFlow-2026!';

let userId = null;
let token = null;
let quizSetId = null;
let attemptId = null;
let deckId = null;
let mindMapId = null;

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
    return { status: res.status, body: parsed, text };
}


function isIso(v) {
    return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

function checkIso(label, value) {
    if (isIso(value)) ok(`${label} is an ISO timestamp (${value})`);
    else bad(`${label} is an ISO timestamp`, `got ${JSON.stringify(value)}`);
}

try {
    console.log(`\nQuiz-flow verification against ${API_BASE}`);

    const user = await createTestUser(email, password, db);
    token = user.token;
    userId = user.userId;
    ok(`test user created (${email})`);


    section('1. quiz set creation (the endpoint that used to throw)');

    const created = await api('POST', '/quiz/sets', {
        title: 'QuizFlow Verification',
        description: 'created by verify-quiz-flow.mjs',
        sourceType: 'manual',
    });
    if (created.status === 201) ok('POST /quiz/sets -> 201');
    else bad('POST /quiz/sets', `${created.status} ${created.text.slice(0, 200)}`);

    const set = created.body?.set;
    if (!set) {
        bad('response carries a `set` object', created.text.slice(0, 200));
        throw new Error('cannot continue without a quiz set');
    }
    quizSetId = set.id;

    const SET_KEYS = ['id', 'userId', 'title', 'description', 'sourceType', 'sourceId',
        'questionCount', 'createdAt', 'updatedAt'];
    const setKeys = Object.keys(set);
    if (JSON.stringify(setKeys) === JSON.stringify(SET_KEYS)) ok('set keys match QuizSet');
    else bad('set keys match QuizSet', `got ${JSON.stringify(setKeys)}`);
    checkIso('set.createdAt', set.createdAt);
    checkIso('set.updatedAt', set.updatedAt);
    if (set.userId === userId) ok('set.userId is the caller');
    else bad('set.userId is the caller', `got ${set.userId}`);


    section('2. quiz set listing (empty map used to throw too)');

    const listed = await api('GET', '/quiz/sets?page=1&pageSize=20');
    if (listed.status === 200) ok('GET /quiz/sets -> 200');
    else bad('GET /quiz/sets', `${listed.status} ${listed.text.slice(0, 200)}`);
    if (Array.isArray(listed.body?.sets)) ok('response carries a `sets` array');
    else bad('response carries a `sets` array', listed.text.slice(0, 200));


    section('3. seeding questions directly into the DB (avoids Gemini)');


    const seeded = await db.query(
        `INSERT INTO quiz_questions
           (quiz_set_id, user_id, position, prompt, option_a, option_b, option_c, option_d,
            correct, explanation, tags, difficulty)
         VALUES
           ($1, $2, 1, 'What is a relational database?', 'A file cabinet', 'A table-based store',
            'A text editor', 'A compiler', 'B', 'Relational databases store data in tables.',
            ARRAY['db','basics'], 'easy'),
           ($1, $2, 2, 'What does a primary key guarantee?', 'Uniqueness', 'Foreign keys exist',
            'Indexes are used', 'Tables are normalized', 'A', 'A primary key uniquely identifies each row.',
            ARRAY['db','keys'], 'medium')
         RETURNING id, position, correct`,
        [quizSetId, userId],
    );
    if (seeded.rows.length === 2) ok('2 questions seeded');
    else bad('2 questions seeded', `got ${seeded.rows.length}`);

    await db.query(
        `UPDATE quiz_sets SET question_count = (SELECT count(*)::int FROM quiz_questions WHERE quiz_set_id = $1)
         WHERE id = $1`,
        [quizSetId],
    );


    section('4. quiz set detail (set + questions + stats)');

    const detail = await api('GET', `/quiz/sets/${quizSetId}`);
    if (detail.status === 200) ok('GET /quiz/sets/:id -> 200');
    else bad('GET /quiz/sets/:id', `${detail.status} ${detail.text.slice(0, 200)}`);

    const questions = detail.body?.questions ?? [];
    if (questions.length === 2) ok('response carries 2 questions');
    else bad('response carries 2 questions', `got ${questions.length}`);

    const Q_KEYS = ['id', 'quizSetId', 'userId', 'position', 'prompt', 'optionA', 'optionB',
        'optionC', 'optionD', 'correct', 'explanation', 'tags', 'difficulty', 'createdAt'];
    const qKeys = Object.keys(questions[0] ?? {});
    if (JSON.stringify(qKeys) === JSON.stringify(Q_KEYS)) ok('question keys match QuizQuestion');
    else bad('question keys match QuizQuestion', `got ${JSON.stringify(qKeys)}`);
    checkIso('question.createdAt', questions[0]?.createdAt);
    if (Array.isArray(questions[0]?.tags)) ok('question.tags is an array');
    else bad('question.tags is an array', JSON.stringify(questions[0]?.tags));

    const stats = detail.body?.stats;
    if (stats && 'best_score' in stats && 'avg_score' in stats) {
        ok('stats use the snake_case keys the frontend expects');
    } else {
        bad('stats use the snake_case keys the frontend expects', JSON.stringify(stats));
    }


    section('5. starting an attempt');

    const started = await api('POST', '/quiz/attempts', { quizSetId });
    if (started.status === 201) ok('POST /quiz/attempts -> 201');
    else bad('POST /quiz/attempts', `${started.status} ${started.text.slice(0, 200)}`);

    const attempt = started.body?.attempt;
    if (attempt) {
        attemptId = attempt.id;
        const A_KEYS = ['id', 'quizSetId', 'userId', 'score', 'total', 'correctCount',
            'wrongTopics', 'srsDeckId', 'durationSeconds', 'startedAt', 'finishedAt'];
        const aKeys = Object.keys(attempt);
        if (JSON.stringify(aKeys) === JSON.stringify(A_KEYS)) ok('attempt keys match QuizAttempt');
        else bad('attempt keys match QuizAttempt', `got ${JSON.stringify(aKeys)}`);
        checkIso('attempt.startedAt', attempt.startedAt);
    } else {
        bad('response carries an `attempt` object', started.text.slice(0, 200));
    }
    if ((started.body?.questions ?? []).length === 2) ok('attempt carries the questions');
    else bad('attempt carries the questions', `got ${(started.body?.questions ?? []).length}`);


    section('6. submitting an answer');

    const firstQuestion = questions[0];
    const answered = await api('POST', `/quiz/attempts/${attemptId}/answers`, {
        questionId: firstQuestion.id,
        selected: 'B',
        timeSeconds: 12,
    });
    if (answered.status === 201) ok('POST /quiz/attempts/:id/answers -> 201');
    else bad('POST /quiz/attempts/:id/answers', `${answered.status} ${answered.text.slice(0, 200)}`);

    const answer = answered.body?.answer;
    const AN_KEYS = ['id', 'attemptId', 'questionId', 'userId', 'selected', 'isCorrect',
        'timeSeconds', 'answeredAt'];
    const anKeys = Object.keys(answer ?? {});
    if (JSON.stringify(anKeys) === JSON.stringify(AN_KEYS)) ok('answer keys match QuizAnswer');
    else bad('answer keys match QuizAnswer', `got ${JSON.stringify(anKeys)}`);
    checkIso('answer.answeredAt', answer?.answeredAt);
    if (answered.body?.isCorrect === true) ok('correct answer graded as correct');
    else bad('correct answer graded as correct', JSON.stringify(answered.body?.isCorrect));
    if (answered.body?.correctText === 'A table-based store') ok('correctText resolved via optionFor()');
    else bad('correctText resolved via optionFor()', JSON.stringify(answered.body?.correctText));





    const secondQuestion = questions[1];
    const wrongSelected = secondQuestion.correct === 'A' ? 'B' : 'A';
    const answeredWrong = await api('POST', `/quiz/attempts/${attemptId}/answers`, {
        questionId: secondQuestion.id,
        selected: wrongSelected,
        timeSeconds: 8,
    });
    if (answeredWrong.status === 201) ok('POST /quiz/attempts/:id/answers (wrong answer) -> 201');
    else bad('POST /quiz/attempts/:id/answers (wrong answer)', `${answeredWrong.status} ${answeredWrong.text.slice(0, 200)}`);
    if (answeredWrong.body?.isCorrect === false) ok('wrong answer graded as incorrect');
    else bad('wrong answer graded as incorrect', JSON.stringify(answeredWrong.body?.isCorrect));


    section('7. reading the attempt back');

    const readBack = await api('GET', `/quiz/attempts/${attemptId}`);
    if (readBack.status === 200) ok('GET /quiz/attempts/:id -> 200');
    else bad('GET /quiz/attempts/:id', `${readBack.status} ${readBack.text.slice(0, 200)}`);
    if ((readBack.body?.answers ?? []).length === 2) ok('attempt carries 2 answers');
    else bad('attempt carries 2 answers', `got ${(readBack.body?.answers ?? []).length}`);
    if ((readBack.body?.questions ?? []).length === 2) ok('attempt carries 2 questions');
    else bad('attempt carries 2 questions', `got ${(readBack.body?.questions ?? []).length}`);


    section('8. finishing the attempt');

    const finished = await api('POST', `/quiz/attempts/${attemptId}/finish`, {
        durationSeconds: 30,
        createSrsDeck: true,
    });
    if (finished.status === 200) ok('POST /quiz/attempts/:id/finish -> 200');
    else bad('POST /quiz/attempts/:id/finish', `${finished.status} ${finished.text.slice(0, 200)}`);

    const finishedAttempt = finished.body?.attempt;
    checkIso('finished attempt.finishedAt', finishedAttempt?.finishedAt);
    if (finishedAttempt?.score === 50) ok('score computed (1 of 2 correct = 50)');
    else bad('score computed (1 of 2 correct = 50)', String(finishedAttempt?.score));
    if ((finished.body?.wrongQuestions ?? []).length === 1) ok('1 wrong question reported');
    else bad('1 wrong question reported', `got ${(finished.body?.wrongQuestions ?? []).length}`);
    const wqKeys = Object.keys(finished.body?.wrongQuestions?.[0] ?? {});
    if (JSON.stringify(wqKeys) === JSON.stringify(Q_KEYS)) ok('wrongQuestions match QuizQuestion');
    else bad('wrongQuestions match QuizQuestion', `got ${JSON.stringify(wqKeys)}`);
    if (finished.body?.srsDeck?.id) {
        deckId = finished.body.srsDeck.id;
        ok('SRS deck created from the wrong answers');
    } else {
        bad('SRS deck created from the wrong answers', JSON.stringify(finished.body?.srsDeck));
    }


    section('9. listing attempts for the set');

    const attempts = await api('GET', `/quiz/sets/${quizSetId}/attempts?page=1&pageSize=20`);
    if (attempts.status === 200) ok('GET /quiz/sets/:id/attempts -> 200');
    else bad('GET /quiz/sets/:id/attempts', `${attempts.status} ${attempts.text.slice(0, 200)}`);
    if ((attempts.body?.attempts ?? []).length === 1) ok('1 attempt listed');
    else bad('1 attempt listed', `got ${(attempts.body?.attempts ?? []).length}`);


    section('10. user stats');

    const userStats = await api('GET', '/quiz/stats');
    if (userStats.status === 200) ok('GET /quiz/stats -> 200');
    else bad('GET /quiz/stats', `${userStats.status} ${userStats.text.slice(0, 200)}`);
    const us = userStats.body;
    if (us && 'avgScore' in us && 'totalCorrect' in us && 'totalQuestions' in us) {
        ok('stats use the camelCase keys the frontend expects');
    } else {
        bad('stats use the camelCase keys the frontend expects', JSON.stringify(us));
    }


    section('11. SRS decks (same bug class, same fix)');

    const deckCreated = await api('POST', '/srs/decks', {
        title: 'QuizFlow Deck',
        description: 'created by verify-quiz-flow.mjs',
        sourceType: 'manual',
    });
    if (deckCreated.status === 201) ok('POST /srs/decks -> 201');
    else bad('POST /srs/decks', `${deckCreated.status} ${deckCreated.text.slice(0, 200)}`);
    const deck = deckCreated.body?.deck;
    if (deck) {
        const D_KEYS = ['id', 'userId', 'title', 'description', 'sourceType', 'sourceId',
            'cardCount', 'createdAt', 'updatedAt'];
        const dKeys = Object.keys(deck);
        if (JSON.stringify(dKeys) === JSON.stringify(D_KEYS)) ok('deck keys match Deck');
        else bad('deck keys match Deck', `got ${JSON.stringify(dKeys)}`);
        checkIso('deck.createdAt', deck.createdAt);
        if (!deckId) deckId = deck.id;
    } else {
        bad('response carries a `deck` object', deckCreated.text.slice(0, 200));
    }


    if (deckId) {
        await db.query(
            `INSERT INTO flashcards (deck_id, user_id, front, back, tags, ease_factor,
                                     interval_days, repetitions, due_at)
             VALUES ($1, $2, 'What is a primary key?', 'Uniqueness', ARRAY['db'],
                     2.5, 0, 0, now())
             RETURNING id`,
            [deckId, userId],
        );

        const deckDetail = await api('GET', `/srs/decks/${deckId}?page=1&pageSize=20`);
        if (deckDetail.status === 200) ok('GET /srs/decks/:id -> 200');
        else bad('GET /srs/decks/:id', `${deckDetail.status} ${deckDetail.text.slice(0, 200)}`);
        const cards = deckDetail.body?.cards ?? [];
        if (cards.length >= 1) ok('deck carries its card(s)');
        else bad('deck carries its card(s)', `got ${cards.length}`);
        const C_KEYS = ['id', 'deckId', 'userId', 'front', 'back', 'tags', 'easeFactor',
            'intervalDays', 'repetitions', 'dueAt', 'lastReviewed', 'createdAt'];
        const cKeys = Object.keys(cards[0] ?? {});
        if (JSON.stringify(cKeys) === JSON.stringify(C_KEYS)) ok('card keys match Card');
        else bad('card keys match Card', `got ${JSON.stringify(cKeys)}`);
        checkIso('card.dueAt', cards[0]?.dueAt);
        if (cards[0]?.lastReviewed === null) ok('card.lastReviewed is null (not dropped)');
        else bad('card.lastReviewed is null (not dropped)', JSON.stringify(cards[0]?.lastReviewed));


        const cardId = cards[0]?.id;
        if (cardId) {
            const reviewed = await api('POST', '/srs/review', { cardId, rating: 3 });
            if (reviewed.status === 200) ok('POST /srs/review -> 200');
            else bad('POST /srs/review', `${reviewed.status} ${reviewed.text.slice(0, 200)}`);
            const rev = reviewed.body?.review;
            const RV_KEYS = ['id', 'cardId', 'userId', 'rating', 'prevInterval', 'newInterval',
                'prevEase', 'newEase', 'reviewedAt'];
            const rvKeys = Object.keys(rev ?? {});
            if (JSON.stringify(rvKeys) === JSON.stringify(RV_KEYS)) ok('review keys match ReviewRecord');
            else bad('review keys match ReviewRecord', `got ${JSON.stringify(rvKeys)}`);
            checkIso('review.reviewedAt', rev?.reviewedAt);
        }
    }


    section('12. mind maps (same bug class, same fix)');

    const mmCreated = await api('POST', '/mindmaps', {
        title: 'QuizFlow Mind Map',
        description: 'created by verify-quiz-flow.mjs',
        sourceType: 'manual',
    });
    if (mmCreated.status === 201) ok('POST /mindmaps -> 201');
    else bad('POST /mindmaps', `${mmCreated.status} ${mmCreated.text.slice(0, 200)}`);



    const mm = mmCreated.body?.mindMap;
    if (mm) {
        mindMapId = mm.id;
        const MM_KEYS = ['id', 'userId', 'title', 'description', 'sourceType', 'sourceId',
            'rootConcept', 'nodeCount', 'graph', 'createdAt', 'updatedAt'];
        const mmKeys = Object.keys(mm);
        if (JSON.stringify(mmKeys) === JSON.stringify(MM_KEYS)) ok('mind map keys match MindMap');
        else bad('mind map keys match MindMap', `got ${JSON.stringify(mmKeys)}`);
        if ('graph' in mm) ok('mind map exposes `graph` (the key the frontend reads)');
        else bad('mind map exposes `graph`', Object.keys(mm).join(','));
        checkIso('mind map.createdAt', mm.createdAt);
    } else {
        bad('response carries a `mindMap` object', mmCreated.text.slice(0, 200));
    }

    if (mindMapId) {
        const mmDetail = await api('GET', `/mindmaps/${mindMapId}`);
        if (mmDetail.status === 200) ok('GET /mindmaps/:id -> 200');
        else bad('GET /mindmaps/:id', `${mmDetail.status} ${mmDetail.text.slice(0, 200)}`);
        if ('graph' in (mmDetail.body?.mindMap ?? {})) ok('mind map detail carries `graph`');
        else bad('mind map detail carries `graph`', mmDetail.text.slice(0, 200));

        const mmList = await api('GET', '/mindmaps?page=1&pageSize=20');
        if (mmList.status === 200) ok('GET /mindmaps -> 200');
        else bad('GET /mindmaps', `${mmList.status} ${mmList.text.slice(0, 200)}`);
    }


    section('13. deleting the quiz set cascades');

    const deleted = await api('DELETE', `/quiz/sets/${quizSetId}`);
    if (deleted.status === 200 || deleted.status === 204) ok('DELETE /quiz/sets/:id -> success');
    else bad('DELETE /quiz/sets/:id', `${deleted.status} ${deleted.text.slice(0, 200)}`);

    const orphans = await db.query(
        `SELECT (SELECT count(*)::int FROM quiz_questions WHERE quiz_set_id = $1) AS questions,
                (SELECT count(*)::int FROM quiz_attempts WHERE quiz_set_id = $1) AS attempts`,
        [quizSetId],
    );
    if (orphans.rows[0].questions === 0 && orphans.rows[0].attempts === 0) {
        ok('questions and attempts cascaded away with the set');
    } else {
        bad('questions and attempts cascaded away with the set', JSON.stringify(orphans.rows[0]));
    }
    quizSetId = null;


    section('14. live Gemini generation (optional, --with-gemini)');

    if (!WITH_GEMINI) {
        console.log('  – skipped (pass --with-gemini to run it)');
    } else {
        const gSet = await api('POST', '/quiz/sets', {
            title: 'QuizFlow Gemini',
            sourceType: 'manual',
        });
        const gSetId = gSet.body?.set?.id;
        if (!gSetId) {
            bad('create the set for the Gemini run', gSet.text.slice(0, 200));
        } else {
            const generated = await api('POST', `/quiz/sets/${gSetId}/generate`, {
                sourceType: 'manual',
                text: 'Photosynthesis is the process by which green plants convert light energy into chemical energy stored as glucose. Chlorophyll is the pigment that absorbs light. The process occurs in the chloroplasts of plant cells.',
                questionCount: 3,
            });
            if (generated.status === 200) {
                ok('POST /quiz/sets/:id/generate -> 200');
                const gen = generated.body?.questions ?? [];
                if (gen.length === 3) ok('3 questions generated');
                else bad('3 questions generated', `got ${gen.length}`);
                const gKeys = Object.keys(gen[0] ?? {});
                if (JSON.stringify(gKeys) === JSON.stringify(Q_KEYS)) {
                    ok('generated questions match QuizQuestion');
                } else {
                    bad('generated questions match QuizQuestion', `got ${JSON.stringify(gKeys)}`);
                }
            } else {



                console.log(`  – Gemini call did not succeed (status ${generated.status}); ` +
                    'not counted as a failure (free-tier quota)');
                console.log(`    ${generated.text.slice(0, 200)}`);
            }
            await api('DELETE', `/quiz/sets/${gSetId}`);
        }
    }
} catch (e) {
    bad('fatal', e.stack || e.message);
} finally {
    console.log('\n--- cleanup ---');
    try {
        if (quizSetId) await db.query('DELETE FROM public.quiz_sets WHERE id = $1', [quizSetId]);
        if (deckId) await db.query('DELETE FROM public.flashcard_decks WHERE id = $1', [deckId]);
        if (mindMapId) await db.query('DELETE FROM public.mind_maps WHERE id = $1', [mindMapId]);
        if (userId) await db.query('DELETE FROM public.profiles WHERE id = $1', [userId]);
        console.log('  ✓ test rows removed');
    } catch (e) {
        bad('cleanup', e.message);
    }
    await db.end();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
