import { isAbsolute, resolve } from 'path'
import { getCwd } from '@utils/state'
import { readFileBun } from '@utils/BunFile'
import { type Hunk } from 'diff'
import { getPatch } from '@utils/diff'

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
    updatedFile = new_string
  } else {
    // Edit existing file
    const fileContent = await readFileBun(fullFilePath)
    if (!fileContent) {
      throw new Error('Could not read file')
    }
    originalFile = fileContent
    const oldStringForReplace =
      new_string === '' &&
      !old_string.endsWith('\n') &&
      originalFile.includes(old_string + '\n')
        ? old_string + '\n'
        : old_string
    updatedFile = replace_all
      ? originalFile.split(oldStringForReplace).join(new_string)
      : originalFile.replace(oldStringForReplace, () => new_string)
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
