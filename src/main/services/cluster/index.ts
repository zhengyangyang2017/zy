/**
 * Agent Cluster — public API surface.
 *
 * Usage:
 *   import { startCluster, stopCluster } from './services/cluster'
 *   const cluster = await startCluster()
 *   await cluster.submitGoal('Research TypeScript 5.8 new features')
 */

export { ClusterOrchestrator, getOrchestrator, startCluster, stopCluster } from './orchestrator'
export { EventBus, getEventBus, resetEventBus } from './event-bus'
export { WorkStealingQueue, getWorkStealingQueue } from './task-queue'
export {
  initClusterStateStore,
  checkIdempotency,
  recordIdempotency,
  upsertAgentState,
  getAgentStates,
} from './state-store'
export {
  createWorkflow,
  createNode,
  executeWorkflow,
  buildWorkflowFromHints,
  countTaskNodes,
  flattenTaskNodes,
} from './workflow'
export { getRoleHandler, hasApiKey, getModelName } from './agent-roles'
export * from './types'
