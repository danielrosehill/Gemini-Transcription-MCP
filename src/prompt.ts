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

export const RAW_TRANSCRIPTION_PROMPT = `The audio binary provided contains a voice note dictated by the user. Your task is to return a verbatim transcript with minimal but essential cleanup.

## Instructions

### Preserve (Verbatim)
- Keep filler words ("um," "uh," "like," "you know," etc.)
- Keep false starts and self-corrections as spoken
- Keep repetitions and restarts
- Maintain the speaker's natural speech patterns

### Essential Cleanup (Apply These)
- **Spelled-out words**: Convert letter-by-letter spelling to the intended word. If the user says "B-A-N-A-N-A-S," transcribe as "bananas." If they say "capital D-A-N-I-E-L," transcribe as "Daniel."
- **Incomplete sentences**: When the speaker trails off mid-sentence without completing a thought, end with an ellipsis (...) and move to the next complete thought. Do not fabricate endings.
- **Verbal deletions**: Honor explicit deletion commands. If the user says "no wait, delete that" or "scratch that" or "never mind that last part," remove the preceding phrase or sentence they're referring to.
- **Basic punctuation**: Add periods, commas, and question marks where clearly indicated by intonation and pauses.

### Do NOT
- Remove filler words or hesitations
- Restructure or reorder content
- Improve prose or wording
- Add information not present in the audio

## Response Format

You MUST respond with valid JSON matching this exact structure:

{
  "title": "A short, descriptive title summarizing the note",
  "description": "A two-sentence summary of the note's content.",
  "transcript": "The verbatim transcript with essential cleanup applied.",
  "timestamp": "ISO 8601 timestamp (will be filled by system)",
  "timestamp_readable": "Human-readable timestamp (will be filled by system)"
}

Return ONLY the JSON object, no additional text or markdown code blocks.`;

export const DEVSPEC_PROMPT = `The audio binary provided contains a voice note where the user describes a software project, feature, or technical idea. Your task is to transcribe this content and structure it as a **Development Specification** suitable for an AI coding agent to begin implementation.

## Instructions

1. **Transcribe the audio content** - Capture all technical details, requirements, and context
2. **Apply standard cleanup** - Remove filler words, honor verbal corrections, add punctuation
3. **Structure as a development spec** - Organize the content into the sections defined below

## Output Structure

Transform the transcribed content into these sections (omit sections if no relevant content was provided):

### Project Overview
A brief summary of what is being built and its purpose.

### Requirements
#### Functional Requirements
- Bulleted list of what the system must do
- Each requirement should be specific and actionable

#### Non-Functional Requirements
- Performance, security, scalability, accessibility requirements if mentioned

### Technical Constraints
- Required technologies, frameworks, languages, or platforms
- Integration requirements with existing systems
- Environment constraints (OS, deployment target, etc.)

### Architecture Notes
- High-level design decisions mentioned by the user
- Component structure if described
- Data flow or state management approach

### User Stories / Use Cases
If the user described specific workflows or user interactions, format them as:
- "As a [user type], I want to [action] so that [benefit]"

### API / Interface Definitions
If endpoints, function signatures, or interfaces were described, document them with:
- Endpoint/function name
- Parameters
- Expected behavior
- Return values

### Success Criteria
How will we know this is complete? What defines "done"?

### Open Questions
Any ambiguities, missing details, or decisions that need clarification before implementation.

### Implementation Notes
Any specific guidance the user provided about how to build this.

## Formatting Guidelines

- Use Markdown formatting with clear headers
- Be specific and actionable - an AI agent should be able to start coding from this spec
- Preserve technical terminology exactly as the user stated it
- If the user mentioned specific file paths, variable names, or code patterns, include them verbatim
- Flag any contradictions or unclear requirements in the "Open Questions" section

## Response Format

You MUST respond with valid JSON matching this exact structure:

{
  "title": "Project/Feature Name - Development Spec",
  "description": "A two-sentence summary of the project being specified.",
  "transcript": "The full development specification in Markdown format.",
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
