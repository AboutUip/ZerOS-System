/**
 * @import {
 *   DefaultsParams,
 *   DOMTarget,
 * } from '../types/index.js'
 *
 * @import {
 *   Scope,
 * } from '../scope/index.js'
*/
/** @type {DefaultsParams} */
export const defaults: DefaultsParams;
export namespace scope {
    export let current: Scope;
    export { doc as root };
}
export namespace globals {
    export { defaults };
    export let precision: number;
    export let timeScale: number;
    export let tickThreshold: number;
}
export namespace globalVersions {
    let version: string;
    let engine: any;
}
import type { DefaultsParams } from '../types/index.js';
import type { Scope } from '../scope/index.js';
import { doc } from './consts.js';
