

const DEFAULTS = {
    'battle:queue': { max: 1, windowMs: 5_000 },
    'battle:answer': { max: 5, windowMs: 1_000 },
    'battle:leave': { max: 5, windowMs: 60_000 },
    'battle:cancel': { max: 5, windowMs: 1_000 },


    'battle:join': { max: 10, windowMs: 60_000 },
};


const _state = new Map();

function _record(socketId, action) {
    const cfg = DEFAULTS[action];
    if (!cfg) return { allowed: true };
    const now = Date.now();
    let perAction = _state.get(socketId);
    if (!perAction) {
        perAction = new Map();
        _state.set(socketId, perAction);
    }
    const arr = perAction.get(action) || [];

    while (arr.length > 0 && arr[0] <= now - cfg.windowMs) {
        arr.shift();
    }
    if (arr.length >= cfg.max) {
        return {
            allowed: false,
            retryAfterMs: cfg.windowMs - (now - arr[0]),
            limit: cfg.max,
            windowMs: cfg.windowMs,
        };
    }
    arr.push(now);
    perAction.set(action, arr);
    return { allowed: true };
}


export function rateLimit(socket, action, handler) {
    return async (...args) => {
        const verdict = _record(socket.id, action);
        if (!verdict.allowed) {
            socket.emit('battle:rate-limit-rejected', {
                action,
                retryAfterMs: verdict.retryAfterMs,
                limit: verdict.limit,
                windowMs: verdict.windowMs,
            });
            return;
        }
        try {
            await handler(...args);
        } catch (e) {

            throw e;
        }
    };
}


export function releaseSocket(socketId) {
    _state.delete(socketId);
}


export function _reset() {
    _state.clear();
}

export default rateLimit;