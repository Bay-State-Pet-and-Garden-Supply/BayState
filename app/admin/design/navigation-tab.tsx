'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Navigation, Plus, Trash2, GripVertical, ExternalLink, Save } from 'lucide-react';
import type { NavigationSettings, NavLink } from '@/lib/settings';
import { updateNavigationSettingsAction } from './actions';
import { toast } from 'sonner';

interface NavigationTabProps {
    initialSettings: NavigationSettings;
}

interface LinkListProps {
    title: string;
    description: string;
    links: NavLink[];
    onUpdate: (links: NavLink[]) => void;
}

function LinkList({ title, description, links, onUpdate }: LinkListProps) {
    const addLink = () => {
        onUpdate([...links, { label: '', href: '' }]);
    };

    const removeLink = (index: number) => {
        onUpdate(links.filter((_, i) => i !== index));
    };

    const updateLink = (index: number, field: keyof NavLink, value: string | boolean) => {
        const updated = [...links];
        updated[index] = { ...updated[index], [field]: value };
        onUpdate(updated);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <Label className="text-base font-medium">{title}</Label>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addLink}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Link
                </Button>
            </div>

            {links.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                    No links configured. Add your first link!
                </div>
            )}

            <div className="space-y-2">
                {links.map((link, index) => (
                    <div key={index} className="flex items-center gap-2 rounded-lg border p-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                        <Input
                            value={link.label}
                            onChange={(e) => updateLink(index, 'label', e.target.value)}
                            placeholder="Label"
                            className="flex-1"
                        />
                        <Input
                            value={link.href}
                            onChange={(e) => updateLink(index, 'href', e.target.value)}
                            placeholder="/path or https://..."
                            className="flex-1"
                        />
                        <label className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                            <input
                                type="checkbox"
                                checked={link.openInNewTab || false}
                                onChange={(e) => updateLink(index, 'openInNewTab', e.target.checked)}
                                className="h-4 w-4"
                            />
                            <ExternalLink className="h-3 w-3" />
                        </label>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLink(index)}
                            className="h-8 w-8"
                            aria-label="Remove navigation link"
                        >
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function NavigationTab({ initialSettings }: NavigationTabProps) {
    const [headerLinks, setHeaderLinks] = useState<NavLink[]>(initialSettings.headerLinks);
    const [footerShopLinks, setFooterShopLinks] = useState<NavLink[]>(initialSettings.footerShopLinks);
    const [footerServiceLinks, setFooterServiceLinks] = useState<NavLink[]>(initialSettings.footerServiceLinks);
    const [footerLegalLinks, setFooterLegalLinks] = useState<NavLink[]>(initialSettings.footerLegalLinks);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (formData: FormData) => {
        setIsSaving(true);

        formData.set('headerLinks', JSON.stringify(headerLinks));
        formData.set('footerShopLinks', JSON.stringify(footerShopLinks));
        formData.set('footerServiceLinks', JSON.stringify(footerServiceLinks));
        formData.set('footerLegalLinks', JSON.stringify(footerLegalLinks));

        const result = await updateNavigationSettingsAction(formData);
        setIsSaving(false);

        if (result.success) {
            toast.success('Navigation settings updated');
        } else {
            toast.error(result.error || 'Failed to update settings');
        }
    };

    return (
        <form action={handleSubmit} className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                            <Navigation className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                            <CardTitle>Navigation Links</CardTitle>
                            <CardDescription>
                                Customize the header and footer navigation menus
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    <LinkList
                        title="Header Navigation"
                        description="Main navigation items shown in the site header"
                        links={headerLinks}
                        onUpdate={setHeaderLinks}
                    />

                    <hr />

                    <LinkList
                        title="Footer - Shop Links"
                        description="Links in the 'Shop' column of the footer"
                        links={footerShopLinks}
                        onUpdate={setFooterShopLinks}
                    />

                    <hr />

                    <LinkList
                        title="Footer - Service Links"
                        description="Links in the 'Services' column of the footer"
                        links={footerServiceLinks}
                        onUpdate={setFooterServiceLinks}
                    />

                    <hr />

                    <LinkList
                        title="Footer - Legal Links"
                        description="Links at the bottom of the footer (Privacy, Returns, etc.)"
                        links={footerLegalLinks}
                        onUpdate={setFooterLegalLinks}
                    />
                </CardContent>
            </Card>

            <div className="sticky bottom-4 flex justify-end">
                <Button type="submit" size="lg" disabled={isSaving} className="shadow-lg">
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Navigation Settings'}
                </Button>
            </div>
        </form>
    );
}
