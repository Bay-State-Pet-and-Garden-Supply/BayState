import { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MapPin, Clock, Phone, Mail } from 'lucide-react';

export const metadata: Metadata = {
    title: "Contact Us",
    description: "Contact Bay State Pet & Garden Supply. Find our store hours, location, phone number, and email. We're always happy to help!",
    openGraph: {
        title: "Contact Us | Bay State Pet & Garden Supply",
        description: "Find our store hours, location, and contact information.",
    },
};

export default async function ContactPage() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <h1 className="text-4xl font-bold tracking-tight mb-8 text-center">Contact Us</h1>

            <h2 className="text-2xl font-semibold text-zinc-900 mb-6">Contact Information</h2>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Store Hours */}
                <Card>
                    <CardHeader>
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Store Hours
                        </h3>
                    </CardHeader>
                    <CardContent>
                        <dl className="space-y-2">
                            <div className="flex justify-between">
                                <dt className="font-medium">Monday - Friday</dt>
                                <dd className="text-zinc-700">8:00 AM - 7:00 PM</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="font-medium">Saturday</dt>
                                <dd className="text-zinc-700">8:00 AM - 6:00 PM</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="font-medium">Sunday</dt>
                                <dd className="text-zinc-700">8:00 AM - 5:00 PM</dd>
                            </div>
                            <div className="mt-4 pt-4 border-t">
                                <dt className="font-medium mb-1">Receiving Hours</dt>
                                <dd className="text-sm text-zinc-700">Monday - Friday: 8:00 AM - 1:00 PM</dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>

                {/* Location */}
                <Card>
                    <CardHeader>
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <MapPin className="h-5 w-5" />
                            Location
                        </h3>
                    </CardHeader>
                    <CardContent>
                        <address className="not-italic space-y-1">
                            <p className="font-medium">Bay State Pet & Garden Supply</p>
                            <p className="text-zinc-700">429 Winthrop Street</p>
                            <p className="text-zinc-700">Taunton, MA 02780</p>
                        </address>
                        <div className="mt-4">
                            <a
                                href="https://maps.google.com/?q=429+Winthrop+Street+Taunton+MA+02780"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-700 hover:underline"
                            >
                                Get Directions
                            </a>
                        </div>
                    </CardContent>
                </Card>

                {/* Phone */}
                <Card>
                    <CardHeader>
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <Phone className="h-5 w-5" />
                            Phone & Text
                        </h3>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-sm font-medium text-zinc-700 mb-1">Call Us</p>
                            <a
                                href="tel:+15088213704"
                                className="text-lg font-medium hover:underline block"
                            >
                                (508) 821-3704
                            </a>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-zinc-700 mb-1">Text Us</p>
                            <a
                                href="sms:+17742269845"
                                className="text-lg font-medium hover:underline block"
                            >
                                (774) 226-9845
                            </a>
                        </div>
                    </CardContent>
                </Card>

                {/* Email */}
                <Card>
                    <CardHeader>
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <Mail className="h-5 w-5" />
                            Email
                        </h3>
                    </CardHeader>
                    <CardContent>
                        <a
                            href="mailto:sales@baystatepet.com"
                            className="font-medium hover:underline"
                        >
                            sales@baystatepet.com
                        </a>
                        <p className="text-sm text-zinc-700 mt-1">
                            We typically respond within 24 hours
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Additional Info */}
            <Card className="mt-6">
                <CardContent className="pt-6">
                    <p className="text-center text-zinc-700">
                        Have a question about a product or service? Give us a call or stop by -
                        we're always happy to help!
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
