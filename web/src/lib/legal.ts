/**
 * Operator details for Impressum and privacy policy.
 * Everything in [brackets] is a placeholder: replace it before going public. Pages highlight
 * remaining placeholders so they are hard to miss.
 */
export const LEGAL = {
  operator: "[Firmenname oder Vor- und Nachname]",
  // Until the company is registered; then put the legal form (e.g. GmbH) in both.
  legalForm: "Firma in Gründung",
  legalFormEn: "Company in formation",
  street: "[Strasse und Hausnummer]",
  city: "[PLZ Ort]",
  country: "Schweiz",
  email: "[kontakt@deine-domain.ch]",
  responsiblePerson: "[Vor- und Nachname der verantwortlichen Person]",
  /** Empty until there is one; the line is then simply left out. */
  uid: "",
  register: "Noch nicht im Handelsregister eingetragen (Firma in Gründung)",
  registerEn: "Not yet entered in the commercial register (company in formation)",
  /** Version of the beta notice; bump it to make everyone confirm again after changes. */
  betaNoticeVersion: "2026-10-28",
  lastUpdated: "28. Oktober 2026",
  lastUpdatedEn: "28 October 2026",
};

export const isPlaceholder = (value: string) => value.startsWith("[") && value.endsWith("]");
