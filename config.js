// DECIDE config — optional cloud chat integration
// For hackathon demo only. Do NOT commit real keys.
// How to use:
// - Set PROVIDER to 'anthropic' and paste your Anthropic API key to enable Claude.
// - If left empty, the app falls back to local canned answers.

window.DECIDE_CONFIG = {
  PROVIDER: 'anthropic', // 'anthropic' | 'openrouter'
  USE_PROXY: true,
  PROXY_URL: 'http://localhost:3000/api/chat',

  // Anthropic (Claude) — https://console.anthropic.com/
  ANTHROPIC_API_KEY: "", // Ignored when USE_PROXY=true. Keep empty; set env ANTHROPIC_API_KEY in server.
  ANTHROPIC_MODEL: "claude-3-5-haiku-latest",
  ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1/messages",
  ANTHROPIC_VERSION: "2023-06-01",

  // OpenRouter fallback (optional)
  OPENROUTER_API_KEY: "",
  OPENROUTER_MODEL: "openai/gpt-4o-mini",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1/chat/completions",
};
