import { login } from './actions'
import Image from 'next/image'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"

export default function AdminLoginPage() {
  return (
    <div className="w-full max-w-sm px-6">
      <div className="mb-8 text-center">
        <Image
          src="/icon.png"
          alt="Bay State app icon"
          width={48}
          height={48}
          className="mx-auto mb-4 h-12 w-12 object-contain"
        />
        <h1 className="text-xl font-semibold text-foreground">
          Bay State Pet &amp; Garden Supply
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin Portal
        </p>
      </div>
      <Card className="rounded-[var(--surface-admin-radius)] border">
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">Sign In</h2>
        </CardHeader>
        <form action={login}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="admin@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full">Sign in</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
