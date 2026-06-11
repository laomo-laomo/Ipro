import type { StorySegment } from '@/types/story';

/**
 * Merge illustration data into story segments.
 * Used by both useStory and useGallery hooks.
 */
export function mergeIllustrations(
  currentSegments: StorySegment[],
  illustrationSegments: StorySegment[]
): StorySegment[] {
  if (currentSegments.length === 0) {
    return illustrationSegments;
  }
  return currentSegments.map((segment) => {
    const illustration = illustrationSegments.find((item) => item.order === segment.order);
    if (!illustration) return segment;
    return {
      ...segment,
      imageUrl: illustration.imageUrl,
      imageStatus: illustration.imageStatus,
      // Always take the freshest errorMessage from the server. If a retry
      // cleared the previous error (status flipped back to 'processing'/'completed'),
      // a null here will hide the stale message from the UI.
      errorMessage: illustration.errorMessage ?? segment.errorMessage ?? undefined,
    };
  });
}
