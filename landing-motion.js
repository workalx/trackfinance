// Home page motion, built on GSAP + ScrollTrigger (loaded from the CDN in index.html).
// Everything here is an enhancement: without GSAP, or with reduced motion, the page stays fully visible.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)');

let ctx = null;
let mm = null;
let refreshFrame = 0;
let magneticReady = false;

function available() {
  return Boolean(window.gsap && window.ScrollTrigger) && !reducedMotion.matches;
}

function splitWords(el) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  el.innerHTML = text
    .split(/\s+/)
    .map((word) => `<span class="title-word" aria-hidden="true"><span class="title-word-inner">${word.replace(/[&<>"]/g, '')}</span></span>`)
    .join(' ');
}

// Buttons lean towards the cursor and spring back when it leaves.
function setupMagnetic(gsap) {
  if (magneticReady || !finePointer.matches) return;
  magneticReady = true;
  document.querySelectorAll('[data-magnetic]').forEach((btn) => {
    const xTo = gsap.quickTo(btn, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.45)' });
    const yTo = gsap.quickTo(btn, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.45)' });
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
    });
    btn.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
}

// Runs the intro and wires the scroll effects; call each time the home page is shown.
export function playLandingMotion({ formatAmount }) {
  stopLandingMotion();
  if (!available()) return;

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  const scroller = document.getElementById('landing-screen');
  scroller.classList.add('motion-ready');
  setupMagnetic(gsap);

  ctx = gsap.context(() => {
    ScrollTrigger.defaults({ scroller });
    const navHeight = () => scroller.querySelector('.landing-nav').offsetHeight;

    // Intro: words rise out of their masks, the receipt prints and its total counts up.
    const title = scroller.querySelector('.landing-title');
    splitWords(title);
    const totalEl = document.getElementById('landing-demo-total');
    const ghostEl = document.getElementById('landing-ghost-total');
    // The number itself comes from a data attribute: the shown text is locale-formatted ("1 284,60 ₴").
    const total = Number(totalEl.dataset.value) || 0;
    const counter = { value: 0 };
    gsap.set('.landing-ghost', { xPercent: -50, x: 0 });

    gsap.timeline({ defaults: { ease: 'expo.out' } })
      .from('.title-word-inner', { yPercent: 115, rotate: 4, duration: 1.2, stagger: 0.07 }, 0.1)
      .from('.landing-lead, .landing-hero-actions, .landing-facts li', { y: 26, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.55)
      .from('.landing-ghost', { yPercent: 25, autoAlpha: 0, duration: 1.8 }, 0.2)
      .from('.landing-printer', { scaleX: 0.5, autoAlpha: 0, duration: 0.7 }, 0.2)
      .from('.landing-paper .receipt', { yPercent: -102, duration: 1.7, ease: 'power3.out' }, 0.45)
      .from('.landing-paper .day-block-header, .landing-paper .entry-row', {
        autoAlpha: 0, x: -12, duration: 0.5, stagger: 0.12, ease: 'power2.out',
      }, 1.05)
      .to(counter, {
        value: total,
        duration: 2,
        ease: 'power3.out',
        onUpdate: () => {
          const text = formatAmount(counter.value);
          totalEl.textContent = text;
          ghostEl.textContent = text;
        },
      }, 0.55);

    // Hero depth on scroll: the ghost figure drifts up, the receipt tilts away.
    const heroScroll = { trigger: '.landing-hero', start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('.landing-ghost', { yPercent: -45, ease: 'none', scrollTrigger: heroScroll });
    gsap.to('.landing-demo', { y: -70, rotate: -3, ease: 'none', scrollTrigger: { ...heroScroll } });

    // Till tape: two endless bands; scrolling fast spins them up.
    const tapeA = gsap.to('#landing-tape-a', { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
    const tapeB = gsap.fromTo('#landing-tape-b', { xPercent: -50 }, { xPercent: 0, duration: 46, ease: 'none', repeat: -1 });
    ScrollTrigger.create({
      trigger: '.landing-tape',
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 300, 7);
        gsap.to([tapeA, tapeB], { timeScale: boost, duration: 0.2, overwrite: true });
        gsap.to([tapeA, tapeB], { timeScale: 1, duration: 1.4, delay: 0.25, ease: 'power2.out' });
      },
    });
    gsap.fromTo('.landing-tape-a', { yPercent: -50, rotate: -6 }, {
      rotate: -1.5, ease: 'none',
      scrollTrigger: { trigger: '.landing-tape', start: 'top bottom', end: 'bottom top', scrub: true },
    });
    gsap.fromTo('.landing-tape-b', { yPercent: -50, rotate: 5 }, {
      rotate: 1, ease: 'none',
      scrollTrigger: { trigger: '.landing-tape', start: 'top bottom', end: 'bottom top', scrub: true },
    });

    // Section headings slide in as they arrive.
    gsap.utils.toArray('.landing-section-head').forEach((head) => {
      gsap.from(head.children, {
        y: 46, autoAlpha: 0, duration: 1.1, stagger: 0.1, ease: 'expo.out',
        scrollTrigger: { trigger: head, start: 'top 85%' },
      });
    });

    // Report bars grow once the features come into view.
    gsap.from('.bento-bar span', {
      scaleX: 0, duration: 1.4, stagger: 0.14, ease: 'expo.out',
      scrollTrigger: { trigger: '.hpanel-reports', start: 'top 75%' },
    });

    mm = gsap.matchMedia();

    // Wide screens: pin the features and slide the panels sideways with the scroll.
    mm.add('(min-width: 960px)', () => {
      const track = scroller.querySelector('.landing-hscroll-track');
      const viewport = scroller.querySelector('.landing-hscroll-viewport');
      const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
      const slide = gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: '.landing-hscroll',
          start: () => `top ${navHeight()}px`,
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });
      // Panels already on screen before the pin reveal with the page scroll; the rest as they slide in.
      const revealTrigger = (panel) => (panel.offsetLeft < viewport.clientWidth * 0.85
        ? { trigger: '.landing-hscroll', start: 'top 55%' }
        : { trigger: panel, containerAnimation: slide, start: 'left 85%' });
      gsap.utils.toArray('.hpanel').forEach((panel, i) => {
        if (i === 0) return;
        gsap.from(panel.querySelector('.hpanel-copy'), {
          x: 80, autoAlpha: 0, duration: 1, ease: 'expo.out', scrollTrigger: revealTrigger(panel),
        });
      });
      const folders = scroller.querySelector('.hpanel-folders');
      gsap.from('.bento-chip', {
        scale: 0.6, autoAlpha: 0, duration: 0.6, stagger: 0.05, ease: 'back.out(2)', delay: 0.2,
        scrollTrigger: revealTrigger(folders),
      });
      const styles = scroller.querySelector('.hpanel-styles');
      gsap.from('.hpanel-styles .style-card', {
        y: 30, autoAlpha: 0, duration: 0.7, stagger: 0.06, ease: 'expo.out', delay: 0.2,
        scrollTrigger: revealTrigger(styles),
      });
    });

    // Phones and tablets: panels simply rise in one after another.
    mm.add('(max-width: 959px)', () => {
      gsap.utils.toArray('.hpanel').forEach((panel) => {
        gsap.from(panel, {
          y: 70, autoAlpha: 0, duration: 1.1, ease: 'expo.out',
          scrollTrigger: { trigger: panel, start: 'top 88%' },
        });
      });
      gsap.from('.bento-chip', {
        scale: 0.6, autoAlpha: 0, duration: 0.6, stagger: 0.05, ease: 'back.out(2)',
        scrollTrigger: { trigger: '.hpanel-folders', start: 'top 70%' },
      });
    });

    // Steps: the joining line fills with the scroll; horizontal from 640px up.
    mm.add({ wide: '(min-width: 640px)', narrow: '(max-width: 639px)' }, (mmCtx) => {
      const axis = mmCtx.conditions.wide ? 'scaleX' : 'scaleY';
      gsap.fromTo('.landing-steps-line-fill', { [axis]: 0 }, {
        [axis]: 1, ease: 'none',
        scrollTrigger: { trigger: '.landing-steps-wrap', start: 'top 75%', end: 'bottom 60%', scrub: 0.6 },
      });
    });
    gsap.from('.landing-steps li', {
      y: 34, autoAlpha: 0, duration: 0.9, stagger: 0.16, ease: 'expo.out',
      scrollTrigger: { trigger: '.landing-steps-wrap', start: 'top 80%' },
    });

    // A purchase hops from the phone onto the laptop, on a loop.
    const chip = scroller.querySelector('.sync-chip');
    const laptop = scroller.querySelector('.sync-laptop');
    const hopX = () => laptop.offsetLeft + laptop.offsetWidth / 2 - chip.offsetLeft - chip.offsetWidth / 2;
    gsap.timeline({ repeat: -1, repeatDelay: 0.5, repeatRefresh: true })
      .fromTo(chip, { x: 0, y: 0, scale: 0.7, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'back.out(2)' })
      .to(chip, { x: hopX, duration: 1.4, ease: 'power1.inOut' }, 'hop')
      .to(chip, { y: -34, duration: 0.7, ease: 'power2.out' }, 'hop')
      .to(chip, { y: 46, duration: 0.7, ease: 'power2.in' }, 'hop+=0.7')
      .to(chip, { scale: 0.7, autoAlpha: 0, duration: 0.35 });

    // Closing block opens up like a widening frame while its headline grows.
    gsap.fromTo('.landing-final', { clipPath: 'inset(10% 7% round 48px)' }, {
      clipPath: 'inset(0% 0% round 0px)', ease: 'none',
      scrollTrigger: { trigger: '.landing-final', start: 'top bottom', end: 'top 45%', scrub: 0.6 },
    });
    gsap.from('.landing-final-title', {
      scale: 0.8, yPercent: 18, ease: 'none',
      scrollTrigger: { trigger: '.landing-final', start: 'top bottom', end: 'center 55%', scrub: 0.6 },
    });
  }, scroller);

  document.fonts.ready.then(refreshLandingMotion);
}

// Layout changed (style, language, fonts): recompute scroll positions on the next frame.
export function refreshLandingMotion() {
  if (!ctx || !window.ScrollTrigger) return;
  cancelAnimationFrame(refreshFrame);
  refreshFrame = requestAnimationFrame(() => window.ScrollTrigger.refresh());
}

export function isLandingMotionRunning() {
  return Boolean(ctx);
}

export function stopLandingMotion() {
  if (mm) { mm.revert(); mm = null; }
  if (!ctx) return;
  ctx.revert();
  ctx = null;
}
