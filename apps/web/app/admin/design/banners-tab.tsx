'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Plus, Trash2, GripVertical } from 'lucide-react';
import type { BannerMessage, CampaignBannerSettings } from '@/lib/settings';
import { updateCampaignBannerAction } from './actions';

interface BannersTabProps {
    initialSettings: CampaignBannerSettings;
}

export function BannersTab({ initialSettings }: BannersTabProps) {
    const [enabled, setEnabled] = useState(initialSettings.enabled);
    const [messages, setMessages] = useState<BannerMessage[]>(initialSettings.messages);
    const [variant, setVariant] = useState(initialSettings.variant);
    const [cycleInterval, setCycleInterval] = useState((initialSettings.cycleInterval || 5000) / 1000);

    const addMessage = () => {
        setMessages([...messages, { text: '', linkText: '', linkHref: '' }]);
    };

    const removeMessage = (index: number) => {
        setMessages(messages.filter((_, i) => i !== index));
    };

    const updateMessage = (index: number, field: keyof BannerMessage, value: string) => {
        const updated = [...messages];
        updated[index] = { ...updated[index], [field]: value };
        setMessages(updated);
    };

    const handleAction = async (formData: FormData) => {
        const result = await updateCampaignBannerAction(formData);
        if (!result.success) {
            alert(result.error);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                        <Megaphone className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <CardTitle>Promotional Banners</CardTitle>
                        <CardDescription>
                            Create cycling promotional banners at the top of the storefront
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <form action={handleAction} className="space-y-6">
                    <input type="hidden" name="messages" value={JSON.stringify(messages)} />
                    <input type="hidden" name="cycleInterval" value={Math.round(cycleInterval * 1000).toString()} />

                    {/* Enable Toggle */}
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                            <p className="font-medium">Banner Enabled</p>
                            <p className="text-sm text-muted-foreground">
                                Show the promotional banner to customers
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Badge variant={enabled ? 'default' : 'secondary'}>
                                {enabled ? 'Active' : 'Inactive'}
                            </Badge>
                            <input
                                type="checkbox"
                                name="enabled"
                                checked={enabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                                className="h-5 w-5 rounded border-gray-300"
                            />
                        </div>
                    </div>

                    {/* Messages List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label>Banner Messages</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addMessage}>
                                <Plus className="h-4 w-4 mr-1" />
                                Add Message
                            </Button>
                        </div>

                        {messages.length === 0 && (
                            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                                No messages yet. Add your first promotional message!
                            </div>
                        )}

                        {messages.map((message, index) => (
                            <div key={index} className="rounded-lg border p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">Message {index + 1}</span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeMessage(index)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor={`message-${index}`}>Message Text</Label>
                                    <Input
                                        id={`message-${index}`}
                                        value={message.text}
                                        onChange={(e) => updateMessage(index, 'text', e.target.value)}
                                        placeholder="🌱 Spring Sale — Save 20% on all garden supplies!"
                                        className="h-12"
                                    />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor={`linkText-${index}`}>Link Text (optional)</Label>
                                        <Input
                                            id={`linkText-${index}`}
                                            value={message.linkText || ''}
                                            onChange={(e) => updateMessage(index, 'linkText', e.target.value)}
                                            placeholder="Shop Now"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`linkHref-${index}`}>Link URL (optional)</Label>
                                        <Input
                                            id={`linkHref-${index}`}
                                            value={message.linkHref || ''}
                                            onChange={(e) => updateMessage(index, 'linkHref', e.target.value)}
                                            placeholder="/products?category=garden"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Cycle Interval */}
                    <div className="space-y-2">
                        <Label htmlFor="cycleIntervalInput">Cycle Interval (seconds)</Label>
                        <Input
                            id="cycleIntervalInput"
                            type="number"
                            min="2"
                            max="30"
                            value={cycleInterval}
                            onChange={(e) => setCycleInterval(parseInt(e.target.value, 10) || 5)}
                            className="w-32"
                        />
                        <p className="text-xs text-muted-foreground">
                            How long each message shows before cycling to the next (2-30 seconds)
                        </p>
                    </div>

                    {/* Variant */}
                    <div className="space-y-2">
                        <Label htmlFor="variant">Banner Style</Label>
                        <select
                            id="variant"
                            name="variant"
                            value={variant}
                            onChange={(e) => setVariant(e.target.value as 'info' | 'promo' | 'seasonal')}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <option value="info">Info (Dark)</option>
                            <option value="promo">Promo (Amber)</option>
                            <option value="seasonal">Seasonal (Green)</option>
                        </select>
                    </div>

                    {/* Preview */}
                    {enabled && messages.length > 0 && (
                        <div className="space-y-2">
                            <Label>Preview (First Message)</Label>
                            <div
                                className={`rounded-lg py-2.5 px-4 text-center text-sm font-medium ${variant === 'info'
                                        ? 'bg-zinc-900 text-white'
                                        : variant === 'promo'
                                            ? 'bg-amber-500 text-zinc-900'
                                            : 'bg-green-600 text-white'
                                    }`}
                            >
                                {messages[0].text}
                                {messages[0].linkText && (
                                    <span className="ml-2 underline">{messages[0].linkText}</span>
                                )}
                            </div>
                            {messages.length > 1 && (
                                <p className="text-xs text-muted-foreground text-center">
                                    + {messages.length - 1} more message{messages.length > 2 ? 's' : ''} will cycle every {cycleInterval} seconds
                                </p>
                            )}
                        </div>
                    )}

                    <Button type="submit" size="lg">
                        Save Changes
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
