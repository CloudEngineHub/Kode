import {
  ListResourceTemplatesResultSchema,
  ListResourcesResultSchema,
  type ListResourceTemplatesResult,
  type ListResourcesResult,
  type Resource,
  type ResourceTemplate,
} from '@modelcontextprotocol/sdk/types.js'
import { memoize } from 'lodash-es'

import { getMcpListChangedVersion } from './listChanged'
import { requestAllPages } from './request'

export type McpResource = Resource & {
  server: string
}

export type McpResourceTemplate = ResourceTemplate & {
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

export const getMCPResourceTemplates = memoize(
  async (): Promise<McpResourceTemplate[]> => {
    const templateList = await requestAllPages<
      ListResourceTemplatesResult,
      typeof ListResourceTemplatesResultSchema
    >(
      { method: 'resources/templates/list' },
      ListResourceTemplatesResultSchema,
      'resources',
    )

    return templateList.flatMap(({ client, results }) =>
      results.flatMap(result =>
        (result.resourceTemplates ?? []).map(template => ({
          ...template,
          server: client.name,
        })),
      ),
    )
  },
  () => `resource-templates@${getMcpListChangedVersion('resources')}`,
)
