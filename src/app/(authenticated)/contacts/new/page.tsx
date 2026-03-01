'use client'

import { useSearchParams } from 'next/navigation'
import { ContactFormPage } from '@/components/contacts/ContactFormPage'

export default function NewContactPage() {
  const searchParams = useSearchParams()

  // Pre-fill from URL query params (used by voice debrief "Full Form" link)
  const prefill = {
    name: searchParams.get('name') || '',
    title: null,
    organization: searchParams.get('org') || null,
    email: null,
    phone: null,
    linkedinUrl: null,
    twitterHandle: null,
    personalWebsite: null,
    tier: 2,
    categories: [] as string[],
    tags: [] as string[],
    targetCadenceDays: 60,
    status: 'target',
    introductionPathway: null,
    connectionToHawleyOrbit: null,
    whyTheyMatter: null,
    notes: searchParams.get('notes') || null,
  }

  const hasPrefill = searchParams.get('name')

  return <ContactFormPage contact={hasPrefill ? prefill : undefined} />
}
