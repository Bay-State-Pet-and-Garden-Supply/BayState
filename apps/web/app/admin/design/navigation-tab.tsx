'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Navigation, Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { updateNavigationSettingsAction } from './actions';
import type { NavLink } from '@/lib/settings';
import { toast } from 'sonner';

interface NavigationTabProps {
  initialSettings: {
    headerLinks: NavLink[];
    footerShopLinks: NavLink[];
    footerServiceLinks: NavLink[];
    footerLegalLinks: NavLink[];
  };
}

type SectionKey = 'headerLinks' | 'footerShopLinks' | 'footerServiceLinks' | 'footerLegalLinks';

export function NavigationTab({ initialSettings }: NavigationTabProps) {
  const [headerLinks, setHeaderLinks] = useState<NavLink[]>(initialSettings.headerLinks || []);
  const [footerShopLinks, setFooterShopLinks] = useState<NavLink[]>(initialSettings.footerShopLinks || []);
  const [footerServiceLinks, setFooterServiceLinks] = useState<NavLink[]>(initialSettings.footerServiceLinks || []);
  const [footerLegalLinks, setFooterLegalLinks] = useState<NavLink[]>(initialSettings.footerLegalLinks || []);
  const [isSaving, setIsSaving] = useState(false);

  const getSectionState = (section: SectionKey) => {
    switch (section) {
      case 'headerLinks': return headerLinks;
      case 'footerShopLinks': return footerShopLinks;
      case 'footerServiceLinks': return footerServiceLinks;
      case 'footerLegalLinks': return footerLegalLinks;
    }
  };

  const setSectionState = (section: SectionKey, newState: NavLink[]) => {
    switch (section) {
      case 'headerLinks': setHeaderLinks(newState); break;
      case 'footerShopLinks': setFooterShopLinks(newState); break;
      case 'footerServiceLinks': setFooterServiceLinks(newState); break;
      case 'footerLegalLinks': setFooterLegalLinks(newState); break;
    }
  };

  const addLink = (section: SectionKey) => {
    const current = getSectionState(section);
    setSectionState(section, [...current, { label: '', href: '', openInNewTab: false }]);
  };

  const removeLink = (section: SectionKey, index: number) => {
    const current = getSectionState(section);
    setSectionState(section, current.filter((_, i) => i !== index));
  };

  const updateLink = (section: SectionKey, index: number, field: keyof NavLink, value: string | boolean) => {
    const current = getSectionState(section);
    const updated = [...current];
    updated[index] = { ...updated[index], [field]: value };
    setSectionState(section, updated);
  };

  const moveLink = (section: SectionKey, index: number, direction: 'up' | 'down') => {
    const current = getSectionState(section);
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === current.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...current];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setSectionState(section, updated);
  };

  const handleSubmit = async (formData: FormData) => {
    setIsSaving(true);
    
    // Set variables as stringified JSON in the FormData
    formData.set('headerLinks', JSON.stringify(headerLinks.filter(l => l.label && l.href)));
    formData.set('footerShopLinks', JSON.stringify(footerShopLinks.filter(l => l.label && l.href)));
    formData.set('footerServiceLinks', JSON.stringify(footerServiceLinks.filter(l => l.label && l.href)));
    formData.set('footerLegalLinks', JSON.stringify(footerLegalLinks.filter(l => l.label && l.href)));

    const result = await updateNavigationSettingsAction(formData);
    setIsSaving(false);

    if (result.success) {
      toast.success('Navigation settings updated');
    } else {
      toast.error(result.error || 'Failed to update settings');
    }
  };

  const renderLinkSection = (title: string, description: string, key: SectionKey) => {
    const links = getSectionState(key);

    return (
      <Card className="border border-border rounded-none">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => addLink(key)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Link
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {links.length === 0 ? (
            <div className="rounded-none border border-dashed p-6 text-center text-muted-foreground text-sm">
              No links configured. Click &quot;Add Link&quot; to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link, index) => (
                <div key={index} className="flex flex-col gap-3 rounded-none border p-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-1 sm:self-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveLink(key, index, 'up')}
                      disabled={index === 0}
                      title="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveLink(key, index, 'down')}
                      disabled={index === links.length - 1}
                      title="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`${key}-label-${index}`} className="sr-only">Label</Label>
                    <Input
                      id={`${key}-label-${index}`}
                      value={link.label}
                      onChange={(e) => updateLink(key, index, 'label', e.target.value)}
                      placeholder="e.g. Products"
                      className="h-10"
                    />
                  </div>

                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`${key}-href-${index}`} className="sr-only">URL Path</Label>
                    <Input
                      id={`${key}-href-${index}`}
                      value={link.href}
                      onChange={(e) => updateLink(key, index, 'href', e.target.value)}
                      placeholder="e.g. /products"
                      className="h-10"
                    />
                  </div>

                  <div className="flex items-center gap-2 sm:px-2">
                    <input
                      type="checkbox"
                      id={`${key}-tab-${index}`}
                      checked={link.openInNewTab || false}
                      onChange={(e) => updateLink(key, index, 'openInNewTab', e.target.checked)}
                      className="h-4 w-4 rounded-none border-border"
                    />
                    <Label htmlFor={`${key}-tab-${index}`} className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                      New tab
                    </Label>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => removeLink(key, index)}
                    title="Delete Link"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      <Card className="border border-border rounded-none">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-none bg-blue-100">
              <Navigation className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>Storefront Navigation</CardTitle>
              <CardDescription>
                Manage main header links and various footer column links. Empty labels or URLs will be ignored.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {renderLinkSection('Header Navigation', 'Main menu links displayed in the desktop header and mobile drawer.', 'headerLinks')}
      {renderLinkSection('Footer Shop Column', 'Links shown under the "Shop" column in the storefront footer.', 'footerShopLinks')}
      {renderLinkSection('Footer Services Column', 'Links shown under the "Services" column in the storefront footer.', 'footerServiceLinks')}
      {renderLinkSection('Footer Info & Legal Column', 'Links shown under the "Information" column in the storefront footer.', 'footerLegalLinks')}

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Navigation Settings'}
        </Button>
      </div>
    </form>
  );
}
