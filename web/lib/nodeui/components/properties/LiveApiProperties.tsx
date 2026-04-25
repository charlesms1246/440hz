import { useGraphStore } from '@nodeui/store/graphStore'
import type { LiveApiData } from '@nodeui/types/nodes'
import { Field, StyledSelect, StyledInput } from './shared'

const INTEGRATIONS = [
  { value: 'slack',   label: 'Slack' },
  { value: 'stripe',  label: 'Stripe' },
  { value: 'github',  label: 'GitHub' },
  { value: 'notion',  label: 'Notion' },
  { value: 'linear',  label: 'Linear' },
]

const OPERATIONS: Record<string, { value: string; label: string }[]> = {
  slack:  [{ value: 'post_message', label: 'Post Message' }, { value: 'create_channel', label: 'Create Channel' }, { value: 'list_channels', label: 'List Channels' }],
  stripe: [{ value: 'create_charge', label: 'Create Charge' }, { value: 'list_customers', label: 'List Customers' }, { value: 'create_refund', label: 'Create Refund' }],
  github: [{ value: 'create_issue', label: 'Create Issue' }, { value: 'list_repos', label: 'List Repos' }, { value: 'create_pr', label: 'Create PR' }],
  notion: [{ value: 'create_page', label: 'Create Page' }, { value: 'query_database', label: 'Query Database' }],
  linear: [{ value: 'create_issue', label: 'Create Issue' }, { value: 'update_issue', label: 'Update Issue' }, { value: 'list_issues', label: 'List Issues' }],
}

const ENV_DEFAULTS: Record<string, string> = {
  slack: 'SLACK_BOT_TOKEN', stripe: 'STRIPE_SECRET_KEY', github: 'GITHUB_TOKEN', notion: 'NOTION_API_KEY', linear: 'LINEAR_API_KEY',
}

export function LiveApiProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as LiveApiData

  return (
    <>
      <Field label="Integration">
        <StyledSelect
          value={d.integration}
          onChange={(v) => update(nodeId, { integration: v as LiveApiData['integration'], operation: OPERATIONS[v][0].value, authEnvKey: ENV_DEFAULTS[v] ?? '' })}
          options={INTEGRATIONS}
        />
      </Field>
      <Field label="Operation">
        <StyledSelect value={d.operation} onChange={(v) => update(nodeId, { operation: v })} options={OPERATIONS[d.integration] ?? []} />
      </Field>
      <Field label="Auth Env Var">
        <StyledInput value={d.authEnvKey} onChange={(v) => update(nodeId, { authEnvKey: v })} placeholder="API_KEY_ENV_VAR" />
      </Field>
    </>
  )
}
