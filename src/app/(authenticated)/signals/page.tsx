import { prisma } from '@/lib/db'
import Link from 'next/link'
import { ExternalLink, Radio } from 'lucide-react'
import { formatDate, formatRelativeDate } from '@/lib/utils'

export default async function SignalsPage() {
  const signals = await prisma.intelligenceSignal.findMany({
    orderBy: { detectedAt: 'desc' },
    take: 100,
    include: { contact: true },
  })

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Intelligence Signals</h1>
        <span className="text-sm text-gray-500">{signals.length} signals</span>
      </div>

      {signals.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          <Radio className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No intelligence signals yet</p>
          <p className="text-xs text-gray-400 mt-1">Signals will appear here when detected via monitoring or added manually</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white divide-y">
          {signals.map(signal => (
            <div key={signal.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/contacts/${signal.contactId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                      {signal.contact.name}
                    </Link>
                    {signal.contact.organization && (
                      <span className="text-xs text-gray-400">{signal.contact.organization}</span>
                    )}
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-600">
                      {signal.signalType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{signal.title}</p>
                  {signal.description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{signal.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {signal.sourceName && <span className="text-xs text-gray-400">{signal.sourceName}</span>}
                    {signal.sourceUrl && (
                      <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-0.5">
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {signal.outreachHook && (
                    <p className="text-xs text-green-600 mt-1 italic">&quot;{signal.outreachHook}&quot;</p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <span className="text-xs text-gray-400">{formatRelativeDate(signal.detectedAt)}</span>
                  <p className="text-xs text-gray-300 mt-0.5">Relevance: {signal.relevanceScore.toFixed(1)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
