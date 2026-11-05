// Runs before every DB test file, so before AppModule reads the env at import time
import '../src/config/env.js';

process.env.POSTGRES_DB = process.env.POSTGRES_TEST_DB;
