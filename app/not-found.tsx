import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 rounded-full bg-zinc-100 p-4 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
        <FileQuestion className="h-10 w-10 text-zinc-500 dark:text-zinc-400" />
      </div>
      
      <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-foreground">
        404
      </h1>
      
      <h2 className="mb-4 text-xl font-medium text-foreground/80">
        Page Not Found
      </h2>
      
      <p className="mb-8 max-w-[450px] text-muted-foreground leading-relaxed">
        Sorry, we could not find the page you are looking for. It may have been moved, deleted, or never existed.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="gap-2 font-medium">
            <Link href="/" className="hover:underline underline-offset-4">
              <Home className="h-4 w-4" />
              Go Home
            </Link>
          </Button>
          
          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link href="/products" className="hover:underline underline-offset-4">
              <ArrowLeft className="h-4 w-4" />
              Browse Products
            </Link>
          </Button>
      </div>
    </div>
  )
}
