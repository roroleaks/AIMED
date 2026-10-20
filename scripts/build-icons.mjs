import sharp from "sharp";
import fs from "fs";
import path from "path";

const srcPath = "C:/Users/raouf.RAOUFDESKTOP/.gemini/antigravity/brain/2bba9978-4d71-4a44-b2ed-701bf3c27e5c/.user_uploaded/media_1792520195344_d923aec9.jpg";
const publicDir = path.resolve("public");
const appDir = path.resolve("src/app");

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// First, copy the source image into public for reproducibility
fs.copyFileSync(srcPath, path.join(publicDir, "app-icon-source.jpg"));

async function generateAllIcons() {
  console.log("🎨 Extracting and preparing AIMed app icons...");

  // Bounding box of the icon:
  // Center is approx (512, 285).
  // Icon squircle width is 380, height is 376.
  const size = 376;
  const left = 512 - Math.floor(size / 2); // 324
  const top = 98; // 98 to 474

  // Extract raw crop
  const cropped = await sharp(srcPath)
    .extract({ left, top, width: size, height: size })
    .toBuffer();

  // Create high-precision squircle mask (rx = 78)
  const rx = Math.round(size * 0.21); // ~79
  const maskSvg = Buffer.from(
    `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="#ffffff"/></svg>`
  );

  // Apply mask to create transparent squircle
  const transparentIconBuffer = await sharp(cropped)
    .ensureAlpha()
    .composite([{ input: maskSvg, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Clean any remaining outer checkerboard artifact if needed
  const { data, info } = await sharp(transparentIconBuffer).raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > 0) {
        // Distance from center
        const dx = x - size / 2;
        const dy = y - size / 2;
        const dist = Math.hypot(dx, dy);
        // If near outer corners, check for light gray checkerboard
        if (dist > size * 0.48) {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const isGray = Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && Math.abs(r - b) < 12 && r > 165;
          if (isGray) {
            data[idx + 3] = 0; // make completely transparent
          }
        }
      }
    }
  }

  const cleanIconBuffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .png()
    .toBuffer();

  console.log("✅ Base squircle icon cleaned and extracted.");

  // 1. Standard PWA Icons (transparent corners)
  const icon512 = await sharp(cleanIconBuffer).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const icon192 = await sharp(cleanIconBuffer).resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, "icon-512.png"), icon512);
  fs.writeFileSync(path.join(publicDir, "icon-192.png"), icon192);

  // 2. Next.js App Router default icons
  fs.writeFileSync(path.join(appDir, "icon.png"), icon512);
  fs.writeFileSync(path.join(publicDir, "favicon-32x32.png"), await sharp(cleanIconBuffer).resize(32, 32).png().toBuffer());
  fs.writeFileSync(path.join(publicDir, "favicon-16x16.png"), await sharp(cleanIconBuffer).resize(16, 16).png().toBuffer());
  fs.writeFileSync(path.join(publicDir, "favicon-48x48.png"), await sharp(cleanIconBuffer).resize(48, 48).png().toBuffer());

  // 3. Apple Touch Icon (180x180) & Maskable Icons (Android Adaptive Icon safe zone)
  // Background color matching dark midnight indigo/violet: #120924
  const bgTheme = { r: 18, g: 9, b: 36, alpha: 1 };
  
  // Apple Touch Icon: 180x180, fitted with solid dark background so iOS squircle mask clips cleanly without black corners
  const appleTouchIcon = await sharp({
    create: { width: 180, height: 180, channels: 4, background: bgTheme }
  })
    .composite([{ input: await sharp(cleanIconBuffer).resize(164, 164).png().toBuffer(), gravity: "center" }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), appleTouchIcon);
  fs.writeFileSync(path.join(publicDir, "apple-touch-icon-precomposed.png"), appleTouchIcon);
  fs.writeFileSync(path.join(appDir, "apple-icon.png"), appleTouchIcon);

  // Maskable 512 & 192 (safe zone: icon inside center 75%)
  const maskable512 = await sharp({
    create: { width: 512, height: 512, channels: 4, background: bgTheme }
  })
    .composite([{ input: await sharp(cleanIconBuffer).resize(390, 390).png().toBuffer(), gravity: "center" }])
    .png()
    .toBuffer();

  const maskable192 = await sharp({
    create: { width: 192, height: 192, channels: 4, background: bgTheme }
  })
    .composite([{ input: await sharp(cleanIconBuffer).resize(146, 146).png().toBuffer(), gravity: "center" }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, "icon-maskable-512.png"), maskable512);
  fs.writeFileSync(path.join(publicDir, "icon-maskable-192.png"), maskable192);

  // 4. Create multi-size favicon.ico (16, 32, 48)
  // sharp creates single png, but we can write a simple valid ICO container for 16, 32, 48
  const p16 = await sharp(cleanIconBuffer).resize(16, 16).png().toBuffer();
  const p32 = await sharp(cleanIconBuffer).resize(32, 32).png().toBuffer();
  const p48 = await sharp(cleanIconBuffer).resize(48, 48).png().toBuffer();
  const icoBuffer = createIco([p16, p32, p48]);
  fs.writeFileSync(path.join(appDir, "favicon.ico"), icoBuffer);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);

  // 5. Open Graph & Twitter Share Card (1200x630)
  // Professional dark preview card featuring the glowing icon, app name, and tagline
  await generateOgImage(cleanIconBuffer);

  console.log("🎉 All icons and share images generated successfully!");
}

function createIco(pngBuffers) {
  // ICO Header: 2 bytes reserved (0), 2 bytes type (1 for ICO), 2 bytes count
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const dirEntries = [];
  for (const png of pngBuffers) {
    const entry = Buffer.alloc(16);
    // Determine size (16, 32, 48)
    const is32 = png.length > 500 && png.length < 2500;
    const is48 = png.length >= 2500;
    const s = is48 ? 48 : is32 ? 32 : 16;
    entry.writeUInt8(s, 0); // width
    entry.writeUInt8(s, 1); // height
    entry.writeUInt8(0, 2); // colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    dirEntries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

async function generateOgImage(iconBuffer) {
  const width = 1200;
  const height = 630;

  // Background SVG with rich radial glow and modern typography
  const bgSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bgGlow" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stop-color="#2a144e" stop-opacity="0.85"/>
          <stop offset="50%" stop-color="#140a28" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#0a0515" stop-opacity="1"/>
        </radialGradient>
        <radialGradient id="centerCyan" cx="30%" cy="50%" r="35%">
          <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#06b6d4" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="centerPink" cx="70%" cy="50%" r="35%">
          <stop offset="0%" stop-color="#ec4899" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#ec4899" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="50%" stop-color="#c084fc"/>
          <stop offset="100%" stop-color="#fb7185"/>
        </linearGradient>
      </defs>
      
      <rect width="${width}" height="${height}" fill="url(#bgGlow)"/>
      <rect width="${width}" height="${height}" fill="url(#centerCyan)"/>
      <rect width="${width}" height="${height}" fill="url(#centerPink)"/>
      
      <!-- Subtle grid pattern -->
      <g stroke="rgba(255,255,255,0.03)" stroke-width="1">
        <line x1="0" y1="105" x2="${width}" y2="105"/>
        <line x1="0" y1="210" x2="${width}" y2="210"/>
        <line x1="0" y1="315" x2="${width}" y2="315"/>
        <line x1="0" y1="420" x2="${width}" y2="420"/>
        <line x1="0" y1="525" x2="${width}" y2="525"/>
        <line x1="200" y1="0" x2="200" y2="${height}"/>
        <line x1="400" y1="0" x2="400" y2="${height}"/>
        <line x1="600" y1="0" x2="600" y2="${height}"/>
        <line x1="800" y1="0" x2="800" y2="${height}"/>
        <line x1="1000" y1="0" x2="1000" y2="${height}"/>
      </g>

      <!-- Badge pill -->
      <g transform="translate(560, 160)">
        <rect x="0" y="0" width="310" height="34" rx="17" fill="rgba(15, 118, 110, 0.25)" stroke="#14b8a6" stroke-width="1.5"/>
        <text x="155" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" fill="#2dd4bf" text-anchor="middle" letter-spacing="1.5">
          MEDICAL INTELLIGENCE · PICO
        </text>
      </g>

      <!-- App Name -->
      <text x="560" y="270" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="900" fill="url(#titleGrad)" letter-spacing="-1">
        AIMed
      </text>

      <!-- Subtitle -->
      <text x="560" y="325" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" fill="#f8fafc">
        Multi-Specialty Clinical Evidence Platform
      </text>

      <!-- Description -->
      <text x="560" y="375" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="400" fill="#94a3b8">
        AI-assisted clinical question formulation, multi-database
      </text>
      <text x="560" y="405" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="400" fill="#94a3b8">
        evidence mapping, and publication-grade Vancouver commentary.
      </text>

      <!-- URL footer -->
      <g transform="translate(560, 465)">
        <text x="0" y="0" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#38bdf8">
          🌐 https://aimed-pico.vercel.app
        </text>
      </g>
    </svg>
  `);

  // Resize icon for left side of the OG image (340x340)
  const resizedIcon = await sharp(iconBuffer)
    .resize(340, 340, { fit: "contain" })
    .png()
    .toBuffer();

  const ogCard = await sharp(bgSvg)
    .composite([
      { input: resizedIcon, left: 140, top: 145 }
    ])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, "og-image.png"), ogCard);
  fs.writeFileSync(path.join(publicDir, "og-image.jpg"), await sharp(ogCard).jpeg({ quality: 90 }).toBuffer());
  console.log("✅ Open Graph share card generated (1200x630).");
}

generateAllIcons().catch(err => {
  console.error("❌ Failed to generate icons:", err);
  process.exit(1);
});
