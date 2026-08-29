export const ENTITY_TYPES = [
  "IN_AADHAAR",
  "IN_PAN",
  "IN_PASSPORT",
  "IN_DRIVING_LICENSE",
  "IN_VOTER_ID",
  "ABHA_NUMBER",
  "ABHA_ADDRESS",
  "MRN",
  "PATIENT_VISIT_ID",
  "LAB_ACCESSION",
  "ICD10",
  "MEDICAL_LICENSE",
  "INSURANCE_POLICY",
  "BANK_ACCOUNT",
  "IN_IFSC",
  "IN_UPI",
  "IN_GSTIN",
  "PERSON",
  "DATE_OF_BIRTH",
  "IN_PHONE",
  "EMAIL_ADDRESS",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export type EntityGroup = "Government ID" | "Health" | "Financial" | "Personal";

interface EntityMeta {
  label: string;
  group: EntityGroup;
}

const ENTITY_META: Record<EntityType, EntityMeta> = {
  IN_AADHAAR: { label: "Aadhaar number", group: "Government ID" },
  IN_PAN: { label: "PAN", group: "Government ID" },
  IN_PASSPORT: { label: "Passport number", group: "Government ID" },
  IN_DRIVING_LICENSE: { label: "Driving licence", group: "Government ID" },
  IN_VOTER_ID: { label: "Voter ID", group: "Government ID" },
  ABHA_NUMBER: { label: "ABHA number", group: "Health" },
  ABHA_ADDRESS: { label: "ABHA address", group: "Health" },
  MRN: { label: "Medical record number", group: "Health" },
  PATIENT_VISIT_ID: { label: "Patient visit ID", group: "Health" },
  LAB_ACCESSION: { label: "Lab accession number", group: "Health" },
  ICD10: { label: "ICD-10 diagnosis code", group: "Health" },
  MEDICAL_LICENSE: { label: "Medical licence", group: "Health" },
  INSURANCE_POLICY: { label: "Insurance policy number", group: "Financial" },
  BANK_ACCOUNT: { label: "Bank account number", group: "Financial" },
  IN_IFSC: { label: "IFSC code", group: "Financial" },
  IN_UPI: { label: "UPI ID", group: "Financial" },
  IN_GSTIN: { label: "GSTIN", group: "Financial" },
  PERSON: { label: "Person name", group: "Personal" },
  DATE_OF_BIRTH: { label: "Date of birth", group: "Personal" },
  IN_PHONE: { label: "Phone number", group: "Personal" },
  EMAIL_ADDRESS: { label: "Email address", group: "Personal" },
};

export const ENTITY_GROUPS: readonly EntityGroup[] = [
  "Government ID",
  "Health",
  "Financial",
  "Personal",
];

function isKnown(type: string): type is EntityType {
  return type in ENTITY_META;
}

export function entityLabel(type: string | null | undefined): string {
  if (!type) return "Unknown type";
  if (isKnown(type)) return ENTITY_META[type].label;
  const words = type
    .replace(/^IN_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .trim();
  if (!words) return "Unknown type";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function entityGroup(type: string): EntityGroup | null {
  return isKnown(type) ? ENTITY_META[type].group : null;
}

export function entityTypesByGroup(group: EntityGroup): EntityType[] {
  return ENTITY_TYPES.filter((t) => ENTITY_META[t].group === group);
}
