// A test must explicitly mock its transport. No real customer data or mail calls.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_PUBLISHABLE_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
globalThis.fetch = async () => {
  throw new Error("Network disabled in unit tests; mock the transport explicitly");
};
