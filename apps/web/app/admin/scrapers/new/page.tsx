import { permanentRedirect } from 'next/navigation';

export default function NewScraperRedirect() {
  permanentRedirect('/admin/scrapers/list');
}
