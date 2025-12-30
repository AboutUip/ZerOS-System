import { waapi, animate, onScroll, $, set, stagger, spring, random, utils } from '../../../dist/modules/index.js';

async function animation() {
  await animate('test', { x: 100 });
}