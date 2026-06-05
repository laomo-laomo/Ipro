export interface StoryDialogueLine {
  speakerId?: string;
  speaker?: string;
  text: string;
  textEn?: string;
  displayOnImage?: boolean;
  tts?: boolean;
  emotion?: string;
}

export interface StoryNarration {
  text: string;
  textEn?: string;
  displayOnImage?: boolean;
  tts?: boolean;
  voiceId?: string;
  voiceIdEn?: string;
}

export interface StoryShot {
  type?: string;
  angle?: string;
  focus?: string;
  movement?: string;
}

export interface StorySceneImage {
  prompt?: string;
  originalPrompt?: string;
  url?: string | null;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount?: number;
  failureCategory?: string | null;
  errorMessage?: string | null;
  cost?: number;
}

export interface StoryboardScene {
  id: string;
  index: number;
  title: string;
  titleEn?: string;
  charactersInScene?: string[];
  storyText: string;
  storyTextEn?: string;
  imageDescription: string;
  imageDescriptionEn?: string;
  imagePrompt?: string;
  charactersLayout?: string;
  dialogue: StoryDialogueLine[];
  narration?: StoryNarration;
  voiceover: string;
  voiceoverEn?: string;
  subtitle?: string;
  shot?: StoryShot;
  durationSec?: number;
  musicMood?: string;
  sfx?: string[];
  image?: StorySceneImage;
}

export interface StoryboardCharacter {
  characterId?: string;
  featureDesc?: string;
  featureDescEn?: string;
  style?: string;
  originalPhotoUrl?: string;
  stylizedPhotoUrl?: string;
}

export interface StoryboardVoiceCastItem {
  speakerId?: string;
  name?: string;
  nameEn?: string;
  role?: string;
  voiceId?: string;
  voiceIdEn?: string;
}

export interface Storyboard {
  version: 1;
  title: string;
  titleEn?: string;
  summary?: string;
  summaryEn?: string;
  theme?: string;
  themeEn?: string;
  audienceAge?: string;
  character?: StoryboardCharacter;
  voiceCast?: StoryboardVoiceCastItem[];
  scenes: StoryboardScene[];
}

export interface LegacyScene {
  index: number;
  description: string;
  text: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asOptionalString(value: unknown): string | undefined {
  const text = asString(value);
  return text || undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter(Boolean);
}

function slugifySceneTitle(title: string, index: number): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized ? `scene-${index}-${normalized}` : `scene-${index}`;
}

function deriveSceneTitle(description: string, index: number): string {
  const cleaned = description
    .replace(/^第\s*\d+\s*[幕章页：:.-]*/u, '')
    .replace(/[，。！？!?].*$/u, '')
    .trim();

  return cleaned || `第 ${index + 1} 幕`;
}

function toSubtitle(text: string, textEn?: string): string | undefined {
  const zh = asString(text);
  const en = asString(textEn);

  if (zh && en) {
    return `${zh}\n${en}`;
  }

  return zh || en || undefined;
}

function normalizeDialogueLine(line: any): StoryDialogueLine {
  return {
    speakerId: asOptionalString(line?.speakerId || line?.speaker),
    speaker: asOptionalString(line?.speaker),
    text: asString(line?.text),
    textEn: asOptionalString(line?.textEn),
    displayOnImage: typeof line?.displayOnImage === 'boolean' ? line.displayOnImage : undefined,
    tts: typeof line?.tts === 'boolean' ? line.tts : undefined,
    emotion: asOptionalString(line?.emotion),
  };
}

function normalizeNarration(raw: any, scene: any): StoryNarration | undefined {
  const source = raw && typeof raw === 'object' ? raw : null;
  const text = asString(source?.text || scene?.voiceover || scene?.storyText || scene?.text || scene?.content);
  const textEn = asOptionalString(source?.textEn || scene?.voiceoverEn || scene?.storyTextEn || scene?.textEn);

  if (!text && !textEn) {
    return undefined;
  }

  return {
    text,
    textEn,
    displayOnImage: typeof source?.displayOnImage === 'boolean' ? source.displayOnImage : undefined,
    tts: typeof source?.tts === 'boolean' ? source.tts : undefined,
    voiceId: asOptionalString(source?.voiceId || scene?.voiceId),
    voiceIdEn: asOptionalString(source?.voiceIdEn || scene?.voiceIdEn),
  };
}

function normalizeImage(raw: any): StorySceneImage | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  return {
    prompt: asOptionalString(raw.prompt),
    originalPrompt: asOptionalString(raw.originalPrompt),
    url: raw.url ?? null,
    status: raw.status,
    retryCount: typeof raw.retryCount === 'number' ? raw.retryCount : undefined,
    failureCategory: raw.failureCategory ?? null,
    errorMessage: raw.errorMessage ?? null,
    cost: typeof raw.cost === 'number' ? raw.cost : undefined,
  };
}

function normalizeCharacter(raw: any): StoryboardCharacter | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  return {
    characterId: asOptionalString(raw.characterId || raw.id),
    featureDesc: asOptionalString(raw.featureDesc || raw.description),
    featureDescEn: asOptionalString(raw.featureDescEn || raw.descriptionEn),
    style: asOptionalString(raw.style),
    originalPhotoUrl: asOptionalString(raw.originalPhotoUrl),
    stylizedPhotoUrl: asOptionalString(raw.stylizedPhotoUrl),
  };
}

function normalizeVoiceCast(raw: any): StoryboardVoiceCastItem[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const voiceCast = raw.map((item) => ({
    speakerId: asOptionalString(item?.speakerId || item?.id),
    name: asOptionalString(item?.name),
    nameEn: asOptionalString(item?.nameEn),
    role: asOptionalString(item?.role),
    voiceId: asOptionalString(item?.voiceId),
    voiceIdEn: asOptionalString(item?.voiceIdEn),
  }));

  return voiceCast.length > 0 ? voiceCast : undefined;
}


function looksLikeStoryboardScene(scene: any): boolean {
  if (!scene || typeof scene !== 'object') {
    return false;
  }

  return Boolean(
    scene.id
    || scene.titleEn
    || scene.storyText
    || scene.storyTextEn
    || scene.imageDescription
    || scene.imageDescriptionEn
    || scene.voiceover
    || scene.voiceoverEn
    || scene.subtitle
    || scene.narration
    || scene.charactersInScene
    || scene.charactersLayout
    || scene.dialogue
    || scene.imagePrompt
    || scene.image
  );
}
function normalizeScene(scene: any, index: number): StoryboardScene {
  const imageDescription = asString(scene?.imageDescription || scene?.description || scene?.sceneDesc || scene?.title);
  const title = asString(scene?.title) || deriveSceneTitle(imageDescription, index);
  const storyText = asString(scene?.storyText || scene?.text || scene?.content || scene?.voiceover);
  const storyTextEn = asOptionalString(scene?.storyTextEn || scene?.textEn);
  const voiceover = asString(scene?.voiceover || storyText);
  const voiceoverEn = asOptionalString(scene?.voiceoverEn || storyTextEn);

  return {
    id: asString(scene?.id) || slugifySceneTitle(title, index),
    index: typeof scene?.index === 'number' ? scene.index : index,
    title,
    titleEn: asOptionalString(scene?.titleEn),
    charactersInScene: asStringArray(scene?.charactersInScene),
    storyText,
    storyTextEn,
    imageDescription,
    imageDescriptionEn: asOptionalString(scene?.imageDescriptionEn || scene?.descriptionEn),
    imagePrompt: asOptionalString(scene?.imagePrompt),
    charactersLayout: asOptionalString(scene?.charactersLayout),
    dialogue: Array.isArray(scene?.dialogue) ? scene.dialogue.map(normalizeDialogueLine) : [],
    narration: normalizeNarration(scene?.narration, scene),
    voiceover,
    voiceoverEn,
    subtitle: asOptionalString(scene?.subtitle) || toSubtitle(voiceover || storyText, voiceoverEn || storyTextEn),
    shot: scene?.shot,
    durationSec: typeof scene?.durationSec === 'number' ? scene.durationSec : 6,
    musicMood: asOptionalString(scene?.musicMood),
    sfx: asStringArray(scene?.sfx),
    image: normalizeImage(scene?.image),
  };
}

export function storyboardSceneToLegacyScene(scene: StoryboardScene): LegacyScene {
  return {
    index: scene.index,
    description: scene.imageDescription,
    text: scene.storyText,
  };
}

export function buildStoryboardFromLegacyScenes(input: {
  title: string;
  titleEn?: string;
  summary?: string;
  summaryEn?: string;
  theme?: string;
  themeEn?: string;
  audienceAge?: string;
  character?: StoryboardCharacter;
  voiceCast?: StoryboardVoiceCastItem[];
  scenes: LegacyScene[];
}): Storyboard {
  return {
    version: 1,
    title: input.title,
    titleEn: input.titleEn,
    summary: input.summary,
    summaryEn: input.summaryEn,
    theme: input.theme,
    themeEn: input.themeEn,
    audienceAge: input.audienceAge,
    character: input.character,
    voiceCast: input.voiceCast,
    scenes: input.scenes.map((scene, index) => {
      const title = deriveSceneTitle(scene.description, index);
      return normalizeScene({
        id: slugifySceneTitle(title, index),
        index: typeof scene.index === 'number' ? scene.index : index,
        title,
        storyText: scene.text,
        storyTextEn: '',
        imageDescription: scene.description,
        imageDescriptionEn: '',
        imagePrompt: undefined,
        dialogue: [],
        narration: {
          text: scene.text,
          textEn: '',
          tts: true,
        },
        voiceover: scene.text,
        voiceoverEn: '',
        subtitle: toSubtitle(scene.text, ''),
        shot: {
          type: index === 0 ? 'wide' : 'medium',
          angle: 'eye-level',
          focus: 'main-action',
        },
        durationSec: 6,
        musicMood: 'warm',
        sfx: [],
      }, index);
    }),
  };
}

export function normalizeStoryboard(raw: string | null | undefined, fallbackTitle = ''): Storyboard {
  if (!raw) {
    return {
      version: 1,
      title: fallbackTitle,
      scenes: [],
    };
  }

  try {
    const parsed = JSON.parse(raw);

    if (parsed?.version === 1 && Array.isArray(parsed?.scenes)) {
      return {
        version: 1,
        title: asString(parsed.title) || fallbackTitle,
        titleEn: asOptionalString(parsed.titleEn),
        summary: asOptionalString(parsed.summary),
        summaryEn: asOptionalString(parsed.summaryEn),
        theme: asOptionalString(parsed.theme),
        themeEn: asOptionalString(parsed.themeEn),
        audienceAge: asOptionalString(parsed.audienceAge),
        character: normalizeCharacter(parsed.character),
        voiceCast: normalizeVoiceCast(parsed.voiceCast),
        scenes: parsed.scenes.map((scene: any, index: number) => normalizeScene(scene, index)),
      };
    }

    if (Array.isArray(parsed)) {
      return buildStoryboardFromLegacyScenes({ title: fallbackTitle, scenes: parsed as LegacyScene[] });
    }

    if (Array.isArray(parsed?.scenes)) {
      return buildStoryboardFromLegacyScenes({
        title: asString(parsed.title) || fallbackTitle,
        titleEn: asOptionalString(parsed.titleEn),
        summary: asOptionalString(parsed.summary),
        summaryEn: asOptionalString(parsed.summaryEn),
        theme: asOptionalString(parsed.theme),
        themeEn: asOptionalString(parsed.themeEn),
        audienceAge: asOptionalString(parsed.audienceAge),
        character: normalizeCharacter(parsed.character),
        voiceCast: normalizeVoiceCast(parsed.voiceCast),
        scenes: parsed.scenes.map((scene: any, index: number) => ({
          index: typeof scene?.index === 'number' ? scene.index : index,
          description: asString(scene?.imageDescription || scene?.description || scene?.sceneDesc || scene?.title || `第${index + 1}幕`),
          text: asString(scene?.storyText || scene?.text || scene?.content || scene?.voiceover),
        })),
      });
    }
  } catch {
    // Fall through to empty storyboard.
  }

  return {
    version: 1,
    title: fallbackTitle,
    scenes: [],
  };
}

export function storyboardToStorage(storyboard: Storyboard): string {
  const normalized: Storyboard = {
    version: 1,
    title: storyboard.title,
    titleEn: storyboard.titleEn,
    summary: storyboard.summary,
    summaryEn: storyboard.summaryEn,
    theme: storyboard.theme,
    themeEn: storyboard.themeEn,
    audienceAge: storyboard.audienceAge,
    character: storyboard.character,
    voiceCast: storyboard.voiceCast,
    scenes: storyboard.scenes.map((scene, index) => normalizeScene(scene, index)),
  };

  return JSON.stringify(normalized);
}

export function storyboardToLegacyScenes(storyboard: Storyboard): LegacyScene[] {
  return storyboard.scenes.map(storyboardSceneToLegacyScene);
}

