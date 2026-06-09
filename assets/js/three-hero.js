/**
 * three-hero.js — Anti-Gravity Studio
 * 3D particle field hero section using Three.js
 * Works on all pillar pages and homepage
 */
(function() {
  'use strict';

  function initThreeHero(containerId) {
    const container = document.getElementById(containerId);
    if (!container || typeof THREE === 'undefined') return;

    const W = container.offsetWidth || window.innerWidth;
    const H = container.offsetHeight || 500;

    // Scene
    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    camera.position.z = 5;

    // Detect pillar for theme colour
    const body   = document.body;
    const pillar = body.dataset.pillar || body.className.match(/pillar-(\w+)/)?.[1] || 'default';
    const COLORS = {
      radha:     0xe8871e,   // warm gold
      corporate: 0xC0C0C0,   // silver
      tour:      0x4ade80,   // forest green
      default:   0x00f9ff    // cyan
    };
    const particleColor = COLORS[pillar] || COLORS.default;

    // Particles
    const COUNT    = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const sizes     = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
      sizes[i] = Math.random() * 2 + 0.5;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      color: particleColor,
      size: 0.04,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Floating geometric shape (pillar-specific)
    let mesh;
    const geoMap = {
      radha:     new THREE.TorusKnotGeometry(0.8, 0.25, 100, 16),
      corporate: new THREE.OctahedronGeometry(1.2, 0),
      tour:      new THREE.IcosahedronGeometry(1.0, 0),
      default:   new THREE.TorusGeometry(1.0, 0.3, 16, 100)
    };
    const wireMat = new THREE.MeshBasicMaterial({
      color: particleColor, wireframe: true, transparent: true, opacity: 0.15
    });
    mesh = new THREE.Mesh(geoMap[pillar] || geoMap.default, wireMat);
    mesh.position.set(2, 0, -2);
    scene.add(mesh);

    // Mouse parallax
    let mx = 0, my = 0;
    document.addEventListener('mousemove', e => {
      mx = (e.clientX / window.innerWidth  - 0.5) * 0.5;
      my = (e.clientY / window.innerHeight - 0.5) * 0.5;
    });

    // Animate
    let frame;
    function animate() {
      frame = requestAnimationFrame(animate);
      const t = Date.now() * 0.0005;
      particles.rotation.y = t * 0.1 + mx;
      particles.rotation.x = t * 0.05 + my;
      if (mesh) { mesh.rotation.x = t; mesh.rotation.y = t * 0.7; }
      renderer.render(scene, camera);
    }
    animate();

    // Resize
    window.addEventListener('resize', () => {
      const nw = container.offsetWidth;
      const nh = container.offsetHeight || H;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });

    // Cleanup
    return () => { cancelAnimationFrame(frame); renderer.dispose(); };
  }

  // Auto-init when DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    ['hero-canvas','three-hero','hero-3d'].forEach(id => {
      if (document.getElementById(id)) initThreeHero(id);
    });
  });

  window.initThreeHero = initThreeHero;
})();
