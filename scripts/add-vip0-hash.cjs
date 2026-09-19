/**
 * One-off / helper: append VIP0 promo hash for code 20ARTCLOSET26 into vipHashes.generated.ts.
 * Reads ARTCLOSET_VIP_SALT from .env. Does not print salt or hash.
 *
 *   node scripts/add-vip0-hash.cjs
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const outFile = path.join(root, 'src', 'entitlements', 'vipHashes.generated.ts');

function loadSalt() {
  if (!fs.existsSync(envPath)) {
    throw new Error('.env not found');
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^ARTCLOSET_VIP_SALT=(.*)$/);
    if (!m) continue;
    let val = (m[1] ?? '').trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!val) throw new Error('ARTCLOSET_VIP_SALT is empty');
    return val;
  }
  throw new Error('ARTCLOSET_VIP_SALT missing from .env');
}

function normalizeVipCode(raw) {
  return String(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24);
}

function hashCode(salt, code) {
  return crypto.createHash('sha256').update(salt + normalizeVipCode(code), 'utf8').digest('hex');
}

const PROMO_CODE = '20ARTCLOSET26';
const salt = loadSalt();
const hash = hashCode(salt, PROMO_CODE);

if (!fs.existsSync(outFile)) {
  throw new Error(`Missing ${outFile}`);
}

let body = fs.readFileSync(outFile, 'utf8');

const vip0Block = `export const VIP0_HASHES: readonly string[] = [
  ${JSON.stringify(hash)},
] as const;

`;

if (/export const VIP0_HASHES/.test(body)) {
  body = body.replace(
    /export const VIP0_HASHES: readonly string\[] = \[[\s\S]*?\] as const;\r?\n*/,
    vip0Block,
  );
} else {
  body = body.replace(
    /\/\* AUTO-GENERATED[\s\S]*?do not edit[^*]*\*\/\r?\n/,
    (header) => `${header}${vip0Block}`,
  );
  if (!/export const VIP0_HASHES/.test(body)) {
    body = `${vip0Block}${body}`;
  }
}

fs.writeFileSync(outFile, body, 'utf8');
console.log(`VIP0 hash for promo code length ${normalizeVipCode(PROMO_CODE).length} written (1 entry).`);
