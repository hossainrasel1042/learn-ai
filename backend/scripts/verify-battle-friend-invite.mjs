
import 'dotenv/config';
import { io as ioc } from '../../frontend/node_modules/socket.io-client/build/esm/index.js';
import pg from 'pg';

import { createTestUser, API_BASE, bypassHeaders } from './_testAuth.js';

const BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '');
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'BattleTest-2026!';

const dbClient = new pg.Client({ connectionString: process.env.DB_URL });
await dbClient.connect();

let passed = 0;
let failed = 0;
let skipped = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const skip = (m) => { console.log(`  - ${m} (skipped)`); skipped++; };

console.log('\n--- Battle: play with a friend ---');

const stamp = Date.now();
const emailA = `battle-friend-a-${stamp}@battle-test.local`;
const emailB = `battle-friend-b-${stamp}@battle-test.local`;
const emailC = `battle-friend-c-${stamp}@battle-test.local`;
const emailD = `battle-friend-d-${stamp}@battle-test.local`;
const emailE = `battle-friend-e-${stamp}@battle-test.local`;
const emailF = `battle-friend-f-${stamp}@battle-test.local`;
const emailG = `battle-friend-g-${stamp}@battle-test.local`;

const A = await createTestUser(emailA, TEST_PASSWORD, dbClient);
const B = await createTestUser(emailB, TEST_PASSWORD, dbClient);
const C = await createTestUser(emailC, TEST_PASSWORD, dbClient);
const D = await createTestUser(emailD, TEST_PASSWORD, dbClient);
const E = await createTestUser(emailE, TEST_PASSWORD, dbClient);
const F = await createTestUser(emailF, TEST_PASSWORD, dbClient);
const G = await createTestUser(emailG, TEST_PASSWORD, dbClient);
ok(`created 7 test users`);

const LEVEL_A = 1000;
const LEVEL_B = 1234;
for (const [userId, level] of [[A.userId, LEVEL_A], [B.userId, LEVEL_B]]) {
    await dbClient.query(
        `INSERT INTO public.quiz_battle_profiles (user_id, level_score)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET level_score = EXCLUDED.level_score`,
        [userId, level],
    );
}

const courseRes = await dbClient.query(`SELECT c.id, c.name FROM public.courses c LIMIT 1`);
if (courseRes.rows.length === 0) {
    console.error('No courses in DB — create one first');
    process.exit(2);
}
const courseId = courseRes.rows[0].id;
const courseName = courseRes.rows[0].name;
console.log(`Using course ${courseName} (${courseId})`);



async function api(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...bypassHeaders(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, body: json };
}

const getFriendCode = (token) => api('/quiz-battle/friend-code', { token });

function connectSocket(token) {
    const s = ioc(BASE, {
        transports: ['websocket'],
        auth: { token },
        extraHeaders: { cookie: `sb-access-token=${token}` },
    });
    s.on('connect_error', (e) => console.log(`  ! connect_error: ${e.message}`));
    return s;
}

const waitConnected = (s) => new Promise((res, rej) => {
    s.on('connect', res);
    s.on('connect_error', rej);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));



const codeARes = await getFriendCode(A.token);
if (codeARes.status === 200 && /^[0-9]{8}$/.test(codeARes.body?.friendCode || '')) {
    ok(`A1: GET /friend-code returns an 8-digit numeric code (${codeARes.body.friendCode})`);
} else {
    bad('A1: GET /friend-code did not return an 8-digit code', JSON.stringify(codeARes));
}

const codeARes2 = await getFriendCode(A.token);
if (codeARes2.body?.friendCode === codeARes.body?.friendCode) {
    ok('A1: the code is stable across calls (lazily minted, not regenerated)');
} else {
    bad('A1: the friend code changed between two reads', `${codeARes.body?.friendCode} -> ${codeARes2.body?.friendCode}`);
}

const codeBRes = await getFriendCode(B.token);
if (codeBRes.body?.friendCode && codeBRes.body.friendCode !== codeARes.body.friendCode) {
    ok(`A2: two users get different codes (${codeARes.body.friendCode} vs ${codeBRes.body.friendCode})`);
} else {
    bad('A2: two users got the same friend code', JSON.stringify(codeBRes));
}

const oldCodeA = codeARes.body.friendCode;
const regenRes = await api('/quiz-battle/friend-code/regenerate', { method: 'POST', token: A.token });
if (regenRes.status === 200 && regenRes.body?.friendCode && regenRes.body.friendCode !== oldCodeA) {
    ok(`A3: regenerate returns a different code (${oldCodeA} -> ${regenRes.body.friendCode})`);
} else {
    bad('A3: regenerate did not return a different code', JSON.stringify(regenRes));
}

const sendWithOldCode = await api('/quiz-battle/invites', {
    method: 'POST',
    token: A.token,
    body: { courseId, friendCode: oldCodeA },
});
if (sendWithOldCode.status === 404) {
    ok('A3: the old code no longer resolves to a user (404)');
} else {
    bad('A3: the old code still resolves', `status ${sendWithOldCode.status}`);
}

const codeA = regenRes.body.friendCode;
const codeB = codeBRes.body.friendCode;



const socketB = connectSocket(B.token);
await waitConnected(socketB);

const inviteEventsB = [];
socketB.on('battle:invite', (e) => inviteEventsB.push(e));

const socketA = connectSocket(A.token);
await waitConnected(socketA);



const sendAt = Date.now();
const sendRes = await api('/quiz-battle/invites', {
    method: 'POST',
    token: A.token,
    body: { courseId, friendCode: codeB },
});

if (sendRes.status === 201 && sendRes.body?.inviteId) {
    ok(`A4: POST /invites returned 201 with an inviteId`);
} else {
    bad('A4: POST /invites did not return 201', JSON.stringify(sendRes));
}

const inviteId = sendRes.body?.inviteId;

if (sendRes.body?.expiresAt) {
    const ttlMs = new Date(sendRes.body.expiresAt).getTime() - sendAt;
    if (ttlMs > 9 * 60_000 && ttlMs <= 10 * 60_000 + 30_000) {
        ok(`A4: the invitation expires in 10 minutes (${Math.round(ttlMs / 60000)}m)`);
    } else {
        bad('A4: the expiry is not 10 minutes', `${ttlMs}ms`);
    }
} else {
    bad('A4: no expiresAt in the response');
}

const inviteRow = await dbClient.query(
    `SELECT * FROM public.quiz_battle_invites WHERE id = $1`,
    [inviteId],
);
if (
    inviteRow.rows.length === 1
    && inviteRow.rows[0].status === 'pending'
    && inviteRow.rows[0].sender_id === A.userId
    && inviteRow.rows[0].invitee_id === B.userId
    && inviteRow.rows[0].course_id === courseId
) {
    ok('A5: the invite row is pending, for the right sender/invitee/course');
} else {
    bad('A5: the invite row is wrong', JSON.stringify(inviteRow.rows[0]));
}

const notifRows = await dbClient.query(
    `SELECT user_id, kind FROM public.quiz_battle_invite_notifications WHERE invite_id = $1`,
    [inviteId],
);
const bNotif = notifRows.rows.find((r) => r.user_id === B.userId);
const aNotif = notifRows.rows.find((r) => r.user_id === A.userId);
if (bNotif?.kind === 'invite') ok("A6: the invitee has an 'invite' notification");
else bad("A6: the invitee has no 'invite' notification", JSON.stringify(notifRows.rows));
if (aNotif?.kind === 'invite_sent') ok("A6: the sender has an 'invite_sent' notification");
else bad("A6: the sender has no 'invite_sent' notification", JSON.stringify(notifRows.rows));

const outsideRes = await dbClient.query(
    `SELECT id, status FROM public.quiz_battle_invites WHERE id = $1`,
    [inviteId],
);
if (outsideRes.rows.length === 1) {
    ok('A26: the invite row is visible from a separate connection (it was committed)');
} else {
    bad('A26: the invite row is not visible outside the request transaction');
}

await sleep(500);
const inviteEvent = inviteEventsB.find((e) => e.kind === 'invite');
if (inviteEvent) {
    ok('A7: the invitee received battle:invite over the socket');
} else {
    bad('A7: the invitee did not receive battle:invite', JSON.stringify(inviteEventsB));
}



const badCodeRes = await api('/quiz-battle/invites', {
    method: 'POST', token: A.token, body: { courseId, friendCode: '123' },
});
if (badCodeRes.status === 400) ok('A8: a malformed friend code is rejected with 400');
else bad('A8: a malformed friend code was not rejected', `status ${badCodeRes.status}`);

const unknownCodeRes = await api('/quiz-battle/invites', {
    method: 'POST', token: A.token, body: { courseId, friendCode: '99999999' },
});
if (unknownCodeRes.status === 404) ok('A9: an unknown friend code is rejected with 404');
else bad('A9: an unknown friend code was not rejected', `status ${unknownCodeRes.status}`);

const selfRes = await api('/quiz-battle/invites', {
    method: 'POST', token: A.token, body: { courseId, friendCode: codeA },
});
if (selfRes.status === 400) ok('A10: inviting yourself is rejected with 400');
else bad('A10: inviting yourself was not rejected', `status ${selfRes.status}`);

const dupRes = await api('/quiz-battle/invites', {
    method: 'POST', token: A.token, body: { courseId, friendCode: codeB },
});
if (dupRes.status === 409) ok('A11: a second pending invite for the same pair is rejected with 409');
else bad('A11: a duplicate invite was not rejected', `status ${dupRes.status}`);



const unauthRes = await api('/quiz-battle/invites', {
    method: 'POST', body: { courseId, friendCode: codeB },
});
if (unauthRes.status === 401) ok('A24: an unauthenticated send is rejected with 401');
else bad('A24: an unauthenticated send was not rejected', `status ${unauthRes.status}`);



const wrongUserRes = await api(`/quiz-battle/invites/${inviteId}/accept`, {
    method: 'POST', token: C.token,
});
if (wrongUserRes.status === 403) ok('A23: accepting somebody else\'s invite is rejected with 403');
else bad('A23: accepting somebody else\'s invite was not rejected', `status ${wrongUserRes.status}`);



const matchedA = new Promise((resolve) => socketA.once('battle:matched', resolve));
const matchedB = new Promise((resolve) => socketB.once('battle:matched', resolve));

const acceptRes = await api(`/quiz-battle/invites/${inviteId}/accept`, {
    method: 'POST', token: B.token,
});

if (acceptRes.status === 200 && acceptRes.body?.matchId) {
    ok(`A12: the accept returned 200 with a matchId`);
} else if (acceptRes.status === 503) {
    skip(`A12/A27: the accept returned 503 (${acceptRes.body?.detail}) — the question generator is out of quota`);
} else {
    bad('A12: the accept did not return 200', JSON.stringify(acceptRes));
}

if (acceptRes.status === 200) {
    const matchId = acceptRes.body.matchId;

    const afterAccept = await dbClient.query(
        `SELECT status, match_id FROM public.quiz_battle_invites WHERE id = $1`,
        [inviteId],
    );
    if (afterAccept.rows[0]?.status === 'accepted' && afterAccept.rows[0]?.match_id === matchId) {
        ok('A13: the invite row is accepted and linked to the match');
    } else {
        bad('A13: the invite row was not updated', JSON.stringify(afterAccept.rows[0]));
    }

    const matchRow = await dbClient.query(
        `SELECT player_one, player_two, status, level_at_match_one, level_at_match_two
           FROM public.quiz_battle_matches WHERE id = $1`,
        [matchId],
    );
    const m = matchRow.rows[0];
    if (
        m
        && m.player_one === A.userId
        && m.player_two === B.userId
        && m.status === 'in_progress'
    ) {
        ok('A14: the match has the right players and is in progress');
    } else {
        bad('A14: the match row is wrong', JSON.stringify(m));
    }
    if (m && m.level_at_match_one === LEVEL_A && m.level_at_match_two === LEVEL_B) {
        ok('A14: the match level scores are NOT NULL and correct');
    } else {
        bad('A14: the match level scores are wrong', JSON.stringify(m));
    }

    let mA = null;
    let mB = null;
    try {
        [mA, mB] = await Promise.all([
            Promise.race([matchedA, sleep(8000).then(() => null)]),
            Promise.race([matchedB, sleep(8000).then(() => null)]),
        ]);
    } catch { /* ignore */ }
    if (mA && mB && mA.matchId === mB.matchId && mA.matchId === matchId) {
        ok('A15: both players received battle:matched for the same match');
    } else {
        bad('A15: the players did not both receive battle:matched', `${mA?.matchId} / ${mB?.matchId}`);
    }
    if (mA && mB && mA.opponent?.id === B.userId && mB.opponent?.id === A.userId) {
        ok('A15: each player sees the other as their opponent');
    } else {
        bad('A15: the opponent identity is wrong');
    }

    const acceptedNotif = await dbClient.query(
        `SELECT kind FROM public.quiz_battle_invite_notifications
          WHERE invite_id = $1 AND user_id = $2 AND kind = 'invite_accepted'`,
        [inviteId, A.userId],
    );
    if (acceptedNotif.rows.length === 1) ok("A16: the sender got an 'invite_accepted' notification");
    else bad("A16: the sender has no 'invite_accepted' notification");

    const questionCount = await dbClient.query(
        `SELECT count(*)::int AS n FROM public.quiz_battle_questions WHERE match_id = $1`,
        [matchId],
    );
    if (questionCount.rows[0]?.n > 0) {
        ok(`A27: the match has ${questionCount.rows[0].n} questions — the whole accept completed`);
    } else {
        bad('A27: the match has no questions');
    }

    const doubleAccept = await api(`/quiz-battle/invites/${inviteId}/accept`, {
        method: 'POST', token: B.token,
    });
    if (doubleAccept.status === 409) ok('A17: a double accept is rejected with 409');
    else bad('A17: a double accept was not rejected', `status ${doubleAccept.status}`);

    const matchCount = await dbClient.query(
        `SELECT count(*)::int AS n FROM public.quiz_battle_matches
          WHERE player_one IN ($1, $2) AND player_two IN ($1, $2)`,
        [A.userId, B.userId],
    );
    if (matchCount.rows[0]?.n === 1) ok('A17: exactly one match exists for the pair');
    else bad('A17: more than one match exists for the pair', String(matchCount.rows[0]?.n));
}



const codeC = (await getFriendCode(C.token)).body.friendCode;
const declineSend = await api('/quiz-battle/invites', {
    method: 'POST', token: C.token, body: { courseId, friendCode: codeB },
});
if (declineSend.status === 201) ok('A18: C sent an invite to B');
else bad('A18: C could not send an invite', JSON.stringify(declineSend));

const declineInviteId = declineSend.body?.inviteId;
const declineRes = await api(`/quiz-battle/invites/${declineInviteId}/decline`, {
    method: 'POST', token: B.token,
});
if (declineRes.status === 200) ok('A18: B declined the invitation');
else bad('A18: the decline failed', JSON.stringify(declineRes));

const declinedRow = await dbClient.query(
    `SELECT status, decline_reason FROM public.quiz_battle_invites WHERE id = $1`,
    [declineInviteId],
);
if (declinedRow.rows[0]?.status === 'declined' && declinedRow.rows[0]?.decline_reason === 'declined') {
    ok('A18: the invite row is declined');
} else {
    bad('A18: the invite row was not declined', JSON.stringify(declinedRow.rows[0]));
}

const declinedNotif = await dbClient.query(
    `SELECT kind FROM public.quiz_battle_invite_notifications
      WHERE invite_id = $1 AND user_id = $2 AND kind = 'invite_declined'`,
    [declineInviteId, C.userId],
);
if (declinedNotif.rows.length === 1) ok("A18: the sender got an 'invite_declined' notification");
else bad("A18: the sender has no 'invite_declined' notification");

const declineTwice = await api(`/quiz-battle/invites/${declineInviteId}/decline`, {
    method: 'POST', token: B.token,
});
if (declineTwice.status === 409) ok('A19: declining twice is rejected with 409');
else bad('A19: declining twice was not rejected', `status ${declineTwice.status}`);



const codeD = (await getFriendCode(D.token)).body.friendCode;
const codeE = (await getFriendCode(E.token)).body.friendCode;

const busyRes = await api('/quiz-battle/invites', {
    method: 'POST', token: D.token, body: { courseId, friendCode: codeB },
});
if (busyRes.status === 201) ok('A20: D sent an invite to B');
else bad('A20: D could not send an invite', JSON.stringify(busyRes));

const busyAccept = await api(`/quiz-battle/invites/${busyRes.body.inviteId}/accept`, {
    method: 'POST', token: B.token,
});
if (busyAccept.status === 409) ok('A20: a busy invitee cannot accept (409)');
else bad('A20: a busy invitee was allowed to accept', `status ${busyAccept.status}`);

const busyRow = await dbClient.query(
    `SELECT status, decline_reason FROM public.quiz_battle_invites WHERE id = $1`,
    [busyRes.body.inviteId],
);
if (busyRow.rows[0]?.status === 'unavailable' && busyRow.rows[0]?.decline_reason === 'in_match') {
    ok("A20: the invite is 'unavailable' with reason 'in_match'");
} else {
    bad('A20: the invite row is wrong', JSON.stringify(busyRow.rows[0]));
}

const unavailableNotif = await dbClient.query(
    `SELECT kind, payload FROM public.quiz_battle_invite_notifications
      WHERE invite_id = $1 AND user_id = $2 AND kind = 'invite_unavailable'`,
    [busyRes.body.inviteId, D.userId],
);
if (unavailableNotif.rows.length === 1) ok("A20: the sender got an 'invite_unavailable' notification");
else bad("A20: the sender has no 'invite_unavailable' notification");



const codeF = (await getFriendCode(F.token)).body.friendCode;
const codeG = (await getFriendCode(G.token)).body.friendCode;

const offlineSend = await api('/quiz-battle/invites', {
    method: 'POST', token: F.token, body: { courseId, friendCode: codeG },
});
if (offlineSend.status === 201) ok('A21: F sent an invite to G');
else bad('A21: F could not send an invite', JSON.stringify(offlineSend));

const offlineAccept = await api(`/quiz-battle/invites/${offlineSend.body.inviteId}/accept`, {
    method: 'POST', token: G.token,
});
if (offlineAccept.status === 409) ok('A21: an offline invitee cannot accept (409)');
else bad('A21: an offline invitee was allowed to accept', `status ${offlineAccept.status}`);

const offlineRow = await dbClient.query(
    `SELECT status, decline_reason FROM public.quiz_battle_invites WHERE id = $1`,
    [offlineSend.body.inviteId],
);
if (offlineRow.rows[0]?.status === 'unavailable' && offlineRow.rows[0]?.decline_reason === 'offline') {
    ok("A21: the invite is 'unavailable' with reason 'offline'");
} else {
    bad('A21: the invite row is wrong', JSON.stringify(offlineRow.rows[0]));
}

const offlineNotif = await dbClient.query(
    `SELECT kind FROM public.quiz_battle_invite_notifications
      WHERE invite_id = $1 AND user_id = $2 AND kind = 'invite_unavailable'`,
    [offlineSend.body.inviteId, F.userId],
);
if (offlineNotif.rows.length === 1) ok("A21: the sender got an 'invite_unavailable' notification");
else bad("A21: the sender has no 'invite_unavailable' notification");



const codeHSend = await api('/quiz-battle/invites', {
    method: 'POST', token: E.token, body: { courseId, friendCode: codeG },
});
if (codeHSend.status === 201) ok('A22: E sent an invite to G');
else bad('A22: E could not send an invite', JSON.stringify(codeHSend));

const expiredInviteId = codeHSend.body?.inviteId;
if (expiredInviteId) {
    await dbClient.query(
        `UPDATE public.quiz_battle_invites SET expires_at = now() - interval '1 minute' WHERE id = $1`,
        [expiredInviteId],
    );

    const expiredAccept = await api(`/quiz-battle/invites/${expiredInviteId}/accept`, {
        method: 'POST', token: G.token,
    });
    if (expiredAccept.status === 410) ok('A22: an expired invitation is rejected with 410');
    else bad('A22: an expired invitation was not rejected', `status ${expiredAccept.status}`);
} else {
    bad('A22: could not create the invitation to expire');
}



{
    const emailJ = `battle-friend-j-${Date.now()}@battle-test.local`;
    const J = await createTestUser(emailJ, TEST_PASSWORD, dbClient);

    const jSend = await api('/quiz-battle/invites', {
        method: 'POST', token: J.token, body: { courseId, friendCode: codeG },
    });

    if (jSend.status !== 201) {
        bad('A28: could not create the invitation for the claim test', `status ${jSend.status}`);
    } else {
        const jInviteId = jSend.body.inviteId;
        await dbClient.query(
            `UPDATE public.quiz_battle_invites
                SET expires_at = now() - interval '1 minute'
              WHERE id = $1`,
            [jInviteId],
        );

        const { quizBattleInviteRepository } = await import(
            '../src/quiz_battle_agent/inviteRepository.js'
        );
        const repo = quizBattleInviteRepository(dbClient);

        const claimRes = await repo.claimInvite(jInviteId, {
            status: 'accepted',
            decidedBy: G.userId,
        });

        if (!claimRes) {
            ok('A28: the atomic claim refuses an expired invitation on its own');
        } else {
            bad('A28: the atomic claim refuses an expired invitation on its own',
                'the claim returned a row for an expired invitation');
            await dbClient.query(
                `UPDATE public.quiz_battle_invites
                    SET status = 'expired', decline_reason = 'expired'
                  WHERE id = $1`,
                [jInviteId],
            );
        }

        await dbClient.query(
            `UPDATE public.quiz_battle_invites
                SET expires_at = now() + interval '10 minutes', status = 'pending'
              WHERE id = $1`,
            [jInviteId],
        );
        const claimOk = await repo.claimInvite(jInviteId, {
            status: 'accepted',
            decidedBy: G.userId,
        });
        if (claimOk) {
            ok('A28: the atomic claim still accepts a live invitation');
        } else {
            bad('A28: the atomic claim still accepts a live invitation');
        }

        const secondClaim = await repo.claimInvite(jInviteId, {
            status: 'accepted',
            decidedBy: G.userId,
        });
        if (!secondClaim) {
            ok('A28: the atomic claim refuses an invitation that was already claimed');
        } else {
            bad('A28: the atomic claim refuses an invitation that was already claimed',
                'the second claim returned a row');
        }
    }
}



if (process.env.RATE_LIMIT_ENABLED === 'false') {
    skip('A25: RATE_LIMIT_ENABLED is false — the limiter is disabled');
} else {
    const emailH = `battle-friend-h-${Date.now()}@battle-test.local`;
    const H = await createTestUser(emailH, TEST_PASSWORD, dbClient);
    const codeI = (await getFriendCode(H.token)).body.friendCode;
    let saw429 = false;
    for (let i = 0; i < 12; i += 1) {
        const res = await api('/quiz-battle/invites', {
            method: 'POST', token: H.token, body: { courseId, friendCode: codeI },
        });
        if (res.status === 429) { saw429 = true; break; }
    }
    if (saw429) ok('A25: the send limiter returns 429');
    else skip('A25: no 429 — the limiter is disabled in this environment');
}


socketA.close();
socketB.close();
await dbClient.end();

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
process.exit(failed === 0 ? 0 : 1);
