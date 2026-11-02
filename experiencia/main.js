// Portada: el scroll enciende la tele, acerca la cámara, entra con un glitch y abre el dashboard.
import * as THREE from 'three';
import { crearCuarto } from './escena.js';
import { crearPantallaCRT } from './crt.js';
import { crearMundo, crearMenu } from './dashboard.js';

const $ = (s) => document.querySelector(s);
const carga = $('#carga'), cargaPct = $('#cargaPct');
const menu = crearMenu();

// Tramos del scroll (0 → 1)
const T = {
  encender: [0.05, 0.20],  // la tele se enciende
  camara: [0.12, 0.60],    // la cámara se desliza hasta la pantalla
  chispas: [0.25, 0.55],   // salen partículas verdes de la tele
  tunel: [0.42, 0.60],     // en la pantalla aparece el túnel
  interferencia: [0.56, 0.60, 0.66], // sube, cambio de escena, baja
  viaje: [0.60, 0.93],     // vuelo por el túnel dentro de la consola
  menu: 0.94,              // aparece el menú
};
const tramo = (p, [a, b]) => THREE.MathUtils.clamp((p - a) / (b - a), 0, 1);

const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lienzo = $('#lienzo');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, powerPreference: 'high-performance' });
} catch { renderer = null; }

if (!renderer || sinMovimiento) {
  // Sin WebGL o con movimiento reducido: directo al menú
  document.documentElement.classList.add('sin-intro');
  carga.classList.add('fuera');
  menu.mostrar(true);
} else {
  iniciar();
}

async function iniciar() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const crt = crearPantallaCRT();
  const cuarto = await crearCuarto((f) => (cargaPct.textContent = Math.round(f * 100)));
  cuarto.pantalla.material = crt.material;

  // Partículas verdes que salen de la pantalla hacia la cámara
  const pantallaPos = new THREE.Vector3(); cuarto.pantalla.getWorldPosition(pantallaPos);
  const NC = 500, posC = new Float32Array(NC * 3), semC = new Float32Array(NC);
  for (let i = 0; i < NC; i++) { posC.set([(Math.random() - .5) * .3, (Math.random() - .5) * .22, 0], i * 3); semC[i] = Math.random(); }
  const geoC = new THREE.BufferGeometry();
  geoC.setAttribute('position', new THREE.BufferAttribute(posC, 3));
  geoC.setAttribute('semilla', new THREE.BufferAttribute(semC, 1));
  const chispas = new THREE.Points(geoC, new THREE.ShaderMaterial({
    uniforms: { tiempo: { value: 0 }, fuerza: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float tiempo, fuerza; attribute float semilla; varying float vA;
      void main(){
        float f = fract(semilla + tiempo * (.08 + semilla * .12));
        vec3 p = position * (1. + f * 3.);
        p.z = f * 2.;
        p.x += sin(tiempo * 2. + semilla * 40.) * .03 * f;
        p.y += cos(tiempo * 1.7 + semilla * 30.) * .03 * f;
        vA = fuerza * smoothstep(0., .1, f) * smoothstep(1., .6, f);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (2. + semilla * 5.) * 3. / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vec3(.4, 1.6, .25) * smoothstep(.5, 0., d) * vA, 1.); }`,
  }));
  chispas.position.copy(pantallaPos).add(new THREE.Vector3(0, 0, .01));
  cuarto.escena.add(chispas);
  const mundo = crearMundo();

  // Pase final: glitch, pixelado, tinte verde y scanlines
  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const post = new THREE.ShaderMaterial({
    uniforms: { mapa: { value: rt.texture }, glitch: { value: 0 }, tiempo: { value: 0 }, res: { value: new THREE.Vector2() }, digital: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D mapa; uniform float glitch, tiempo, digital; uniform vec2 res; varying vec2 vUv;
      float azar(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 uv=vUv;
        // Franjas desplazadas
        float fila=floor(vUv.y*22.);
        float r=azar(vec2(fila,floor(tiempo*18.)));
        uv.x+=(r-.5)*.12*glitch*step(.6,r);
        float sep=.002+.02*glitch+.004*length(vUv-.5)*digital;
        vec3 col=vec3(texture2D(mapa,uv+vec2(sep,0.)).r, texture2D(mapa,uv).g, texture2D(mapa,uv-vec2(sep,0.)).b);
        // El cuarto se renderiza en lineal: ACES + sRGB aquí. El mundo digital ya viene en colores de pantalla.
        if(digital<.5){ col*=1.1; col=clamp((col*(2.51*col+.03))/(col*(2.43*col+.59)+.14),0.,1.); col=pow(col,vec3(1./2.2)); }
        // Interferencia verde breve
        float lum=dot(col,vec3(.3,.59,.11));
        col=mix(col, vec3(.3,1.,.2)*lum*1.4, glitch*.5);
        col+=vec3(.2,1.,.1)*glitch*.15*step(.97,azar(vec2(floor(vUv.y*120.),floor(tiempo*30.))));
        // Scanlines suaves dentro de la consola
        col*=1.-digital*.12*(.5+.5*sin(vUv.y*res.y*1.2));
        col*=1.-.35*pow(length(vUv-.5)*1.25,2.);
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
  const escenaPost = new THREE.Scene(); escenaPost.add(quad);
  const camPost = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function redimensionar() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    rt.setSize(w * pr, h * pr);
    post.uniforms.res.value.set(w * pr, h * pr);
    for (const c of [cuarto.camara, mundo.camara]) { c.aspect = w / h; c.updateProjectionMatrix(); }
  }
  addEventListener('resize', redimensionar); redimensionar();

  // Mouse y giroscopio → parallax
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    mouse.x = THREE.MathUtils.clamp(e.gamma / 25, -1, 1); mouse.y = THREE.MathUtils.clamp((e.beta - 45) / 25, -1, 1);
  });

  // Scroll
  let p = 0, ps = 0;
  const leerScroll = () => { const max = document.documentElement.scrollHeight - innerHeight; p = max > 0 ? scrollY / max : 0; };
  addEventListener('scroll', leerScroll, { passive: true }); leerScroll(); ps = p;

  const saltar = $('#saltar'), pista = $('.pista');
  saltar.addEventListener('click', () => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
  $('#volver').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  carga.classList.add('fuera');
  const reloj = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const t = reloj.getElapsedTime();
    ps += (p - ps) * 0.08;
    if (Math.abs(p - ps) < 1e-4) ps = p;
    mouse.sx += (mouse.x - mouse.sx) * 0.06; mouse.sy += (mouse.y - mouse.sy) * 0.06;

    const encendido = tramo(ps, T.encender);
    const avance = tramo(ps, T.camara);
    const [i0, cambio, i1] = T.interferencia;
    const glitch = ps < cambio ? tramo(ps, [i0, cambio]) : 1 - tramo(ps, [cambio, i1]);
    const dentro = ps >= cambio;
    const viaje = tramo(ps, T.viaje);

    pista.style.opacity = String(1 - tramo(ps, [0.02, 0.1]));
    saltar.classList.toggle('oculto', ps > T.menu - 0.05);
    menu.mostrar(ps >= T.menu);
    menu.leerControl(performance.now());

    let escena, camara;
    if (!dentro) {
      cuarto.colocarCamara(avance);
      // Parallax: se reduce al acercarse a la pantalla
      const f = 1 - avance * 0.8;
      cuarto.camara.rotateY(-mouse.sx * 0.06 * f);
      cuarto.camara.rotateX(-mouse.sy * 0.04 * f);
      crt.actualizar(t, encendido, glitch * .5, tramo(ps, T.tunel));
      chispas.material.uniforms.tiempo.value = t;
      chispas.material.uniforms.fuerza.value = tramo(ps, T.chispas);
      cuarto.luzTele.intensity = encendido * (2.2 + Math.sin(t * 30) * 0.15 + Math.random() * 0.1);
      escena = cuarto.escena; camara = cuarto.camara;
    } else {
      mundo.actualizar(t, mouse.sx, mouse.sy, viaje);
      escena = mundo.escena; camara = mundo.camara;
    }

    post.uniforms.glitch.value = glitch * .6;
    post.uniforms.tiempo.value = t;
    post.uniforms.digital.value = dentro ? 1 : 0;
    renderer.setRenderTarget(rt);
    renderer.render(escena, camara);
    renderer.setRenderTarget(null);
    renderer.render(escenaPost, camPost);
  });
}
