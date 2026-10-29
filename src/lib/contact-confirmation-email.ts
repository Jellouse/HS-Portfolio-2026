/** Plain-text confirmation sent to the submitter after the contact form posts. */
export function contactConfirmationEmail(service: string, project: string) {
  const lines = [
    'Thanks for getting in touch.',
    '',
    'This confirms we received your message:',
    '',
    `Service: ${service}`,
    '',
    project,
    '',
    'Johann will reply from Humansize when he can.',
    '',
    'Humansize',
    'https://humansize.de',
  ];
  return lines.join('\n');
}
