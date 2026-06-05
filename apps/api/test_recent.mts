import { prisma } from './src/config/database';
async function main() {
  const stories = await prisma.story.findMany({
    where: { createdAt: { gt: new Date(Date.now() - 24*60*60*1000) } },
    include: { illustrations: { select: { sceneIndex: true } } },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  for (const s of stories) {
    const idxs = new Set(s.illustrations.map(i => i.sceneIndex));
    console.log(s.id.slice(0,8), s.title, 'scenes=', idxs.size);
  }
  process.exit(0);
}
main();
