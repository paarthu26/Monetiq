'use client';

import { redirect } from 'next/navigation';

/** Profile lives inside Settings; this keeps old links working. */
export default function ProfileRedirect() {
  redirect('/settings');
}
