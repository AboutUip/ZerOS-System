import {
  isSvg,
} from '../core/helpers.js';

import {
  parseTargets
} from '../core/targets.js';

/**
 * @import {
 *   TargetsParam,
 * } from '../types/index.js'
*/

/**
 * @param  {TargetsParam} path
 * @return {SVGGeometryElement|void}
 */
export const getPath = path => {
  const parsedTargets = parseTargets(path);
  const $parsedSvg = /** @type {SVGGeometryElement} */(parsedTargets[0]);
  if (!$parsedSvg || !isSvg($parsedSvg)) return console.warn(`${path} is not a valid SVGGeometryElement`);
  return $parsedSvg;
}
