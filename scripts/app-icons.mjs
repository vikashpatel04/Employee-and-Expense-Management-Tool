// Makes every app icon PNG from the chosen design-system icons (Design System → Brand → App
// icons): FinCrew "B · Rupee ring", Staffora "B · Staff badge". Sources (512 × 512, full-bleed
// ground + mark) are in packages/ui/design/app-icons/. Run after changing them:
//
//   pnpm ui:icons
//
// Writes for each Expo app (apps/<app>/assets/images): icon.png (1024, full square; the phone
// masks the corners), android-icon-background.png (ground colour), android-icon-foreground.png
// (mark only, shrunk into the adaptive-icon safe zone), android-icon-monochrome.png (one-colour
// mark for themed icons: the ground colour inside the mark becomes a hole), splash-icon.png
// (mark only, on the splash's ground colour from app.json), favicon.png (48, rounded). For the
// website: apps/fincrew-web/src/app/icon.svg and apple-icon.png.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'packages/ui/design/app-icons';
/** Android shows the middle 66% of an adaptive icon; the marks are scaled to sit inside it. */
const SAFE = 0.8;

/** Split a source icon into its ground colour and its mark (everything after the ground). */
function parse(name) {
  const svg = readFileSync(`${SRC}/${name}.svg`, 'utf8');
  const ground = /<rect width="512" height="512" fill="(#[0-9a-fA-F]{6})"\/>/.exec(svg);
  if (!ground) throw new Error(`${name}.svg: expected a full-size ground <rect> first`);
  const mark = svg.slice(ground.index + ground[0].length, svg.lastIndexOf('</svg>'));
  return { svg, ground: ground[1], mark };
}

const wrap = (body, size = 512) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${body}</svg>`;
const scaled = (mark, k) =>
  `<g transform="translate(${256 * (1 - k)} ${256 * (1 - k)}) scale(${k})">${mark}</g>`;

/** One colour: every mark colour white, the ground colour (cut-outs) a hole. */
function monochrome(mark, ground) {
  const inMask = mark.replace(/#[0-9a-fA-F]{6}/g, (c) =>
    c.toLowerCase() === ground.toLowerCase() ? '#000000' : '#ffffff',
  );
  return `<mask id="m"><rect width="512" height="512" fill="#000"/>${scaled(inMask, SAFE)}</mask><rect width="512" height="512" fill="#fff" mask="url(#m)"/>`;
}

const png = (svg, size, out) =>
  sharp(Buffer.from(svg), { density: (72 * size) / 512 })
    .resize(size, size)
    .png()
    .toFile(out);

async function expoApp(app, icon) {
  const dir = `apps/${app}/assets/images`;
  mkdirSync(dir, { recursive: true });
  const { svg, ground, mark } = icon;
  await png(svg, 1024, `${dir}/icon.png`);
  await png(
    wrap(`<rect width="512" height="512" fill="${ground}"/>`),
    512,
    `${dir}/android-icon-background.png`,
  );
  await png(wrap(scaled(mark, SAFE)), 512, `${dir}/android-icon-foreground.png`);
  await png(wrap(monochrome(mark, ground)), 432, `${dir}/android-icon-monochrome.png`);
  await png(wrap(mark), 512, `${dir}/splash-icon.png`);
  await png(
    wrap(
      `<clipPath id="r"><rect width="512" height="512" rx="123"/></clipPath><g clip-path="url(#r)">${svg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')}</g>`,
    ),
    48,
    `${dir}/favicon.png`,
  );
}

const fincrew = parse('fincrew');
const staffora = parse('staffora');
await expoApp('fincrew-mobile', fincrew);
await expoApp('staffora-mobile', staffora);

// Website: an SVG favicon (rounded like the phone icon) and the home-screen icon.
const webDir = 'apps/fincrew-web/src/app';
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><clipPath id="r"><rect width="512" height="512" rx="123"/></clipPath><g clip-path="url(#r)">${fincrew.svg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')}</g></svg>\n`;
writeFileSync(`${webDir}/icon.svg`, rounded);
await png(fincrew.svg, 180, `${webDir}/apple-icon.png`);
console.log('App icons written.');
