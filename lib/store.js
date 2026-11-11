// Data access. STORE=memory runs without Supabase (local dev and tests only; data is lost on restart).
module.exports = process.env.STORE === 'memory' ? require('./store-memory') : require('./store-supabase');
