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
    // Custom prompt from the UI — inject profile data into placeholders
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
      // No placeholder found — append profile data to the end of the prompt
      systemPrompt = customPrompt + '\n\n--- CANDIDATE PROFILE ---\n' + profileText;
    }
    userContent = profileText;
    console.log(`[messageGen] Using CUSTOM prompt (${customPrompt.length} chars, placeholder: ${hasPlaceholder})`);
  } else if (outreachMode === 'sales') {
    // For sales mode, replace the placeholder in the prompt
    systemPrompt = SALES_PROMPT.replace('[INSERT PROFILE DATA HERE]', profileText);
    userContent = profileText;
  } else {
    // For recruiter mode, insert profile into the <<<>>> placeholder
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

  // Build a meta-prompt that incorporates the feedback
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

  // Inject profile data using all placeholder formats
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

module.exports = { generateOutreachMessage, regenerateWithFeedback, evolvePrompt, formatUserPrompt, generatePromptFromContext, RECRUITER_PROMPT, SALES_PROMPT };
