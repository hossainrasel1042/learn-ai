
import 'dotenv/config';
import pg from 'pg';

let passed = 0;
let failed = 0;

function ok(msg) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
}

function bad(msg) {
    failed += 1;
    console.log(`  ✗ ${msg}`);
}

function check(cond, passMsg, failMsg) {
    if (cond) ok(passMsg);
    else bad(failMsg ?? passMsg);
}

const client = new pg.Client({ connectionString: process.env.DB_URL });
await client.connect();

try {
    console.log('--- Migration 016: battle friend invites ---\n');


    const col = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'friend_code'
    `);
    const friendCol = col.rows[0];
    check(
        friendCol && friendCol.data_type === 'text',
        'profiles.friend_code exists and is TEXT',
        `profiles.friend_code is wrong: ${JSON.stringify(friendCol)}`,
    );
    check(
        friendCol && friendCol.is_nullable === 'YES',
        'profiles.friend_code is nullable (minted lazily)',
        'profiles.friend_code must be nullable',
    );

    const uniqueIdx = await client.query(`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND indexname = 'idx_profiles_friend_code_unique'
    `);
    check(
        uniqueIdx.rows.length === 1 && /UNIQUE/i.test(uniqueIdx.rows[0].indexdef),
        'idx_profiles_friend_code_unique is a UNIQUE index',
        'idx_profiles_friend_code_unique is missing or not unique',
    );
    check(
        uniqueIdx.rows.length === 1 && /WHERE/i.test(uniqueIdx.rows[0].indexdef),
        'idx_profiles_friend_code_unique is PARTIAL (WHERE friend_code IS NOT NULL)',
        'idx_profiles_friend_code_unique must be partial — a plain unique index '
        + 'would still allow many NULLs but must not exclude the partial predicate',
    );

    const badCodes = [
        ['123', 'a short code'],
        ['abcdefgh', 'a non-numeric code'],
        ['123456789', 'a 9-digit code'],
    ];
    for (const [code, label] of badCodes) {
        const probeEmail = `probe-fc-${Date.now()}-${Math.floor(Math.random() * 1e6)}@probe.local`;
        let rejected = false;
        let probeId = null;
        try {
            const ins = await client.query(
                `INSERT INTO public.profiles (id, name, email)
                 VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
                [`probe ${label}`, probeEmail],
            );
            probeId = ins.rows[0].id;
            await client.query(
                `UPDATE public.profiles SET friend_code = $1 WHERE id = $2`,
                [code, probeId],
            );
        } catch (e) {
            rejected = true;
        }
        if (probeId) {
            await client.query(`DELETE FROM public.profiles WHERE id = $1`, [probeId]);
        }
        check(rejected, `profiles_friend_code_format rejects ${label} ('${code}')`,
            `profiles_friend_code_format accepted ${label} ('${code}')`);
    }

    {
        const probeEmail = `probe-fc-ok-${Date.now()}@probe.local`;
        let accepted = false;
        let probeId = null;
        try {
            const ins = await client.query(
                `INSERT INTO public.profiles (id, name, email)
                 VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
                ['probe valid code', probeEmail],
            );
            probeId = ins.rows[0].id;
            await client.query(
                `UPDATE public.profiles SET friend_code = $1 WHERE id = $2`,
                ['01234567', probeId],
            );
            accepted = true;
        } catch (e) {
            accepted = false;
        }
        if (probeId) {
            await client.query(`DELETE FROM public.profiles WHERE id = $1`, [probeId]);
        }
        check(accepted, 'profiles_friend_code_format accepts a valid 8-digit code',
            'profiles_friend_code_format rejected a valid 8-digit code');
    }


    const invTable = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'quiz_battle_invites'
    `);
    check(invTable.rows.length === 1, 'public.quiz_battle_invites exists',
        'public.quiz_battle_invites is missing');

    const statusEnum = await client.query(`
        SELECT e.enumlabel FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'quiz_battle_invite_status'
        ORDER BY e.enumsortorder
    `);
    const statusLabels = statusEnum.rows.map((r) => r.enumlabel);
    const expectedStatus = ['pending', 'accepted', 'declined', 'unavailable', 'expired'];
    check(
        expectedStatus.every((s) => statusLabels.includes(s))
        && statusLabels.length === expectedStatus.length,
        `quiz_battle_invite_status has exactly the 5 expected values`,
        `quiz_battle_invite_status is wrong: ${JSON.stringify(statusLabels)}`,
    );

    const matchCol = await client.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'quiz_battle_invites'
          AND column_name = 'match_id'
    `);
    check(
        matchCol.rows[0] && matchCol.rows[0].is_nullable === 'YES',
        'quiz_battle_invites.match_id is NULLABLE (the match does not exist yet)',
        'quiz_battle_invites.match_id must be nullable',
    );

    const inviteCols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'quiz_battle_invites'
    `);
    const inviteColNames = inviteCols.rows.map((r) => r.column_name);
    const expectedCols = [
        'id', 'sender_id', 'invitee_id', 'course_id', 'invitee_friend_code',
        'status', 'match_id', 'sender_level_score', 'invitee_level_score',
        'decided_by', 'decline_reason', 'expires_at', 'responded_at', 'created_at',
    ];
    const missingCols = expectedCols.filter((c) => !inviteColNames.includes(c));
    check(
        missingCols.length === 0,
        'quiz_battle_invites has every expected column',
        `quiz_battle_invites is missing columns: ${missingCols.join(', ')}`,
    );

    const pairIdx = await client.query(`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'quiz_battle_invites'
          AND indexname = 'idx_quiz_battle_invites_one_pending_pair'
    `);
    check(
        pairIdx.rows.length === 1
        && /UNIQUE/i.test(pairIdx.rows[0].indexdef)
        && /status\s*=\s*'pending'/i.test(pairIdx.rows[0].indexdef),
        'idx_quiz_battle_invites_one_pending_pair is a UNIQUE partial index on pending',
        `idx_quiz_battle_invites_one_pending_pair is wrong: ${JSON.stringify(pairIdx.rows[0])}`,
    );


    const notifTable = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'quiz_battle_invite_notifications'
    `);
    check(notifTable.rows.length === 1,
        'public.quiz_battle_invite_notifications exists',
        'public.quiz_battle_invite_notifications is missing');

    const kindEnum = await client.query(`
        SELECT e.enumlabel FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'quiz_battle_invite_notification_kind'
        ORDER BY e.enumsortorder
    `);
    const kindLabels = kindEnum.rows.map((r) => r.enumlabel);
    const expectedKinds = [
        'invite', 'invite_sent', 'invite_declined',
        'invite_unavailable', 'invite_expired', 'invite_accepted',
    ];
    check(
        expectedKinds.every((k) => kindLabels.includes(k))
        && kindLabels.length === expectedKinds.length,
        'quiz_battle_invite_notification_kind has exactly the 6 expected values',
        `quiz_battle_invite_notification_kind is wrong: ${JSON.stringify(kindLabels)}`,
    );


    const oldMatchCol = await client.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'quiz_battle_notifications'
          AND column_name = 'match_id'
    `);
    check(
        oldMatchCol.rows[0] && oldMatchCol.rows[0].is_nullable === 'NO',
        'REGRESSION: quiz_battle_notifications.match_id is still NOT NULL',
        'REGRESSION: quiz_battle_notifications.match_id was widened to nullable — '
        + 'the existing table must stay untouched',
    );

    const oldKind = await client.query(`
        SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = 'public.quiz_battle_notifications'::regclass
          AND contype = 'c'
    `);
    const oldKindDefs = oldKind.rows.map((r) => r.def).join('\n');
    const oldKindsMatch = oldKindDefs.match(/'([^']+)'/g) || [];
    const oldKindValues = oldKindsMatch.map((v) => v.replace(/'/g, ''));
    const expectedOldKinds = ['matched', 'opponent_answered', 'opponent_left', 'ended'];
    check(
        expectedOldKinds.every((k) => oldKindValues.includes(k))
        && !oldKindValues.includes('invite'),
        'REGRESSION: quiz_battle_notifications.kind still has exactly its 4 original values',
        `REGRESSION: quiz_battle_notifications.kind changed: ${JSON.stringify(oldKindValues)}`,
    );

    const oldIdx = await client.query(`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'quiz_battle_notifications'
          AND indexname = 'idx_quiz_battle_notifications_match'
    `);
    check(
        oldIdx.rows.length === 1 && !/WHERE/i.test(oldIdx.rows[0].indexdef),
        'REGRESSION: idx_quiz_battle_notifications_match still exists and is not partial',
        `REGRESSION: idx_quiz_battle_notifications_match changed: ${JSON.stringify(oldIdx.rows[0])}`,
    );


    const sender = await client.query(`
        INSERT INTO public.profiles (id, name, email)
        VALUES (gen_random_uuid(), '016 self-sender', $1) RETURNING id`,
        [`probe-self-${Date.now()}@probe.local`],
    );
    const senderId = sender.rows[0].id;

    const course = await client.query(`SELECT id FROM public.courses LIMIT 1`);
    if (course.rows.length === 0) {
        bad('no course row exists — cannot test the invite constraints');
    } else {
        const courseId = course.rows[0].id;

        let selfRejected = false;
        try {
            await client.query(
                `INSERT INTO public.quiz_battle_invites
                   (sender_id, invitee_id, course_id, invitee_friend_code, expires_at)
                 VALUES ($1, $1, $2, '12345678', now() + interval '10 minutes')`,
                [senderId, courseId],
            );
        } catch (e) {
            selfRejected = true;
        }
        check(selfRejected,
            'quiz_battle_invites_distinct_players rejects sender_id = invitee_id',
            'quiz_battle_invites_distinct_players did NOT reject a self-invite');

        const other = await client.query(`
            INSERT INTO public.profiles (id, name, email)
            VALUES (gen_random_uuid(), '016 other', $1) RETURNING id`,
            [`probe-other-${Date.now()}@probe.local`],
        );
        const otherId = other.rows[0].id;

        let reasonRejected = false;
        try {
            await client.query(
                `INSERT INTO public.quiz_battle_invites
                   (sender_id, invitee_id, course_id, invitee_friend_code, status, expires_at)
                 VALUES ($1, $2, $3, '12345678', 'declined', now() + interval '10 minutes')`,
                [senderId, otherId, courseId],
            );
        } catch (e) {
            reasonRejected = true;
        }
        check(reasonRejected,
            'quiz_battle_invites_decline_reason rejects a declined invite with no reason',
            'quiz_battle_invites_decline_reason did NOT reject a reasonless decline');

        await client.query(`DELETE FROM public.profiles WHERE id = ANY($1)`, [[senderId, otherId]]);
    }

    await client.query(`DELETE FROM public.profiles WHERE id = $1`, [senderId]);

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
    console.error('verify-016 failed:', e.message);
    process.exitCode = 1;
} finally {
    await client.end();
}
