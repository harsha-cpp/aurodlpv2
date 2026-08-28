// Validators mirroring aurodlpv2_detection/recognition/validators.py.
// A validator is what separates "twelve digits" from "an Aadhaar number".

const VERHOEFF_D: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const PAN_HOLDER_TYPES = new Set('PCHABGJLFTEK'.split(''));
const PLACEHOLDER_PANS = new Set([
  'ABCDE1234F',
  'AAAAA0000A',
  'AAAAA1111A',
  'ABCDE0000A',
  'XXXXX0000X',
  'AAAPL1234C',
]);
const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const STATE_CODES = new Set([
  'AN','AP','AR','AS','BR','CG','CH','DD','DL','DN','GA','GJ','HP','HR','JH','JK',
  'KA','KL','LA','LD','MH','ML','MN','MP','MZ','NL','OD','OR','PB','PY','RJ','SK',
  'TN','TR','TS','UK','UP','WB',
]);

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function isRepdigit(digits: string): boolean {
  return new Set(digits.split('')).size === 1;
}

function isSequential(digits: string): boolean {
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i++) {
    const delta = Number(digits[i]) - Number(digits[i - 1]);
    if (delta !== 1) ascending = false;
    if (delta !== -1) descending = false;
  }
  return ascending || descending;
}

export function verhoeffOk(value: string): boolean {
  const digits = digitsOnly(value);
  if (!digits) return false;
  let checksum = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    checksum = VERHOEFF_D[checksum]![VERHOEFF_P[i % 8]![Number(reversed[i])]!]!;
  }
  return checksum === 0;
}

export function validateAadhaar(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 12) return false;
  if (digits[0] === '0' || digits[0] === '1') return false;
  if (isRepdigit(digits) || isSequential(digits)) return false;
  if (new Set(digits.split('')).size <= 2) return false;
  return verhoeffOk(digits);
}

export function validatePan(value: string): boolean {
  const pan = value.trim().toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return false;
  if (PLACEHOLDER_PANS.has(pan)) return false;
  if (!PAN_HOLDER_TYPES.has(pan[3]!)) return false;
  return new Set(pan.slice(0, 5).split('')).size !== 1;
}

export function validateGstin(value: string): boolean {
  const gstin = value.trim().toUpperCase();
  if (!/^[0-3]\d[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return false;
  const state = Number(gstin.slice(0, 2));
  if (state < 1 || state > 38) return false;

  let total = 0;
  for (let i = 0; i < 14; i++) {
    const position = GSTIN_ALPHABET.indexOf(gstin[i]!);
    const product = position * (i % 2 ? 2 : 1);
    total += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_ALPHABET[(36 - (total % 36)) % 36] === gstin[14];
}

export function validateIfsc(value: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.trim().toUpperCase());
}

export function validatePassport(value: string): boolean {
  return /^[A-PR-WY]\d{7}$/.test(value.trim().toUpperCase());
}

export function validateDrivingLicense(value: string): boolean {
  const compact = value.trim().toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z]{2}\d{13}$/.test(compact)) return false;
  return STATE_CODES.has(compact.slice(0, 2));
}

export function validateVoterId(value: string): boolean {
  return /^[A-Z]{3}\d{7}$/.test(value.trim().toUpperCase());
}

export function validateInPhone(value: string): boolean {
  let digits = digitsOnly(value);
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (digits.length !== 10) return false;
  if (!'6789'.includes(digits[0]!)) return false;
  return !isRepdigit(digits);
}

export function validateAbhaNumber(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 14) return false;
  if (digits[0] === '0') return false;
  return !isRepdigit(digits);
}

export function validateBankAccount(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 9 || digits.length > 18) return false;
  return !isRepdigit(digits);
}

export type Validator = (value: string) => boolean;

/**
 * ICD-10 validation is category-level on the client: the full 73,000-code
 * dictionary is too heavy for a content script, but rejecting invalid
 * categories is what stops "room A12" and "vitamin B12" flagging.
 */
export function buildValidators(icd10Categories: readonly string[]): Record<string, Validator> {
  const categories = new Set(icd10Categories);
  return {
    aadhaar: validateAadhaar,
    abha_number: validateAbhaNumber,
    bank_account: validateBankAccount,
    driving_license: validateDrivingLicense,
    gstin: validateGstin,
    icd10: (value) => categories.has(value.trim().toUpperCase().slice(0, 3)),
    ifsc: validateIfsc,
    in_phone: validateInPhone,
    pan: validatePan,
    passport: validatePassport,
    voter_id: validateVoterId,
  };
}
