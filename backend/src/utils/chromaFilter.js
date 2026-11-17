


export function buildChromaWhere(conditions) {
  if (!conditions || typeof conditions !== 'object') return null;

  const active = Object.entries(conditions).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );

  if (active.length === 0) return null;
  if (active.length === 1) return { [active[0][0]]: active[0][1] };

  return { $and: active.map(([key, value]) => ({ [key]: value })) };
}

export default { buildChromaWhere };
