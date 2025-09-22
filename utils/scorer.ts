export interface AttributeSuggestion {
  qualifier: string;
  proposedValue: string;
}

export interface ProductSuggestionResponse {
  attributeSuggestions?: AttributeSuggestion[];
  invalidAttributeSuggestions?: AttributeSuggestion[];
}

export interface ScoreBreakdown {
  correct: number;
  incorrect: number;
  hallucinated: number;
  invalid: number;
  missed: number;
  score: number;
}

/**
 * Compare AI suggestion response against ground-truth expectations.
 * @param expected Expected list of attribute suggestions for the product.
 * @param response API response containing attributeSuggestions & invalidAttributeSuggestions.
 */
export function scoreProduct(
  expected: AttributeSuggestion[],
  response: ProductSuggestionResponse,
): ScoreBreakdown {
  const expectedMap = new Map<string, string>();
  expected.forEach(({ qualifier, proposedValue }) => {
    expectedMap.set(qualifier, proposedValue);
  });

  const respAttr = response.attributeSuggestions ?? [];
  const respInvalid = response.invalidAttributeSuggestions ?? [];

  let correct = 0;
  let incorrect = 0;
  let hallucinated = 0;
  const invalid = respInvalid.length;

  // Track qualifiers we have seen in response.
  const seenQualifiers = new Set<string>();

  // Evaluate attributeSuggestions array
  for (const { qualifier, proposedValue } of respAttr) {
    seenQualifiers.add(qualifier);
    if (!expectedMap.has(qualifier)) {
      hallucinated += 1;
      continue;
    }
    if (expectedMap.get(qualifier) === proposedValue) {
      correct += 1;
    } else {
      incorrect += 1;
    }
  }

  // Track qualifiers seen in invalid list so they aren't counted as missed.
  for (const { qualifier } of respInvalid) {
    seenQualifiers.add(qualifier);
  }

  const missed = Array.from(expectedMap.keys()).filter((q) => !seenQualifiers.has(q)).length;

  const score = correct - incorrect - hallucinated - invalid - missed;

  return { correct, incorrect, hallucinated, invalid, missed, score };
} 