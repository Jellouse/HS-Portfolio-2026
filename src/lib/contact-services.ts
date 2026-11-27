/**
 * What the contact form asks first. Six pills in a 3-2-1 pyramid, in this order.
 * The value is what the api stores and what the email subject names.
 */
export type ContactChoice = { value: string; row: 1 | 2 | 3 };

export const contactChoices: ContactChoice[] = [
  { value: 'Retail store', row: 1 },
  { value: 'Prototype', row: 1 },
  { value: '3D Printing', row: 1 },
  { value: '3D Render', row: 2 },
  { value: 'Website', row: 2 },
  { value: 'Other', row: 3 },
];

/** Rows of pill labels, top to bottom. */
export const contactChoiceRows: string[][] = [1, 2, 3].map((row) =>
  contactChoices.filter((choice) => choice.row === row).map((choice) => choice.value),
);

/** The service pages jump straight to the description step with these. */
export const contactPresets = ['Physical Build', 'Digital Build'];

/** Every service value the api accepts. */
export const contactServiceValues = [...contactChoices.map((choice) => choice.value), ...contactPresets];
