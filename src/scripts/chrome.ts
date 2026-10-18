export function initChrome() {
        function tick() {
          document.querySelectorAll('[data-tokyo-time]').forEach(function (el) {
            var zone = el.getAttribute('data-timezone') || 'Asia/Tokyo';
            var place = el.getAttribute('data-place') || 'Tokyo';
            var time = new Intl.DateTimeFormat('en-GB', {
              timeZone: zone,
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            }).format(new Date());
            el.textContent = place + ', ' + time;
          });
        }
        tick();
        setInterval(tick, 30000);

        document.querySelectorAll('.frame img').forEach(function (img) {
          var mark = function () {
            img.classList.add('is-ready');
          };
          if (img.complete) mark();
          else img.addEventListener('load', mark, { once: true });
        });

        // phones: an open menu or time closes itself after 5s
        var autoClose = 0;
        var armClose = function (el) {
          clearTimeout(autoClose);
          if (!el.classList.contains('is-open')) return;
          if (!window.matchMedia('(max-width: 759px)').matches) return;
          autoClose = setTimeout(function () {
            el.classList.remove('is-open');
          }, 5000);
        };

        document.querySelectorAll('.contact').forEach(function (el) {
          var button = el.querySelector('.contact-label');
          if (!button) return;
          button.addEventListener('click', function () {
            if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
            el.classList.toggle('is-open');
            if (el.classList.contains('is-open')) {
              document.querySelectorAll('.who.is-open').forEach(function (who) {
                who.classList.remove('is-open');
              });
            }
            armClose(el);
          });
        });

        // touch phones: tapping the name toggles the Tokyo time instead of navigating
        document.querySelectorAll('.who').forEach(function (who) {
          var link = who.querySelector('a');
          if (!link) return;
          link.addEventListener('click', function (event) {
            if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
            if (!window.matchMedia('(max-width: 759px)').matches) return;
            event.preventDefault();
            who.classList.toggle('is-open');
            if (who.classList.contains('is-open')) {
              document.querySelectorAll('.contact.is-open').forEach(function (el) {
                el.classList.remove('is-open');
              });
            }
            armClose(who);
          });
        });

        // a tap outside an open menu or time closes it
        document.addEventListener('click', function (event) {
          document.querySelectorAll('.contact.is-open, .who.is-open').forEach(function (el) {
            if (!el.contains(event.target)) el.classList.remove('is-open');
          });
        });

        document.addEventListener('keydown', function (event) {
          if (event.key !== 'Escape') return;
          document.querySelectorAll('.contact.is-open').forEach(function (el) {
            el.classList.remove('is-open');
          });
        });

        var marks = document.querySelectorAll('.mark');
        if (marks.length) {
          var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
          var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
          var current = 1;
          var target = 1;
          var frame = 0;

          var paint = function () {
            var value = current.toFixed(4);
            marks.forEach(function (mark) {
              mark.style.setProperty('--mark-scale', value);
            });
          };

          var tick = function () {
            current += (target - current) * 0.12;
            if (Math.abs(target - current) < 0.0008) {
              current = target;
              paint();
              frame = 0;
              return;
            }
            paint();
            frame = requestAnimationFrame(tick);
          };

          var wake = function () {
            if (!frame) frame = requestAnimationFrame(tick);
          };

          window.addEventListener('pointermove', function (event) {
            if (!fine.matches || reduce.matches || event.pointerType === 'touch') return;
            var distance = Math.abs(event.clientX - window.innerWidth / 2);
            var reach = Math.min(1, distance / (window.innerWidth / 2));
            var max = parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue('--mark-stretch-max'),
            );
            if (!max || max < 1) max = 1.35;
            target = 1 + (max - 1) * reach * reach;
            wake();
          });

          // phones: tilt left or right stretches the mark like moving the cursor to the edge
          window.addEventListener('hs:tilt', function (event) {
            if (reduce.matches) return;
            var reach = Math.min(1, Math.abs(event.detail.u - 0.5) * 2);
            var max = parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue('--mark-stretch-max'),
            );
            if (!max || max < 1) max = 1.35;
            target = 1 + (max - 1) * reach * reach;
            wake();
          });

          document.documentElement.addEventListener('pointerleave', function () {
            target = 1;
            wake();
          });
        }
      
}
