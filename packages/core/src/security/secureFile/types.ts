export type ValidateFilePathResult = {
  isValid: boolean
  normalizedPath: string
  error?: string
}

export type ValidateFileNameResult = {
  isValid: boolean
  error?: string
}

export type SecureFileConfig = {
  allowedBasePaths: ReadonlySet<string>
  maxFileSize: number
  allowedExtensions: ReadonlySet<string>
}

export type SafeReadFileOptions = {
  encoding?: BufferEncoding
  maxFileSize?: number
  allowedExtensions?: string[]
  checkFileExtension?: boolean
}

export type SafeReadFileStats = {
  size: number
  mtime: Date
  atime: Date
  mode: number
}

export type SafeReadFileResult = {
  success: boolean
  content?: string | Buffer
  error?: string
  stats?: SafeReadFileStats
}

export type SafeWriteFileOptions = {
  encoding?: BufferEncoding
  createDirectory?: boolean
  atomic?: boolean
  mode?: number
  allowedExtensions?: string[]
  checkFileExtension?: boolean
  maxSize?: number
}

export type SafeWriteFileResult = { success: boolean; error?: string }

export type SafeDeleteFileResult = { success: boolean; error?: string }

export type SafeCreateDirectoryResult = { success: boolean; error?: string }

export type SafeFileInfoResult = {
  success: boolean
  stats?: {
    size: number
    isFile: boolean
    isDirectory: boolean
    mode: number
    atime: Date
    mtime: Date
    ctime: Date
  }
  error?: string
}
