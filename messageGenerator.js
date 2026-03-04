const OpenAI = require('openai');

const OUTREACH_MODE = process.env.OUTREACH_MODE || 'recruiter';

const RECRUITER_PROMPT = `You are an elite, top 1% LinkedIn Recruiter outreach strategist specializing in senior enterprise IT staffing and SOW revenue leaders.
Your outreach consistently earns replies from skeptical, high-performing enterprise producers and operators who ignore generic recruiting noise.
You write messages that feel like they came from a serious operator — not a recruiter.
Your objective:
Generate a concise, high-conversion LinkedIn InMail that makes a proven enterprise revenue leader genuinely curious enough to take a real conversation.
Think step-by-step internally before writing. Do not reveal reasoning.
ROLE CONTEXT (Source of Truth – Do Not Modify)
Company: Grandview Tek — IT Services & Staffing
Positioning: Scaling fast. Platform to build a business inside an operating ecosystem.
Role: Managing Partner (launch, scale, and lead a new City/Market)
Core Expectations:
Personally produce new IT staffing + SOW revenue in Year 1
Hire, coach, and develop AEs
Run operating cadence (pipeline, forecast, KPIs, QBRs)
Own full market P&L
Win new logos and expand accounts
Build systems so the office thrives beyond founder production
(Align messaging with this structure.)
STRATEGIC POSITIONING PRINCIPLE
Do NOT describe this as a job.
Frame it as:
A structural ownership opportunity for someone already operating at a high level.
This is not upward mobility.
It is economic control.
OPPORTUNITY LEVERAGE (Translate Features Into Structural Advantage)
Never list benefits generically.
Translate them into strategic power serious operators care about.
Instead of "earned equity," position:
→ Building equity in what they create — not just collecting commission inside someone else's machine.
Instead of "uncapped comp," position:
→ Participating in both personal production economics AND team-level economics.
Instead of "full market ownership," position:
→ Authority over hiring, vertical focus, pricing strategy, and growth design.
Instead of "executive support + recruiting engine," position:
→ Infrastructure that accelerates scale without solo risk.
Instead of "Finance, Legal, HR," position:
→ Operating inside a capitalized platform without back-office drag.
Instead of "entrepreneurial culture," position:
→ No corporate layers. No politics. Direct line to decision-makers.
Anchor the opportunity in:
Control
Leverage
Equity
Scale
Autonomy
Exit optionality
Structural advantage
PSYCHOLOGICAL ARCHITECTURE
Your message must:
Open with a concrete reference from their LinkedIn profile.
Create a subtle contrast between their current trajectory and a structural upgrade.
Leverage structural leverage subtly (not hyped).
Insert ONE intelligent micro-qualification question.
End with a low-friction 10–15 minute CTA.
This is not persuasion through hype.
It is persuasion through clarity and contrast.
ETHICS & DISCIPLINE
Use ONLY information explicitly present in the LinkedIn profile.
Do NOT infer revenue numbers unless stated.
Do NOT guess geography beyond what is listed.
If unclear, write around it safely.
Tone:
Peer-to-peer (CEO to revenue leader)
Direct
Controlled
Short sentences
No buzzwords
No emojis
No compensation specifics
Never say "perfect fit"
Never sound like a recruiter
Write like an operator speaking to another operator.
INPUTS
My Name: Joe
IMPORTANT: Do NOT include a sign-off, closing, or name at the end of the message. No "Best, Joe", no "Joe", no "Best," — end the message after the CTA or final sentence. LinkedIn InMail already shows the sender's name.
Candidate Market/City:
→ Infer ONLY if explicitly listed in profile.
Candidate LinkedIn Profile Text:
<<<>>>
INTERNAL STRATEGIC STEPS (Do Not Print)
Extract 2–3 strongest credibility signals from profile.
Determine dominant positioning angle:
Builder ready for ownership
Enterprise producer ready for autonomy
Operator capable of owning P&L
Leader capped by current structure
Proven seller ready to scale through people
Select strongest contrast tension.
Craft a sharp first sentence anchored in profile.
Introduce ownership leverage without sounding promotional.
Add exactly ONE micro-qualification question.
Enforce ≤ 650 characters.
Ensure rhythm reads naturally inside LinkedIn.
OUTPUT FORMAT (Produce ALL)
A) SUBJECT LINE OPTION 1 (≤ 6 words)
B) SUBJECT LINE OPTION 2 (≤ 6 words)
C) INMAIL BODY (≤ 650 characters total)
Formatting rules:
2–4 short paragraphs
Clean spacing
Easy to scan
No fluff
No bullet points
No hashtags
FINAL QUALITY CONTROL (Silent – Do Not Print)
Before delivering, confirm:
At least 2 concrete profile-specific references used
Ownership angle clearly implied
Structural leverage present but not hyped
Exactly one micro-qualification question
Clear CTA
Under 650 characters
Reads like a credible operator wrote it
Would stand out in a senior leader's inbox
Now generate the subject lines and InMail.`;

const SALES_PROMPT = `You are a highly persuasive, emotionally intelligent sales professional crafting casual, consultative, and hyper-personalized LinkedIn messages to executive and technical decision-makers.

These messages are designed for top-of-funnel outreach — sparking genuine interest and increasing reply rates from prospective clients across tech, talent, and procurement roles.

Your job is to write short, warm, and natural-sounding messages that:
• Reference the prospect's background and likely strategic focus
• Softly introduce how Grandview Tech helps companies scale smarter using nearshore agile delivery and flexible tech staffing
• Use conversational tactics, social psychology, and subtle positioning — never a pitch

✅ Think step by step to:
1. Identify the prospect's role, priorities, and business context
2. Infer what challenge or pressure they might be facing (e.g., cost, velocity, hiring bottlenecks, vendor fatigue)
3. Subtly position Grandview's relevance (e.g., speed-to-team, cost advantage, technical fit, or pod-based delivery)
4. Use relaxed, human language that builds rapport — not sales copy
5. End with a soft invitation to connect or continue the conversation

📌 Guidelines:
• Tone: Human, casual, thoughtful, respectful of time
• Structure: 3–5 sentences max
• Personalization: Reference role, company, or known market dynamics
• Influence tactics: Use familiarity, credibility cues, curiosity gaps, and low-effort CTAs
• Format: Use commas (not dashes), natural pacing, avoid pitch formatting

🧠 Use these Grandview Tech context signals as relevant:
• We help tech and talent leaders scale faster and spend smarter using LATAM-based pods and high-performance contractors
• Our clients reduce engineering costs by up to 50%, accelerate sprints, and deploy teams in <3 weeks
• We've helped companies like CNN Digital, Dow Jones, Providence, and PE-backed startups improve delivery with fewer internal resources
• Common pain points: Hiring freezes, project delays, poor ROI from vendors, inability to scale without risk

🎯 Message Goal: Spark interest, build relevance, and invite a reply — not to pitch or convert immediately.

📎 Few-Shot Examples:

Input:
Name: Jordan Ramos
Title: Director of Engineering at a fintech scale-up
Known factors: Recently raised Series C, hiring appears frozen, lots of senior backend roles open

Output:
Hi Jordan, I saw you're leading engineering at [Company] — exciting stage post-Series C. Noticed you've got a lot of senior backend openings live. We've been helping teams in similar spots spin up nearshore pods that deliver fast without long hiring cycles. Would it be helpful to connect and compare notes?

Input:
Name: Alicia Gomez
Title: VP of Talent Acquisition, Enterprise Media Group
Known factors: High req load, previous vendor churn, works with contractors

Output:
Hi Alicia, I saw you're leading TA at [Company] — always admire how media teams move fast with lean recruiting ops. Curious if you'd be open to chat; we've helped teams like WBD and Dow Jones fill high-skill tech roles quickly with low-risk contractor pipelines. Worth comparing notes sometime?

These messages will be sent via LinkedIn InMail or connection requests to prospective clients, not candidates. You are targeting decision-makers across engineering, talent, and procurement roles.

✅ Think step-by-step to:
1. Identify the person's role, seniority, and function
2. Infer which Grandview service vertical is most relevant (Agile Pods or Tech Staffing)
3. Understand their likely current pressure or pain (e.g. hiring freeze, vendor churn, delayed delivery)
4. Position Grandview's value subtly: faster scale, 40–50% cost savings, sprint-ready pods, or contractor pipelines
5. Write a message that's casual, consultative, and relevant — without pitching

📌 Guidelines:
• Tone: Human, warm, calm, slightly informal but consultative
• Structure: 3–5 sentences max
• Personalization: Reference their company, stage, or role context
• Outcome: Message should naturally guide toward a reply or meeting

🧠 Use Grandview's Positioning as Needed:
• Agile Nearshore Pods (LATAM, sprint-ready in 2–3 weeks, 40–50% cost savings)
• Contract-to-Hire and High-Touch Contract Staffing (8.8 avg. submissions/job, 72-hour speed, MSP-compliant)
• Used by: CNN, Dow Jones, Providence, PE-backed firms

🎯 Trigger Scenarios You Can Map To:
• Internal hiring freeze
• Vendor performance fatigue
• Missed sprints or delivery delays
• Need to scale engineering without adding FTE

🎯 Message Goal: Spark interest, build relevance, and invite a reply — not to pitch or convert immediately.

Now, generate a personalized LinkedIn sales outreach message using the following profile data:

[INSERT PROFILE DATA HERE]

Return only the message — no explanations, no formatting.
IMPORTANT: Do NOT include a sign-off, closing, or name at the end. No "Best, Joe", no "Joe", no "Best," — end after the final sentence. LinkedIn already shows the sender's name.`;

function formatUserPrompt(profile) {
  const sections = [`Name: ${profile.full_name || profile.name}`];
  if (profile.occupation || profile.headline) sections.push(`Headline: ${profile.occupation || profile.headline}`);
  if (profile.location) sections.push(`Location: ${profile.location}`);
  if (profile.industry) sections.push(`Industry: ${profile.industry}`);
  if (profile.summary) sections.push(`\nAbout / Summary:\n${profile.summary}`);
  if (profile.experiences && profile.experiences.length > 0) {
    const expLines = profile.experiences.map(exp => {
      let line = `- ${exp.title} at ${exp.company}`;
      if (exp.date) line += ` (${exp.date})`;
      if (exp.location) line += ` — ${exp.location}`;
      if (exp.description) line += `\n  ${exp.description}`;
      return line;
    }).join('\n');
    sections.push(`\nExperience:\n${expLines}`);
  }
  if (profile.education && profile.education.length > 0) {
    const eduLines = profile.education.map(edu => {
      let line = `- ${edu.school}`;
      if (edu.degree) line += ` — ${edu.degree}`;
      if (edu.date) line += ` (${edu.date})`;
      return line;
    }).join('\n');
    sections.push(`\nEducation:\n${eduLines}`);
  }
  if (profile.skills && profile.skills.length > 0) {
    sections.push(`\nSkills: ${profile.skills.join(', ')}`);
  }
  return sections.join('\n');
}

async function generateOutreachMessage(candidateInfo, mode, customPrompt) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const outreachMode = mode || OUTREACH_MODE;

  const profileText = formatUserPrompt(candidateInfo);
  
  let systemPrompt;
  let userContent;

  if (customPrompt) {
    const hasPlaceholder = customPrompt.includes('<<<>>>') ||
      customPrompt.includes('[INSERT PROFILE DATA HERE]') ||
      customPrompt.includes('{{CANDIDATE_PROFILE_JSON_OR_TEXT}}') ||
      /\{\{CANDIDATE_PROFILE\}\}/i.test(customPrompt);

    if (hasPlaceholder) {
      systemPrompt = customPrompt
        .replace('<<<>>>', profileText)
        .replace('[INSERT PROFILE DATA HERE]', profileText)
        .replace('{{CANDIDATE_PROFILE_JSON_OR_TEXT}}', profileText)
        .replace(/\{\{CANDIDATE_PROFILE\}\}/gi, profileText);
    } else {
      systemPrompt = customPrompt + '\n\n--- CANDIDATE PROFILE ---\n' + profileText;
    }
    userContent = profileText;
    console.log(`[messageGen] Using CUSTOM prompt (${customPrompt.length} chars, placeholder: ${hasPlaceholder})`);
  } else if (outreachMode === 'sales') {
    systemPrompt = SALES_PROMPT.replace('[INSERT PROFILE DATA HERE]', profileText);
    userContent = profileText;
  } else {
    systemPrompt = RECRUITER_PROMPT.replace('<<<>>>', profileText);
    userContent = profileText;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  });

  const content = response.choices[0]?.message?.content || '';

  return {
    subject: '',
    message: content,
    profile: candidateInfo,
  };
}

// Regenerate a message incorporating user feedback into the prompt
async function regenerateWithFeedback(candidateInfo, originalPrompt, originalMessage, feedback, mode) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const profileText = formatUserPrompt(candidateInfo);

  const feedbackSystemPrompt = `${originalPrompt}

--- FEEDBACK LOOP ---
You previously generated the following message for this candidate:

"""
${originalMessage}
"""

The user provided this feedback:
"${feedback}"

Now generate an IMPROVED message that addresses the feedback while still following all the original instructions above.
Apply the feedback as a permanent style/content adjustment — not just a one-time fix.
--- END FEEDBACK LOOP ---`;

  const hasPlaceholder = feedbackSystemPrompt.includes('<<<>>>') ||
    feedbackSystemPrompt.includes('[INSERT PROFILE DATA HERE]') ||
    feedbackSystemPrompt.includes('{{CANDIDATE_PROFILE_JSON_OR_TEXT}}') ||
    /\{\{CANDIDATE_PROFILE\}\}/i.test(feedbackSystemPrompt);

  let finalPrompt;
  if (hasPlaceholder) {
    finalPrompt = feedbackSystemPrompt
      .replace('<<<>>>', profileText)
      .replace('[INSERT PROFILE DATA HERE]', profileText)
      .replace('{{CANDIDATE_PROFILE_JSON_OR_TEXT}}', profileText)
      .replace(/\{\{CANDIDATE_PROFILE\}\}/gi, profileText);
  } else {
    finalPrompt = feedbackSystemPrompt + '\n\n--- CANDIDATE PROFILE ---\n' + profileText;
  }

  console.log(`[messageGen] Regenerating with feedback: "${feedback.substring(0, 80)}..."`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: 'system', content: finalPrompt },
      { role: 'user', content: profileText },
    ],
  });

  return response.choices[0]?.message?.content || '';
}

// Take feedback and distill it into a prompt improvement
async function evolvePrompt(currentPrompt, feedbackHistory) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const feedbackSummary = feedbackHistory.map((f, i) =>
    `${i + 1}. Feedback: "${f.feedback}" (for candidate: ${f.candidateName})`
  ).join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    max_tokens: 2000,
    messages: [
      {
        role: 'system',
        content: `You are a prompt engineering expert. Your job is to improve an outreach prompt based on user feedback.

Rules:
- Keep the original prompt's intent, structure, and format intact
- Integrate the feedback as permanent improvements to the instructions
- Do NOT add feedback-specific language — generalize the improvements
- Do NOT add commentary — return ONLY the improved prompt
- Preserve all placeholders (<<<>>>, {{CANDIDATE_PROFILE}}, [INSERT PROFILE DATA HERE]) exactly as they are`
      },
      {
        role: 'user',
        content: `Here is the current prompt:

---START PROMPT---
${currentPrompt}
---END PROMPT---

Here is the feedback from users reviewing generated messages:

${feedbackSummary}

Return the improved prompt with the feedback incorporated as permanent improvements.`
      }
    ],
  });

  return response.choices[0]?.message?.content || currentPrompt;
}

// Generate an outreach prompt from campaign context and type
async function generatePromptFromContext(context, campaignType) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const metaPrompt = campaignType === 'sales'
    ? `You are an expert prompt engineer specializing in LinkedIn sales outreach.
Given the following context about a product/service and target persona, generate an optimized LinkedIn outreach prompt.
The prompt should:
- Be a complete system prompt for an AI to generate personalized LinkedIn messages
- Include the specific product/service details, value props, and target persona from the context
- Use {{CANDIDATE_PROFILE}} as a placeholder where the prospect's LinkedIn profile data will be inserted
- Instruct the AI to write short (3-5 sentences), casual, consultative messages
- Include guidelines about tone (human, warm, not salesy), personalization, and soft CTAs
- Reference specific pain points and differentiators from the context
- End messages without sign-offs (LinkedIn shows sender name)

Return ONLY the prompt text, no explanations.`
    : `You are an expert prompt engineer specializing in LinkedIn recruiting outreach.
Given the following context about a role/opportunity, generate an optimized LinkedIn InMail outreach prompt.
The prompt should:
- Be a complete system prompt for an AI to generate personalized LinkedIn InMail messages
- Include the specific role details, requirements, company value prop, and compensation highlights from the context
- Use {{CANDIDATE_PROFILE}} as a placeholder where the candidate's LinkedIn profile data will be inserted
- Instruct the AI to write compelling, peer-to-peer style messages (not recruiter-speak)
- Include output format: A) SUBJECT LINE OPTION 1, B) SUBJECT LINE OPTION 2, C) INMAIL BODY (≤ 650 chars)
- Include guidelines about tone (direct, operator-to-operator, no buzzwords, no emojis)
- Reference specific opportunity details from the context
- End messages without sign-offs (LinkedIn shows sender name)

Return ONLY the prompt text, no explanations.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.5,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: metaPrompt },
      { role: 'user', content: `Here is the campaign context:\n\n${context}` },
    ],
  });

  return response.choices[0]?.message?.content || '';
}

// ══════════════════════════════════════════════════════════════
// NEW: Goal-based message generation & scoring functions
// ══════════════════════════════════════════════════════════════

/**
 * Build a structured candidate context from raw profile data.
 * Extracts name, title, company, experience summary, and signals
 * (promotions, team size, years in industry, notable companies, etc.)
 */
function buildCandidateContext(profileData) {
  const name = profileData.full_name || profileData.name || 'Unknown';
  const headline = profileData.occupation || profileData.headline || '';
  const location = profileData.location || '';
  const industry = profileData.industry || '';
  const summary = profileData.summary || '';
  const experiences = profileData.experiences || [];
  const education = profileData.education || [];
  const skills = profileData.skills || [];

  // Derive title and company from first (current) experience
  let title = '';
  let company = '';
  if (experiences.length > 0) {
    title = experiences[0].title || '';
    company = experiences[0].company || '';
  }
  if (!title && headline) {
    // Try to parse "Title at Company" from headline
    const atMatch = headline.match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      title = headline;
    }
  }

  // Calculate experience duration
  let totalYears = 0;
  if (experiences.length > 0) {
    // Rough estimate from number of roles and date ranges
    const dateRegex = /(\d{4})/g;
    let earliest = 9999;
    let latest = 0;
    for (const exp of experiences) {
      const dateStr = exp.date || '';
      const years = dateStr.match(dateRegex);
      if (years) {
        for (const y of years) {
          const num = parseInt(y);
          if (num < earliest) earliest = num;
          if (num > latest) latest = num;
        }
      }
    }
    if (earliest < 9999 && latest > 0) {
      totalYears = latest - earliest;
    }
  }

  // Extract signals
  const signals = [];

  // Notable companies (large/recognizable)
  const notableKeywords = ['google', 'amazon', 'microsoft', 'meta', 'apple', 'netflix', 'salesforce',
    'oracle', 'ibm', 'deloitte', 'accenture', 'kpmg', 'ey', 'pwc', 'mckinsey', 'bain', 'bcg',
    'jpmorgan', 'goldman', 'morgan stanley', 'citi', 'tesla', 'uber', 'airbnb', 'stripe',
    'robert half', 'insight global', 'tek systems', 'randstad', 'manpower', 'hays', 'kforce',
    'cnn', 'dow jones', 'providence'];
  const allCompanies = experiences.map(e => e.company || '').filter(Boolean);
  for (const comp of allCompanies) {
    const lower = comp.toLowerCase();
    for (const notable of notableKeywords) {
      if (lower.includes(notable)) {
        signals.push(`Notable company: ${comp}`);
        break;
      }
    }
  }

  // Promotions: detect title progression at the same company
  const companyTitles = {};
  for (const exp of experiences) {
    const c = exp.company || 'Unknown';
    if (!companyTitles[c]) companyTitles[c] = [];
    companyTitles[c].push(exp.title || '');
  }
  for (const [comp, titles] of Object.entries(companyTitles)) {
    if (titles.length >= 2) {
      signals.push(`Promotion path at ${comp}: ${titles.reverse().join(' → ')}`);
    }
  }

  // Leadership signals from titles
  const leadershipKeywords = ['vp', 'vice president', 'director', 'head of', 'chief', 'ceo', 'coo', 'cfo',
    'cto', 'cmo', 'svp', 'evp', 'managing', 'partner', 'president', 'founder', 'owner', 'principal',
    'general manager', 'regional'];
  for (const exp of experiences.slice(0, 3)) {
    const titleLower = (exp.title || '').toLowerCase();
    for (const keyword of leadershipKeywords) {
      if (titleLower.includes(keyword)) {
        signals.push(`Leadership role: ${exp.title} at ${exp.company}`);
        break;
      }
    }
  }

  // Team/revenue signals from descriptions
  for (const exp of experiences) {
    const desc = (exp.description || '').toLowerCase();
    const teamMatch = desc.match(/(\d+)\+?\s*(team|people|employees|reports|direct reports|staff)/i);
    if (teamMatch) {
      signals.push(`Team size: ${teamMatch[1]}+ at ${exp.company}`);
    }
    const revenueMatch = desc.match(/\$[\d.,]+\s*(m|mm|million|b|billion|k)/i);
    if (revenueMatch) {
      signals.push(`Revenue reference: ${revenueMatch[0]} at ${exp.company}`);
    }
  }

  // Years in industry
  if (totalYears > 0) {
    signals.push(`${totalYears}+ years of experience`);
  }

  // Location signal
  if (location) {
    signals.push(`Based in: ${location}`);
  }

  // Industry
  if (industry) {
    signals.push(`Industry: ${industry}`);
  }

  return {
    name,
    title,
    company,
    headline,
    location,
    experience: experiences.map(e => ({
      title: e.title || '',
      company: e.company || '',
      date: e.date || '',
      description: e.description || '',
    })),
    education: education.map(e => ({
      school: e.school || '',
      degree: e.degree || '',
      date: e.date || '',
    })),
    skills,
    summary,
    totalYears,
    signals,
  };
}

/**
 * Score a generated message using OpenAI.
 * Returns {score, breakdown, signals, replyProbability}
 */
async function scoreMessage(message, candidateContext, campaignGoal) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `You are a message quality evaluator for LinkedIn outreach. Score the message on these dimensions (0-100 each):
- personalization: How well does the message reference specific details from the candidate's profile?
- clarity: Is the message clear, easy to read, and well-structured?
- tone: Does it match the desired tone? Not too salesy, not too casual?
- responselikelihood: How likely is this message to get a reply from this specific person?
- lengthEfficiency: Is the message the right length? Not too long, not too short?

Also identify:
- signals: What specific profile references are used in the message? (e.g., "Referenced: promotion to Regional Director")
- replyProbability: Overall estimate 0-100 of likelihood this person replies

Return ONLY valid JSON in this exact format:
{
  "score": <overall 0-100>,
  "breakdown": {
    "personalization": <0-100>,
    "clarity": <0-100>,
    "tone": <0-100>,
    "responselikelihood": <0-100>,
    "lengthEfficiency": <0-100>
  },
  "signals": ["Referenced: ...", "Referenced: ..."],
  "replyProbability": <0-100>
}`
        },
        {
          role: 'user',
          content: `Campaign Goal: ${campaignGoal || 'LinkedIn outreach'}

Candidate Context:
Name: ${candidateContext.name}
Title: ${candidateContext.title}
Company: ${candidateContext.company}
Signals: ${(candidateContext.signals || []).join('; ')}

Message to score:
"""
${message}
"""`
        }
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: parsed.score || 75,
        breakdown: parsed.breakdown || { personalization: 75, clarity: 75, tone: 75, responselikelihood: 75, lengthEfficiency: 75 },
        signals: parsed.signals || [],
        replyProbability: parsed.replyProbability || 50,
      };
    }
    // Fallback if parsing fails
    return { score: 75, breakdown: { personalization: 75, clarity: 75, tone: 75, responselikelihood: 75, lengthEfficiency: 75 }, signals: [], replyProbability: 50 };
  } catch (err) {
    console.error('[scoreMessage] Error:', err.message);
    return { score: 75, breakdown: { personalization: 75, clarity: 75, tone: 75, responselikelihood: 75, lengthEfficiency: 75 }, signals: ['Score unavailable'], replyProbability: 50 };
  }
}

/**
 * Generate a message from campaign goal fields (outcome, tone, constraints).
 * Builds the system prompt internally from campaign settings.
 */
async function generateFromCampaignGoal(candidateContext, campaign) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Get active prompt from library, or build one
  let basePrompt = '';
  const promptLibrary = campaign.promptLibrary || [];
  const activeEntry = promptLibrary.find(p => p.active);
  if (activeEntry) {
    basePrompt = activeEntry.prompt;
  }

  const profileText = typeof candidateContext === 'string' ? candidateContext :
    `Name: ${candidateContext.name}
Title: ${candidateContext.title}
Company: ${candidateContext.company}
Headline: ${candidateContext.headline || ''}
Location: ${candidateContext.location || ''}
Summary: ${candidateContext.summary || ''}
Experience:
${(candidateContext.experience || []).map(e => `- ${e.title} at ${e.company} (${e.date}) ${e.description ? '— ' + e.description : ''}`).join('\n')}
Education:
${(candidateContext.education || []).map(e => `- ${e.school} ${e.degree ? '— ' + e.degree : ''}`).join('\n')}
Skills: ${(candidateContext.skills || []).join(', ')}
Signals: ${(candidateContext.signals || []).join('; ')}`;

  const constraintsText = (campaign.constraints || []).join('\n- ');

  let systemPrompt;
  if (basePrompt) {
    // Use the library prompt but inject context
    const hasPlaceholder = basePrompt.includes('<<<>>>') ||
      basePrompt.includes('[INSERT PROFILE DATA HERE]') ||
      basePrompt.includes('{{CANDIDATE_PROFILE_JSON_OR_TEXT}}') ||
      /\{\{CANDIDATE_PROFILE\}\}/i.test(basePrompt);

    if (hasPlaceholder) {
      systemPrompt = basePrompt
        .replace('<<<>>>', profileText)
        .replace('[INSERT PROFILE DATA HERE]', profileText)
        .replace('{{CANDIDATE_PROFILE_JSON_OR_TEXT}}', profileText)
        .replace(/\{\{CANDIDATE_PROFILE\}\}/gi, profileText);
    } else {
      systemPrompt = basePrompt + '\n\n--- CANDIDATE PROFILE ---\n' + profileText;
    }
  } else {
    // Build from scratch using campaign goal fields
    systemPrompt = `ROLE: You are an elite LinkedIn outreach strategist. You craft messages that earn replies from busy, skeptical professionals.

OBJECTIVE: ${campaign.outcome || 'Start a meaningful conversation with this person.'}

CONTEXT ABOUT THE CANDIDATE:
${profileText}

RULES:
${constraintsText ? '- ' + constraintsText : '- Keep it concise and personalized'}
- Use ONLY information present in the candidate's profile
- Do NOT include a sign-off or closing name (LinkedIn shows sender name)
- Reference at least one specific detail from their profile

TONE: ${campaign.tone || 'Professional, peer-to-peer, concise'}

OUTPUT: Generate a LinkedIn InMail message only. No explanations, no formatting labels.
If the campaign type is recruiting, also provide:
A) SUBJECT LINE OPTION 1 (≤ 6 words)
B) SUBJECT LINE OPTION 2 (≤ 6 words)
C) INMAIL BODY`;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: profileText },
    ],
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * Evolve a prompt based on accumulated feedback dataset.
 * Analyzes patterns in feedback and generates an improved prompt.
 */
async function evolvePromptFromDataset(currentPrompt, feedbackDataset) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Summarize the feedback dataset
    const feedbackSummary = feedbackDataset.slice(-20).map((entry, i) => {
      const feedback = entry.feedback || entry.feedbackType || 'general';
      const correction = entry.correction || entry.customFeedback || '';
      const candidateName = entry.candidateContext?.name || 'unknown';
      return `${i + 1}. Type: ${feedback}${correction ? ` — "${correction}"` : ''} (candidate: ${candidateName})`;
    }).join('\n');

    // Analyze feedback patterns
    const feedbackCounts = {};
    for (const entry of feedbackDataset) {
      const type = entry.feedback || entry.feedbackType || 'general';
      feedbackCounts[type] = (feedbackCounts[type] || 0) + 1;
    }
    const patternSummary = Object.entries(feedbackCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `"${type}": ${count} times`)
      .join(', ');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `You are a prompt engineering expert specializing in LinkedIn outreach optimization.
Your job: Take a current outreach prompt and improve it based on accumulated user feedback.

Rules:
- Keep the original prompt's core intent and structure
- Integrate feedback patterns as permanent improvements
- Generalize the improvements (don't be feedback-instance-specific)
- Preserve all placeholders exactly as they are (<<<>>>, {{CANDIDATE_PROFILE}}, [INSERT PROFILE DATA HERE])
- Return ONLY the improved prompt text, no commentary`
        },
        {
          role: 'user',
          content: `Current prompt:
---START---
${currentPrompt}
---END---

Feedback patterns (most common issues): ${patternSummary}

Recent feedback entries:
${feedbackSummary}

Generate the improved prompt.`
        }
      ],
    });

    return response.choices[0]?.message?.content || currentPrompt;
  } catch (err) {
    console.error('[evolvePromptFromDataset] Error:', err.message);
    return currentPrompt;
  }
}

module.exports = {
  generateOutreachMessage,
  regenerateWithFeedback,
  evolvePrompt,
  formatUserPrompt,
  generatePromptFromContext,
  buildCandidateContext,
  scoreMessage,
  generateFromCampaignGoal,
  evolvePromptFromDataset,
  RECRUITER_PROMPT,
  SALES_PROMPT,
};
