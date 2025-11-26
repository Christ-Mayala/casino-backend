export function log(...args: any[]) {
  console.log('[server]', ...args);
}

export function error(...args: any[]) {
  console.error('[server]', ...args);
}
