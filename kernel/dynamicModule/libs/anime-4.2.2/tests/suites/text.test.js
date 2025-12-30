import {
  expect,
  browserIs,
} from '../utils.js';

import {
  utils,
  splitText,
  animate,
} from '../../dist/modules/index.js';

// Firefox detect Japanse words differently
const wordsLength = browserIs.firefox ? 44 : 45;
const charsLength = 229;

suite('Text', () => {
  test('Defaults text split (words only)', () => {
    const split = splitText('#split-text p');
    expect(split.lines.length).to.equal(0);
    expect(split.words.length).to.equal(wordsLength);
    expect(split.chars.length).to.equal(0);
    split.revert();
  });

  test('Split chars only', () => {
    const split = splitText('#split-text p', { words: false, chars: true });
    expect(split.lines.length).to.equal(0);
    expect(split.words.length).to.equal(0);
    expect(split.chars.length).to.equal(charsLength);
    split.revert();
  });

  test('Split lines only', resolve => {
    const split = splitText('#split-text p', {
      lines: true,
      words: false,
    })
    .addEffect((split) => {
      const firstLevelSpans = split.$target.querySelectorAll('#split-text p > span[data-line]');
      expect(split.lines.length).to.be.above(0);
      expect(split.lines.length).to.equal(firstLevelSpans.length);
      expect(split.words.length).to.equal(0);
      expect(split.chars.length).to.equal(0);
      resolve();
      split.revert();
    });
    expect(split.lines.length).to.equal(0);
    expect(split.words.length).to.equal(0);
    expect(split.chars.length).to.equal(0);
  });

  test('Split words and chars', () => {
    const split = splitText('#split-text p', { chars: true });
    expect(split.lines.length).to.equal(0);
    expect(split.words.length).to.equal(wordsLength);
    expect(split.chars.length).to.equal(charsLength);
    split.revert();
  });

  test('Split words and lines', resolve => {
    const split = splitText('#split-text p', {
      lines: true,
    });
    split.addEffect((split) => {
      const firstLevelSpans = split.$target.querySelectorAll('#split-text p > span[data-line]');
      expect(split.lines.length).to.be.above(0);
      expect(split.lines.length).to.equal(firstLevelSpans.length);
      expect(split.words.length).to.equal(wordsLength);
      expect(split.chars.length).to.equal(0);
      resolve();
      split.revert();
    });
    expect(split.lines.length).to.equal(0);
    expect(split.words.length).to.equal(0);
    expect(split.chars.length).to.equal(0);
  });

  test('Split lines and chars', resolve => {
    const split = splitText('#split-text p', {
      lines: true,
      words: false,
      chars: true,
    })
    .addEffect((split) => {
      const firstLevelSpans = split.$target.querySelectorAll('#split-text p > span[data-line]');
      expect(split.lines.length).to.be.above(0);
      expect(split.lines.length).to.equal(firstLevelSpans.length);
      expect(split.words.length).to.equal(0);
      expect(split.chars.length).to.equal(charsLength);
      resolve();
      split.revert();
    });
    expect(split.words.length).to.equal(0);
    expect(split.chars.length).to.equal(0);
  });

  test('Split lines words and chars', resolve => {
    const split = splitText('#split-text p', {
      lines: true,
      chars: true,
    })
    .addEffect((split) => {
      const firstLevelSpans = split.$target.querySelectorAll('#split-text p > span[data-line]');
      expect(split.lines.length).to.be.above(0);
      expect(split.lines.length).to.equal(firstLevelSpans.length);
      expect(split.words.length).to.equal(wordsLength);
      expect(split.chars.length).to.equal(charsLength);
      resolve();
      split.revert();
    });
    expect(split.lines.length).to.equal(0);
    expect(split.words.length).to.equal(0);
    expect(split.chars.length).to.equal(0);
  });

  test('Custom css classes', resolve => {
    const split = splitText('#split-text p', {
      lines: { class: 'split-line' },
      words: { class: 'split-word' },
      chars: { class: 'split-char' },
    })
    .addEffect((split) => {
      expect(split.lines.length).to.be.above(0);
      expect(split.lines.length).to.equal(utils.$('.split-line').length);
      expect(split.words.length).to.equal(utils.$('.split-word').length);
      expect(split.chars.length).to.equal(utils.$('.split-char').length);
      resolve();
      split.revert();
    });
    expect(split.lines.length).to.equal(0);
    expect(split.words.length).to.equal(0);
    expect(split.chars.length).to.equal(0);
  });

  test('Wrap text', resolve => {
    const split = splitText('#split-text p', {
      lines: { wrap: 'clip' },
      words: { wrap: 'clip' },
      chars: { wrap: 'clip' },
    })
    .addEffect((split) => {
      expect(split.lines.length).to.be.above(0);
      expect(split.words.length).to.equal(wordsLength);
      expect(split.chars.length).to.equal(charsLength);
      split.lines.forEach($line => expect($line.parentElement.style.overflow).to.equal('clip'));
      split.words.forEach($word => expect($word.parentElement.style.overflow).to.equal('clip'));
      split.chars.forEach($char => expect($char.parentElement.style.overflow).to.equal('clip'));
      resolve();
      split.revert();
    })
  });

  test('Clone text', resolve => {
    const split = splitText('#split-text p', {
      lines: { clone: true },
      words: { clone: true },
      chars: { clone: true },
    });
    split.addEffect((split) => {
      expect(split.lines.length).to.be.above(0);
      expect(split.words.length).to.equal(wordsLength * 2);
      expect(split.chars.length).to.equal(charsLength * 4);
      resolve();
      split.revert();
    });
  });

  test('Custom template', resolve => {
    const split = splitText('#split-text p', {
      lines: '<span class="split-line split-line-{i}">{value}</span>',
      words: '<span class="split-word split-word-{i}">{value}</span>',
      chars: '<span class="split-char split-char-{i}">{value}</span>',
    });
    split.addEffect((split) => {
      expect(split.lines.length).to.be.above(0);
      expect(split.words.length).to.equal(wordsLength);
      expect(split.chars.length).to.equal(charsLength);
      split.lines.forEach(($line, i) => expect($line.classList[1]).to.equal(`split-line-${i}`));
      split.words.forEach(($word, i) => expect($word.classList[1]).to.equal(`split-word-${i}`));
      split.chars.forEach(($char, i) => expect($char.classList[1]).to.equal(`split-char-${i}`));
      resolve();
      split.revert();
    });
  });

  test('Init in a document.fonts.ready Promise', resolve => {
    document.fonts.ready.then(() => {
      splitText('#split-text p', {
        lines: true,
        words: true,
        chars: true,
      })
      .addEffect((split) => {
        const firstLevelSpans = split.$target.querySelectorAll('#split-text p > span[data-line]');
        expect(split.lines.length).to.be.above(0);
        expect(split.lines.length).to.equal(firstLevelSpans.length);
        expect(split.words.length).to.equal(wordsLength);
        expect(split.chars.length).to.equal(charsLength);
        resolve();
        split.revert();
      })
    });
  });

  test('addEffect() should only triggers once on load', resolve => {
    let calls = 0, timeout;
    splitText('#split-text p', {
      lines: true,
    })
    .addEffect((split) => {
      calls++;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        expect(calls).to.equal(1);
        resolve();
        split.revert();
      }, 33)
    })
  });

  test('addEffect() should properly track the time of an animation', resolve => {
    let animation;
    const [ $p ] = utils.$('#split-text p');
    const split = splitText('#split-text p', {
      lines: true,
    })
    .addEffect((split) => {
      animation = animate(split.lines, {
        opacity: 0,
      });
      return animation;
    });
    setTimeout(() => {
      expect(animation.currentTime).to.be.above(10);
      expect(animation.currentTime).to.be.below(100);
      $p.style.width = '10px';
    }, 50);
    setTimeout(() => {
      expect(animation.currentTime).to.be.above(150);
      resolve();
      split.revert();
    }, 200);
  });

  test('addEffect() should properly triggers on resize', resolve => {
    document.fonts.ready.then(() => {
      let calls = 0;
      let cleanups = 0;
      let lines = 0;
      const [ $p ] = utils.$('#split-text p');
      const split = splitText($p, {
        lines: true,
      })
      .addEffect(() => {
        calls++;
        return () => {
          cleanups++;
        }
      });
      expect(calls).to.equal(0);
      expect(cleanups).to.equal(0);
      setTimeout(() => {
        expect(calls).to.equal(1);
        expect(cleanups).to.equal(0);
        $p.style.width = '10px';
      }, 10);
      setTimeout(() => {
        expect(calls).to.equal(2);
        expect(cleanups).to.equal(1);
        expect(split.lines.length).to.be.above(lines);
        lines = split.lines.length;
        $p.style.width = 'auto';
      }, 200);
      setTimeout(() => {
        expect(calls).to.equal(3);
        expect(cleanups).to.equal(2);
        expect(lines).to.be.above(split.lines.length);
        resolve();
        split.revert();
      }, 400);
    });
  });

  test('addEffect() should only triggers once on load inside a document.fonts.ready Promise', resolve => {
    document.fonts.ready.then(() => {
      let calls = 0, timeout;
      splitText('#split-text p', {
        lines: true,
      })
      .addEffect((split) => {
        calls++;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          expect(calls).to.equal(1);
          resolve();
          split.revert();
        }, 33)
      })
    });
  });

  test('addEffect() cleanup function should only execute between addEffect', resolve => {
    document.fonts.ready.then(() => {
      let calls = 0;
      let cleanups = 0;
      const [ $p ] = utils.$('#split-text p');
      const split = splitText($p, {
        lines: true,
      })
      .addEffect(() => {
        calls++;
        return () => {
          cleanups++;
        }
      });
      setTimeout(() => {
        expect(calls).to.equal(1);
        expect(cleanups).to.equal(0);
        $p.style.width = '10px';
      }, 10);
      setTimeout(() => {
        expect(calls).to.equal(2);
        expect(cleanups).to.equal(1);
        resolve();
        split.revert();
      }, 200);
    });
  });

  test('addEffect() function should be triggered even when not splitting by lines', resolve => {
    let calls = 0;
    let cleanups = 0;
    const [ $p ] = utils.$('#split-text p');
    const split = splitText($p, {
      lines: false,
    })
    .addEffect(() => {
      calls++;
      return () => {
        cleanups++;
      }
    });
    setTimeout(() => {
      expect(calls).to.equal(1);
      expect(cleanups).to.equal(0);
      resolve();
      split.revert();
    }, 10);
  });

  test('revert() should properly call cleanups function', resolve => {
    document.fonts.ready.then(() => {
      let calls = 0;
      let cleanups = 0;
      const [ $p ] = utils.$('#split-text p');
      const split = splitText($p, {
        lines: true,
      })
      .addEffect(self => {
        calls++;
        self.words.forEach(($word, i) => $word.setAttribute('data-test', i));
        return () => {
          self.words.forEach(($word, i) => {
            expect(+$word.setAttribute('data-test')).to.equal(i);
          });
          cleanups++;
        }
      });
      setTimeout(() => {
        expect(calls).to.equal(1);
        expect(cleanups).to.equal(0);
        split.revert();
        $p.style.width = '10px';
      }, 10);
      setTimeout(() => {
        expect(calls).to.equal(1);
        expect(cleanups).to.equal(1);
        resolve();
      }, 200);
    });
  });

  test('revert() should properly revert animations effects', resolve => {
    let animation;
    const [ $p ] = utils.$('#split-text p');
    const split = splitText('#split-text p', {
      lines: true,
    })
    .addEffect((split) => {
      animation = animate(split.lines, {
        opacity: 0,
      });
      return animation;
    });
    setTimeout(() => {
      expect(animation.paused).to.equal(false);
      split.revert();
      expect(animation.paused).to.equal(true);
      resolve();
    }, 10);
  });

  test('refresh() should properly call cleanups function', resolve => {
    document.fonts.ready.then(() => {
      let calls = 0;
      let cleanups = 0;
      const [ $p ] = utils.$('#split-text p');
      const split = splitText($p, {
        lines: true,
      })
      .addEffect(self => {
        calls++;
        self.words.forEach(($word, i) => $word.setAttribute('data-test', i));
        return () => {
          self.words.forEach(($word, i) => {
            expect(+$word.getAttribute('data-test')).to.equal(i);
          });
          cleanups++;
        }
      });
      setTimeout(() => {
        expect(calls).to.equal(1);
        expect(cleanups).to.equal(0);
        split.refresh();
        split.revert();
        resolve();
      }, 10);
    });
  });

});
