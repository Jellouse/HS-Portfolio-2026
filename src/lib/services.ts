const BRACKET = /\[([^\]]+)\]/g;

export function hasBracket(text: string): boolean {
  return /\[([^\]]+)\]/.test(text);
}

/** Visible highlight for unfilled CMS values like [year] or [x to y]. */
export function renderPlaceholders(text: string): string {
  return text.replace(BRACKET, '<span class="content-placeholder">[$1]</span>');
}

export function faqJsonLd(
  items: { question: string; answer: string }[],
  pageUrl: string,
): Record<string, unknown> | undefined {
  const mainEntity = items
    .filter((item) => !hasBracket(item.question) && !hasBracket(item.answer))
    .map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer.replace(BRACKET, '$1') },
    }));
  if (!mainEntity.length) return undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity,
    url: pageUrl,
  };
}
