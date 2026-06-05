/**
 * PDF Export Service
 *
 * Generates a downloadable PDF of the story: title page + one print-ready page
 * per scene. The generated illustrations already contain the story text, so the
 * PDF treats each illustration as the main printable page instead of duplicating
 * body copy in a side column.
 *
 * Uses pdfkit (pure JS, no native deps). Chinese text is rendered via embedded
 * Source Han Sans / Noto Sans CJK fonts if available on disk; otherwise falls
 * back to a default font (Chinese glyphs may render as blank on systems without
 * a CJK font — see `findCjkFont`).
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import { resolve } from 'path';
import https from 'https';
import http from 'http';
import { Writable } from 'stream';
import { prisma } from '../config/database.js';
import { normalizeStoryboard } from '../types/storyboard.js';

const PAGE_W = 842; // A4 landscape at 72 dpi
const PAGE_H = 595;
const PAPER = '#f7edd8';
const INK = '#3a2e1f';
const RED = '#a82a3a';
const GOLD = '#c8a878';

const CN_FONT_CANDIDATES = [
  // Prefer single-file TTF/OTF (pdfkit cannot use TTC without an index)
  'C:/Windows/Fonts/simkai.ttf',  // 楷体 — for titles
  'C:/Windows/Fonts/simhei.ttf',  // 黑体 — for body
  'C:/Windows/Fonts/simfang.ttf',
  'C:/Windows/Fonts/simsun.ttf',  // 宋体 — for body
  // Linux
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
  '/usr/share/fonts/truetype/arphic/uming.ttc',
  // macOS
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/STHeiti Light.ttc',
  '/Library/Fonts/Songti.ttc',
];

function findCjkFont(name: 'kai' | 'hei' | 'song'): { path: string; buffer: Buffer } | null {
  const order = name === 'kai'
    ? ['simkai.ttf', 'simsun.ttf', 'simhei.ttf', 'NotoSansCJK', 'wqy-microhei', 'uming', 'PingFang', 'STHeiti', 'Songti']
    : name === 'song'
    ? ['simsun.ttf', 'simkai.ttf', 'simhei.ttf', 'NotoSansCJK', 'wqy-microhei', 'uming', 'PingFang', 'STHeiti', 'Songti']
    : ['simhei.ttf', 'simkai.ttf', 'simsun.ttf', 'NotoSansCJK', 'wqy-microhei', 'uming', 'PingFang', 'STHeiti', 'Songti'];

  for (const partial of order) {
    for (const p of CN_FONT_CANDIDATES) {
      if (p.toLowerCase().includes(partial.toLowerCase())) {
        try {
          if (fs.existsSync(p)) return { path: p, buffer: fs.readFileSync(p) };
        } catch {
          // continue
        }
      }
    }
  }
  return null;
}

function fetchImageBuffer(url: string): Promise<Buffer> {
  return new Promise((resolveBuf, rejectBuf) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // redirect
          resolveBuf(fetchImageBuffer(res.headers.location));
          return;
        }
        if (res.statusCode !== 200) {
          rejectBuf(new Error(`Image HTTP ${res.statusCode}: ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolveBuf(Buffer.concat(chunks)));
        res.on('error', rejectBuf);
      })
      .on('error', rejectBuf);
  });
}

function safeFont(doc: PDFKit.PDFDocument, preferred: string, fallback: string = 'Helvetica'): PDFKit.PDFDocument {
  try {
    return doc.font(preferred);
  } catch {
    return doc.font(fallback);
  }
}

function drawPaperBackground(doc: PDFKit.PDFDocument): void {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(PAPER);
  doc.save();
  doc.strokeColor('#e5d0a8').lineWidth(1);
  doc.rect(22, 22, PAGE_W - 44, PAGE_H - 44).stroke();
  doc.strokeColor('#fff8e8').lineWidth(1);
  doc.rect(28, 28, PAGE_W - 56, PAGE_H - 56).stroke();
  doc.restore();
}

export async function generateStoryPDF(storyId: string, userId: string): Promise<Buffer> {
  const story = await prisma.story.findFirst({
    where: { id: storyId, userId },
    include: {
      illustrations: { orderBy: { sceneIndex: 'asc' } },
    },
  });
  if (!story) throw new Error('Story not found');

  const storyboard = normalizeStoryboard(story.scenes, story.title);
  const title = storyboard.title || story.title || '我的绘本';

  // Pre-fetch all illustration images in parallel
  const illustrationByIndex = new Map(story.illustrations.map((ill) => [ill.sceneIndex, ill]));
  const sceneImageBufs = await Promise.all(
    storyboard.scenes.map(async (scene) => {
      const ill = illustrationByIndex.get(scene.index);
      if (!ill?.imageUrl) return null;
      try {
        return await fetchImageBuffer(ill.imageUrl);
      } catch (err) {
        console.warn(`[PDF] Failed to fetch image for scene ${scene.index}: ${err instanceof Error ? err.message : err}`);
        return null;
      }
    })
  );

  // Render to an in-memory buffer
  return new Promise<Buffer>((resolveBuf, rejectBuf) => {
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 30, info: { Title: title, Creator: 'IPro' } });
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      },
    });
    doc.pipe(sink);

    // Register CJK fonts: kai (title) + hei (body)
    const kaiFont = findCjkFont('kai');
    const heiFont = findCjkFont('hei');
    if (kaiFont) {
      try {
        doc.registerFont('kai', kaiFont.buffer);
      } catch (err) {
        console.warn(`[PDF] Failed to register kai font ${kaiFont.path}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (heiFont) {
      try {
        doc.registerFont('hei', heiFont.buffer);
        doc.font('hei');
        console.log(`[PDF] Loaded CJK fonts: kai=${kaiFont?.path || 'fallback'} | hei=${heiFont.path}`);
      } catch (err) {
        console.warn(`[PDF] Failed to register hei font ${heiFont.path}: ${err instanceof Error ? err.message : err}`);
      }
    } else {
      console.warn('[PDF] No CJK font found; Chinese characters may render as blank');
    }

    // --- Title page ---
    {
      drawPaperBackground(doc);

      doc.save();
      doc.strokeColor(GOLD).lineWidth(2.5);
      doc.roundedRect(70, 80, PAGE_W - 140, PAGE_H - 160, 18).stroke();
      doc.strokeColor('#fff7df').lineWidth(1.5);
      doc.roundedRect(82, 92, PAGE_W - 164, PAGE_H - 184, 14).stroke();
      doc.restore();

      const titleY = PAGE_H * 0.32;
      safeFont(doc, 'kai').fillColor(RED).fontSize(title.length > 8 ? 44 : 56).text(title, 90, titleY, {
        width: PAGE_W - 180,
        align: 'center',
      });
      safeFont(doc, 'hei').fillColor('#7a5a3a').fontSize(17).text(
        `共 ${storyboard.scenes.length} 页 · 打印版绘本`,
        90,
        titleY + 105,
        { width: PAGE_W - 180, align: 'center' }
      );
      doc.fillColor('#000');
    }

    // --- Per-scene pages: one large printable illustration per page ---
    for (let i = 0; i < storyboard.scenes.length; i++) {
      doc.addPage();
      const scene = storyboard.scenes[i];
      const imgBuf = sceneImageBufs[i];

      drawPaperBackground(doc);

      const margin = 46;
      const headerH = 36;
      const footerH = 32;
      const imgBoxX = margin;
      const imgBoxY = margin + headerH;
      const imgBoxW = PAGE_W - margin * 2;
      const imgBoxH = PAGE_H - margin * 2 - headerH - footerH;
      const titleText = scene.title || `第 ${i + 1} 页`;

      safeFont(doc, 'kai').fontSize(18).fillColor(RED).text(titleText, margin, margin - 10, {
        width: imgBoxW,
        align: 'center',
        ellipsis: true,
      });

      doc.save();
      doc.roundedRect(imgBoxX - 8, imgBoxY - 8, imgBoxW + 16, imgBoxH + 16, 12).fill('#fff8ea');
      doc.strokeColor(GOLD).lineWidth(1.2).roundedRect(imgBoxX - 8, imgBoxY - 8, imgBoxW + 16, imgBoxH + 16, 12).stroke();
      doc.restore();

      if (imgBuf) {
        try {
          doc.image(imgBuf, imgBoxX, imgBoxY, {
            fit: [imgBoxW, imgBoxH],
            align: 'center',
            valign: 'center',
          });
        } catch (err) {
          console.warn(`[PDF] Failed to embed image for scene ${scene.index}: ${err instanceof Error ? err.message : err}`);
        }
      } else {
        doc.rect(imgBoxX, imgBoxY, imgBoxW, imgBoxH).stroke('#d7c29a');
        safeFont(doc, 'hei').fontSize(16).fillColor('#9a7a4a').text('（插画生成中）', imgBoxX, imgBoxY + imgBoxH / 2 - 8, {
          width: imgBoxW,
          align: 'center',
        });
        doc.fillColor('#000');
      }

      // Small page badge. Keep it outside the illustration so the page remains print-clean.
      // lineBreak:false + height:1.2em pins it on the current page — without this
      // pdfkit's auto-pagination kicks in (the y is just barely past the bottom
      // margin safe area) and pushes the badge to its own empty page, which is
      // why the previous render had 17 pages: 1 cover + 8 scene pages + 8 empty
      // badge pages.
      safeFont(doc, 'kai').fontSize(12).fillColor('#b08b5b');
      doc.text(
        `· ${i + 1} ·`,
        margin,
        PAGE_H - margin - 2,
        { width: imgBoxW, align: 'center', lineBreak: false, height: 12 }
      );
      doc.fillColor(INK);
    }

    doc.end();
    sink.on('finish', () => resolveBuf(Buffer.concat(chunks)));
    sink.on('error', rejectBuf);
  });
}
