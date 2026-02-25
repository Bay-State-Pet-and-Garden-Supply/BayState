import { redirect } from 'next/navigation';

export default function TestLabRedirect() {
  redirect('/admin/scrapers/list');
}
