import { redirect } from 'next/navigation';

export default function CreateScraperRedirect() {
  redirect('/admin/scrapers/list');
}
