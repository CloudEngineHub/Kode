import {
  ListResourcesResultSchema,
  type ListResourcesResult,
  type Resource,
} from '@modelcontextprotocol/sdk/types.js'
import { memoize } from 'lodash-es'

import { getMcpListChangedVersion } from './listChanged'
import { requestAllPages } from './request'

export type McpResource = Resource & {
  server: string
}

export const getMCPResources = memoize(
  async (): Promise<McpResource[]> => {
    const resourceList = await requestAllPages<
      ListResourcesResult,
      typeof ListResourcesResultSchema
    >({ method: 'resources/list' }, ListResourcesResultSchema, 'resources')

    return resourceList.flatMap(({ client, results }) =>
      results.flatMap(result =>
        (result.resources ?? []).map(resource => ({
          ...resource,
          server: client.name,
        })),
      ),
    )
  },
  () => `resources@${getMcpListChangedVersion('resources')}`,
)
