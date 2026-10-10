import type { LicenseStatus } from '../../shared/license/api'
import { Card, Toggle } from '../components/ui'
import { messages } from '../i18n'
import type { Preferences } from '../lib/preferences'
import { BackupSection } from './settings/BackupSection'
import { FeaturesSection } from './settings/FeaturesSection'
import { LicenseSection } from './settings/LicenseSection'
import { PrintingSection } from './settings/PrintingSection'

export type SettingsPageProps = {
  preferences: Preferences
  onPreferencesChange: (preferences: Preferences) => void
  licenseStatus: LicenseStatus | null
  readOnly: boolean
  onActivateLicense: (key: string) => Promise<string | null>
}

/**
 * Settings, one card per concern (§4.6 keeps Settings out of the sidebar for
 * cashiers, so everything here is an owner/manager task).
 *
 * Lite mode is a *preference*, not a business setting: it lives in localStorage
 * and is applied by the shell, so flipping it is instant and needs no database
 * write, no migration and no backup.
 */
export function SettingsPage({
  preferences,
  onPreferencesChange,
  licenseStatus,
  readOnly,
  onActivateLicense,
}: SettingsPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-4 text-h3 font-semibold text-ink">{messages.settings.appearanceTitle}</h2>
        <div className="max-w-[560px]">
          <Toggle
            id="preference-lite-mode"
            label={
              <span>
                {messages.settings.liteMode}
                <span className="block text-sm font-normal text-muted">{messages.settings.liteModeHint}</span>
              </span>
            }
            checked={preferences.liteMode}
            onChange={(liteMode) => onPreferencesChange({ ...preferences, liteMode })}
          />
        </div>
      </Card>

      <Card>
        <FeaturesSection readOnly={readOnly} />
      </Card>

      <Card>
        <PrintingSection preferences={preferences} onPreferencesChange={onPreferencesChange} />
      </Card>

      <Card>
        <BackupSection readOnly={readOnly} />
      </Card>

      <Card>
        <LicenseSection status={licenseStatus} onActivate={onActivateLicense} />
      </Card>
    </div>
  )
}
