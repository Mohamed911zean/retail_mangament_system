import { useEffect, useState } from 'react'
import type { Settings, SettingsKey } from '../../../shared/settings'
import { Alert, Button, Select, Toggle } from '../../components/ui'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { useToast } from '../../lib/toast'

/** The flags a shop owner flips; `payment_methods` needs a multi-select, later. */
const FEATURE_FLAGS = ['shifts', 'expiry_batches', 'weighted_items', 'customer_credit', 'tax', 'allow_negative_stock'] as const

const ROUNDING_STEPS = [0, 25, 50, 100] as const

const ROUNDING_LABELS: Record<number, string> = {
  0: messages.cashRounding['0'],
  25: messages.cashRounding['25'],
  50: messages.cashRounding['50'],
  100: messages.cashRounding['100'],
}

const PRESETS = ['frozen_food', 'sweets', 'grocery'] as const

/**
 * Business feature flags (AGENTS.md §6.1) — the *first* customisation mechanism,
 * before hooks and extension tables. A shop that never weighs anything turns the
 * weighed-item column off and gets a simpler POS screen.
 *
 * Every switch writes through `settings:set` immediately and adopts the settings
 * the service returns. If a write fails the switch goes back to what the database
 * says, so the screen can never claim a feature is on when it is not.
 */
export function FeaturesSection({ readOnly }: { readOnly: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<SettingsKey | null>(null)
  const toast = useToast()

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const current = await unwrap(window.api.settings.get())
        if (alive) setSettings(current)
      } catch (caught) {
        if (alive) setError(errorKey(caught))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  async function update(key: SettingsKey, value: Settings[SettingsKey]): Promise<void> {
    setBusy(key)
    setError(null)
    try {
      const next = await unwrap(window.api.settings.set(key, value))
      setSettings(next)
      toast({ kind: 'success', message: messages.settings.saved })
    } catch (caught) {
      setError(errorKey(caught))
    } finally {
      setBusy(null)
    }
  }

  async function applyPreset(preset: (typeof PRESETS)[number]): Promise<void> {
    setError(null)
    try {
      const next = await unwrap(window.api.settings.applyPreset(preset))
      setSettings(next)
      toast({ kind: 'success', message: messages.settings.presetApplied })
    } catch (caught) {
      setError(errorKey(caught))
    }
  }

  const disabled = readOnly || busy !== null || settings === null

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold text-ink">{messages.settings.presetsTitle}</h2>
        <p className="text-sm text-secondary">{messages.settings.presetsHint}</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button key={preset} variant="outline" disabled={disabled} onClick={() => void applyPreset(preset)}>
              {messages.presets[preset]}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold text-ink">{messages.settings.featuresTitle}</h2>
        <div className="flex max-w-[560px] flex-col gap-1">
          {FEATURE_FLAGS.map((flag) => (
            <div key={flag} className="border-b border-line py-2 last:border-b-0">
              <Toggle
                id={`feature-${flag}`}
                label={messages.features[flag]}
                checked={settings?.[flag] ?? false}
                disabled={disabled}
                onChange={(checked) => void update(flag, checked)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold text-ink">{messages.settings.advancedTitle}</h2>
        <div className="max-w-[320px]">
          <label htmlFor="cash-rounding" className="mb-1 block text-sm font-semibold text-strong">
            {messages.features.cashRounding}
          </label>
          <Select
            id="cash-rounding"
            value={String(settings?.cash_rounding_step_piasters ?? 0)}
            disabled={disabled}
            options={ROUNDING_STEPS.map((step) => ({ value: String(step), label: ROUNDING_LABELS[step] }))}
            onChange={(value) => void update('cash_rounding_step_piasters', Number(value))}
          />
        </div>
      </section>

      {error !== null && <Alert tone="error">{translate(error)}</Alert>}
    </div>
  )
}
