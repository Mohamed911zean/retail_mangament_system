export function downloadBase64File(base64: string, fileName: string, mimeType: string): void {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Data URL format: "data:...;base64,..."
      const commaIdx = result.indexOf(',')
      if (commaIdx >= 0) {
        resolve(result.slice(commaIdx + 1))
      } else {
        resolve(result)
      }
    }
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}
