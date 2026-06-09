/**
 * assets/js/particles.js
 * Canvas particle system with mobile optimization & reduced-motion support
 */

export function initParticles() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  // Respect prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.display = 'none';
    return;
  }

  const ctx = canvas.getContext('2d');
  let particles = [];
  let animId;
  let mouse = { x: -999, y: -999, active: false };

  // Particle count: fewer on small/mobile screens
  const PARTICLE_COUNT = window.innerWidth < 768 ? 80 : 240;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', () => {
    resize();
    buildParticles();
  });

  function buildParticles() {
    particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x:       Math.random() * canvas.width,
      y:       Math.random() * canvas.height,
      size:    Math.random() * 2.2 + 0.6,
      speed:   Math.random() * 0.35 + 0.12,
      opacity: Math.random() * 0.7 + 0.3,
      drift:   Math.random() * 0.6 - 0.3,
    }));
  }
  buildParticles();

  // Mouse interaction — only on non-touch devices
  if (!('ontouchstart' in window)) {
    canvas.addEventListener('mousemove', e => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    });
    canvas.addEventListener('mouseleave', () => { mouse.active = false; });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p, i) => {
      // Move
      p.y -= p.speed;
      p.x += Math.sin(Date.now() / 800 + i) * 0.3 + p.drift;

      // Wrap
      if (p.y < 0) { p.y = canvas.height; p.x = Math.random() * canvas.width; }
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;

      // Mouse repulsion
      if (mouse.active) {
        const dx   = p.x - mouse.x;
        const dy   = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140 && dist > 2) {
          p.x += (dx / dist) * 2.5;
          p.y += (dy / dist) * 2.5;
        }
      }

      // Draw dot
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Neural web lines (every 4th particle, short range)
      if (i % 4 === 0) {
        for (let j = i + 1; j < particles.length; j++) {
          const p2  = particles[j];
          const dx2 = p.x - p2.x;
          const dy2 = p.y - p2.y;
          const d2  = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          if (d2 < 90) {
            ctx.save();
            ctx.globalAlpha = 0.12 * (1 - d2 / 90);
            ctx.strokeStyle = '#00f9ff';
            ctx.lineWidth   = 0.6;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    });

    animId = requestAnimationFrame(draw);
  }

  draw();

  // Pause when tab is hidden (saves CPU)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(animId); }
    else { draw(); }
  });
}
