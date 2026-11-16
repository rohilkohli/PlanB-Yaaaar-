/** Server config. Read lazily so tests can mutate process.env. Keys never reach the client bundle (PRD §25). */
export interface ServerEnv {
  placesKey: string | null;
  geminiKey: string | null;
  llmModel: string;
  llmTimeoutMs: number;
  deterministicOnly: boolean;
  limitGenerate: number;
  limitAdapt: number;
  limitSwap: number;
  limitEvents: number;
  upstashUrl: string | null;
  upstashToken: string | null;
  allowTestClock: boolean;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function env(): ServerEnv {
  const e = process.env;
  return {
    placesKey: e.GOOGLE_PLACES_API_KEY || null,
    geminiKey: e.GEMINI_API_KEY || null,
    llmModel: e.LLM_MODEL || 'gemini-2.5-flash',
    llmTimeoutMs: num(e.LLM_TIMEOUT_MS, 5500),
    deterministicOnly: /^(1|true|yes)$/i.test(e.USE_DETERMINISTIC_PLANNER || ''),
    limitGenerate: num(e.RATE_LIMIT_GENERATE_PER_DAY, 10),
    limitAdapt: num(e.RATE_LIMIT_ADAPT_PER_DAY, 25),
    limitSwap: num(e.RATE_LIMIT_SWAP_PER_DAY, 60),
    limitEvents: num(e.RATE_LIMIT_EVENTS_PER_DAY, 400),
    upstashUrl: e.UPSTASH_REDIS_REST_URL || null,
    upstashToken: e.UPSTASH_REDIS_REST_TOKEN || null,
    allowTestClock: /^(1|true)$/i.test(e.ALLOW_TEST_CLOCK || '')
  };
}
