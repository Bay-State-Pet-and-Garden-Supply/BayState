import { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MapPin, Clock, Users, Heart } from 'lucide-react';

export const metadata: Metadata = {
    title: "About Us",
    description: "Learn about Bay State Pet & Garden Supply - a family-owned local store serving the community with quality pet supplies, garden tools, and farm products for decades.",
    openGraph: {
        title: "About Us | Bay State Pet & Garden Supply",
        description: "A family-owned local store serving the community with quality products and neighborly service.",
    },
};

export default async function AboutPage() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <h1 className="text-4xl font-bold tracking-tight mb-8 text-center">About Us</h1>
            <h2 className="text-2xl font-semibold mb-6">Our Story</h2>

            <div className="space-y-8">
                {/* History Section */}
                <Card>
                    <CardHeader>
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Our History
                        </h3>
                    </CardHeader>
                    <CardContent className="prose prose-gray dark:prose-invert">
                        <p>
                            Bay State Pet & Garden Supply, Inc. has been a trusted source for all your animal
                            and farm needs since 1997. Whether you have dogs, cats, farm or zoo animals,
                            Bay State Pet & Garden Supply makes sure to carry all of the latest products and
                            provide all the services for your every need.
                        </p>
                        <p>
                            Bay State Pet & Garden Supply has won numerous honors and awards for their superior
                            customer service and continues to be at the forefront of their industry.
                        </p>
                        <p className="italic">
                            &quot;We are constantly looking for products and services to improve the health and well-being
                            of your pets&quot; Tom says &quot;We know that your pets are a big part of your family,
                            so we want to make them a part of ours.&quot;
                        </p>
                    </CardContent>
                </Card>

                {/* Family/Team Section */}
                <Card>
                    <CardHeader>
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Family Owned & Operated
                        </h3>
                    </CardHeader>
                    <CardContent className="prose prose-gray dark:prose-invert">
                        <p>
                            We&apos;re proud to be a family-owned business. Our team knows the products
                            we sell because we use them ourselves - on our own farms, in our own gardens,
                            and with our own pets.
                        </p>
                        <p>
                            When you shop with us, you&apos;re not just a customer - you&apos;re a neighbor.
                            We&apos;re here to help you find exactly what you need, whether it&apos;s the
                            right feed for your chickens or the perfect toy for your dog.
                        </p>
                    </CardContent>
                </Card>

                {/* Location Section */}
                <Card>
                    <CardHeader>
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <MapPin className="h-5 w-5" />
                            Visit Us
                        </h3>
                    </CardHeader>
                    <CardContent>
                        <p className="text-zinc-700">
                            Stop by our store to see our full selection in person. Our friendly staff
                            is always happy to help you find what you need.
                        </p>
                    </CardContent>
                </Card>

                {/* Mission Section */}
                <Card>
                    <CardHeader>
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <Heart className="h-5 w-5" />
                            Our Mission
                        </h3>
                    </CardHeader>
                    <CardContent className="prose prose-gray dark:prose-invert">
                        <p>
                            To provide our community with quality pet, garden, and farm supplies
                            at fair prices, backed by knowledgeable service and neighborly care.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
