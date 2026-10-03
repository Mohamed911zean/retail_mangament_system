export type FaultInjector = { after(step: string): void }

export const noFaults: FaultInjector = { after: () => undefined }
