'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Paintbrush,
    Plus,
    Trash2,
    Save,
    Building,
    Palette,
    Share2
} from 'lucide-react';
import type { BrandingSettings, SocialLink } from '@/lib/settings';
import { updateBrandingSettingsAction } from './actions';
import { toast } from 'sonner';
import Image from 'next/image';

interface BrandingTabProps {
    initialSettings: BrandingSettings;
}

const SOCIAL_PLATFORMS = [
    { value: 'facebook', label: 'Facebook' },
    { value: 'twitter', label: 'Twitter/X' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'tiktok', label: 'TikTok' },
] as const;

export function BrandingTab({ initialSettings }: BrandingTabProps) {
    const [siteName, setSiteName] = useState(initialSettings.siteName);
    const [tagline, setTagline] = useState(initialSettings.tagline);
    const [logoUrl, setLogoUrl] = useState(initialSettings.logoUrl);
    const [primaryColor, setPrimaryColor] = useState(initialSettings.primaryColor);
    const [accentColor, setAccentColor] = useState(initialSettings.accentColor);
    const [contactAddress, setContactAddress] = useState(initialSettings.contactAddress);
    const [contactEmail, setContactEmail] = useState(initialSettings.contactEmail);
    const [contactPhones, setContactPhones] = useState(initialSettings.contactPhones.join('\n'));
    const [socialLinks, setSocialLinks] = useState<SocialLink[]>(initialSettings.socialLinks);
    const [isSaving, setIsSaving] = useState(false);

    const addSocialLink = () => {
        setSocialLinks([...socialLinks, { platform: 'facebook', url: '' }]);
    };

    const removeSocialLink = (index: number) => {
        setSocialLinks(socialLinks.filter((_, i) => i !== index));
    };

    const updateSocialLink = (index: number, field: keyof SocialLink, value: string) => {
        const updated = [...socialLinks];
        updated[index] = { ...updated[index], [field]: value } as SocialLink;
        setSocialLinks(updated);
    };

    const handleSubmit = async (formData: FormData) => {
        setIsSaving(true);

        formData.set('siteName', siteName);
        formData.set('tagline', tagline);
        formData.set('logoUrl', logoUrl);
        formData.set('primaryColor', primaryColor);
        formData.set('accentColor', accentColor);
        formData.set('contactAddress', contactAddress);
        formData.set('contactEmail', contactEmail);
        formData.set('contactPhones', JSON.stringify(contactPhones.split('\n').filter(Boolean)));
        formData.set('socialLinks', JSON.stringify(socialLinks));

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
            {/* Site Identity */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
                            <Paintbrush className="h-5 w-5 text-violet-600" />
                        </div>
                        <div>
                            <CardTitle>Site Identity</CardTitle>
                            <CardDescription>
                                Your site name, tagline, and logo
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
                                value={siteName}
                                onChange={(e) => setSiteName(e.target.value)}
                                placeholder="Bay State Pet & Garden"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tagline">Tagline</Label>
                            <Input
                                id="tagline"
                                value={tagline}
                                onChange={(e) => setTagline(e.target.value)}
                                placeholder="From big to small, we feed them all!"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="logoUrl">Logo URL</Label>
                        <div className="flex gap-4">
                            <Input
                                id="logoUrl"
                                value={logoUrl}
                                onChange={(e) => setLogoUrl(e.target.value)}
                                placeholder="/logo.png"
                                className="flex-1"
                            />
                            {logoUrl && (
                                <div className="h-10 w-10 rounded border bg-white p-1 flex items-center justify-center">
                                    <Image
                                        src={logoUrl}
                                        alt="Logo preview"
                                        width={32}
                                        height={32}
                                        className="object-contain"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Colors */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100">
                            <Palette className="h-5 w-5 text-pink-600" />
                        </div>
                        <div>
                            <CardTitle>Brand Colors</CardTitle>
                            <CardDescription>
                                Primary and accent colors used across the site
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="primaryColor">Primary Color</Label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    id="primaryColor"
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    className="h-10 w-14 cursor-pointer rounded border"
                                />
                                <Input
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    placeholder="#1e3a5f"
                                    className="flex-1 font-mono text-sm"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Used for header, buttons, and primary elements
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="accentColor">Accent Color</Label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    id="accentColor"
                                    value={accentColor}
                                    onChange={(e) => setAccentColor(e.target.value)}
                                    className="h-10 w-14 cursor-pointer rounded border"
                                />
                                <Input
                                    value={accentColor}
                                    onChange={(e) => setAccentColor(e.target.value)}
                                    placeholder="#22c55e"
                                    className="flex-1 font-mono text-sm"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Used for highlights and call-to-action elements
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100">
                            <Building className="h-5 w-5 text-cyan-600" />
                        </div>
                        <div>
                            <CardTitle>Contact Information</CardTitle>
                            <CardDescription>
                                Address, email, and phone numbers shown in the footer
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="contactAddress">Address</Label>
                        <Textarea
                            id="contactAddress"
                            value={contactAddress}
                            onChange={(e) => setContactAddress(e.target.value)}
                            placeholder="429 Winthrop Street&#10;Taunton, MA 02780"
                            rows={2}
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="contactEmail">Email</Label>
                            <Input
                                id="contactEmail"
                                type="email"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                placeholder="sales@baystatepet.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contactPhones">Phone Numbers (one per line)</Label>
                            <Textarea
                                id="contactPhones"
                                value={contactPhones}
                                onChange={(e) => setContactPhones(e.target.value)}
                                placeholder="(508) 821-3704&#10;(774) 226-9845"
                                rows={2}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Social Links */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                            <Share2 className="h-5 w-5 text-orange-600" />
                        </div>
                        <div>
                            <CardTitle>Social Media</CardTitle>
                            <CardDescription>
                                Links to your social media profiles
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-end">
                        <Button type="button" variant="outline" size="sm" onClick={addSocialLink}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add Social Link
                        </Button>
                    </div>

                    {socialLinks.length === 0 && (
                        <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                            No social links configured. Add your first social profile!
                        </div>
                    )}

                    <div className="space-y-2">
                        {socialLinks.map((link, index) => (
                            <div key={index} className="flex items-center gap-2 rounded-lg border p-3">
                                <select
                                    value={link.platform}
                                    onChange={(e) => updateSocialLink(index, 'platform', e.target.value)}
                                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    {SOCIAL_PLATFORMS.map((platform) => (
                                        <option key={platform.value} value={platform.value}>
                                            {platform.label}
                                        </option>
                                    ))}
                                </select>
                                <Input
                                    value={link.url}
                                    onChange={(e) => updateSocialLink(index, 'url', e.target.value)}
                                    placeholder="https://..."
                                    className="flex-1"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeSocialLink(index)}
                                    className="h-8 w-8"
                                    aria-label="Remove social link"
                                >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="sticky bottom-4 flex justify-end">
                <Button type="submit" size="lg" disabled={isSaving} className="shadow-lg">
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Branding Settings'}
                </Button>
            </div>
        </form>
    );
}
