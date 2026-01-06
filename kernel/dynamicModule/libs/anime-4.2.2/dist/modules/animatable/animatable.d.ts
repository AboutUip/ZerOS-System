/**
 * @import {
 * TargetsParam,
 * AnimatableParams,
 * AnimationParams,
 * TweenParamsOptions,
 * Tween,
 * AnimatableProperty,
 * AnimatableObject,
 * } from '../types/index.js';
 */
export class Animatable {
    /**
     * @param {TargetsParam} targets
     * @param {AnimatableParams} parameters
     */
    constructor(targets: TargetsParam, parameters: AnimatableParams);
    targets: (HTMLElement | SVGElement | import("../types/index.js").JSTarget)[];
    animations: {};
    /** @type {JSAnimation|null} */
    callbacks: JSAnimation | null;
    revert(): this;
}
export function createAnimatable(targets: TargetsParam, parameters: AnimatableParams): AnimatableObject;
import { JSAnimation } from '../animation/animation.js';
import type { TargetsParam } from '../types/index.js';
import type { AnimatableParams } from '../types/index.js';
import type { AnimatableObject } from '../types/index.js';
