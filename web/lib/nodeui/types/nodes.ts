export enum NodeCategory {
  Triggers   = 'triggers',
  Config     = 'config',
  Context    = 'context',
  State      = 'state',
  Execution  = 'execution',
  Routing    = 'routing',
  Evaluation = 'evaluation',
  Terminus   = 'terminus',
}

export enum NodeType {
  OnReset          = 'onReset',
  OnStep           = 'onStep',
  ActionSpace      = 'actionSpace',
  ObservationSpace = 'observationSpace',
  Documentation    = 'documentation',
  Persona          = 'persona',
  GetSetState      = 'getSetState',
  HttpsRequest     = 'httpsRequest',
  LiveApi          = 'liveApi',
  McpEndpoint      = 'mcpEndpoint',
  MockCli          = 'mockCli',
  RouterSwitch     = 'routerSwitch',
  DataExtractor    = 'dataExtractor',
  Constraint       = 'constraint',
  RlaifOverseer    = 'rlaifOverseer',
  StaticReward     = 'staticReward',
  ReturnReset      = 'returnReset',
  ReturnStep       = 'returnStep',
}

export interface BaseNodeData extends Record<string, unknown> {
  label: string
  nodeType: NodeType
}

export interface OnResetData extends BaseNodeData { nodeType: NodeType.OnReset }
export interface OnStepData  extends BaseNodeData { nodeType: NodeType.OnStep }

export interface ActionSpaceData extends BaseNodeData {
  nodeType: NodeType.ActionSpace
  spaceType: 'Discrete' | 'Box' | 'Dict' | 'Text'
  schema: string
}

export interface ObservationSpaceData extends BaseNodeData {
  nodeType: NodeType.ObservationSpace
  spaceType: 'Discrete' | 'Box' | 'Dict' | 'Text'
  schema: string
}

export interface DocumentationData extends BaseNodeData {
  nodeType: NodeType.Documentation
  title: string
  content: string
}

export interface PersonaData extends BaseNodeData {
  nodeType: NodeType.Persona
  systemPrompt: string
}

export interface StateEntry {
  key: string
  defaultValue: string
  type: 'string' | 'number' | 'boolean' | 'list'
}

export interface GetSetStateData extends BaseNodeData {
  nodeType: NodeType.GetSetState
  operation: 'get' | 'set' | 'get_and_set'
  stateEntries: StateEntry[]
}

export interface HeaderEntry { key: string; value: string }

export interface HttpsRequestData extends BaseNodeData {
  nodeType: NodeType.HttpsRequest
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  urlTemplate: string
  headers: HeaderEntry[]
  bodyTemplate: string
}

export interface LiveApiData extends BaseNodeData {
  nodeType: NodeType.LiveApi
  integration: 'slack' | 'stripe' | 'github' | 'notion' | 'linear'
  operation: string
  authEnvKey: string
}

export interface McpEndpointData extends BaseNodeData {
  nodeType: NodeType.McpEndpoint
  serverUrl: string
  toolName: string
  transportType: 'stdio' | 'sse' | 'http'
}

export interface MockCliData extends BaseNodeData {
  nodeType: NodeType.MockCli
  commandMatcher: string
  stdout: string
  stderr: string
  exitCode: number
}

export interface RouterCondition {
  id: string
  label: string
  condition: string
}

export interface RouterSwitchData extends BaseNodeData {
  nodeType: NodeType.RouterSwitch
  conditions: RouterCondition[]
}

export interface ExtractionEntry { key: string; jsonPath: string }

export interface DataExtractorData extends BaseNodeData {
  nodeType: NodeType.DataExtractor
  extractions: ExtractionEntry[]
}

export interface ConstraintData extends BaseNodeData {
  nodeType: NodeType.Constraint
  rule: string
  violationReward: number
}

export interface RlaifOverseerData extends BaseNodeData {
  nodeType: NodeType.RlaifOverseer
  model: 'mistral-small' | 'mimo-v2-flash' | 'gpt-4o-mini' | 'claude-haiku'
  rubric: string
  minScore: number
  maxScore: number
  apiKeyEnvVar: string
}

export interface StaticRewardData extends BaseNodeData {
  nodeType: NodeType.StaticReward
  reward: number
  description: string
}

export interface ReturnResetData extends BaseNodeData { nodeType: NodeType.ReturnReset }
export interface ReturnStepData  extends BaseNodeData { nodeType: NodeType.ReturnStep }

export type AnyNodeData =
  | OnResetData | OnStepData
  | ActionSpaceData | ObservationSpaceData
  | DocumentationData | PersonaData
  | GetSetStateData
  | HttpsRequestData | LiveApiData | McpEndpointData | MockCliData
  | RouterSwitchData | DataExtractorData
  | ConstraintData | RlaifOverseerData | StaticRewardData
  | ReturnResetData | ReturnStepData
