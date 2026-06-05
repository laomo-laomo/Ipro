import { generateStoryPDF } from './src/services/pdf.service';
import { prisma } from './src/config/database';
import * as fs from 'fs/promises';

async function main() {
  const story = await prisma.story.findFirst({
    where: { illustrations: { some: {} } },
    orderBy: { createdAt: 'desc' },
  });
  if (!story) {
    console.log('No story found');
    process.exit(0);
  }
  console.log('Generating PDF for', story.id, story.title);
  const buf = await generateStoryPDF(story.id, story.userId);
  await fs.writeFile('F:/IPro/test_output.pdf', buf);
  console.log('OK:', buf.length, 'bytes -> F:/IPro/test_output.pdf');
  process.exit(0);
}
main();
