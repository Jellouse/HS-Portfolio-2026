
import sharp from 'sharp';
import {
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  existsSync,
} from 'node:fs';
import { join, extname, basename, dirname, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src/content/projects');
const MAX = 3200;
const JPEG_Q = 82;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (/\.(jpe?g|png|webp|avif)$/i.test(name)) out.push(path);
  }
  return out;
}

function totalBytes(files) {
  return files.reduce((s, f) => s + (existsSync(f) ? statSync(f).size : 0), 0);
}

const files = walk(ROOT);
const before = totalBytes(files);
console.log(`Before: ${files.length} files, ${(before / 1024 / 1024).toFixed(2)} MB`);

const renames = [];

for (const file of files) {
  const ext = extname(file).toLowerCase();
  const meta = await sharp(file).metadata();
  const long = Math.max(meta.width || 0, meta.height || 0);
  const needsResize = long > MAX;
  const isPng = ext === '.png';
  const convertPng = isPng && !meta.hasAlpha;

  let pipeline = sharp(file).rotate();
  if (needsResize) {
    pipeline = pipeline.resize({
      width: meta.width >= meta.height ? MAX : undefined,
      height: meta.height > meta.width ? MAX : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  let outPath = file;
  let buf;

  if (convertPng || ext === '.jpg' || ext === '.jpeg' || (ext === '.webp' && !meta.hasAlpha)) {

    const asJpeg = convertPng || ext === '.jpg' || ext === '.jpeg';
    if (asJpeg) {
      buf = await pipeline.jpeg({ quality: JPEG_Q, mozjpeg: true }).toBuffer();
      if (convertPng) {
        outPath = file.replace(/\.png$/i, '.jpg');
      }
    } else {
      buf = await pipeline.webp({ quality: JPEG_Q }).toBuffer();
    }
  } else if (isPng && meta.hasAlpha) {
    buf = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
  } else if (ext === '.avif') {
    buf = await pipeline.avif({ quality: JPEG_Q }).toBuffer();
  } else {
    buf = await pipeline.webp({ quality: JPEG_Q }).toBuffer();
  }

  const originalSize = statSync(file).size;

  if (buf.length < originalSize || needsResize || convertPng || outPath !== file) {
    writeFileSync(outPath, buf);
    if (outPath !== file) {
      unlinkSync(file);
      const relFrom = '/' + relative(process.cwd(), file).replace(/\\/g, '/');
      const relTo = '/' + relative(process.cwd(), outPath).replace(/\\/g, '/');
      renames.push({ from: relFrom, to: relTo });
      console.log(
        `CONVERT ${(originalSize / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB  ${relative(process.cwd(), file)} → ${basename(outPath)}`,
      );
    } else {
      console.log(
        `OPT     ${(originalSize / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB  ${relative(process.cwd(), file)}`,
      );
    }
  } else {

    if (buf.length <= originalSize * 1.02) {
      writeFileSync(file, buf);
      console.log(
        `STRIP   ${(originalSize / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB  ${relative(process.cwd(), file)}`,
      );
    } else {
      console.log(`SKIP    ${(originalSize / 1024).toFixed(0)}KB  ${relative(process.cwd(), file)}`);
    }
  }
}

if (renames.length) {
  function walkYaml(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walkYaml(path, out);
      else if (/\.ya?ml$/i.test(name)) out.push(path);
    }
    return out;
  }
  const yamls = walkYaml(ROOT);
  for (const y of yamls) {
    let text = readFileSync(y, 'utf8');
    let changed = false;
    for (const { from, to } of renames) {
      if (text.includes(from)) {
        text = text.split(from).join(to);
        changed = true;
      }
    }
    if (changed) {
      writeFileSync(y, text);
      console.log(`YAML    ${relative(process.cwd(), y)}`);
    }
  }
}

const afterFiles = walk(ROOT);
const after = totalBytes(afterFiles);
console.log(`After: ${afterFiles.length} files, ${(after / 1024 / 1024).toFixed(2)} MB`);
console.log(
  `Saved: ${((before - after) / 1024 / 1024).toFixed(2)} MB (${(((before - after) / before) * 100).toFixed(1)}%)`,
);
writeFileSync(
  'scripts/optimize-report.json',
  JSON.stringify(
    {
      beforeMB: +(before / 1024 / 1024).toFixed(2),
      afterMB: +(after / 1024 / 1024).toFixed(2),
      beforeFiles: files.length,
      afterFiles: afterFiles.length,
      renames,
    },
    null,
    2,
  ),
);
