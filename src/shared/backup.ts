export type BackupInfo = {
  fileName: string
  createdAt: number
  sizeBytes: number
}

export type BackupApi = {
  listBackups: () => Promise<BackupInfo[]>
  createBackup: () => Promise<BackupInfo>
  restoreBackup: (fileName: string) => Promise<BackupInfo[]>
}
