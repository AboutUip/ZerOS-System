import {
  lerp,
} from '../core/helpers.js';

export {
  snap,
  clamp,
  round,
  lerp,
} from '../core/helpers.js';

/**
 * Rounds a number to fixed decimal places
 * @param  {Number|String} v - Value to round
 * @param  {Number} decimalLength - Number of decimal places
 * @return {String}
 */
export const roundPad = (v, decimalLength) => (+v).toFixed(decimalLength);

/**
 * Pads the start of a value with a string
 * @param  {Number} v - Value to pad
 * @param  {Number} totalLength - Target length
 * @param  {String} padString - String to pad with
 * @return {String}
 */
export const padStart = (v, totalLength, padString) => `${v}`.padStart(totalLength, padString);

/**
 * Pads the end of a value with a string
 * @param  {Number} v - Value to pad
 * @param  {Number} totalLength - Target length
 * @param  {String} padString - String to pad with
 * @return {String}
 */
export const padEnd = (v, totalLength, padString) => `${v}`.padEnd(totalLength, padString);

/**
 * Wraps a value within a range
 * @param  {Number} v - Value to wrap
 * @param  {Number} min - Minimum boundary
 * @param  {Number} max - Maximum boundary
 * @return {Number}
 */
export const wrap = (v, min, max) => (((v - min) % (max - min) + (max - min)) % (max - min)) + min;

/**
 * Maps a value from one range to another
 * @param  {Number} value - Input value
 * @param  {Number} inLow - Input range minimum
 * @param  {Number} inHigh - Input range maximum
 * @param  {Number} outLow - Output range minimum
 * @param  {Number} outHigh - Output range maximum
 * @return {Number}
 */
export const mapRange = (value, inLow, inHigh, outLow, outHigh) => outLow + ((value - inLow) / (inHigh - inLow)) * (outHigh - outLow);

/**
 * Converts degrees to radians
 * @param  {Number} degrees - Angle in degrees
 * @return {Number}
 */
export const degToRad = degrees => degrees * Math.PI / 180;

/**
 * Converts radians to degrees
 * @param  {Number} radians - Angle in radians
 * @return {Number}
 */
export const radToDeg = radians => radians * 180 / Math.PI;

/**
 * Frame rate independent damped lerp
 * Based on: https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/
 *
 * @param  {Number} start - Starting value
 * @param  {Number} end - Target value
 * @param  {Number} deltaTime - Delta time in ms
 * @param  {Number} factor - Interpolation factor in the range [0, 1]
 * @return {Number} The interpolated value
 */
export const damp = (start, end, deltaTime, factor) => {
  return !factor ? start : factor === 1 ? end : lerp(start, end, 1 - Math.exp(-factor * deltaTime * .1));
}
