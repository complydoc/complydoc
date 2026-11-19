/**
 * One page for each industry Veil is built for: what its documents hold, what Veil covers and
 * what it keeps. The examples are made up.
 */

/** A piece of an example line: plain text, or a value that belongs to a person or to a company. */
export type Piece = string | { text: string; owner: "person" | "company"; kind: string };

export interface Industry {
  slug: string;
  name: string;
  /** The page title is "Veil for" this. */
  audience: string;
  /** One line for the cards that link here. */
  headline: string;
  lead: string;
  /** A photo on Unsplash, loaded from Unsplash's own servers as its licence asks, and who took it. */
  photo?: { src: string; by: string; page: string };
  documents: string[];
  veiled: string[];
  kept: string[];
  model: string;
  example: Piece[];
}

/** A photo from Unsplash, wide enough for the top of a page. */
const unsplash = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2400&q=80`;

export const INDUSTRIES: Industry[] = [
  {
    slug: "legal",
    photo: { src: unsplash("photo-1562564055-71e051d33c19"), by: "Gabrielle Henderson", page: "https://unsplash.com/photos/woman-signing-on-white-printer-paper-beside-woman-about-to-touch-the-documents-HJckKnwCXxQ" },
    name: "Legal",
    audience: "legal teams",
    headline: "Contracts and court filings, with clients' details covered.",
    lead: "Lawyers ask models to review contracts and court filings. Veil covers the clients, witnesses and heirs named in them. Companies keep their names, so the model can still tell who owes what to whom.",
    documents: ["Contracts and leases", "Court filings", "Powers of attorney", "Due diligence data rooms"],
    veiled: ["Clients, witnesses and heirs", "Tax and ID numbers", "Home addresses", "Personal bank accounts"],
    kept: ["Companies and their registry numbers", "Courts and case references", "The clauses themselves"],
    model: "Veil 1 PT Legal",
    example: [
      "O réu, ",
      { text: "João Pereira", owner: "person", kind: "name" },
      ", NIF ",
      { text: "213 456 789", owner: "person", kind: "tax no." },
      ", contra ",
      { text: "Atlântico Logística, S.A.", owner: "company", kind: "company" },
      ", processo n.º 1234/26.0T8LSB.",
    ],
  },
  {
    slug: "healthcare",
    photo: { src: unsplash("photo-1777269749032-d8d458ae594d"), by: "Tasha Kostyuk", page: "https://unsplash.com/photos/empty-hospital-corridor-with-benches-and-doors-Pk-KuizxQv8" },
    name: "Healthcare",
    audience: "healthcare",
    headline: "Referral letters and discharge notes, with patients' details covered.",
    lead: "Clinicians use models to summarise referral letters and discharge notes. Veil covers the patient's name, health number and address. Diagnoses, drugs and doses stay in the text.",
    documents: ["Referral letters", "Discharge summaries", "Lab results", "Insurance claims"],
    veiled: ["Patients and relatives", "Health service numbers", "Dates of birth", "Addresses and phones"],
    kept: ["Hospitals, clinics and labs", "Diagnoses, drugs and doses", "Dates of care"],
    model: "Veil 1",
    example: [
      "Patient ",
      { text: "Sarah Mitchell", owner: "person", kind: "name" },
      ", NHS number ",
      { text: "943 476 5919", owner: "person", kind: "nhs no." },
      ", discharged from ",
      { text: "Riverside General Hospital", owner: "company", kind: "hospital" },
      " on amoxicillin 500 mg.",
    ],
  },
  {
    slug: "finance",
    photo: { src: unsplash("photo-1753955900090-d252808f350d"), by: "Giorgio Tomassetti", page: "https://unsplash.com/photos/bills-and-calculator-sit-on-a-desk-hBhouoXClKw" },
    name: "Banking and finance",
    audience: "banking and finance",
    headline: "Statements and onboarding files, with customers' details covered.",
    lead: "Banks use models for onboarding checks, loan applications and reconciliations. Veil covers customers' accounts, cards and ID numbers. Merchants and amounts stay, so a reconciliation still works.",
    documents: ["Bank statements", "Onboarding files", "Loan applications", "Invoices"],
    veiled: ["Customers' accounts and cards", "ID and tax numbers", "Salaries tied to a person", "Home addresses"],
    kept: ["Merchants and their accounts", "Amounts and dates", "Company tax numbers"],
    model: "Veil 1 with Veil Judge",
    example: [
      "Transfer from ",
      { text: "PT50 0035 0123 0000 4567 8901 2", owner: "person", kind: "iban" },
      " to ",
      { text: "Energia do Tejo, S.A.", owner: "company", kind: "company" },
      ", 64,20 €.",
    ],
  },
  {
    slug: "insurance",
    photo: { src: unsplash("photo-1597328290883-50c5787b7c7e"), by: "Clark Van Der Beken", page: "https://unsplash.com/photos/damaged-silver-car-with-crushed-hood-CSkriQWeTVs" },
    name: "Insurance",
    audience: "insurance",
    headline: "Claim files, with claimants' details covered.",
    lead: "A claim comes in as a form, a police report, a medical note and photos of a car. Veil covers the claimant, the witnesses and the licence plates. The insurer, the garage and the amounts stay.",
    documents: ["Claim forms", "Police reports", "Medical reports", "Policy schedules"],
    veiled: ["Claimants and witnesses", "Licence plates", "Health details", "Policyholders' contacts"],
    kept: ["Insurers, garages and clinics", "Policy terms and amounts", "Dates and places of loss"],
    model: "Veil 1",
    example: [
      "Vehicle ",
      { text: "AB-12-CD", owner: "person", kind: "plate" },
      ", driven by ",
      { text: "Pedro Santos", owner: "person", kind: "name" },
      ", repaired at ",
      { text: "Auto Reparadora do Norte, Lda.", owner: "company", kind: "company" },
      ".",
    ],
  },
  {
    slug: "hr",
    photo: { src: unsplash("photo-1758691737278-3af15b37af48"), by: "Vitaly Gariev", page: "https://unsplash.com/photos/two-colleagues-discussing-work-in-a-modern-office-E3TJIo5E9Gg" },
    name: "HR and recruiting",
    audience: "HR and recruiting",
    headline: "CVs and payslips, with candidates' details covered.",
    lead: "Screening tools read every CV and payslip a team receives. Veil covers names, contacts and salaries. Employers, job titles and skills stay. complydoc also flags CVs that hide instructions for the screening model.",
    documents: ["CVs and cover letters", "Employment contracts", "Payslips", "Performance reviews"],
    veiled: ["Candidates and employees", "Contacts and addresses", "Salaries", "Social security numbers"],
    kept: ["Employers and schools", "Job titles and skills", "Dates of employment"],
    model: "Veil 1 Mini",
    example: [
      { text: "Ana Rodrigues", owner: "person", kind: "name" },
      ", ",
      { text: "ana.r@exemplo.pt", owner: "person", kind: "email" },
      ". Data engineer at ",
      { text: "Lisboa Data Lab, Lda.", owner: "company", kind: "company" },
      ", 2021 to 2025.",
    ],
  },
];

export const industryPath = (slug: string) => `industries/${slug}/`;
