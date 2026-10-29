// Tests always run against the dedicated test database, never the development one.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://nutriscan@localhost:5433/nutriscan_test?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-only-secret-not-for-production-use-0123456789';
process.env.ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://127.0.0.1:59999';
process.env.LLM_PROVIDER = 'none';
process.env.OFF_LIVE_LOOKUP = 'false';
