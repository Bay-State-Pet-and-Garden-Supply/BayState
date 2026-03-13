import { permanentRedirect } from 'next/navigation';

export default function CreateScraperRedirect() {
  permanentRedirect('/admin/scrapers/list');
}
