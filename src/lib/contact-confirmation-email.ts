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
    'Humansize',
    'https://humansize.de',
  ];
  return lines.join('\n');
}
