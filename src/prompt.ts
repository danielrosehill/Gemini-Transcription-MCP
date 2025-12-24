/**
 * Generates a format-specific transcription prompt.
 * The AI agent specifies the desired output format, and this constructs
 * an appropriate prompt for Gemini to transcribe and format in one pass.
 */
export function generateFormatPrompt(format: string): string {
  return `The audio binary provided contains a voice note dictated by the user. Your task is to transcribe this content and format it as: **${format}**

## Instructions

1. **Transcribe the audio content** - Capture all meaningful content from the audio
2. **Apply light cleanup** - Remove filler words ("um," "uh," "like"), honor verbal corrections, add punctuation
3. **Format the output** as a ${format} - Structure the transcribed content appropriately for this format

## Format-Specific Guidance

Based on the requested format "${format}", apply appropriate structural conventions:

- **Email**: Include a subject line suggestion, greeting, body paragraphs, and sign-off placeholder
- **To-do list / Task list**: Extract actionable items as a bulleted or numbered list with checkboxes
- **Meeting notes**: Include attendees (if mentioned), date, key discussion points, action items, and decisions
- **Technical document**: Use proper headings, sections, code formatting if applicable
- **Blog post**: Include a compelling title, introduction, body sections with subheadings, conclusion
- **Summary / Executive summary**: Condense to key points, main takeaways, and recommendations
- **Letter**: Formal letter structure with date, recipient, salutation, body, closing
- **Report**: Structured sections with findings, analysis, and conclusions
- **Script / Dialogue**: Format with speaker labels and stage directions if applicable
- **Outline**: Hierarchical structure with main topics and subtopics

If the format doesn't match these examples, use your judgment to apply the most appropriate structure for "${format}".

## Core Principles

- Preserve the speaker's intended meaning and all substantive content
- Apply formatting that makes the content most useful in the requested format
- Do not add information not present in the audio
- If content doesn't fit the requested format well, do your best and note any limitations

## Response Format

You MUST respond with valid JSON matching this exact structure:

{
  "title": "A short, descriptive title appropriate for the ${format}",
  "description": "A two-sentence summary of the content.",
  "transcript": "The transcribed and formatted content as a ${format}.",
  "format_applied": "${format}",
  "timestamp": "ISO 8601 timestamp (will be filled by system)",
  "timestamp_readable": "Human-readable timestamp (will be filled by system)"
}

Return ONLY the JSON object, no additional text or markdown code blocks.`;
}

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
