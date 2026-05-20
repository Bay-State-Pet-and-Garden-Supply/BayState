'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Paintbrush, Plus, Trash2, Save, Phone, Eye } from 'lucide-react';
import { updateBrandingSettingsAction } from './actions';
import type { SocialLink } from '@/lib/settings';
import { toast } from 'sonner';

interface BrandingTabProps {
  initialSettings: {
    siteName: string;
    tagline: string;
    logoUrl: string;
    primaryColor: string;
    accentColor: string;
    contactAddress: string;
    contactEmail: string;
    contactPhones: string[];
    socialLinks: SocialLink[];
  };
}

const platforms = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
];

export function BrandingTab({ initialSettings }: BrandingTabProps) {
  const [siteName, setSiteName] = useState(initialSettings.siteName || '');
  const [tagline, setTagline] = useState(initialSettings.tagline || '');
  const [logoUrl, setLogoUrl] = useState(initialSettings.logoUrl || '');
  const [primaryColor, setPrimaryColor] = useState(initialSettings.primaryColor || '#1e3a5f');
  const [accentColor, setAccentColor] = useState(initialSettings.accentColor || '#22c55e');
  const [contactAddress, setContactAddress] = useState(initialSettings.contactAddress || '');
  const [contactEmail, setContactEmail] = useState(initialSettings.contactEmail || '');
  
  // Lists
  const [contactPhones, setContactPhones] = useState<string[]>(initialSettings.contactPhones || []);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(initialSettings.socialLinks || []);
  
  const [isSaving, setIsSaving] = useState(false);

  // Phone list actions
  const addPhone = () => setContactPhones([...contactPhones, '']);
  const removePhone = (index: number) => setContactPhones(contactPhones.filter((_, i) => i !== index));
  const updatePhone = (index: number, val: string) => {
    const updated = [...contactPhones];
    updated[index] = val;
    setContactPhones(updated);
  };

  // Social list actions
  const addSocial = () => setSocialLinks([...socialLinks, { platform: 'facebook', url: '' }]);
  const removeSocial = (index: number) => setSocialLinks(socialLinks.filter((_, i) => i !== index));
  const updateSocial = (index: number, field: keyof SocialLink, val: string) => {
    const updated = [...socialLinks];
    updated[index] = { ...updated[index], [field]: val } as SocialLink;
    setSocialLinks(updated);
  };

  const handleSubmit = async (formData: FormData) => {
    setIsSaving(true);
    
    // Pass arrays as stringified JSON
    formData.set('contactPhones', JSON.stringify(contactPhones.filter(Boolean)));
    formData.set('socialLinks', JSON.stringify(socialLinks.filter(s => s.url)));

    const result = await updateBrandingSettingsAction(formData);
    setIsSaving(false);

    if (result.success) {
      toast.success('Branding settings updated');
    } else {
      toast.error(result.error || 'Failed to update settings');
    }
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Branding Info */}
      <Card className="border border-border rounded-none">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-none bg-emerald-100">
              <Paintbrush className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle>Branding & Identity</CardTitle>
              <CardDescription>
                Configure the core identity, descriptions, colors, and logos of the storefront.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="siteName">Site Name</Label>
              <Input
                id="siteName"
                name="siteName"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g. Bay State Pet & Garden"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                name="tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. From big to small, we feed them all!"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="logoUrl">Logo Image URL</Label>
              <Input
                id="logoUrl"
                name="logoUrl"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="e.g. /logo.png or external HTTPS link"
              />
            </div>
            <div className="sm:col-span-1 flex flex-col justify-end">
              <div className="flex h-10 items-center gap-2 rounded-none border border-border bg-muted/30 px-3 py-1">
                {logoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="Logo preview" className="max-h-6 max-w-[80px] object-contain" />
                    <span className="text-xs text-muted-foreground truncate">Logo Active</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">No logo preview</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      <Card className="border border-border rounded-none">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Storefront Theme Colors</CardTitle>
          <CardDescription>
            These values customize theme elements where dynamic styles are supported.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Primary Theme Color</Label>
            <div className="flex gap-2">
              <Input
                id="primaryColor"
                name="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="font-mono"
              />
              <Input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-12 h-10 p-0 border border-border cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accentColor">Accent Theme Color</Label>
            <div className="flex gap-2">
              <Input
                id="accentColor"
                name="accentColor"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="font-mono"
              />
              <Input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-12 h-10 p-0 border border-border cursor-pointer"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Details */}
      <Card className="border border-border rounded-none">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">Contact Information</CardTitle>
            <CardDescription>Support email, physical address, and store phone numbers.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addPhone}>
            <Plus className="h-4 w-4 mr-1" />
            Add Phone
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                name="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="e.g. sales@baystatepet.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactAddress">Physical Address</Label>
              <Textarea
                id="contactAddress"
                name="contactAddress"
                value={contactAddress}
                onChange={(e) => setContactAddress(e.target.value)}
                placeholder="e.g. 429 Winthrop Street&#10;Taunton, MA 02780"
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Phone Numbers
            </Label>
            {contactPhones.length === 0 ? (
              <div className="rounded-none border border-dashed p-4 text-center text-muted-foreground text-sm">
                No phone numbers added yet.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {contactPhones.map((phone, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={phone}
                      onChange={(e) => updatePhone(index, e.target.value)}
                      placeholder="e.g. (508) 821-3704"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => removePhone(index)}
                      title="Remove Phone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <Card className="border border-border rounded-none">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">Social Media Profiles</CardTitle>
            <CardDescription>Social platform URLs shown in the header/footer.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSocial}>
            <Plus className="h-4 w-4 mr-1" />
            Add Profile
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {socialLinks.length === 0 ? (
            <div className="rounded-none border border-dashed p-6 text-center text-muted-foreground text-sm">
              No social profiles configured. Click &quot;Add Profile&quot; to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {socialLinks.map((link, index) => (
                <div key={index} className="flex flex-col gap-3 rounded-none border p-4 sm:flex-row sm:items-center">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor={`social-platform-${index}`} className="text-xs font-semibold text-muted-foreground">
                      Platform
                    </Label>
                    <select
                      id={`social-platform-${index}`}
                      value={link.platform}
                      onChange={(e) => updateSocial(index, 'platform', e.target.value)}
                      className="flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {platforms.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-[2] space-y-2">
                    <Label htmlFor={`social-url-${index}`} className="text-xs font-semibold text-muted-foreground">
                      Profile URL
                    </Label>
                    <Input
                      id={`social-url-${index}`}
                      value={link.url}
                      onChange={(e) => updateSocial(index, 'url', e.target.value)}
                      placeholder="https://facebook.com/brandname"
                      className="h-10"
                    />
                  </div>

                  <div className="flex items-end justify-end sm:pt-6">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => removeSocial(index)}
                      title="Remove Profile"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Branding Settings'}
        </Button>
      </div>
    </form>
  );
}
