// Seeds clearly-marked SAMPLE reviews (data/reviews.json) so product pages are not empty.
// Only runs when the file does not exist yet — real customer reviews are never overwritten.
import fs from 'node:fs';
import path from 'node:path';

const NAMES = [
  'Tanvir Hasan',
  'Nusrat Jahan',
  'Rafiq Ahmed',
  'Sadia Islam',
  'Mahmudul Karim',
  'Farzana Akter',
  'Imran Hossain',
  'Tasnia Rahman',
  'Arif Chowdhury',
  'Mim Sultana',
  'Shakil Mia',
  'Rumana Begum',
  'Sabbir Ali',
  'Jannatul Ferdous',
  'Nabil Khan',
];
const GOOD = [
  [
    'Perfectly chilled taste',
    'Ordered a carton for my sister’s birthday and every can arrived sealed and without a single dent. Tastes exactly as it should.',
  ],
  [
    'Delivery was quick',
    'Ordered in the morning and got it the next day in Dhaka. Packaging was solid, cans were fine.',
  ],
  ['My go-to for adda nights', 'We finish a 12-pack every weekend. Bkash payment was easy and they confirmed quickly.'],
  ['Great price for the pack', 'The 6-pack works out cheaper than buying singles at the shop. Will order again.'],
  ['Exactly what I wanted', 'Hard to find this one near my house. Glad I can order it online now.'],
  ['Fresh and fizzy', 'Checked the date on the base — very fresh. Fizz was lively and flavour was spot on.'],
  ['Good value', 'Got the carton of 24 for the office fridge. Everyone loved it.'],
];
const OK = [
  ['Nice, but chill it first', 'Taste is great once it is cold. Delivery took two days outside Dhaka which was fine.'],
  ['Good product', 'Cans were fine. Wish there were more flavours in this range.'],
];

function rnd(seed) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedReviews(dataDir, products) {
  const file = path.join(dataDir, 'reviews.json');
  if (fs.existsSync(file)) return false;
  const out = [];
  for (const p of products) {
    const R = rnd(hash(p.handle));
    const n = 3 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const good = R() > 0.18;
      const rating = good ? (R() > 0.35 ? 5 : 4) : 3;
      const [title, body] = (good ? GOOD : OK)[Math.floor(R() * (good ? GOOD.length : OK.length))];
      const day = 1 + Math.floor(R() * 28),
        month = 1 + Math.floor(R() * 9);
      out.push({
        id: `s${out.length.toString(36)}${Math.floor(R() * 1e6).toString(36)}`,
        product: p.handle,
        name: NAMES[Math.floor(R() * NAMES.length)],
        rating,
        title,
        body,
        createdAt: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00.000Z`,
        approved: true,
        verified: false,
        sample: true,
      });
    }
  }
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  return true;
}
