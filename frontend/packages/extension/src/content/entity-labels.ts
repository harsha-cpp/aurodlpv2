export const ENTITY_LABELS: Record<string, string> = {
  IN_AADHAAR: "Aadhaar number",
  IN_PAN: "PAN",
  IN_PASSPORT: "Passport number",
  IN_DRIVING_LICENSE: "Driving licence",
  IN_VOTER_ID: "Voter ID",
  ABHA_NUMBER: "ABHA number",
  ABHA_ADDRESS: "ABHA address",
  MRN: "Medical record number",
  PATIENT_VISIT_ID: "Patient visit ID",
  LAB_ACCESSION: "Lab accession number",
  ICD10: "Diagnosis code",
  MEDICAL_LICENSE: "Medical licence",
  INSURANCE_POLICY: "Insurance policy",
  BANK_ACCOUNT: "Bank account",
  IN_IFSC: "IFSC code",
  IN_UPI: "UPI ID",
  IN_GSTIN: "GSTIN",
  PERSON: "Person name",
  DATE_OF_BIRTH: "Date of birth",
  IN_PHONE: "Phone number",
  EMAIL_ADDRESS: "Email address",
};

export function entityLabel(type: string): string {
  const known = ENTITY_LABELS[type];
  if (known) return known;
  const words = type.replace(/^IN_/, "").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
