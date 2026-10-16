/**
 * The password of the seeded demo accounts, taken from the environment.
 *
 * `.env` files in this repository quote their values, and the .NET configuration loader strips
 * those quotes - so a password copied straight out of `.env` into a shell arrives here with the
 * quotes attached and every sign-in fails with "Invalid email or password". Removing the
 * surrounding quotes means either form works.
 */
export const seedPassword = (process.env.NINECUBE_SEED_PASSWORD ?? '').replace(/^(['"])(.*)\1$/, '$2');

/** Why the specs that need the demo accounts skip themselves when nothing is configured. */
export const seedPasswordMissing =
  'Set NINECUBE_SEED_PASSWORD (the password of the seeded demo accounts) to run this spec.';
