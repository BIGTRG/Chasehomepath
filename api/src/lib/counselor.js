/**
 * The counselor's name. Deon (2026-09-12): give the assistant a name and use it
 * everywhere instead of "AI". One clear disclosure that Maren is a virtual counselor
 * stays at the start of every meeting and in the Terms (FTC guidance; CA B.O.T. Act
 * requires bot disclosure when a purchase is involved). Everywhere else: just Maren.
 */
export const COUNSELOR = Object.freeze({
  name: 'Maren',
  title: 'your HomePath counselor',
  disclosure: 'Maren is a virtual counselor built by CHASE HomePath, not a person. She speaks only from your file. Rate, loan-term, and legal questions go to your licensed team.',
});
