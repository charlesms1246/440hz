import { NodeType, type AnyNodeData } from '@nodeui/types/nodes'

export function getNodeDefaults(nodeType: NodeType): AnyNodeData {
  switch (nodeType) {
    case NodeType.OnReset:
      return { label: 'On Reset', nodeType: NodeType.OnReset }
    case NodeType.OnStep:
      return { label: 'On Step', nodeType: NodeType.OnStep }
    case NodeType.ActionSpace:
      return { label: 'Action Space', nodeType: NodeType.ActionSpace, spaceType: 'Discrete', schema: '{"n": 4}' }
    case NodeType.ObservationSpace:
      return { label: 'Observation Space', nodeType: NodeType.ObservationSpace, spaceType: 'Text', schema: '' }
    case NodeType.Documentation:
      return { label: 'Documentation', nodeType: NodeType.Documentation, title: 'API Docs', content: '' }
    case NodeType.Persona:
      return { label: 'Persona', nodeType: NodeType.Persona, systemPrompt: '' }
    case NodeType.GetSetState:
      return {
        label: 'Get/Set State',
        nodeType: NodeType.GetSetState,
        operation: 'set',
        stateEntries: [{ key: 'step_count', defaultValue: '0', type: 'number' }],
      }
    case NodeType.HttpsRequest:
      return {
        label: 'HTTPS Request',
        nodeType: NodeType.HttpsRequest,
        method: 'POST',
        urlTemplate: '',
        headers: [],
        bodyTemplate: '',
      }
    case NodeType.LiveApi:
      return {
        label: 'Live API',
        nodeType: NodeType.LiveApi,
        integration: 'slack',
        operation: 'post_message',
        authEnvKey: 'SLACK_BOT_TOKEN',
      }
    case NodeType.McpEndpoint:
      return {
        label: 'MCP Endpoint',
        nodeType: NodeType.McpEndpoint,
        serverUrl: '',
        toolName: '',
        transportType: 'http',
      }
    case NodeType.MockCli:
      return {
        label: 'Mock CLI',
        nodeType: NodeType.MockCli,
        commandMatcher: '.*',
        stdout: '',
        stderr: '',
        exitCode: 0,
      }
    case NodeType.RouterSwitch:
      return {
        label: 'Router / Switch',
        nodeType: NodeType.RouterSwitch,
        conditions: [
          { id: 'cond-0', label: 'Path A', condition: '' },
          { id: 'cond-1', label: 'Path B', condition: '' },
        ],
      }
    case NodeType.DataExtractor:
      return {
        label: 'Data Extractor',
        nodeType: NodeType.DataExtractor,
        extractions: [{ key: '', jsonPath: '$.' }],
      }
    case NodeType.Constraint:
      return { label: 'Constraint', nodeType: NodeType.Constraint, rule: '', violationReward: -100 }
    case NodeType.RlaifOverseer:
      return {
        label: 'RLAIF Overseer',
        nodeType: NodeType.RlaifOverseer,
        model: 'mistral-small',
        rubric: '',
        minScore: 0,
        maxScore: 10,
        apiKeyEnvVar: 'OPENAI_API_KEY',
      }
    case NodeType.StaticReward:
      return { label: 'Static Reward', nodeType: NodeType.StaticReward, reward: -0.1, description: 'step penalty' }
    case NodeType.ReturnReset:
      return { label: 'Return Reset', nodeType: NodeType.ReturnReset }
    case NodeType.ReturnStep:
      return { label: 'Return Step', nodeType: NodeType.ReturnStep }
  }
}
