import { permanentRedirect } from 'next/navigation';

export default function DashboardRedirect() {
  permanentRedirect('/admin/scrapers/list');
}
