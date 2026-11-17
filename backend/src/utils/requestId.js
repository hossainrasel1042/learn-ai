import { AsyncLocalStorage } from 'node:async_hooks';

export const requestIdCtx = new AsyncLocalStorage();

export const getRequestId = () => {
  try {
    const id = requestIdCtx.getStore();
    return id || '-';
  } catch (_) {
    return '-';
  }
};

export const runWithRequestId = (id, fn) => {
  return requestIdCtx.run(id, fn);
};

export default requestIdCtx;
