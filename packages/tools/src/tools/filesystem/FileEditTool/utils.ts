import { isAbsolute, resolve } from 'path'
import { getCwd } from '#core/utils/state'
import { readFileBun } from '#runtime/file'
import { type Hunk } from 'diff'
import { getPatch } from '#core/utils/diff'
import { normalizeLineEndings } from '#core/utils/paste'

/**
 * Applies an edit to a file and returns the patch and updated file.
 * Does not write the file to disk.
 */
export async function applyEdit(
  file_path: string,
  old_string: string,
  new_string: string,
  replace_all = false,
): Promise<{ patch: Hunk[]; updatedFile: string }> {
  const fullFilePath = isAbsolute(file_path)
    ? file_path
    : resolve(getCwd(), file_path)

  let originalFile
  let updatedFile
  if (old_string === '') {
    // Create new file
    originalFile = ''
    updatedFile = normalizeLineEndings(new_string)
  } else {
    // Edit existing file
    const fileContent = await readFileBun(fullFilePath)
    if (!fileContent) {
      throw new Error('Could not read file')
    }
    originalFile = normalizeLineEndings(fileContent)
    const normalizedOldString = normalizeLineEndings(old_string)
    const normalizedNewString = normalizeLineEndings(new_string)
    const oldStringForReplace =
      normalizedNewString === '' &&
      !normalizedOldString.endsWith('\n') &&
      originalFile.includes(normalizedOldString + '\n')
        ? normalizedOldString + '\n'
        : normalizedOldString
    updatedFile = replace_all
      ? originalFile.split(oldStringForReplace).join(normalizedNewString)
      : originalFile.replace(oldStringForReplace, () => normalizedNewString)
    if (updatedFile === originalFile) {
      throw new Error(
        'Original and edited file match exactly. Failed to apply edit.',
      )
    }
  }

  const patch = getPatch({
    filePath: file_path,
    fileContents: originalFile,
    oldStr: originalFile,
    newStr: updatedFile,
  })

  return { patch, updatedFile }
}
