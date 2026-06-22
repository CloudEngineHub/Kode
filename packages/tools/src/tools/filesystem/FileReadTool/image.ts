import { statSync } from 'fs'
import { logError } from '#core/utils/log'
import { secureFileService } from '#core/utils/secureFile'
import type { AnthropicImageMediaType } from './types'
import { MAX_HEIGHT, MAX_IMAGE_SIZE, MAX_WIDTH } from './constants'
import {
  detectImageMediaType,
  isSvgBuffer,
  isSvgExtension,
  rasterizeSvgToPng,
  type SupportedImageMediaType,
} from '#core/utils/image/media'

type ImageToolResult = {
  type: 'image'
  file: {
    base64: string
    type: AnthropicImageMediaType
    originalSize: number
    dimensions?: {
      originalWidth?: number
      originalHeight?: number
      displayWidth?: number
      displayHeight?: number
    }
  }
}

function createImageResponse(
  buffer: Buffer,
  mediaType: SupportedImageMediaType,
  originalSize: number,
  dimensions?: {
    originalWidth?: number
    originalHeight?: number
    displayWidth?: number
    displayHeight?: number
  },
): ImageToolResult {
  return {
    type: 'image',
    file: {
      base64: buffer.toString('base64'),
      type: mediaType as AnthropicImageMediaType,
      originalSize,
      ...(dimensions ? { dimensions } : {}),
    },
  }
}

export async function readImage(
  filePath: string,
  ext: string,
): Promise<ImageToolResult> {
  try {
    const stats = statSync(filePath)
    const sharp = (await import('sharp')).default

    // Use secure file service to read the file
    const fileReadResult = secureFileService.safeReadFile(filePath, {
      encoding: 'buffer' as BufferEncoding,
      maxFileSize: MAX_IMAGE_SIZE,
      checkFileExtension: false,
    })

    if (!fileReadResult.success) {
      throw new Error(`Failed to read image file: ${fileReadResult.error}`)
    }

    const inputBuffer = fileReadResult.content as Buffer

    if (isSvgExtension(ext) || isSvgBuffer(inputBuffer)) {
      const rasterized = await rasterizeSvgToPng(inputBuffer)
      return createImageResponse(rasterized, 'image/png', stats.size)
    }

    const detectedMediaType = detectImageMediaType(inputBuffer)
    if (!detectedMediaType) {
      throw new Error(
        'Unsupported image format. Supported image formats are PNG, JPEG, GIF, WebP, and SVG.',
      )
    }

    const image = sharp(inputBuffer)
    const metadata = await image.metadata()

    const originalWidth = metadata.width
    const originalHeight = metadata.height
    const hasDimensions = Boolean(originalWidth && originalHeight)

    if (!hasDimensions) {
      if (stats.size > MAX_IMAGE_SIZE) {
        const compressedBuffer = await image.jpeg({ quality: 80 }).toBuffer()
        return createImageResponse(compressedBuffer, 'image/jpeg', stats.size)
      }
    }

    // Calculate dimensions while maintaining aspect ratio
    let width = originalWidth || 0
    let height = originalHeight || 0

    // Check if the original file just works
    if (
      stats.size <= MAX_IMAGE_SIZE &&
      width <= MAX_WIDTH &&
      height <= MAX_HEIGHT
    ) {
      // Use secure file service to read the file
      const fileReadResult = secureFileService.safeReadFile(filePath, {
        encoding: 'buffer' as BufferEncoding,
        maxFileSize: MAX_IMAGE_SIZE,
      })

      if (!fileReadResult.success) {
        throw new Error(`Failed to read image file: ${fileReadResult.error}`)
      }

      const dimensions = hasDimensions
        ? {
            originalWidth,
            originalHeight,
            displayWidth: width,
            displayHeight: height,
          }
        : undefined

      return createImageResponse(
        inputBuffer,
        detectedMediaType,
        stats.size,
        dimensions,
      )
    }

    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width)
      width = MAX_WIDTH
    }

    if (height > MAX_HEIGHT) {
      width = Math.round((width * MAX_HEIGHT) / height)
      height = MAX_HEIGHT
    }

    // Resize image and convert to buffer
    const resizedImageBuffer = await image
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer()

    // If still too large after resize, compress quality
    const dimensions = hasDimensions
      ? {
          originalWidth,
          originalHeight,
          displayWidth: width,
          displayHeight: height,
        }
      : undefined

    if (resizedImageBuffer.length > MAX_IMAGE_SIZE) {
      const compressedBuffer = await image.jpeg({ quality: 80 }).toBuffer()
      return createImageResponse(
        compressedBuffer,
        'image/jpeg',
        stats.size,
        dimensions,
      )
    }

    return createImageResponse(
      resizedImageBuffer,
      detectedMediaType,
      stats.size,
      dimensions,
    )
  } catch (e) {
    logError(e)
    // If any error occurs during processing, return original image
    const stats = statSync(filePath)
    const fileReadResult = secureFileService.safeReadFile(filePath, {
      encoding: 'buffer' as BufferEncoding,
      maxFileSize: MAX_IMAGE_SIZE,
      checkFileExtension: false,
    })

    if (!fileReadResult.success) {
      throw new Error(`Failed to read image file: ${fileReadResult.error}`)
    }

    const buffer = fileReadResult.content as Buffer
    const detectedMediaType = detectImageMediaType(buffer)
    if (!detectedMediaType) {
      throw new Error(
        'Unsupported image format. Supported image formats are PNG, JPEG, GIF, WebP, and SVG.',
      )
    }

    return createImageResponse(buffer, detectedMediaType, stats.size)
  }
}
