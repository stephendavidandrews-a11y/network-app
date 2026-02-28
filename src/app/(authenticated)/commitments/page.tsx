import { prisma } from '@/lib/db'
import Link from 'next/link'
import { CheckCircle, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

interface CommitmentItem {
  description: string
  dueDate: string | null
  fulfilled: boolean
  contactName: string
  contactId: string
  interactionId: string
  interactionDate: string
  daysOverdue: number | null
}

export default async function CommitmentsPage() {
  const interactions = await prisma.interaction.findMany({
    where: { commitments: { not: '[]' } },
    include: { contact: true },
    orderBy: { date: 'desc' },
  })

  const commitments: CommitmentItem[] = []
  for (const interaction of interactions) {
    try {
      const parsed = JSON.parse(interaction.commitments)
      for (const c of parsed) {
        const daysOverdue = c.due_date && !c.fulfilled
          ? Math.floor((Date.now() - new Date(c.due_date).getTime()) / (1000 * 60 * 60 * 24))
          : null
        commitments.push({
          description: c.description,
          dueDate: c.due_date,
          fulfilled: c.fulfilled,
          contactName: interaction.contact.name,
          contactId: interaction.contactId,
          interactionId: interaction.id,
          interactionDate: interaction.date,
          daysOverdue: daysOverdue && daysOverdue > 0 ? daysOverdue : null,
        })
      }
    } catch { /* skip */ }
  }

  const open = commitments.filter(c => !c.fulfilled).sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0))
  const fulfilled = commitments.filter(c => c.fulfilled)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Commitments</h1>

      {/* Open */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-amber-500" />
          Open Commitments ({open.length})
        </h2>
        {open.length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">No open commitments</div>
        ) : (
          <div className="rounded-lg border bg-white divide-y">
            {open.map((c, i) => (
              <div key={i} className="p-4 flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-900">{c.description}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <Link href={`/contacts/${c.contactId}`} className="hover:text-blue-600">{c.contactName}</Link>
                    <span>from {formatDate(c.interactionDate)}</span>
                    {c.dueDate && <span>Due {formatDate(c.dueDate)}</span>}
                  </div>
                </div>
                {c.daysOverdue && (
                  <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">{c.daysOverdue}d overdue</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fulfilled */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          Fulfilled ({fulfilled.length})
        </h2>
        {fulfilled.length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">No fulfilled commitments</div>
        ) : (
          <div className="rounded-lg border bg-white divide-y">
            {fulfilled.slice(0, 20).map((c, i) => (
              <div key={i} className="p-4 flex items-start justify-between text-gray-400">
                <div>
                  <p className="text-sm line-through">{c.description}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <Link href={`/contacts/${c.contactId}`} className="hover:text-blue-600">{c.contactName}</Link>
                    <span>{formatDate(c.interactionDate)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
