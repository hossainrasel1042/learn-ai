

import { Server as IOServer } from 'socket.io';

import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';

import { verifyAccessToken, payloadToUser } from '../services/tokenService.js';
import { startMatchTicker, findLiveMatchForUser, setSocket } from './matchState.js';
import { registerHandlers } from './handlers.js';


function readAccessTokenFromCookieHeader(cookieHeader) {
    if (!cookieHeader || typeof cookieHeader !== 'string') return null;
    const parts = cookieHeader.split(';');
    for (const raw of parts) {
        const trimmed = raw.trim();
        if (trimmed.startsWith('sb-access-token=')) {
            return decodeURIComponent(trimmed.substring('sb-access-token='.length));
        }
    }
    return null;
}


export function createSocketServer(httpServer) {
    const io = new IOServer(httpServer, {
        cors: {
            origin: settings.CORS_ORIGINS,
            credentials: settings.CORS_CREDENTIALS,
        },


        serveClient: false,
    });


    io.use(async (socket, next) => {
        try {

            const token =
                readAccessTokenFromCookieHeader(socket.handshake.headers?.cookie) ||
                socket.handshake.auth?.token ||
                null;

            if (!token) {
                return next(new Error('unauthorized: no token'));
            }
            const user = payloadToUser(verifyAccessToken(token));
            if (!user) {
                return next(new Error('unauthorized: invalid token'));
            }
            socket.data.user = user;
            socket.data.userId = user.id;
            return next();
        } catch (e) {
            logger.warn?.(`[realtime] handshake auth failed: ${e?.message || e}`);
            return next(new Error('unauthorized'));
        }
    });

    io.on('connection', (socket) => {
        logger.info?.(
            `[realtime] socket connected: user=${socket.data.userId} sid=${socket.id}`,
        );


        socket.join(`user:${socket.data.userId}`);







        const live = findLiveMatchForUser(socket.data.userId);
        if (live) {
            socket.join(`match:${live.matchId}`);



            setSocket(live.matchId, socket.data.userId, socket.id);
            logger.info?.(
                `[realtime] reconnected user=${socket.data.userId} into match=${live.matchId}`,
            );
        }

        registerHandlers(io, socket);
    });


    startMatchTicker(io);

    logger.info?.(`[realtime] Socket.IO server attached`);
    return io;
}

export default createSocketServer;
