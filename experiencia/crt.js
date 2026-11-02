// Pantalla de la tele de bulbo: un canvas con la imagen de arranque + shader CRT encima.
import * as THREE from 'three';

export function crearPantallaCRT() {
  const lienzo = document.createElement('canvas');
  lienzo.width = 512; lienzo.height = 384;
  const ctx = lienzo.getContext('2d');
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      mapa: { value: textura },
      encendido: { value: 0 },   // 0 apagada → 1 encendida
      tiempo: { value: 0 },
      glitch: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D mapa; uniform float encendido, tiempo, glitch;
      varying vec2 vUv;
      float azar(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        // Curvatura del vidrio
        vec2 c = vUv * 2.0 - 1.0;
        c *= 1.0 + 0.08 * dot(c.yx, c.yx);
        vec2 uv = c * 0.5 + 0.5;
        // Encendido: una línea horizontal que se abre a pantalla completa
        float abre = smoothstep(0.0, 0.35, encendido);
        float alto = mix(0.004, 1.0, smoothstep(0.25, 0.75, encendido));
        float enLinea = step(abs(uv.y - 0.5), alto * 0.5) * step(abs(uv.x - 0.5), 0.5 * abre);
        // Desfase por línea (glitch)
        float fila = floor(uv.y * 60.0);
        uv.x += (azar(vec2(fila, floor(tiempo * 12.0))) - 0.5) * 0.08 * glitch;
        vec3 col;
        col.r = texture2D(mapa, uv + vec2(0.003 + 0.01 * glitch, 0.0)).r;
        col.g = texture2D(mapa, uv).g;
        col.b = texture2D(mapa, uv - vec2(0.003 + 0.01 * glitch, 0.0)).b;
        // Scanlines, ruido y viñeta
        col *= 0.82 + 0.18 * sin(uv.y * 384.0 * 3.14159);
        col += (azar(uv * tiempo) - 0.5) * 0.08;
        float vin = smoothstep(1.25, 0.35, length(c));
        // Fuera del vidrio curvo: negro
        float dentro = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        vec3 apagada = vec3(0.025, 0.03, 0.035) + 0.04 * (1.0 - length(c) * 0.5);
        vec3 brillo = col * vin * enLinea * dentro;
        // Destello blanco al encender
        brillo += vec3(0.9, 1.0, 0.9) * enLinea * (1.0 - smoothstep(0.0, 0.5, encendido)) * 1.5;
        gl_FragColor = vec4(mix(apagada, brillo, step(0.001, encendido)), 1.0);
      }`,
  });

  // Estelas del túnel que se ve en la tele al acercarse
  const estrellas = Array.from({ length: 220 }, () => ({ a: Math.random() * Math.PI * 2, z: Math.random() }));
  let tAntes = 0;
  function dibujarTunel(t, tunel) {
    const w = lienzo.width, h = lienzo.height, dt = Math.min(0.05, t - tAntes);
    ctx.fillStyle = `rgba(0,6,0,${0.35 + tunel * 0.6})`; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = tunel; ctx.lineCap = 'round';
    for (const e of estrellas) {
      const z0 = e.z; e.z -= dt * (0.25 + tunel * 0.9);
      if (e.z <= 0.03) { e.z = 1; e.a = Math.random() * Math.PI * 2; continue; }
      const r0 = (0.06 / z0) * w, r1 = (0.06 / e.z) * w;
      const cx = Math.cos(e.a), cy = Math.sin(e.a);
      ctx.strokeStyle = `rgba(${150 + 100 * (1 - e.z)},255,${110 * (1 - e.z)},${Math.min(1, 0.2 + (1 - e.z))})`;
      ctx.lineWidth = 1 + (1 - e.z) * 3;
      ctx.beginPath(); ctx.moveTo(w / 2 + cx * r0, h / 2 + cy * r0); ctx.lineTo(w / 2 + cx * r1, h / 2 + cy * r1); ctx.stroke();
    }
    const nucleo = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.25);
    nucleo.addColorStop(0, 'rgba(210,255,190,.9)'); nucleo.addColorStop(1, 'rgba(60,255,20,0)');
    ctx.fillStyle = nucleo; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // Dibuja la pantalla de arranque (orbe verde + nombre)
  function dibujar(t, encendido, tunel) {
    const w = lienzo.width, h = lienzo.height;
    const fondo = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h / 2, w * 0.7);
    fondo.addColorStop(0, '#0f3a08'); fondo.addColorStop(1, '#000');
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, w, h);
    // Anillos que giran
    ctx.save(); ctx.translate(w / 2, h * 0.42);
    for (let i = 0; i < 3; i++) {
      ctx.rotate(t * (0.4 + i * 0.25));
      ctx.strokeStyle = `rgba(124,255,58,${0.25 - i * 0.06})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 90 + i * 22, 34 + i * 10, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // Orbe
    const r = 44 + Math.sin(t * 2.2) * 3;
    const orbe = ctx.createRadialGradient(w / 2 - 14, h * 0.42 - 16, 4, w / 2, h * 0.42, r);
    orbe.addColorStop(0, '#f2ffe6'); orbe.addColorStop(0.35, '#7cff3a'); orbe.addColorStop(1, '#0b3d08');
    ctx.shadowColor = '#7cff3a'; ctx.shadowBlur = 40;
    ctx.fillStyle = orbe; ctx.beginPath(); ctx.arc(w / 2, h * 0.42, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // Texto (aparece después del orbe)
    const a = Math.min(1, Math.max(0, (encendido - 0.75) * 4));
    ctx.globalAlpha = a; ctx.textAlign = 'center';
    ctx.fillStyle = '#d8ffc4'; ctx.font = '900 38px Orbitron, sans-serif';
    ctx.fillText('DIEGO CHÁVEZ', w / 2, h * 0.78);
    ctx.fillStyle = '#7cff3a'; ctx.font = '600 15px Orbitron, sans-serif';
    ctx.fillText('P O R T A F O L I O', w / 2, h * 0.86);
    ctx.globalAlpha = 1;
    if (tunel > 0) dibujarTunel(t, tunel);
    tAntes = t;
    textura.needsUpdate = true;
  }

  return {
    material,
    actualizar(t, encendido, glitch, tunel = 0) {
      material.uniforms.tiempo.value = t;
      material.uniforms.encendido.value = encendido;
      material.uniforms.glitch.value = glitch;
      if (encendido > 0) dibujar(t, encendido, tunel);
    },
  };
}
