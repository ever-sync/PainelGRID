import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentryFromEnv() {
  if (initialized) {
    return;
  }

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
  });
  initialized = true;
}

export { Sentry };
