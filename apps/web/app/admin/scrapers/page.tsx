import { permanentRedirect } from 'next/navigation';

export default function ScrapersRootRedirect() {
  permanentRedirect('/admin/scrapers/list');
}
