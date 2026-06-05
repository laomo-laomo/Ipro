import { prisma } from './src/config/database';

async function main() {
  // Find 小红帽 story
  const stories = await prisma.story.findMany({
    where: { title: { contains: '小红帽' } },
    include: { illustrations: { orderBy: { sceneIndex: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  for (const story of stories) {
    console.log(`=== ${story.id} | ${story.title} ===`);
    console.log(`Scenes: ${story.illustrations.length}`);
    try {
      const { normalizeStoryboard } = await import('./src/types/storyboard');
      const board = normalizeStoryboard(story.scenes, story.title);
      for (const scene of board.scenes) {
        const text = (scene.storyText || '').slice(0, 50);
        console.log(`  [${scene.index}] ${scene.title} | ${text}`);
      }
    } catch (e) {
      console.log('Parse error:', e instanceof Error ? e.message : e);
    }
    console.log('---');
  }
  process.exit(0);
}
main();
