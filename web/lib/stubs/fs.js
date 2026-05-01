// Browser stub for 'fs', 'fs/promises' — 0g-serving-broker imports these at
// module level but never calls them during browser inference flows.
const notAvailable = (name) => () => { throw new Error(`fs.${name} unavailable in browser`) }
const notAvailableAsync = (name) => async () => { throw new Error(`fs.${name} unavailable in browser`) }

// fs/promises named exports (used via `import * as fs from 'fs/promises'`)
export const open = notAvailableAsync('open')
export const readFile = notAvailableAsync('readFile')
export const writeFile = notAvailableAsync('writeFile')
export const appendFile = notAvailableAsync('appendFile')
export const readdir = notAvailableAsync('readdir')
export const mkdir = notAvailableAsync('mkdir')
export const rm = notAvailableAsync('rm')
export const rmdir = notAvailableAsync('rmdir')
export const stat = notAvailableAsync('stat')
export const lstat = notAvailableAsync('lstat')
export const unlink = notAvailableAsync('unlink')
export const rename = notAvailableAsync('rename')
export const copyFile = notAvailableAsync('copyFile')
export const chmod = notAvailableAsync('chmod')
export const chown = notAvailableAsync('chown')
export const realpath = notAvailableAsync('realpath')
export const symlink = notAvailableAsync('symlink')
export const link = notAvailableAsync('link')
export const access = notAvailableAsync('access')
export const watch = notAvailableAsync('watch')
export const opendir = notAvailableAsync('opendir')

// fs sync exports (used via `import { promises } from 'fs'`)
export const promises = {
  open, readFile, writeFile, appendFile, readdir, mkdir,
  rm, rmdir, stat, lstat, unlink, rename, copyFile, chmod,
  chown, realpath, symlink, link, access, watch, opendir,
}
export const readFileSync = notAvailable('readFileSync')
export const writeFileSync = notAvailable('writeFileSync')
export const existsSync = () => false
export const mkdirSync = () => {}

export default { promises, readFileSync, writeFileSync, existsSync, mkdirSync }
