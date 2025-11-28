export const RAW_TRANSCRIPTION_PROMPT = `The audio binary provided contains a voice note dictated by the user. Your task is to return a verbatim transcript of this content.

## Instructions

- Transcribe exactly what is spoken, including filler words ("um," "uh," "like," etc.)
- Include false starts, corrections, and repetitions as spoken
- Add basic punctuation only where clearly indicated by pauses
- Do not edit, clean up, or restructure the content

## Response Format

You MUST respond with valid JSON matching this exact structure:

{
  "title": "A short, descriptive title summarizing the note",
  "description": "A two-sentence summary of the note's content.",
  "transcript": "The verbatim transcript.",
  "timestamp": "ISO 8601 timestamp (will be filled by system)",
  "timestamp_readable": "Human-readable timestamp (will be filled by system)"
}

Return ONLY the JSON object, no additional text or markdown code blocks.`;

export const TRANSCRIPTION_PROMPT = `The audio binary provided contains a voice note dictated by the user. Your task is to return a lightly edited transcript of this content.

## Editing Scope

Apply the following edits:

- **Omit filler words** such as "um," "uh," "like," etc.
- **Honor inline corrections**: If the user verbally corrects themselves, apply the correction. For example, if the user says "and tomorrow I need to buy kiwis—wait, I meant bananas," return "tomorrow I need to buy bananas." Treat verbal corrections as editing instructions.
- **Add punctuation** to ensure logical sentence structure.
- **Add paragraph breaks** where appropriate to improve readability.
- **Generate subheadings** where logical to divide the text into sections. Return the transcript in Markdown format.

## Out of Scope

Do **not** make the following types of edits:

- General stylistic improvements or rewording for "better" prose
- Adding information not present in the original audio
- Changing the user's intended meaning

## Core Principles

The fundamental objective is to return an accurate transcript that is lightly edited for intelligibility when read as text.

**Preserve the source material in its entirety.** If the input is exceptionally long, use a chunking approach with logical breakpoints. However, in most cases, the full transcript should fit within the context window.

## Response Format

You MUST respond with valid JSON matching this exact structure:

{
  "title": "A short, descriptive title summarizing the note (e.g., 'Ideas for a Tech Blog')",
  "description": "A two-sentence summary of the note's content.",
  "transcript": "The edited transcript in Markdown format with paragraphs and subheadings.",
  "timestamp": "ISO 8601 timestamp (will be filled by system)",
  "timestamp_readable": "Human-readable timestamp (will be filled by system)"
}

Return ONLY the JSON object, no additional text or markdown code blocks.`;
