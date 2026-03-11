'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Send,
  Calendar,
  Radio,
  Network,
  CheckSquare,
  Database,
  Inbox,
  Mic,
  Settings,
  LogOut,
  Eye,
  Podcast,
  Newspaper,
  FileText,
  ChevronDown,
  ChevronRight,
  Heart,
  MapPin,
  UserRound,
  UserPlus,
  Import,
  X,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { useMobileSidebar } from './MobileSidebarContext'

const mainNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Inbox', href: '/inbox', icon: Inbox },
  { name: 'Upload', href: '/upload', icon: Mic },
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Interactions', href: '/interactions', icon: MessageSquare },
  { name: 'Outreach', href: '/outreach', icon: Send },
]

const visibilityNavigation = [
  { name: 'Events', href: '/events', icon: Calendar, enabled: true },
  { name: 'Intel Feed', href: '/visibility/intel', icon: FileText, enabled: true },
  { name: 'Podcasts', href: '/visibility/podcasts', icon: Podcast, enabled: true },
]

const socialNavigation = [
  { name: 'Dashboard', href: '/social', icon: Heart },
  { name: 'Friends', href: '/social/friends', icon: UserRound },
  { name: 'Plans', href: '/social/plans', icon: Calendar },
  { name: 'Invites', href: '/social/invites', icon: UserPlus },
  { name: 'Venues', href: '/social/venues', icon: MapPin },
  { name: 'Import', href: '/social/import', icon: Import },
]

const bottomNavigation = [
  { name: 'Signals', href: '/signals', icon: Radio },
  { name: 'Network', href: '/network', icon: Network },
  { name: 'Commitments', href: '/commitments', icon: CheckSquare },
  { name: 'Enrichment', href: '/contacts/enrich', icon: Database },
  { name: 'Settings', href: '/settings', icon: Settings },
]

function SidebarContent() {
  const pathname = usePathname()
  const [visibilityOpen, setVisibilityOpen] = useState(true)
  const [socialOpen, setSocialOpen] = useState(true)

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    if (href === '/contacts') return pathname === '/contacts' || (pathname.startsWith('/contacts/') && !pathname.startsWith('/contacts/enrich'))
    if (href === '/inbox') return pathname === '/inbox'
    return pathname.startsWith(href)
  }

  const isVisibilityActive = visibilityNavigation.some(item => isActive(item.href))
  const isSocialActive = socialNavigation.some(item => isActive(item.href))

  const renderNavItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }>; enabled?: boolean }, indent = false) => {
    const active = isActive(item.href)
    const disabled = item.enabled === false

    if (disabled) {
      return (
        <div
          key={item.name}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 cursor-not-allowed',
            indent && 'pl-9'
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.name}
          <span className="ml-auto text-[10px] text-slate-600">Soon</span>
        </div>
      )
    }

    return (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-slate-700/60 text-slate-100'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
          indent && 'pl-9'
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {item.name}
      </Link>
    )
  }

  return (
    <>
      <div className="flex h-14 items-center px-4 border-b border-slate-700/50">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Network className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-100">Network Intel</span>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {mainNavigation.map(item => renderNavItem(item))}

        {/* Visibility Section */}
        <div className="pt-3">
          <button
            onClick={() => setVisibilityOpen(!visibilityOpen)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
              isVisibilityActive
                ? 'text-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Visibility
            {visibilityOpen ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
          </button>
          {visibilityOpen && (
            <div className="mt-0.5 space-y-0.5">
              {visibilityNavigation.map(item => renderNavItem(item, true))}
            </div>
          )}
        </div>

        {/* Social Section */}
        <div className="pt-3">
          <button
            onClick={() => setSocialOpen(!socialOpen)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
              isSocialActive
                ? 'text-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <Heart className="h-3.5 w-3.5" />
            Social
            {socialOpen ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
          </button>
          {socialOpen && (
            <div className="mt-0.5 space-y-0.5">
              {socialNavigation.map(item => renderNavItem(item, true))}
            </div>
          )}
        </div>

        <div className="pt-2">
          {bottomNavigation.map(item => renderNavItem(item))}
        </div>
      </nav>

      <div className="border-t border-slate-700/50 p-2">
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </>
  )
}

export function Sidebar() {
  const { isOpen, close } = useMobileSidebar()
  const pathname = usePathname()

  // Auto-close mobile sidebar on navigation
  useEffect(() => {
    close()
  }, [pathname, close])

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full w-60 flex-col bg-slate-900">
        <SidebarContent />
      </div>

      {/* Mobile sidebar drawer */}
      <Dialog.Root open={isOpen} onOpenChange={(open) => !open && close()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 md:hidden" />
          <Dialog.Content
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 md:hidden focus:outline-none"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close className="absolute right-2 top-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
              <X className="h-5 w-5" />
            </Dialog.Close>
            <SidebarContent />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
