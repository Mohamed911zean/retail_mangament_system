import type { ReactNode } from 'react'
import { Card, EmptyState } from '../components/ui'
import { BoxIcon } from '../components/icons'
import { messages } from '../i18n'

/**
 * Stands in for a screen that has not been built yet (Phase 2). It says so in
 * Arabic and points at what *is* available, instead of showing an empty table
 * that a shop owner would read as "the app is broken".
 */
export function PlaceholderPage({ icon }: { icon?: ReactNode }) {
  return (
    <Card>
      <EmptyState
        icon={icon ?? <BoxIcon size={24} />}
        title={messages.pages.comingSoonTitle}
        description={messages.pages.comingSoonBody}
      />
    </Card>
  )
}
