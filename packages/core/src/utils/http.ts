/**
 * HTTP utility constants and helpers
 */

import { MACRO } from '#core/constants/macros'
import { PRODUCT_COMMAND } from '#core/constants/product'

// Keep the user agent stable so upstream providers can reliably attribute requests.
export const USER_AGENT = `${PRODUCT_COMMAND}/${MACRO.VERSION} (${process.env.USER_TYPE})`
