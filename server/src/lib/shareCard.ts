import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;
const GOLD = { r: 217, g: 166, b: 38, alpha: 255 };
const DARK = { r: 24, g: 20, b: 12, alpha: 255 };

// User-controlled strings (display_name, badge title/description) get
// interpolated into an SVG string below — must be XML-escaped or a name
// containing `<`/`&` breaks the SVG parse (or worse).
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function renderBase(svgBody: string): Promise<Buffer> {
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a1610"/>
        <stop offset="100%" stop-color="#2e2413"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <rect x="0" y="${HEIGHT - 10}" width="${WIDTH}" height="10" fill="#d9a626"/>
    ${svgBody}
    <text x="60" y="${HEIGHT - 36}" font-family="Noto Sans Bengali, Noto Sans" font-size="22" fill="#d9a626" font-weight="700">BoiAro</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 7 }).toBuffer();
}

export async function renderBadgeCard(params: {
  badgeTitle: string;
  badgeDescription: string | null;
  coinReward: number | null;
  userName: string;
}): Promise<Buffer> {
  const title = escapeXml(truncate(params.badgeTitle, 40));
  const description = escapeXml(truncate(params.badgeDescription || "", 70));
  const userName = escapeXml(truncate(params.userName, 30));

  const body = `
    <text x="600" y="230" text-anchor="middle" font-family="Noto Color Emoji, Noto Sans Bengali, Noto Sans" font-size="96" fill="#ffffff">${title}</text>
    <text x="600" y="320" text-anchor="middle" font-family="Noto Sans Bengali, Noto Sans" font-size="28" fill="#c9c2b3">${description}</text>
    ${params.coinReward ? `<text x="600" y="390" text-anchor="middle" font-family="Noto Sans Bengali, Noto Sans" font-size="26" fill="#d9a626" font-weight="700">+${params.coinReward} কয়েন</text>` : ""}
    <text x="600" y="470" text-anchor="middle" font-family="Noto Sans Bengali, Noto Sans" font-size="22" fill="#8a8371">অর্জন করেছেন ${userName}</text>
  `;
  return renderBase(body);
}

export async function renderWeeklyReportCard(params: {
  userName: string;
  totalMinutes: number;
  bookCount: number;
  weekOverWeekPercent: number | null;
  topBookTitle: string | null;
}): Promise<Buffer> {
  const userName = escapeXml(truncate(params.userName, 30));
  const topBook = params.topBookTitle ? escapeXml(truncate(params.topBookTitle, 50)) : null;
  const deltaText = params.weekOverWeekPercent === null
    ? ""
    : params.weekOverWeekPercent >= 0
      ? `গত সপ্তাহের তুলনায় ${params.weekOverWeekPercent}% বেশি`
      : `গত সপ্তাহের তুলনায় ${Math.abs(params.weekOverWeekPercent)}% কম`;

  const body = `
    <text x="60" y="110" font-family="Noto Sans Bengali, Noto Sans" font-size="30" fill="#c9c2b3">${userName}-এর এই সপ্তাহের রিডিং রিপোর্ট</text>
    <text x="60" y="250" font-family="Noto Sans Bengali, Noto Sans" font-size="120" fill="#ffffff" font-weight="700">${params.totalMinutes}</text>
    <text x="60" y="300" font-family="Noto Sans Bengali, Noto Sans" font-size="30" fill="#d9a626">মিনিট পড়া/শোনা হয়েছে</text>
    <text x="60" y="370" font-family="Noto Sans Bengali, Noto Sans" font-size="26" fill="#c9c2b3">${params.bookCount}টি বই স্পর্শ করেছেন</text>
    ${deltaText ? `<text x="60" y="410" font-family="Noto Sans Bengali, Noto Sans" font-size="24" fill="#8bc48a">${escapeXml(deltaText)}</text>` : ""}
    ${topBook ? `<text x="60" y="470" font-family="Noto Sans Bengali, Noto Sans" font-size="24" fill="#8a8371">সবচেয়ে বেশি: ${topBook}</text>` : ""}
  `;
  return renderBase(body);
}
