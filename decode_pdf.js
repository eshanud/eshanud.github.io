const fs = require('fs');
const zlib = require('zlib');

const buf = fs.readFileSync('C:/Users/hp/Downloads/index/Eshanki-UD-Resume.pdf');
const str = buf.toString('latin1');

function getStreams() {
  const streams = [];
  let idx = 0;
  while (true) {
    const start = str.indexOf('stream', idx);
    if (start < 0) break;
    let dataStart = start + 6;
    if (str[dataStart] === '\r') dataStart++;
    if (str[dataStart] === '\n') dataStart++;
    const end = str.indexOf('endstream', dataStart);
    if (end < 0) break;
    const chunk = Buffer.from(str.slice(dataStart, end), 'latin1');
    if (chunk.length > 50) {
      try {
        const deflated = zlib.inflateSync(chunk);
        streams.push(deflated.toString('latin1'));
      } catch(e) { streams.push(null); }
    } else { streams.push(null); }
    idx = end + 9;
  }
  return streams;
}

const streams = getStreams();

function parseCMap(s) {
  if (!s || !s.includes('begincmap')) return null;
  const map = {};
  const bfcharBlocks = s.match(/beginbfchar[\s\S]*?endbfchar/g) || [];
  for (const block of bfcharBlocks) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      map[parseInt(m[1], 16)] = parseInt(m[2], 16);
    }
  }
  const bfrangeBlocks = s.match(/beginbfrange[\s\S]*?endbfrange/g) || [];
  for (const block of bfrangeBlocks) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      const f = parseInt(m[1], 16), t = parseInt(m[2], 16), d = parseInt(m[3], 16);
      for (let i = f; i <= t; i++) map[i] = d + (i - f);
    }
  }
  return map;
}

const cmaps = [];
const cmapOrder = [];
streams.forEach((s, i) => {
  const c = parseCMap(s);
  if (c) { cmaps.push(c); cmapOrder.push(i); }
});

// Map font names F4, F5, F6... to cmaps in order
// Stream indices for cmaps: 2, 4, 6, 8 (every other after fonts)
// F4 -> cmap 0, F5 -> cmap 1, F6 -> cmap 2, F7 -> cmap 3

const pageContent = streams[0];
if (!pageContent) { console.log('No page content'); process.exit(); }

// Parse all BT...ET blocks
const btRe = /BT[\s\S]*?ET/g;
let btM;
let currentFont = 0;

while ((btM = btRe.exec(pageContent)) !== null) {
  const block = btM[0];
  const fontRe = /\/F(\d+)/g;
  let fm;
  if ((fm = fontRe.exec(block)) !== null) {
    currentFont = parseInt(fm[1]) - 4; // F4=0, F5=1, etc.
  }
  const cmap = cmaps[currentFont] || cmaps[0];

  const hexRe = /<([0-9A-Fa-f]+)>/g;
  let hm;
  let decoded = '';
  while ((hm = hexRe.exec(block)) !== null) {
    const hex = hm[1];
    for (let i = 0; i < hex.length; i += 4) {
      const code = parseInt(hex.slice(i, i+4), 16);
      const unicode = cmap ? cmap[code] : null;
      if (unicode) {
        try { decoded += String.fromCodePoint(unicode); } catch(e) { decoded += '?'; }
      }
    }
  }
  if (decoded.trim()) process.stdout.write(decoded.trim() + '\n');
}
