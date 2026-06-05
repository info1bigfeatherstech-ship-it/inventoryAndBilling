const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ''}`.trim();
};

const threeDigits = (n) => {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h ? `${ONES[h]} Hundred` : '';
  const tail = rest ? twoDigits(rest) : '';
  return [head, tail].filter(Boolean).join(' ').trim();
};

const integerToWords = (n) => {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;

  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(' ').trim();
};

/** Indian invoice style: "Two Thousand ... and Sixty Four Paise Only" */
const amountInWords = (amount) => {
  const num = Number(amount);
  if (!Number.isFinite(num)) return 'Zero Only';
  const val = Math.round((num + Number.EPSILON) * 100) / 100;
  const rupees = Math.floor(val);
  const paise = Math.round((val - rupees) * 100);

  let words = integerToWords(rupees);
  if (paise > 0) {
    words += ` and ${integerToWords(paise)} Paise`;
  }
  return `${words} Only`;
};

module.exports = { amountInWords };
