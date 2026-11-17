


import http from 'node:http';

const port = Number(process.argv[2] || process.env.MAIL_STUB_PORT || 8899);

const received = [];

const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(405).end('{}');
        return;
    }

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = JSON.parse(raw); } catch { body = null; }

        const auth = req.headers.authorization || '';
        const entry = {
            url: req.url,
            authorization: auth,
            body,
        };
        received.push(entry);
        console.log(JSON.stringify(entry));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: `stub-${received.length}` }));
    });
});

server.listen(port, '0.0.0.0', () => {
    console.error(`[mailStub] listening on 0.0.0.0:${port}`);
});
