import { prisma } from '../src/config/database.js';

async function main() {
  // Find failed illustration records directly
  const failedIlls = await prisma.illustration.findMany({ 
    where: { status: 'failed' },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log('Failed illustrations:', failedIlls.length);
  if (failedIlls.length > 0) {
    console.log('First one:', JSON.stringify(failedIlls[0], null, 2));
    // Get story
    const story = await prisma.story.findFirst({
      where: { id: failedIlls[0].storyId }
    });
    console.log('Story:', JSON.stringify(story, null, 2));
  }
}
main().catch(console.error);