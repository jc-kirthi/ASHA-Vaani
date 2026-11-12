export function buildExtractionPrompt(transcript: string, language: string): string {
  return [
    `Language code: ${language}`,
    'Extract only information explicitly stated in the transcript. Do not infer, assume, diagnose, or fill missing values.',
    'Use null for an unstated scalar and an empty array for an unstated list.',
    'For every populated field, copy the shortest exact supporting transcript phrase into its evidence field.',
    'Preserve symptom negation, whether it is current or past/resolved, and any uncertainty in symptom data.',
    'Return only the requested JSON object.',
    `Transcript: ${transcript}`,
  ].join('\n');
}
