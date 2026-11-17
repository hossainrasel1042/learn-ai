
export async function resolveSocketId(io, userId) {
  if (!io || !userId) return null;
  try {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    if (!sockets || sockets.length === 0) return null;
    const connected = sockets.find((s) => s.connected);
    return (connected || sockets[0]).id;
  } catch {
    return null;
  }
}

export async function resolveSocketIds(io, userIds) {
  const out = {};
  if (!io || !Array.isArray(userIds)) return out;
  const ids = await Promise.all(
    userIds.map(async (id) => [id, await resolveSocketId(io, id)]),
  );
  for (const [userId, socketId] of ids) {
    if (socketId) out[userId] = socketId;
  }
  return out;
}
