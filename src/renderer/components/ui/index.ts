/**
 * The UI kit. Screens import from `components/ui` only, never from a single file,
 * so a primitive can be split or renamed without touching every page.
 *
 * Nothing here knows about the domain, the IPC contract or Arabic business text:
 * strings arrive as props, values arrive as integers, and formatting happens in
 * `lib/format`. That is what keeps a client overlay able to restyle a screen.
 */
export { Alert, type AlertTone } from './Alert'
export { Badge, type BadgeTone } from './Badge'
export { Button, IconButton, type ButtonProps, type ButtonSize, type ButtonVariant, type IconButtonProps } from './Button'
export { Card, CardHeader, StatCard } from './Card'
export { Dialog, type DialogProps } from './Dialog'
export { EmptyState } from './EmptyState'
export { Field, controlClasses, type FieldProps } from './Field'
export { MoneyInput, type MoneyInputProps } from './MoneyInput'
export { QtyInput, type QtyInputProps } from './QtyInput'
export { Select, Toggle, type SelectOption } from './Select'
export { Spinner } from './Spinner'
export { Table, THead, TRow, TH, TD, TableEmpty, TFoot } from './Table'
export { SearchInput, TextInput, type SearchInputProps, type TextInputProps } from './TextInput'
export { ToastProvider } from './Toast'
