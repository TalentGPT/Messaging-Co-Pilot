process.env.MOCK_OPENAI = '1';
process.env.OPENAI_API_KEY = 'sk-test-fake';

// Mock MUST be set up before messageGenerator is required
require('../mocks/mock-openai');

// Clear messageGenerator cache so it picks up the mocked OpenAI
delete require.cache[require.resolve('../../messageGenerator')];

const {
  formatUserPrompt, buildCandidateContext, scoreMessage,
  generateOutreachMessage, regenerateWithFeedback, evolvePrompt,
  generatePromptFromContext, generateFromCampaignGoal, evolvePromptFromDataset,
  RECRUITER_PROMPT, SALES_PROMPT,
} = require('../../messageGenerator');

describe('messageGenerator', () => {
  const sampleProfile = {
    name: 'Jane Smith',
    headline: 'VP of Engineering at TechCorp',
    location: 'San Francisco, CA',
    industry: 'Technology',
    summary: 'Experienced leader with 15 years in enterprise software.',
    experiences: [
      { title: 'VP of Engineering', company: 'TechCorp', date: '2020-2024', description: 'Led 50+ team members across 3 divisions' },
      { title: 'Director', company: 'Google', date: '2016-2020', description: 'Managed cloud platform team' },
    ],
    education: [{ school: 'MIT', degree: 'BS Computer Science', date: '2005-2009' }],
    skills: ['Python', 'Leadership', 'Cloud'],
  };

  describe('formatUserPrompt', () => {
    test('includes name', () => {
      expect(formatUserPrompt({ name: 'Test User' })).toContain('Test User');
    });

    test('includes headline/occupation', () => {
      expect(formatUserPrompt(sampleProfile)).toContain('VP of Engineering');
    });

    test('includes location', () => {
      expect(formatUserPrompt(sampleProfile)).toContain('San Francisco');
    });

    test('includes experiences', () => {
      const result = formatUserPrompt(sampleProfile);
      expect(result).toContain('TechCorp');
      expect(result).toContain('Google');
    });

    test('includes education', () => {
      expect(formatUserPrompt(sampleProfile)).toContain('MIT');
    });

    test('includes skills', () => {
      expect(formatUserPrompt(sampleProfile)).toContain('Python');
    });

    test('handles minimal profile', () => {
      const result = formatUserPrompt({ name: 'Min User' });
      expect(result).toContain('Min User');
    });

    test('uses full_name if present', () => {
      expect(formatUserPrompt({ full_name: 'Full Name' })).toContain('Full Name');
    });
  });

  describe('buildCandidateContext', () => {
    test('extracts name, title, company from experiences', () => {
      const ctx = buildCandidateContext(sampleProfile);
      expect(ctx.name).toBe('Jane Smith');
      expect(ctx.title).toBe('VP of Engineering');
      expect(ctx.company).toBe('TechCorp');
    });

    test('detects notable companies (Google)', () => {
      const ctx = buildCandidateContext(sampleProfile);
      expect(ctx.signals.some(s => s.includes('Google'))).toBe(true);
    });

    test('detects leadership roles', () => {
      const ctx = buildCandidateContext(sampleProfile);
      expect(ctx.signals.some(s => s.includes('Leadership role'))).toBe(true);
    });

    test('detects team size from descriptions', () => {
      const ctx = buildCandidateContext(sampleProfile);
      expect(ctx.signals.some(s => s.includes('Team size'))).toBe(true);
    });

    test('calculates total years', () => {
      const ctx = buildCandidateContext(sampleProfile);
      expect(ctx.totalYears).toBeGreaterThanOrEqual(4);
    });

    test('detects promotion path (same company multiple roles)', () => {
      const profile = {
        name: 'Test',
        experiences: [
          { title: 'Director', company: 'Acme', date: '2022' },
          { title: 'Manager', company: 'Acme', date: '2020' },
        ],
      };
      const ctx = buildCandidateContext(profile);
      expect(ctx.signals.some(s => s.includes('Promotion path'))).toBe(true);
    });

    test('includes location signal', () => {
      const ctx = buildCandidateContext(sampleProfile);
      expect(ctx.signals.some(s => s.includes('San Francisco'))).toBe(true);
    });

    test('parses title from headline when no experiences', () => {
      const ctx = buildCandidateContext({ name: 'Bob', headline: 'CTO at Startup' });
      expect(ctx.title).toBe('CTO');
      expect(ctx.company).toBe('Startup');
    });

    test('handles empty profile gracefully', () => {
      const ctx = buildCandidateContext({});
      expect(ctx.name).toBe('Unknown');
      expect(ctx.signals).toBeDefined();
    });
  });

  describe('generateOutreachMessage (mocked)', () => {
    test('returns message content for recruiter mode', async () => {
      const result = await generateOutreachMessage(sampleProfile, 'recruiter', null);
      expect(result.message).toBeTruthy();
      expect(result.message.length).toBeGreaterThan(10);
    });

    test('returns message for sales mode', async () => {
      const result = await generateOutreachMessage(sampleProfile, 'sales', null);
      expect(result.message).toBeTruthy();
    });

    test('uses custom prompt when provided', async () => {
      const result = await generateOutreachMessage(sampleProfile, 'recruiter', 'Custom prompt <<<>>>');
      expect(result.message).toBeTruthy();
    });

    test('returns profile in result', async () => {
      const result = await generateOutreachMessage(sampleProfile, 'recruiter', null);
      expect(result.profile).toBeDefined();
      expect(result.profile.name).toBe('Jane Smith');
    });
  });

  describe('regenerateWithFeedback (mocked)', () => {
    test('returns improved message', async () => {
      const result = await regenerateWithFeedback(sampleProfile, RECRUITER_PROMPT, 'old message', 'make it shorter', 'recruiter');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('evolvePrompt (mocked)', () => {
    test('returns evolved prompt', async () => {
      const result = await evolvePrompt('original prompt', [{ feedback: 'too long', candidateName: 'Test' }]);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('generatePromptFromContext (mocked)', () => {
    test('generates prompt for recruiter type', async () => {
      const result = await generatePromptFromContext('We are hiring senior engineers', 'recruiter');
      expect(result).toBeTruthy();
    });

    test('generates prompt for sales type', async () => {
      const result = await generatePromptFromContext('We sell cloud solutions', 'sales');
      expect(result).toBeTruthy();
    });
  });

  describe('scoreMessage (mocked)', () => {
    test('returns score object with expected fields', async () => {
      const ctx = buildCandidateContext(sampleProfile);
      const result = await scoreMessage('Great message', ctx, 'Recruit engineers');
      expect(result.score).toBeDefined();
      expect(typeof result.score).toBe('number');
      expect(result.breakdown).toBeDefined();
      expect(result.replyProbability).toBeDefined();
      expect(result.signals).toBeDefined();
    });
  });

  describe('generateFromCampaignGoal (mocked)', () => {
    test('generates from campaign with outcome', async () => {
      const ctx = buildCandidateContext(sampleProfile);
      const campaign = { outcome: 'Schedule intro call', tone: 'casual', constraints: ['Under 500 chars'], promptLibrary: [] };
      const result = await generateFromCampaignGoal(ctx, campaign);
      expect(result).toBeTruthy();
    });

    test('uses active prompt from library when available', async () => {
      const ctx = buildCandidateContext(sampleProfile);
      const campaign = {
        outcome: 'test',
        promptLibrary: [{ version: 1, prompt: 'Custom <<<>>>', active: true }],
      };
      const result = await generateFromCampaignGoal(ctx, campaign);
      expect(result).toBeTruthy();
    });
  });

  describe('evolvePromptFromDataset (mocked)', () => {
    test('evolves prompt from feedback dataset', async () => {
      const dataset = [
        { feedback: 'too_long', candidateContext: { name: 'Alice' }, message: 'old msg', promptUsed: 'prompt' },
        { feedback: 'not_personalized', candidateContext: { name: 'Bob' }, message: 'msg2', promptUsed: 'prompt' },
      ];
      const result = await evolvePromptFromDataset('original prompt', dataset);
      expect(result).toBeTruthy();
    });
  });

  describe('prompts', () => {
    test('RECRUITER_PROMPT contains placeholder', () => {
      expect(RECRUITER_PROMPT).toContain('<<<>>>');
    });

    test('SALES_PROMPT contains placeholder', () => {
      expect(SALES_PROMPT).toContain('[INSERT PROFILE DATA HERE]');
    });

    test('RECRUITER_PROMPT mentions subject line format', () => {
      expect(RECRUITER_PROMPT).toContain('SUBJECT LINE OPTION 1');
    });
  });
});
