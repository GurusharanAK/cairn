export function validateMeaningfulText(
  rawValue: string,
  fieldName: string,
  minAlnum: number = 3
): string | null {
  const cleaned = (rawValue || '').trim();
  if (!cleaned) {
    return `${fieldName} cannot be empty.`;
  }

  const alnum = cleaned.match(/[A-Za-z0-9]/g) || [];
  if (alnum.length === 0) {
    return `${fieldName} must include meaningful words, not only punctuation or symbols.`;
  }

  if (alnum.length < minAlnum) {
    return `${fieldName} is too short; please enter at least ${minAlnum} letters or numbers.`;
  }

  if (!/[A-Za-z]{2,}/.test(cleaned)) {
    return `${fieldName} must include at least one alphabetic word rather than digits or isolated characters.`;
  }

  const uniqueChars = new Set(alnum.map((ch) => ch.toLowerCase()));
  if (uniqueChars.size <= 1) {
    return `${fieldName} appears to be repetitive junk input; please enter meaningful text.`;
  }

  return null;
}
