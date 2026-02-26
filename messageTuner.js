/**
 * Message Tuner — post-processes AI-generated messages to sound more natural.
 * Applies contractions, removes em dashes, adds filler, adjusts length, tweaks subject lines.
 */

const CONTRACTION_MAP = {
  'I am': "I'm", 'I have': "I've", 'I will': "I'll", 'I would': "I'd",
  'you are': "you're", 'you have': "you've", 'you will': "you'll", 'you would': "you'd",
  'we are': "we're", 'we have': "we've", 'we will': "we'll", 'we would': "we'd",
  'they are': "they're", 'they have': "they've", 'they will': "they'll", 'they would': "they'd",
  'he is': "he's", 'he has': "he's", 'he will': "he'll", 'he would': "he'd",
  'she is': "she's", 'she has': "she's", 'she will': "she'll", 'she would': "she'd",
  'it is': "it's", 'it has': "it's", 'it will': "it'll",
  'that is': "that's", 'that has': "that's", 'that will': "that'll",
  'there is': "there's", 'there has': "there's",
  'what is': "what's", 'what has': "what's", 'what will': "what'll",
  'who is': "who's", 'who has': "who's", 'who will': "who'll",
  'how is': "how's", 'how has': "how's",
  'do not': "don't", 'does not': "doesn't", 'did not': "didn't",
  'is not': "isn't", 'are not': "aren't", 'was not': "wasn't", 'were not': "weren't",
  'has not': "hasn't", 'have not': "haven't", 'had not': "hadn't",
  'will not': "won't", 'would not': "wouldn't", 'could not': "couldn't",
  'should not': "shouldn't", 'can not': "can't", 'cannot': "can't",
  'let us': "let's",
};

function applyContractions(text) {
  let result = text;
  for (const [full, contracted] of Object.entries(CONTRACTION_MAP)) {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      if (match[0] === match[0].toUpperCase()) {
        return contracted[0].toUpperCase() + contracted.slice(1);
      }
      return contracted;
    });
  }
  return result;
}

function removeEmDashes(text) {
  return text
    .replace(/\s*—\s*/g, ' — ')
    .replace(/\s*—\s*/g, '. ')
    .replace(/\s*–\s*/g, ' - ')
    .replace(/\.\.\s/g, '. ');
}

function addFillerWords(text) {
  const fillers = [
    { pattern: /\bI think\b/i, replacement: 'I actually think' },
    { pattern: /\bIt seems\b/i, replacement: 'It really seems' },
    { pattern: /\bI noticed\b/i, replacement: 'I noticed' },
  ];
  let result = text;
  let applied = 0;
  for (const f of fillers) {
    if (applied >= 1) break;
    if (f.pattern.test(result)) {
      result = result.replace(f.pattern, f.replacement);
      applied++;
    }
  }
  return result;
}

function adjustLength(text, maxWords = 150) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  let result = '';
  let wordCount = 0;
  for (const sentence of sentences) {
    const sWords = sentence.split(/\s+/).length;
    if (wordCount + sWords > maxWords && wordCount > 0) break;
    result += (result ? ' ' : '') + sentence;
    wordCount += sWords;
  }
  return result;
}

function tuneSubjectLine(subject) {
  if (!subject) return subject;
  let result = subject
    .replace(/^Re:\s*/i, '')
    .replace(/^Fwd:\s*/i, '');
  result = applyContractions(result);
  if (result.length > 60) {
    result = result.substring(0, 57) + '...';
  }
  return result;
}

function tuneMessage(message, subject) {
  let tuned = message;
  tuned = removeEmDashes(tuned);
  tuned = applyContractions(tuned);
  tuned = addFillerWords(tuned);
  tuned = adjustLength(tuned, 150);
  tuned = tuned.replace(/\n{3,}/g, '\n\n');
  const tunedSubject = subject ? tuneSubjectLine(subject) : undefined;
  return { message: tuned, subject: tunedSubject };
}

module.exports = { tuneMessage, applyContractions, removeEmDashes, tuneSubjectLine };
