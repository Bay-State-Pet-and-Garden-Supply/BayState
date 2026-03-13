import { redirect } from 'next/navigation';

export default function NewScraperRedirect() {
  redirect('/admin/scrapers/list');
}
