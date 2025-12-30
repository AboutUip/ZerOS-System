import {
  expect,
} from '../utils.js';

import {
  onScroll,
  scrollContainers,
  animate,
  utils
} from '../../dist/modules/index.js';

suite('Scroll', () => {
  test('Reverting an animation with onScroll should also revert the ScrollObserver', () => {
    const [ $container ] = utils.$('#css-tests');
    const animation = animate('#target-id', {
      rotate: 360,
      autoplay: onScroll({
        container: '#css-tests',
      })
    });
    expect(scrollContainers.get($container)).to.not.equal(undefined);
    $container.remove();
    $container.width = '100px';
    animation.revert();
    expect(scrollContainers.get($container)).to.equal(undefined);
  });
});
