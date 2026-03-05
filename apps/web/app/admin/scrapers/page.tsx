import { redirect } from 'next/navigation';

export default function ScrapersRootRedirect() {
  redirect('/admin/scrapers/list');
}
