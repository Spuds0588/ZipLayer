// One-shot generator: builds assets/JohnSmith-LoanFile.zip for the demo.
// Run with: node scripts/make-example.mjs
// Self-contained (hand-rolled PDF writer + fflate). Produces a static asset
// that index.html simply downloads — nothing is generated at runtime.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "../lib/fflate.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

// ---- Minimal PDF writer ---------------------------------------------------
const enc = new TextEncoder();
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
class PDF {
  constructor() { this.w = 612; this.h = 792; this.ops = []; }
  text(x, y, str, { size = 11, bold = false } = {}) {
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${this.h - y} Tm (${esc(str)}) Tj ET`);
    return this;
  }
  line(x1, y1, x2, y2) { this.ops.push(`${x1} ${this.h - y1} m ${x2} ${this.h - y2} l S`); return this; }
  rect(x, y, w, h) { this.ops.push(`${x} ${this.h - y - h} ${w} ${h} re S`); return this; }
  bytes() {
    const content = enc.encode(this.ops.join("\n"));
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.w} ${this.h}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
      `<< /Length ${content.length} >>\nstream\n${new TextDecoder().decode(content)}\nendstream`,
    ];
    let buf = new Uint8Array(0);
    const push = (str) => {
      const b = enc.encode(str);
      const next = new Uint8Array(buf.length + b.length);
      next.set(buf); next.set(b, buf.length);
      buf = next;
    };
    push("%PDF-1.4\n");
    const offsets = [0];
    objs.forEach((obj, i) => { offsets.push(buf.length); push(`${i + 1} 0 obj\n${obj}\nendobj\n`); });
    const xref = buf.length;
    push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
    for (let i = 1; i < offsets.length; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return buf;
  }
}

// ---- Example person -------------------------------------------------------
const JOHN = {
  name: "John A. Smith",
  ssn: "123-45-6789",
  address: "42 Oakwood Lane, Springfield, IL 62704",
  employer: "Acme Mortgage Corp",
  ein: "88-1234567",
  empAddress: "500 Commerce Drive, Springfield, IL 62701",
  id: "00421",
};

// ---- Documents ------------------------------------------------------------
function buildW2() {
  const p = new PDF();
  const L = 72, R = 540;
  p.text(L, 48, "W-2 Wage and Tax Statement 2024", { size: 18, bold: true });
  p.text(L, 66, "Copy B - File with Employee's FEDERAL tax return", { size: 10 });
  p.line(L, 74, R, 74);

  const box = (x, y, w, h, label, value, size = 11) => {
    p.rect(x, y, w, h);
    p.text(x + 5, y + 13, label, { size: 8 });
    if (value) p.text(x + 5, y + 27, value, { size, bold: true });
  };
  const box2 = (x, y, w, h, label, line1, line2, size = 9) => {
    p.rect(x, y, w, h);
    p.text(x + 5, y + 12, label, { size: 8 });
    if (line1) p.text(x + 5, y + 25, line1, { size, bold: true });
    if (line2) p.text(x + 5, y + 38, line2, { size, bold: true });
  };

  box(L, 88, 190, 40, "a. Employee's SSN", JOHN.ssn);
  box(L + 200, 88, 160, 40, "b. Employer EIN", JOHN.ein);
  box(L + 370, 88, 170, 40, "d. Control number", "2024-00421");
  box2(L, 134, 300, 46, "c. Employer's name, address, and ZIP code", JOHN.employer, JOHN.empAddress);
  box2(L + 310, 134, 230, 46, "e. Employee's name, address, and ZIP code", JOHN.name, JOHN.address);
  box(L, 186, 540, 26, "f. Employee's first name and initial / Last name", JOHN.name);

  const gridY = 218;
  const cols = 3, colW = 180, rowH = 42;
  const cells = [
    ["1", "Wages, tips, other comp.", "$62,400.00"],
    ["2", "Federal income tax withheld", "$6,864.00"],
    ["3", "Social security wages", "$62,400.00"],
    ["4", "Social security tax withheld", "$3,868.80"],
    ["5", "Medicare wages and tips", "$62,400.00"],
    ["6", "Medicare tax withheld", "$904.80"],
    ["7", "Social security tips", ""],
    ["8", "Allocated tips", ""],
    ["9", "", ""],
    ["10", "Dependent care benefits", ""],
    ["11", "Nonqualified plans", ""],
    ["12a", "See instructions for box 12", "D  $5,000.00"],
    ["12b", "", ""],
    ["12c", "", ""],
    ["12d", "", ""],
    ["13", "Statutory employee / Retirement plan / Third-party sick pay", "Retirement plan"],
    ["14", "Other", ""],
    ["15", "State / Employer's state ID", "IL / 12-345678"],
    ["16", "State wages, tips, etc.", "$62,400.00"],
    ["17", "State income tax", "$2,496.00"],
    ["18", "Local wages, tips, etc.", ""],
    ["19", "Local income tax", ""],
    ["20", "Locality name", "Springfield"],
  ];
  cells.forEach(([num, label, value], i) => {
    const x = L + (i % cols) * colW;
    const y = gridY + Math.floor(i / cols) * rowH;
    box(x, y, colW - 4, rowH - 4, num + "  " + label, value, 10);
  });
  p.text(L, 560, "Form W-2 (Rev. 2024) - Department of the Treasury - IRS", { size: 8 });
  return p.bytes();
}

function buildPayStub() {
  const p = new PDF();
  const L = 72, R = 540;
  p.text(L, 48, "ACME MORTGAGE CORP", { size: 16, bold: true });
  p.text(L, 64, "Pay Stub - Pay Period 11/01/2024 through 11/15/2024", { size: 11 });
  p.line(L, 72, R, 72);
  p.text(L, 92, `Employee: ${JOHN.name}   ID: ${JOHN.id}   SSN: ${JOHN.ssn}`);
  p.text(L, 108, "Pay Date: 11/15/2024   Check #: 20241115-00421");
  p.line(L, 118, R, 118);

  const earnY = 140;
  p.text(L, earnY, "EARNINGS", { size: 10, bold: true });
  p.text(R - 120, earnY, "AMOUNT", { size: 10, bold: true });
  p.text(L, earnY + 22, "Regular  80.00 hrs @ $30.00");
  p.text(R - 120, earnY + 22, "$2,400.00");
  p.text(L, earnY + 40, "YTD Gross Earnings");
  p.text(R - 120, earnY + 40, "$57,600.00");
  p.line(L, earnY + 50, R, earnY + 50);

  const dedY = earnY + 68;
  p.text(L, dedY, "DEDUCTIONS", { size: 10, bold: true });
  p.text(R - 120, dedY, "AMOUNT", { size: 10, bold: true });
  const ded = [
    ["Federal Income Tax", "$288.00"],
    ["Social Security Tax (6.2%)", "$148.80"],
    ["Medicare Tax (1.45%)", "$34.80"],
    ["Illinois State Tax", "$124.80"],
    ["401(k) Deferral", "$96.00"],
  ];
  ded.forEach(([label, amt], i) => {
    p.text(L, dedY + 22 + i * 18, label);
    p.text(R - 120, dedY + 22 + i * 18, amt);
  });
  p.line(L, dedY + 20 + ded.length * 18, R, dedY + 20 + ded.length * 18);

  const netY = dedY + 40 + ded.length * 18;
  p.rect(L, netY - 6, R - L, 30);
  p.text(L + 10, netY + 16, "NET PAY", { size: 12, bold: true });
  p.text(R - 130, netY + 16, "$1,707.60", { size: 12, bold: true });

  p.text(L, netY + 52, "YTD: Gross $57,600.00 | Federal $6,864.00 | SS $3,571.20 | Medicare $835.20 | State $2,995.20 | 401(k) $2,304.00", { size: 9 });
  p.text(L, 740, "This is a simulated pay stub for demonstration purposes only.", { size: 8 });
  return p.bytes();
}

function buildContract() {
  const p = new PDF();
  const L = 72, R = 540;
  p.text((L + R) / 2 - 140, 48, "RESIDENTIAL REAL ESTATE PURCHASE AGREEMENT", { size: 14, bold: true });
  p.text((L + R) / 2 - 90, 64, "Contract No. 2341 - For demonstration purposes only", { size: 9 });
  p.line(L, 72, R, 72);

  let y = 100;
  const para = (text, bold = false) => { p.text(L, y, text, { size: 10, bold }); y += 16; };

  para("THIS AGREEMENT is made this 12th day of November, 2024, by and between:", true);
  y += 4;
  para("SELLER:  Oakwood Development LLC, 1200 Industrial Blvd, Springfield, IL 62703");
  para("BUYER:   " + JOHN.name + ", " + JOHN.address);
  y += 6;
  para("1. PROPERTY. The real property located at 12 Oakwood Lane, Springfield, IL 62704,", true);
  para("   together with all fixtures and appurtenances (the \"Property\").");
  y += 4;
  para("2. PURCHASE PRICE. The purchase price is $385,000.00, payable as follows:", true);
  para("   (a) Earnest money deposit of $7,700.00 paid upon execution of this Agreement;");
  para("   (b) Balance of $377,300.00 financed by a conventional first mortgage at closing.");
  y += 4;
  para("3. CLOSING. Closing shall occur on or before December 30, 2024 at a title company", true);
  para("   mutually agreed upon, unless extended by written agreement of the parties.");
  y += 4;
  para("4. CONTINGENCIES. This Agreement is contingent upon the Buyer obtaining a", true);
  para("   mortgage loan commitment within 30 days and a satisfactory home inspection");
  para("   within 14 days of the effective date.");
  y += 4;
  para("5. TITLE. Seller shall convey marketable title by Warranty Deed, free and clear", true);
  para("   of all liens and encumbrances except as otherwise provided herein.");
  y += 4;
  para("6. GOVERNING LAW. This Agreement shall be governed by the laws of the State of", true);
  para("   Illinois.");
  y += 12;

  p.line(L, y, 300, y); p.text(L, y - 8, "Seller: Oakwood Development LLC", { size: 9 });
  p.line(L, y + 46, 300, y + 46); p.text(L, y + 38, "Buyer: " + JOHN.name, { size: 9 });
  y += 70;
  p.text(L, y, "WITNESSES:", { size: 9, bold: true });
  p.line(L, y + 30, 300, y + 30);
  p.line(L, y + 56, 300, y + 56);
  p.text(L, 740, "Simulated contract. Not a legal document. Do not rely upon it for any real transaction.", { size: 8 });
  return p.bytes();
}

function buildLicenseSvg() {
  const f = (label, value, x, y) =>
    `<text x="${x}" y="${y}" font-family="Arial" font-size="28" fill="#9fb8d4">${label}</text>` +
    `<text x="${x}" y="${y + 38}" font-family="Arial" font-size="34" font-weight="bold" fill="#ffffff">${value}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640" viewBox="0 0 1024 640">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#1e3a5f"/><stop offset="1" stop-color="#0f2440"/>
</linearGradient></defs>
<rect width="1024" height="640" fill="url(#bg)"/>
<rect y="40" width="1024" height="110" fill="#f4c542"/>
<text x="512" y="102" font-family="Arial" font-size="60" font-weight="bold" fill="#0f2440" text-anchor="middle">STATE OF ILLINOIS</text>
<text x="512" y="140" font-family="Arial" font-size="42" font-weight="bold" fill="#0f2440" text-anchor="middle">DRIVER LICENSE</text>
<rect x="60" y="190" width="220" height="260" fill="#cfe3f7" stroke="#ffffff" stroke-width="4"/>
<circle cx="170" cy="265" r="45" fill="#7ba7cc"/>
<rect x="90" y="315" width="160" height="90" fill="#7ba7cc"/>
<text x="170" y="430" font-family="Arial" font-size="28" fill="#0f2440" text-anchor="middle">PHOTO</text>
${f("NAME", "JOHN A SMITH", 330, 220)}
${f("DATE OF BIRTH", "02/14/1985", 330, 310)}
${f("ADDRESS", "42 OAKWOOD LANE", 330, 400)}
${f("CITY, STATE ZIP", "SPRINGFIELD, IL 62704", 330, 464)}
${f("LICENSE NO", "D123-4567-8901", 60, 500)}
${f("EXPIRES", "02/14/2029", 560, 500)}
${f("CLASS", "D", 60, 580)}
${f("SEX", "M", 240, 580)}
${f("ISSUED", "02/14/2021", 330, 580)}
${f("END", "NONE", 560, 580)}
</svg>`;
}

const README =
  "EXAMPLE LOAN FILE - ZipLayer.js demo\n" +
  "=====================================\n\n" +
  "Simulated borrower: " + JOHN.name + " (SSN " + JOHN.ssn + ")\n\n" +
  "Contents:\n" +
  "  W2-2024.pdf            - Wage and Tax Statement\n" +
  "  PayStub-2024-11-15.pdf - Recent pay stub\n" +
  "  SalesContract-2341.pdf - Residential purchase agreement\n" +
  "  DriverLicense.svg      - Scanned driver license (simulated)\n\n" +
  "All documents are synthetic examples for demonstration purposes only.\n";

// ---- Assemble ---------------------------------------------------------------
const zip = zipSync({
  "JohnSmith/W2-2024.pdf": buildW2(),
  "JohnSmith/PayStub-2024-11-15.pdf": buildPayStub(),
  "JohnSmith/SalesContract-2341.pdf": buildContract(),
  "JohnSmith/DriverLicense.svg": strToU8(buildLicenseSvg()),
  "JohnSmith/README.txt": strToU8(README),
});

mkdirSync(join(ROOT, "..", "assets"), { recursive: true });
const out = join(ROOT, "..", "assets", "JohnSmith-LoanFile.zip");
writeFileSync(out, zip);
console.log(`Wrote ${out} (${zip.length} bytes)`);
