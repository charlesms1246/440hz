import type { ComponentType } from 'react'
import type { NodeTypes } from '@xyflow/react'
import { NodeType, NodeCategory, type AnyNodeData } from '@nodeui/types/nodes'
import { getNodeDefaults } from '@nodeui/utils/nodeHelpers'

import { OnResetNode }          from './triggers/OnResetNode'
import { OnStepNode }           from './triggers/OnStepNode'
import { ActionSpaceNode }      from './config/ActionSpaceNode'
import { ObservationSpaceNode } from './config/ObservationSpaceNode'
import { DocumentationNode }    from './context/DocumentationNode'
import { PersonaNode }          from './context/PersonaNode'
import { GetSetStateNode }      from './state/GetSetStateNode'
import { HttpsRequestNode }     from './execution/HttpsRequestNode'
import { LiveApiNode }          from './execution/LiveApiNode'
import { McpEndpointNode }      from './execution/McpEndpointNode'
import { MockCliNode }          from './execution/MockCliNode'
import { RouterSwitchNode }     from './routing/RouterSwitchNode'
import { DataExtractorNode }    from './routing/DataExtractorNode'
import { ConstraintNode }       from './evaluation/ConstraintNode'
import { RlaifOverseerNode }    from './evaluation/RlaifOverseerNode'
import { StaticRewardNode }     from './evaluation/StaticRewardNode'
import { ReturnResetNode }      from './terminus/ReturnResetNode'
import { ReturnStepNode }       from './terminus/ReturnStepNode'

export interface NodeRegistryEntry {
  label: string
  category: NodeCategory
  accentHex: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>
  defaultData: () => AnyNodeData
  description: string
}

export const NODE_REGISTRY: Record<NodeType, NodeRegistryEntry> = {
  [NodeType.OnReset]: {
    label: 'On Reset', category: NodeCategory.Triggers, accentHex: '#f59e0b',
    component: OnResetNode,
    defaultData: () => getNodeDefaults(NodeType.OnReset),
    description: 'Triggered when env.reset() is called',
  },
  [NodeType.OnStep]: {
    label: 'On Step', category: NodeCategory.Triggers, accentHex: '#f59e0b',
    component: OnStepNode,
    defaultData: () => getNodeDefaults(NodeType.OnStep),
    description: 'Triggered when env.step(action) is called',
  },
  [NodeType.ActionSpace]: {
    label: 'Action Space', category: NodeCategory.Config, accentHex: '#3b82f6',
    component: ActionSpaceNode,
    defaultData: () => getNodeDefaults(NodeType.ActionSpace),
    description: 'Defines the schema of allowed agent actions',
  },
  [NodeType.ObservationSpace]: {
    label: 'Observation Space', category: NodeCategory.Config, accentHex: '#3b82f6',
    component: ObservationSpaceNode,
    defaultData: () => getNodeDefaults(NodeType.ObservationSpace),
    description: 'Defines what the agent can observe',
  },
  [NodeType.Documentation]: {
    label: 'Documentation', category: NodeCategory.Context, accentHex: '#a855f7',
    component: DocumentationNode,
    defaultData: () => getNodeDefaults(NodeType.Documentation),
    description: 'Injects API docs, wikis, or instructions',
  },
  [NodeType.Persona]: {
    label: 'Persona', category: NodeCategory.Context, accentHex: '#a855f7',
    component: PersonaNode,
    defaultData: () => getNodeDefaults(NodeType.Persona),
    description: 'Base system instructions for the agent',
  },
  [NodeType.GetSetState]: {
    label: 'Get/Set State', category: NodeCategory.State, accentHex: '#14b8a6',
    component: GetSetStateNode,
    defaultData: () => getNodeDefaults(NodeType.GetSetState),
    description: 'Reads or updates environment variables',
  },
  [NodeType.HttpsRequest]: {
    label: 'HTTPS Request', category: NodeCategory.Execution, accentHex: '#10b981',
    component: HttpsRequestNode,
    defaultData: () => getNodeDefaults(NodeType.HttpsRequest),
    description: 'Generic HTTP client with auth injection',
  },
  [NodeType.LiveApi]: {
    label: 'Live API', category: NodeCategory.Execution, accentHex: '#10b981',
    component: LiveApiNode,
    defaultData: () => getNodeDefaults(NodeType.LiveApi),
    description: 'Pre-built integrations (Slack, Stripe, GitHub)',
  },
  [NodeType.McpEndpoint]: {
    label: 'MCP Endpoint', category: NodeCategory.Execution, accentHex: '#10b981',
    component: McpEndpointNode,
    defaultData: () => getNodeDefaults(NodeType.McpEndpoint),
    description: 'Connect to an external MCP tool server',
  },
  [NodeType.MockCli]: {
    label: 'Mock CLI', category: NodeCategory.Execution, accentHex: '#10b981',
    component: MockCliNode,
    defaultData: () => getNodeDefaults(NodeType.MockCli),
    description: 'Simulates bash commands with mocked output',
  },
  [NodeType.RouterSwitch]: {
    label: 'Router / Switch', category: NodeCategory.Routing, accentHex: '#facc15',
    component: RouterSwitchNode,
    defaultData: () => getNodeDefaults(NodeType.RouterSwitch),
    description: 'Routes execution based on action conditions',
  },
  [NodeType.DataExtractor]: {
    label: 'Data Extractor', category: NodeCategory.Routing, accentHex: '#facc15',
    component: DataExtractorNode,
    defaultData: () => getNodeDefaults(NodeType.DataExtractor),
    description: 'Extracts keys from JSON using JSONPath',
  },
  [NodeType.Constraint]: {
    label: 'Constraint', category: NodeCategory.Evaluation, accentHex: '#f43f5e',
    component: ConstraintNode,
    defaultData: () => getNodeDefaults(NodeType.Constraint),
    description: 'Hard rule — violations terminate with penalty',
  },
  [NodeType.RlaifOverseer]: {
    label: 'RLAIF Overseer', category: NodeCategory.Evaluation, accentHex: '#f43f5e',
    component: RlaifOverseerNode,
    defaultData: () => getNodeDefaults(NodeType.RlaifOverseer),
    description: 'LLM judge scores agent actions dynamically',
  },
  [NodeType.StaticReward]: {
    label: 'Static Reward', category: NodeCategory.Evaluation, accentHex: '#f43f5e',
    component: StaticRewardNode,
    defaultData: () => getNodeDefaults(NodeType.StaticReward),
    description: 'Fixed numerical reward (e.g. step penalty)',
  },
  [NodeType.ReturnReset]: {
    label: 'Return Reset', category: NodeCategory.Terminus, accentHex: '#94a3b8',
    component: ReturnResetNode,
    defaultData: () => getNodeDefaults(NodeType.ReturnReset),
    description: 'Finalizes the On Reset flow',
  },
  [NodeType.ReturnStep]: {
    label: 'Return Step', category: NodeCategory.Terminus, accentHex: '#94a3b8',
    component: ReturnStepNode,
    defaultData: () => getNodeDefaults(NodeType.ReturnStep),
    description: 'Returns the Gymnasium v0.26+ step tuple',
  },
}

export const REACT_FLOW_NODE_TYPES: NodeTypes = Object.fromEntries(
  Object.entries(NODE_REGISTRY).map(([type, entry]) => [type, entry.component])
)

const CATEGORY_ORDER = [
  NodeCategory.Triggers,
  NodeCategory.Config,
  NodeCategory.Context,
  NodeCategory.State,
  NodeCategory.Execution,
  NodeCategory.Routing,
  NodeCategory.Evaluation,
  NodeCategory.Terminus,
]

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  [NodeCategory.Triggers]:   'Triggers',
  [NodeCategory.Config]:     'Configuration',
  [NodeCategory.Context]:    'Context & Knowledge',
  [NodeCategory.State]:      'State Management',
  [NodeCategory.Execution]:  'Execution & Tools',
  [NodeCategory.Routing]:    'Routing & Logic',
  [NodeCategory.Evaluation]: 'Evaluation & Reward',
  [NodeCategory.Terminus]:   'Terminus',
}

export interface CategoryGroup {
  category: NodeCategory
  label: string
  accentHex: string
  nodes: { type: NodeType; label: string; description: string; accentHex: string }[]
}

export const NODE_CATEGORIES: CategoryGroup[] = CATEGORY_ORDER.map((cat) => {
  const nodes = Object.entries(NODE_REGISTRY)
    .filter(([, e]) => e.category === cat)
    .map(([type, e]) => ({ type: type as NodeType, label: e.label, description: e.description, accentHex: e.accentHex }))
  const accentHex = nodes[0]?.accentHex ?? '#8888aa'
  return { category: cat, label: CATEGORY_LABELS[cat], accentHex, nodes }
})
