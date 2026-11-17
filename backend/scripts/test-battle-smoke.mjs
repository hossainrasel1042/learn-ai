




import 'dotenv/config';
import pg from 'pg';

const dbUrl = process.env.DB_URL;
if (!dbUrl) { console.error('DB_URL env var not set'); process.exit(1); }

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

let passed = 0;
let failed = 0;
const ok  = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

console.log('\n--- HTTP smoke (assumes backend on :8000 with admin.jar cookie) ---');

const token = process.env.ADMIN_TOKEN;
if (token) {
    const profileRes = await fetch('http://localhost:8000/api/v1/quiz-battle/profile', {
        headers: { cookie: `sb-access-token=${token}` },
    });
    if (profileRes.ok) {
        const body = await profileRes.json();
        if (body.profile?.userId) {
            ok(`profile: userId=${body.profile.userId.slice(0,8)} level=${body.profile.levelScore} tier=${body.profile.tier}`);
        } else {
            bad('profile: missing userId');
        }
    } else {
        bad('profile endpoint', `${profileRes.status}`);
    }
} else {
    console.log('  · profile: skipped (no ADMIN_TOKEN env var)');
}

console.log('\n--- DB smoke ---');


await client.query(
    `DELETE FROM public.quiz_battle_answers WHERE match_id IN (
        SELECT id FROM public.quiz_battle_matches
        WHERE course_id = (SELECT id FROM public.courses WHERE course_no='BATTLE-101' LIMIT 1))`,
).catch(() => {});
await client.query(
    `DELETE FROM public.quiz_battle_questions WHERE match_id IN (
        SELECT id FROM public.quiz_battle_matches
        WHERE course_id = (SELECT id FROM public.courses WHERE course_no='BATTLE-101' LIMIT 1))`,
).catch(() => {});
await client.query(
    `DELETE FROM public.quiz_battle_matches WHERE course_id = (
        SELECT id FROM public.courses WHERE course_no='BATTLE-101' LIMIT 1)`,
).catch(() => {});


const courseRes = await client.query(`SELECT id FROM public.courses WHERE course_no='BATTLE-101' LIMIT 1`);
const courseId = courseRes.rows[0]?.id;
if (!courseId) { bad('seed: BATTLE-101 course missing'); process.exit(2); }

const usersRes = await client.query(`SELECT id FROM auth.users LIMIT 2`);
const users = usersRes.rows;
if (users.length < 2) { bad(`seed: need ≥2 auth.users rows (got ${users.length})`); process.exit(2); }
const [p1, p2] = users;
ok(`picked players ${p1.id.slice(0,8)} / ${p2.id.slice(0,8)}`);


await client.query(
    `INSERT INTO public.quiz_battle_profiles (user_id) VALUES ($1), ($2) ON CONFLICT DO NOTHING`,
    [p1.id, p2.id],
);
await client.query(
    `UPDATE public.quiz_battle_profiles SET wins=0, losses=0, draws=0, level_score=1000 WHERE user_id IN ($1, $2)`,
    [p1.id, p2.id],
);
ok('seeded both profiles');


const matchRes = await client.query(
    `INSERT INTO public.quiz_battle_matches (course_id, player_one, player_two, status, level_at_match_one, level_at_match_two, started_at)
     VALUES ($1, $2, $3, 'in_progress', 1000, 1000, now())
     RETURNING id`,
    [courseId, p1.id, p2.id],
);
const matchId = matchRes.rows[0].id;
ok(`created match ${matchId.slice(0,8)}`);


const qRows = [];
for (let i = 1; i <= 3; i++) {
    const r = await client.query(
        `INSERT INTO public.quiz_battle_questions
           (match_id, position, prompt, option_a, option_b, option_c, option_d, correct, explanation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'A', 'explanation')
         RETURNING id`,
        [matchId, i, `Question ${i}`, 'A-text', 'B-text', 'C-text', 'D-text'],
    );
    qRows.push(r.rows[0]);
}
ok('inserted 3 questions');


for (const q of qRows) {
    await client.query(
        `INSERT INTO public.quiz_battle_answers (match_id, user_id, question_id, selected, is_correct, time_seconds)
         VALUES ($1, $2, $3, 'A', true, 5)`,
        [matchId, p1.id, q.id],
    );
}
ok('player1 answered all 3 correctly');


await client.query(
    `INSERT INTO public.quiz_battle_answers (match_id, user_id, question_id, selected, is_correct, time_seconds)
     VALUES ($1, $2, $3, 'A', true, 5)`,
    [matchId, p2.id, qRows[0].id],
);
ok('player2 answered 1 correctly');


await client.query(
    `UPDATE public.quiz_battle_matches
        SET status='finished', winner=$2, ended_reason='completed', finished_at=now()
      WHERE id=$1`,
    [matchId, p1.id],
);
ok('finalized match (p1 wins)');


await client.query(
    `UPDATE public.quiz_battle_profiles
        SET wins=wins+1, level_score=GREATEST(level_score+20, 0), last_match_at=now()
      WHERE user_id=$1`,
    [p1.id],
);
await client.query(
    `UPDATE public.quiz_battle_profiles
        SET losses=losses+1, level_score=GREATEST(level_score-15, 0), last_match_at=now()
      WHERE user_id=$1`,
    [p2.id],
);
ok('applied profile stats (+20 win, -15 loss)');


const ver = await client.query(
    `SELECT user_id, wins, losses, draws, level_score FROM public.quiz_battle_profiles WHERE user_id IN ($1, $2) ORDER BY user_id`,
    [p1.id, p2.id],
);
const p1row = ver.rows.find((r) => r.user_id === p1.id);
const p2row = ver.rows.find((r) => r.user_id === p2.id);
console.log(`  · ${p1.id.slice(0,8)}: wins=${p1row.wins} losses=${p1row.losses} level=${p1row.level_score}`);
console.log(`  · ${p2.id.slice(0,8)}: wins=${p2row.wins} losses=${p2row.losses} level=${p2row.level_score}`);
if (p1row.wins === 1 && p1row.level_score === 1020) ok('p1 stats correct');
else bad('p1 stats', `got wins=${p1row.wins} level=${p1row.level_score}`);
if (p2row.losses === 1 && p2row.level_score === 985) ok('p2 stats correct');
else bad('p2 stats', `got losses=${p2row.losses} level=${p2row.level_score}`);


if (token) {
    const detailRes = await fetch(`http://localhost:8000/api/v1/quiz-battle/matches/${matchId}`, {
        headers: { cookie: `sb-access-token=${token}` },
    });
    if (detailRes.ok) {
        const detail = await detailRes.json();
        if (detail.match?.winner === p1.id) ok('HTTP /matches/:id winner correct');
        else bad('HTTP /matches/:id winner', JSON.stringify(detail.match?.winner));
        if (detail.scores?.[p1.id] === 3 && detail.scores?.[p2.id] === 1) ok('HTTP /matches/:id scores correct');
        else bad('HTTP /matches/:id scores', JSON.stringify(detail.scores));
        if (detail.questions?.length === 3) ok('HTTP /matches/:id returns 3 questions');
        else bad('HTTP /matches/:id question count', `${detail.questions?.length}`);
    } else {
        bad('HTTP /matches/:id', `${detailRes.status}`);
    }
}


console.log('\n--- Inactivity forfeit simulation ---');
const fmatchRes = await client.query(
    `INSERT INTO public.quiz_battle_matches (course_id, player_one, player_two, status, level_at_match_one, level_at_match_two, started_at)
     VALUES ($1, $2, $3, 'in_progress', 1000, 1000, now())
     RETURNING id`,
    [courseId, p1.id, p2.id],
);
const fmatchId = fmatchRes.rows[0].id;


await client.query(
    `UPDATE public.quiz_battle_matches
        SET status='finished', winner=$2, ended_reason='inactivity_forfeit', finished_at=now()
      WHERE id=$1`,
    [fmatchId, p2.id],
);
ok('applied inactivity_forfeit (p2 wins, p1 forfeits)');

await client.query(
    `UPDATE public.quiz_battle_profiles
        SET wins=wins+1, level_score=GREATEST(level_score+20, 0), last_match_at=now()
      WHERE user_id=$1`,
    [p2.id],
);
await client.query(
    `UPDATE public.quiz_battle_profiles
        SET losses=losses+1, level_score=GREATEST(level_score-15, 0), last_match_at=now()
      WHERE user_id=$1`,
    [p1.id],
);
ok('applied inactivity stats');

const v2 = await client.query(
    `SELECT user_id, wins, losses, level_score FROM public.quiz_battle_profiles WHERE user_id IN ($1, $2) ORDER BY user_id`,
    [p1.id, p2.id],
);
const p1b = v2.rows.find((r) => r.user_id === p1.id);
const p2b = v2.rows.find((r) => r.user_id === p2.id);



if (p1b.losses === 1 && p2b.wins === 1 && p1b.level_score === 1005 && p2b.level_score === 1005) {
    ok('cumulative stats updated correctly across matches');
}
else bad('cumulative stats', `p1 losses=${p1b.losses} level=${p1b.level_score}, p2 wins=${p2b.wins} level=${p2b.level_score}`);

await client.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);