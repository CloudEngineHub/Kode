import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'

import {
  normalizePathInput,
  safeCreateDirectory,
  safeDeleteFile,
  safeExists,
  safeGetFileInfo,
  safeReadFile,
  safeWriteFile,
} from './operations'
import type {
  SafeCreateDirectoryResult,
  SafeDeleteFileResult,
  SafeFileInfoResult,
  SafeReadFileOptions,
  SafeReadFileResult,
  SafeWriteFileOptions,
  SafeWriteFileResult,
  SecureFileConfig,
  ValidateFileNameResult,
  ValidateFilePathResult,
} from './types'
import { validateFileName, validateFilePath } from './validators'

/**
 * 安全文件系统操作服务
 * 解决文件系统操作中缺少适当验证和错误处理的问题
 */
export class SecureFileService {
  private static instance: SecureFileService
  private allowedBasePaths: Set<string>
  private maxFileSize: number
  private allowedExtensions: Set<string>

  private constructor() {
    // 允许的基础路径
    this.allowedBasePaths = new Set([
      process.cwd(),
      homedir(),
      tmpdir(),
      '/tmp',
      '/var/tmp',
    ])

    // 默认最大文件大小 (10MB)
    this.maxFileSize = 10 * 1024 * 1024

    // 允许的文件扩展名（空集合表示不限制扩展名）
    this.allowedExtensions = new Set()
  }

  public static getInstance(): SecureFileService {
    if (!SecureFileService.instance) {
      SecureFileService.instance = new SecureFileService()
    }
    return SecureFileService.instance
  }

  private getConfig(): SecureFileConfig {
    return {
      allowedBasePaths: this.allowedBasePaths,
      maxFileSize: this.maxFileSize,
      allowedExtensions: this.allowedExtensions,
    }
  }

  /**
   * 验证文件路径是否安全
   * @param filePath 文件路径
   * @returns 验证结果
   */
  public validateFilePath(filePath: string): ValidateFilePathResult {
    return validateFilePath({
      allowedBasePaths: this.allowedBasePaths,
      filePath,
    })
  }

  /**
   * 安全地检查文件是否存在
   * @param filePath 文件路径
   * @returns 文件是否存在
   */
  public safeExists(filePath: string): boolean {
    return safeExists(this.getConfig(), filePath)
  }

  /**
   * 安全地读取文件
   * @param filePath 文件路径
   * @param options 读取选项
   * @returns 读取结果
   */
  public safeReadFile(
    filePath: string,
    options: SafeReadFileOptions = {},
  ): SafeReadFileResult {
    return safeReadFile(this.getConfig(), filePath, options)
  }

  /**
   * 安全地写入文件
   * @param filePath 文件路径
   * @param content 文件内容
   * @param options 写入选项
   * @returns 写入结果
   */
  public safeWriteFile(
    filePath: string,
    content: string | Buffer,
    options: SafeWriteFileOptions = {},
  ): SafeWriteFileResult {
    return safeWriteFile(this.getConfig(), filePath, content, options)
  }

  /**
   * 安全地删除文件
   * @param filePath 文件路径
   * @returns 删除结果
   */
  public safeDeleteFile(filePath: string): SafeDeleteFileResult {
    return safeDeleteFile(this.getConfig(), filePath)
  }

  /**
   * 安全地创建目录
   * @param dirPath 目录路径
   * @param mode 目录权限
   * @returns 创建结果
   */
  public safeCreateDirectory(
    dirPath: string,
    mode: number = 0o755,
  ): SafeCreateDirectoryResult {
    return safeCreateDirectory(this.getConfig(), dirPath, mode)
  }

  /**
   * 安全地获取文件信息
   * @param filePath 文件路径
   * @returns 文件信息
   */
  public safeGetFileInfo(filePath: string): SafeFileInfoResult {
    return safeGetFileInfo(this.getConfig(), filePath)
  }

  /**
   * 添加允许的基础路径
   * @param basePath 基础路径
   */
  public addAllowedBasePath(basePath: string): {
    success: boolean
    error?: string
  } {
    try {
      const normalized = normalizePathInput(basePath)

      // 验证路径是否存在
      if (!existsSync(normalized)) {
        return { success: false, error: 'Base path does not exist' }
      }

      this.allowedBasePaths.add(normalized)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: `Failed to add base path: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  /**
   * 设置最大文件大小
   * @param maxSize 最大文件大小（字节）
   */
  public setMaxFileSize(maxSize: number): void {
    this.maxFileSize = maxSize
  }

  /**
   * 添加允许的文件扩展名
   * @param extensions 文件扩展名数组
   */
  public addAllowedExtensions(extensions: string[]): void {
    extensions.forEach(ext => {
      if (!ext.startsWith('.')) {
        ext = '.' + ext
      }
      this.allowedExtensions.add(ext.toLowerCase())
    })
  }

  /**
   * 检查文件是否在允许的基础路径中
   * @param filePath 文件路径
   * @returns 是否允许
   */
  public isPathAllowed(filePath: string): boolean {
    const validation = this.validateFilePath(filePath)
    return validation.isValid
  }

  /**
   * 验证文件名安全性
   * @param filename 文件名
   * @returns 验证结果
   */
  public validateFileName(filename: string): ValidateFileNameResult {
    return validateFileName(filename)
  }
}

// 导出单例实例
export const secureFileService = SecureFileService.getInstance()
