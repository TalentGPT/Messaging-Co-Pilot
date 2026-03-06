/**
 * Mock OpenAI — intercepts OpenAI constructor when MOCK_OPENAI=1
 */

if (process.env.MOCK_OPENAI === '1') {
  const FIXTURES = {
    recruiter: `A) SUBJECT LINE OPTION 1
Building something bigger

B) SUBJECT LINE OPTION 2
Your track record stands out

C) INMAIL BODY
Hi {name},

Noticed your trajectory from {company} — particularly the enterprise revenue growth.

We're scaling a platform where proven operators own the P&L and build equity.

Curious — are you at a point where ownership economics would change your calculus?

Worth 10 minutes to compare notes.`,

    sales: `Hi {name}, saw your work at {company} — impressive trajectory. We help teams like yours scale engineering faster with LATAM-based pods. Worth comparing notes sometime?`,

    score: JSON.stringify({
      score: 82,
      breakdown: { personalization: 85, clarity: 80, tone: 82, responselikelihood: 78, lengthEfficiency: 85 },
      signals: ['Referenced: current role', 'Referenced: company name'],
      replyProbability: 65,
    }),

    evolve: 'EVOLVED PROMPT: Improved version with feedback incorporated. Use {{CANDIDATE_PROFILE}} for profile data. Keep messages under 650 characters.',

    generate_prompt: 'GENERATED PROMPT: You are an outreach specialist. Write personalized messages using {{CANDIDATE_PROFILE}} placeholder. Keep tone professional.',
  };

  function getFixture(messages) {
    const sys = (messages[0]?.content || '').toLowerCase();
    const usr = (messages[1]?.content || '').toLowerCase();
    let name = 'Candidate', company = 'Company';
    const nm = usr.match(/name:\s*(.+)/i);
    if (nm) name = nm[1].trim().split('\n')[0];
    const cm = usr.match(/company:\s*(.+)/i);
    if (cm) company = cm[1].trim().split('\n')[0];

    if (sys.includes('message quality evaluator') || sys.includes('score the message')) return FIXTURES.score;
    if (sys.includes('prompt engineering expert') || sys.includes('improve an outreach prompt')) return FIXTURES.evolve;
    if (sys.includes('expert prompt engineer') || sys.includes('generate an optimized')) return FIXTURES.generate_prompt;
    if (sys.includes('sales') && !sys.includes('recruiter')) return FIXTURES.sales.replace('{name}', name).replace('{company}', company);
    return FIXTURES.recruiter.replace(/{name}/g, name).replace(/{company}/g, company);
  }

  // Get the real module path
  const moduleId = require.resolve('openai');
  const RealOpenAI = require(moduleId);

  // Create a mock class that looks like OpenAI
  class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (params) => {
            const content = getFixture(params.messages || []);
            return {
              choices: [{ message: { content }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            };
          },
        },
      };
    }
  }

  // Copy all static properties from the real module
  for (const key of Object.keys(RealOpenAI)) {
    if (!(key in MockOpenAI)) MockOpenAI[key] = RealOpenAI[key];
  }

  // Replace in cache
  const mod = require.cache[moduleId];
  if (mod) {
    mod.exports = MockOpenAI;
    mod.exports.default = MockOpenAI;
    mod.exports.OpenAI = MockOpenAI;
  }
}

module.exports = { isMocked: process.env.MOCK_OPENAI === '1' };
