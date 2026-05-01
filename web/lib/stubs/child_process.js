// Browser stub — child_process is Node-only; 0g-serving-broker imports it
// at module level but never calls it during browser inference flows.
export const spawn = () => { throw new Error('child_process unavailable in browser') }
export const exec = () => { throw new Error('child_process unavailable in browser') }
export const execSync = () => { throw new Error('child_process unavailable in browser') }
export const execFile = () => { throw new Error('child_process unavailable in browser') }
export const fork = () => { throw new Error('child_process unavailable in browser') }
export default { spawn, exec, execSync, execFile, fork }
