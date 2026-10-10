import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  ArrowRightIcon,
  CircleCheckIcon,
  FileTextIcon,
  LayersIcon,
  LockIcon,
  MoonIcon,
  NotebookTextIcon,
  ShieldCheckIcon,
  SunIcon,
  type LucideIcon,
} from 'lucide-react'
import { useRef } from 'react'
import appDark from '@/assets/landing/app-dark.webp'
import appLight from '@/assets/landing/app-light.webp'
import gapsDark from '@/assets/landing/gaps-dark.webp'
import gapsLight from '@/assets/landing/gaps-light.webp'
import mobileDark from '@/assets/landing/mobile-dark.webp'
import mobileLight from '@/assets/landing/mobile-light.webp'
import quotesDark from '@/assets/landing/quotes-dark.webp'
import quotesLight from '@/assets/landing/quotes-light.webp'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

gsap.registerPlugin(useGSAP, ScrollTrigger)

const APP_URL = '/app'
const REPO_URL = 'https://github.com/sohanfernando/cloudflare-notes-ai'

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheckIcon,
    title: 'Only your notes',
    body: 'The model answers from your notes alone, and says "I don\'t know" when they don\'t cover the question.',
  },
  {
    icon: FileTextIcon,
    title: 'Bring your documents',
    body: 'Paste text or upload a PDF, Word, text or Markdown file. Files are read in your browser; only the text is sent.',
  },
  {
    icon: LayersIcon,
    title: 'One note or all of them',
    body: 'Ask across everything, or pick a single note and ask about just that one. Follow-up questions keep the thread.',
  },
  {
    icon: LockIcon,
    title: 'Private to you',
    body: 'Every user sees only their own notes. Sign-in is handled by Cloudflare Access.',
  },
]

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Add a note',
    body: 'Paste in meeting notes, a handbook or a report, or upload the file. It is split into passages and indexed.',
  },
  {
    title: 'Ask in plain language',
    body: 'Your question is matched against your notes, and the closest passages are handed to the model to answer from.',
  },
  {
    title: 'Check the answer',
    body: 'Under each answer are the passages it rests on, each one checked word for word against your note, and the sources they came from.',
  },
]

const STACK = ['Workers', 'D1', 'Vectorize', 'Workers AI', 'Access', 'Ollama for local development']

/** The grid of faint lines behind the hero and the closing panel, fading out towards the edges. */
function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]',
        className,
      )}
    />
  )
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center" data-reveal>
      <p className="font-medium text-emerald-600 text-sm dark:text-emerald-400">{eyebrow}</p>
      <h2 className="mt-3 text-balance font-semibold text-3xl tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-pretty text-muted-foreground sm:text-lg">{body}</p>
    </div>
  )
}

function Phone({ src, alt, className, name }: { src: string; alt: string; className?: string; name: string }) {
  return (
    <div
      className={cn(
        'w-44 overflow-hidden rounded-[2rem] border-[6px] border-foreground/15 bg-background shadow-2xl sm:w-60',
        className,
      )}
      data-phone={name}
    >
      <img alt={alt} className="block w-full" height={2532} loading="lazy" src={src} width={1170} />
    </div>
  )
}

export default function Landing() {
  const { theme, toggle } = useTheme()
  const root = useRef<HTMLDivElement>(null)
  const dark = theme === 'dark'

  useGSAP(
    () => {
      // Everything is laid out in its final state; motion is added only for people who have not asked for less of it.
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ defaults: { ease: 'power3.out', duration: 0.9 } })
          .from('[data-nav]', { y: -24, autoAlpha: 0, duration: 0.6 })
          .from('[data-hero-fade="eyebrow"]', { y: 16, autoAlpha: 0, duration: 0.6 }, '<0.1')
          .from('[data-hero-line]', { yPercent: 110, stagger: 0.12 }, '<0.1')
          .from('[data-hero-underline]', { strokeDashoffset: 1, duration: 0.7, ease: 'power2.inOut' }, '-=0.35')
          .from('[data-hero-fade="body"]', { y: 20, autoAlpha: 0, stagger: 0.1 }, '-=0.6')
          .from('[data-hero-shot]', { y: 80, autoAlpha: 0, duration: 1.1 }, '-=0.7')
          .from('[data-hero-chip]', { scale: 0.6, autoAlpha: 0, duration: 0.5, ease: 'back.out(2)' }, '-=0.3')

        // The screenshot starts tilted back and settles flat as it is scrolled into view.
        gsap.fromTo(
          '[data-hero-frame]',
          { rotateX: 14, scale: 0.94 },
          {
            rotateX: 0,
            scale: 1,
            ease: 'none',
            scrollTrigger: { trigger: '[data-hero-shot]', start: 'top 75%', end: 'top 15%', scrub: 0.6 },
          },
        )
        gsap.to('[data-glow]', { xPercent: 10, yPercent: -8, duration: 9, repeat: -1, yoyo: true, ease: 'sine.inOut' })

        for (const element of gsap.utils.toArray<HTMLElement>('[data-reveal]')) {
          gsap.from(element, {
            y: 32,
            autoAlpha: 0,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: { trigger: element, start: 'top 85%', once: true },
          })
        }

        gsap.set('[data-card]', { y: 40, autoAlpha: 0 })
        ScrollTrigger.batch('[data-card]', {
          start: 'top 88%',
          once: true,
          onEnter: (cards) =>
            gsap.to(cards, { y: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out', stagger: 0.1 }),
        })

        gsap.fromTo(
          '[data-step-line]',
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: { trigger: '[data-steps]', start: 'top 70%', end: 'bottom 65%', scrub: 0.4 },
          },
        )
        for (const step of gsap.utils.toArray<HTMLElement>('[data-step]')) {
          gsap.from(step, {
            x: -24,
            autoAlpha: 0,
            duration: 0.7,
            ease: 'power3.out',
            scrollTrigger: { trigger: step, start: 'top 80%', once: true },
          })
        }

        // The two phones drift in opposite directions while their section crosses the screen.
        const phones = { trigger: '[data-phones]', start: 'top bottom', end: 'bottom top', scrub: 0.6 }
        gsap.fromTo('[data-phone="back"]', { y: 70 }, { y: -50, ease: 'none', scrollTrigger: phones })
        gsap.fromTo('[data-phone="front"]', { y: -30 }, { y: 60, ease: 'none', scrollTrigger: phones })
      })
    },
    { scope: root },
  )

  return (
    <div className="relative overflow-x-clip" ref={root}>
      <header
        className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md"
        data-nav
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a className="flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold" href="/">
            <NotebookTextIcon className="size-5" /> Notes AI
          </a>
          <nav className="hidden items-center gap-6 text-muted-foreground text-sm md:flex">
            <a className="transition-colors hover:text-foreground" href="#features">
              Features
            </a>
            <a className="transition-colors hover:text-foreground" href="#how-it-works">
              How it works
            </a>
            <a className="transition-colors hover:text-foreground" href={REPO_URL} rel="noreferrer" target="_blank">
              GitHub
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button
              aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
              onClick={toggle}
              size="icon-sm"
              variant="ghost"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
            <Button asChild>
              <a href={APP_URL}>
                Open app <ArrowRightIcon />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-4 pt-16 pb-10 sm:px-6 sm:pt-24">
          <GridBackdrop />
          <div
            aria-hidden
            className="pointer-events-none absolute top-24 left-1/2 h-72 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl"
            data-glow
          />

          <div className="relative mx-auto max-w-4xl text-center">
            <p
              className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-muted-foreground text-sm"
              data-hero-fade="eyebrow"
            >
              <CircleCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
              Every quote is checked against your note
            </p>
            <h1 className="mt-6 font-semibold text-5xl tracking-tight sm:text-6xl lg:text-7xl">
              <span className="block overflow-hidden pb-2">
                <span className="block" data-hero-line>
                  Ask your notes.
                </span>
              </span>
              <span className="-mt-2 block overflow-hidden pb-3">
                <span className="block" data-hero-line>
                  Check{' '}
                  <span className="relative inline-block">
                    every answer.
                    <svg
                      aria-hidden
                      className="absolute -bottom-2 left-0 h-3 w-full text-emerald-500"
                      fill="none"
                      preserveAspectRatio="none"
                      viewBox="0 0 300 12"
                    >
                      <path
                        d="M2 8 C 60 2, 120 11, 180 6 S 270 3, 298 7"
                        data-hero-underline
                        pathLength={1}
                        stroke="currentColor"
                        strokeDasharray={1}
                        strokeLinecap="round"
                        strokeWidth={3}
                      />
                    </svg>
                  </span>
                </span>
              </span>
            </h1>
            <p
              className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl"
              data-hero-fade="body"
            >
              Paste in your notes or upload a document, then ask in plain language. Answers come only from
              what you wrote, with the exact passages they rest on shown underneath.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3" data-hero-fade="body">
              <Button asChild className="h-11 px-5 text-base">
                <a href={APP_URL}>
                  Open the app <ArrowRightIcon />
                </a>
              </Button>
              <Button asChild className="h-11 px-5 text-base" variant="outline">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto mt-16 max-w-6xl [perspective:2000px]" data-hero-shot>
            <div
              className="origin-top overflow-hidden rounded-xl border bg-card shadow-2xl ring-1 ring-foreground/5"
              data-hero-frame
            >
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-foreground/15" />
                <span className="size-2.5 rounded-full bg-foreground/15" />
                <span className="size-2.5 rounded-full bg-foreground/15" />
                <span className="mx-auto rounded-md bg-muted px-3 py-0.5 text-muted-foreground text-xs">
                  Notes AI
                </span>
              </div>
              <img
                alt="The Notes AI app: a list of notes on the left, and on the right a question about annual leave answered with two quotes from the Team Handbook, each marked as found word for word."
                className="block w-full"
                height={1800}
                src={dark ? appDark : appLight}
                width={2880}
              />
            </div>
            <div
              className="absolute -bottom-5 left-6 hidden items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm shadow-lg md:flex"
              data-hero-chip
            >
              <CircleCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-muted-foreground">Found word for word in</span>
              <span className="font-medium">Team Handbook</span>
            </div>
          </div>
        </section>

        <section className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28" id="features">
          <SectionHeading
            body="A language model can sound right and be wrong. Notes AI shows what each answer is based on, and tells you when your notes have nothing to say."
            eyebrow="Features"
            title="Answers you don't have to take on trust"
          />

          <div className="mx-auto mt-14 grid max-w-6xl gap-4 lg:grid-cols-12">
            <article className="flex flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-8" data-card>
              <div className="p-6 sm:p-8">
                <h3 className="font-semibold text-xl">Verified quotes</h3>
                <p className="mt-2 max-w-xl text-muted-foreground">
                  Each answer shows the passages behind it. A quote is marked as verified only after the
                  server finds it word for word in your note, so a loose paraphrase is visible instead of
                  hidden.
                </p>
              </div>
              <div className="mt-auto border-t bg-background px-4 pt-4 sm:px-8 sm:pt-6">
                <img
                  alt="An answer followed by two quotes, each with a green tick and the words: Found word for word in Team Handbook."
                  className="block w-full rounded-t-lg"
                  height={655}
                  loading="lazy"
                  src={dark ? quotesDark : quotesLight}
                  width={1478}
                />
              </div>
            </article>

            <article className="flex flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-4" data-card>
              <div className="p-6 sm:p-8">
                <h3 className="font-semibold text-xl">Gaps</h3>
                <p className="mt-2 text-muted-foreground">
                  Questions your notes couldn't answer are kept in a list, so you can see what is worth
                  writing down. A gap closes when you ask it again and get an answer.
                </p>
              </div>
              <div className="mt-auto border-t bg-background px-4 pt-4 sm:px-6">
                <img
                  alt="The Gaps list with one entry: What is the parental leave policy? with an Ask again button."
                  className="block w-full rounded-t-lg"
                  height={380}
                  loading="lazy"
                  src={dark ? gapsDark : gapsLight}
                  width={750}
                />
              </div>
            </article>

            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article className="rounded-2xl border bg-card p-6 sm:col-span-1 lg:col-span-3" data-card key={title}>
                <span className="flex size-9 items-center justify-center rounded-lg border bg-background">
                  <Icon className="size-4" />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="scroll-mt-20 border-y bg-muted/30 px-4 py-20 sm:px-6 sm:py-28" id="how-it-works">
          <SectionHeading
            body="No folders to organise and no tags to keep up. Add what you have and ask."
            eyebrow="How it works"
            title="From a pile of notes to an answer in three steps"
          />

          <ol className="relative mx-auto mt-14 max-w-2xl" data-steps>
            <div aria-hidden className="absolute top-2 bottom-2 left-5 w-px bg-border" />
            <div
              aria-hidden
              className="absolute top-2 bottom-2 left-5 w-px origin-top bg-emerald-500"
              data-step-line
            />
            {STEPS.map(({ title, body }, index) => (
              <li className="relative flex gap-6 pb-12 last:pb-0" data-step key={title}>
                <span className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full border bg-background font-semibold text-sm">
                  {index + 1}
                </span>
                <div className="pt-1.5">
                  <h3 className="font-semibold text-lg">{title}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div data-reveal>
              <p className="font-medium text-emerald-600 text-sm dark:text-emerald-400">On every screen</p>
              <h2 className="mt-3 text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
                The same app on your phone, in light or dark
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground sm:text-lg">
                Look something up between meetings. On a small screen the chat and your notes become two
                tabs, and nothing is left out.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {STACK.map((name) => (
                  <span className="rounded-full border px-3 py-1 text-muted-foreground text-sm" key={name}>
                    {name}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-muted-foreground text-sm">
                Built on Cloudflare. For development it runs entirely on your own machine.
              </p>
            </div>
            <div className="flex justify-center py-10" data-phones>
              <Phone
                alt="The app on a phone in light mode."
                className="translate-x-6 -rotate-3"
                name="back"
                src={mobileLight}
              />
              <Phone
                alt="The app on a phone in dark mode, answering who owns the mobile app redesign with two verified quotes."
                className="-translate-x-6 rotate-3"
                name="front"
                src={mobileDark}
              />
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-28">
          <div
            className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border bg-card px-6 py-16 text-center sm:py-20"
            data-reveal
          >
            <GridBackdrop className="[mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]" />
            <div className="relative">
              <h2 className="text-balance font-semibold text-3xl tracking-tight sm:text-5xl">
                Start asking your notes
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground sm:text-lg">
                Add your first note and ask it a question. It takes about a minute.
              </p>
              <Button asChild className="mt-8 h-11 px-5 text-base">
                <a href={APP_URL}>
                  Open the app <ArrowRightIcon />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <NotebookTextIcon className="size-4" /> Notes AI
          </span>
          <a className="transition-colors hover:text-foreground" href={REPO_URL} rel="noreferrer" target="_blank">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
