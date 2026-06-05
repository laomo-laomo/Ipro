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
  url?: string;
  status?: 'pending' | 'generating' | 'processing' | 'completed' | 'failed';
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
