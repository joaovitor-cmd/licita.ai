// Only operating-system variables needed by local child processes are inherited.
export function isolatedQaEnvironment(source = process.env) {
  const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'temp', 'tmp', 'pathext', 'systemdrive']);
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (allowed.has(key.toLowerCase()) && value !== undefined) env[key] = value;
  }
  return {
    ...env,
    LICITARO_ISOLATED_QA: 'true',
    NODE_ENV: 'test',
    DATABASE_SSL: 'false',
    DATABASE_SSL_CA_FILE: '',
    LOCAL_PG_PORT: '',
    SCHEDULER_ENABLED: 'false',
  };
}