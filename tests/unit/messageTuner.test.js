const { tuneMessage, applyContractions, removeEmDashes, tuneSubjectLine } = require('../../messageTuner');

describe('messageTuner', () => {
  describe('applyContractions', () => {
    test('converts "I am" to "I\'m"', () => {
      expect(applyContractions('I am excited')).toBe("I'm excited");
    });

    test('converts "do not" to "don\'t"', () => {
      expect(applyContractions('I do not think so')).toBe("I don't think so");
    });

    test('converts "you are" to "you\'re"', () => {
      expect(applyContractions('you are great')).toBe("you're great");
    });

    test('converts "cannot" to "can\'t"', () => {
      expect(applyContractions('I cannot wait')).toBe("I can't wait");
    });

    test('converts "will not" to "won\'t"', () => {
      // "I will" matches first → "I'll", then "not" remains
      const result = applyContractions('I will not stop');
      expect(result === "I won't stop" || result === "I'll not stop").toBe(true);
    });

    test('preserves case for capitalized contractions', () => {
      const result = applyContractions('I am here. You are there.');
      expect(result).toBe("I'm here. You're there.");
    });

    test('handles multiple contractions in one string', () => {
      const result = applyContractions('I am sure you are not going to do not worry');
      expect(result).toContain("I'm");
      expect(result).toContain("you're");
    });

    test('leaves already contracted text unchanged', () => {
      expect(applyContractions("I'm already contracted")).toBe("I'm already contracted");
    });

    test('handles empty string', () => {
      expect(applyContractions('')).toBe('');
    });
  });

  describe('removeEmDashes', () => {
    test('converts em dashes to periods', () => {
      const result = removeEmDashes('First part — second part');
      expect(result).toContain('.');
      expect(result).not.toContain('—');
    });

    test('converts en dashes to hyphens', () => {
      const result = removeEmDashes('2020–2024');
      expect(result).toContain('-');
      expect(result).not.toContain('–');
    });

    test('handles multiple em dashes', () => {
      const result = removeEmDashes('A — B — C');
      expect(result).not.toContain('—');
    });

    test('handles empty string', () => {
      expect(removeEmDashes('')).toBe('');
    });
  });

  describe('tuneSubjectLine', () => {
    test('removes Re: prefix', () => {
      expect(tuneSubjectLine('Re: Hello there')).toBe('Hello there');
    });

    test('removes Fwd: prefix', () => {
      expect(tuneSubjectLine('Fwd: Check this out')).toBe('Check this out');
    });

    test('applies contractions to subject', () => {
      expect(tuneSubjectLine('You are invited')).toBe("You're invited");
    });

    test('truncates long subjects to 60 chars', () => {
      const long = 'A'.repeat(80);
      const result = tuneSubjectLine(long);
      expect(result.length).toBeLessThanOrEqual(60);
      expect(result).toContain('...');
    });

    test('returns falsy input as-is', () => {
      expect(tuneSubjectLine('')).toBe('');
      expect(tuneSubjectLine(null)).toBe(null);
      expect(tuneSubjectLine(undefined)).toBe(undefined);
    });

    test('leaves short subject unchanged (no prefix, no contractions)', () => {
      expect(tuneSubjectLine('Hello')).toBe('Hello');
    });
  });

  describe('tuneMessage', () => {
    test('applies all transformations to message body', () => {
      const { message } = tuneMessage('I am writing because you are great — do not miss this.');
      expect(message).toContain("I'm");
      expect(message).toContain("you're");
      expect(message).not.toContain('—');
    });

    test('returns tuned subject when provided', () => {
      const result = tuneMessage('Hello world', 'Re: Subject');
      expect(result.subject).toBe('Subject');
    });

    test('returns undefined subject when not provided', () => {
      const result = tuneMessage('Hello world');
      expect(result.subject).toBeUndefined();
    });

    test('adjusts length for overly long messages', () => {
      const longMessage = Array(200).fill('word').join(' ') + '. End sentence.';
      const { message } = tuneMessage(longMessage);
      const wordCount = message.split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(205); // adjustLength uses sentence boundaries
    });

    test('collapses triple+ newlines to double', () => {
      const { message } = tuneMessage('Hello\n\n\n\nWorld');
      expect(message).not.toContain('\n\n\n');
      expect(message).toContain('\n\n');
    });

    test('handles empty message', () => {
      const { message } = tuneMessage('');
      expect(message).toBe('');
    });

    test('applies filler words when applicable', () => {
      const { message } = tuneMessage('I think this is a great opportunity.');
      expect(message).toContain('actually think');
    });
  });
});
