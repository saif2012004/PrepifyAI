/** Returns a user-facing hint if the address looks like a common typo. */
export function emailDomainTypoHint(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (e.endsWith('@gamil.com')) {
    return 'This looks like a typo: you wrote @gamil.com. Gmail addresses use @gmail.com.';
  }
  if (e.endsWith('@gmial.com') || e.endsWith('@gmai.com')) {
    return 'Check the spelling of your email domain (@gmail.com).';
  }
  return null;
}
