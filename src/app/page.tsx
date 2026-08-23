import { redirect } from 'next/navigation';

/**
 * The root is not a marketing page in this product. Middleware sends signed-out
 * visitors to /login, so this simply forwards to the dashboard.
 */
export default function Home() {
  redirect('/dashboard');
}
