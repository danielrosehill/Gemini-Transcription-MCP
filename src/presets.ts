const REPO_TREE_URL = 'https://api.github.com/repos/danielrosehill/Text-Transformation-Prompt-Library/git/trees/main?recursive=1';
const RAW_BASE = 'https://raw.githubusercontent.com/danielrosehill/Text-Transformation-Prompt-Library/main';

export interface PresetInfo {
  slug: string;
  displayName: string;
  path: string;
}

interface PresetJson {
  name?: string;
  description?: string;
  system_prompt_text?: string;
}

// Cache the preset list in memory for the lifetime of the process
let cachedPresets: PresetInfo[] | null = null;

function slugFromPath(filePath: string): string {
  // "prompts/json/ blog_outline_270525.json" -> "blog_outline"
  let name = filePath.replace(/^prompts\/json\//, '').trim();
  name = name.replace(/\.json$/, '');
  // Strip trailing date suffix like _270525 or _280525
  name = name.replace(/_\d{6}$/, '');
  return name.toLowerCase();
}

export async function listPresets(): Promise<PresetInfo[]> {
  if (cachedPresets) return cachedPresets;

  const response = await fetch(REPO_TREE_URL, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch preset list from GitHub: ${response.status}`);
  }

  const data = await response.json() as { tree: Array<{ path: string; type: string }> };

  const seen = new Set<string>();
  const presets: PresetInfo[] = [];

  for (const item of data.tree) {
    if (item.type !== 'blob') continue;
    if (!item.path.startsWith('prompts/json/')) continue;
    if (!item.path.endsWith('.json')) continue;

    const slug = slugFromPath(item.path);
    if (seen.has(slug)) continue;
    seen.add(slug);

    presets.push({
      slug,
      displayName: slug.replace(/_/g, ' '),
      path: item.path,
    });
  }

  presets.sort((a, b) => a.slug.localeCompare(b.slug));
  cachedPresets = presets;
  return presets;
}

export async function getPresetPrompt(presetName: string): Promise<{ prompt: string; name: string }> {
  const presets = await listPresets();

  // Normalize the user input to a slug
  const normalized = presetName.toLowerCase().replace(/[\s-]/g, '_').replace(/[^\w]/g, '');

  // Exact match first
  let match = presets.find(p => p.slug === normalized);

  // Partial match if no exact
  if (!match) {
    const candidates = presets.filter(p => p.slug.includes(normalized) || normalized.includes(p.slug));
    if (candidates.length === 1) {
      match = candidates[0];
    } else if (candidates.length > 1) {
      const names = candidates.map(c => c.slug).join(', ');
      throw new Error(`Ambiguous preset "${presetName}". Did you mean one of: ${names}`);
    }
  }

  if (!match) {
    throw new Error(`Preset "${presetName}" not found. Use the list_transcription_presets tool to see available presets.`);
  }

  // Fetch the preset JSON content
  const encodedPath = match.path.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const url = `${RAW_BASE}/${encodedPath}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch preset content: ${response.status}`);
  }

  const data = await response.json() as PresetJson;

  if (!data.system_prompt_text) {
    throw new Error(`Preset "${match.slug}" has no prompt text defined`);
  }

  return {
    prompt: data.system_prompt_text,
    name: data.name || match.displayName,
  };
}

/**
 * Wraps a preset's transformation prompt so it works with audio transcription,
 * instructing the model to transcribe first, then apply the transformation,
 * and return structured JSON output.
 */
export function wrapPresetForTranscription(presetPrompt: string): string {
  return `You are processing an audio recording. Your task has two steps:

1. **Transcribe** the audio recording accurately.
2. **Transform** the transcript by applying the following instructions:

---
${presetPrompt}
---

Return your response as a JSON object with exactly these fields:
- "title": A short descriptive title for the content (max 10 words)
- "description": A one-sentence summary of what this content is
- "transcript": The final transformed text (the output after applying the transformation instructions above)

Return ONLY the raw JSON object. Do not wrap it in markdown code blocks or add any other text.`;
}
