const fs = require('fs');
const zlib = require('zlib');
const text = fs.readFileSync('F:/IPro/test_output.pdf', 'latin1');
const re = /(\d+) 0 obj\s*<<[^>]*?\/Type \/Page(?!s)[^>]*?\/Contents (\d+) 0 R/g;
let m;
let pageNum = 0;
while ((m = re.exec(text)) !== null) {
  pageNum++;
  if (pageNum !== 3) continue; // dump page 3 only
  const contentObj = m[2];
  const streamRe = new RegExp(`${contentObj} 0 obj[\\s\\S]*?stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream`);
  const sm = streamRe.exec(text);
  if (sm) {
    let decoded;
    try { decoded = zlib.inflateSync(Buffer.from(sm[1], 'latin1')).toString('latin1'); }
    catch { decoded = sm[1]; }
    console.log(`=== Page 3 content ===`);
    console.log(decoded);
  }
}
