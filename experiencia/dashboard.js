// Mundo digital dentro de la consola: orbe verde, rejilla de hexágonos y tubos de luz.
// También maneja el menú de portadas (mouse, teclado, control y sonidos).
import * as THREE from 'three';

// ---------- Fondo 3D ----------
export function crearMundo() {
  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x000000);
  const camara = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
  camara.position.set(0, 0, 6);
  const tiempo = { value: 0 };

  // Rejilla de hexágonos que late
  const hex = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 24),
    new THREE.ShaderMaterial({
      uniforms: { tiempo },
      transparent: true,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */`
        uniform float tiempo; varying vec2 vUv;
        vec4 hexa(vec2 p){
          vec2 r=vec2(1.,1.732), h=r*.5;
          vec2 a=mod(p,r)-h, b=mod(p-h,r)-h;
          vec2 g=dot(a,a)<dot(b,b)?a:b;
          vec2 id=p-g;
          vec2 q=abs(g);
          float d=.5-max(dot(q,normalize(vec2(1.,1.732))),q.x);
          return vec4(d,id,0.);
        }
        void main(){
          vec2 p=(vUv-.5)*vec2(40.,24.)*1.4;
          vec4 h=hexa(p);
          float borde=smoothstep(.06,.0,h.x);
          float onda=sin(length(h.yz)*.35-tiempo*1.6)*.5+.5;
          float centro=smoothstep(16.,0.,length(p));
          vec3 col=vec3(.25,1.,.1)*borde*(.08+.5*pow(onda,6.))*centro;
          col+=vec3(.02,.12,.01)*centro*centro;
          gl_FragColor=vec4(col,1.);
        }`,
    })
  );
  hex.position.z = -6;
  escena.add(hex);

  // Orbe con borde brillante y "líquido" interno
  const orbe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { tiempo },
      vertexShader: /* glsl */`
        uniform float tiempo; varying vec3 vN, vP;
        void main(){
          vec3 p=position;
          p+=normal*.04*sin(p.y*5.+tiempo*2.)*sin(p.x*4.+tiempo*1.3);
          vN=normalize(normalMatrix*normal); vP=p;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        }`,
      fragmentShader: /* glsl */`
        uniform float tiempo; varying vec3 vN, vP;
        void main(){
          float fres=pow(1.-abs(vN.z),2.2);
          float vetas=sin(vP.x*6.+tiempo)*sin(vP.y*7.-tiempo*1.4)*sin(vP.z*5.+tiempo*.7);
          vec3 base=mix(vec3(.02,.18,.01),vec3(.35,1.,.15),.5+.5*vetas);
          vec3 col=base*.55+vec3(.6,1.,.45)*fres*1.6;
          col+=vec3(.9,1.,.85)*pow(max(dot(vN,normalize(vec3(-.4,.5,1.))),0.),24.)*.8;
          gl_FragColor=vec4(col,1.);
        }`,
    })
  );
  orbe.position.set(0, 1.75, -1.5);
  orbe.scale.setScalar(0.85);
  escena.add(orbe);

  // Halo del orbe
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; void main(){ float d=length(vUv-.5); gl_FragColor=vec4(vec3(.3,1.,.12)*pow(smoothstep(.5,.1,d),2.)*.5,1.); }`,
    })
  );
  halo.position.copy(orbe.position).add(new THREE.Vector3(0, 0, -0.2));
  escena.add(halo);

  // Tubos orgánicos de luz alrededor
  const tubos = new THREE.Group();
  const matTubo = new THREE.MeshBasicMaterial({ color: 0x3cff10, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 7) * Math.PI * 2 + i;
      pts.push(new THREE.Vector3(Math.cos(a) * (3 + i * 0.6), Math.sin(a * 1.3 + i) * 2.2, -2 - i * 0.5 + Math.sin(a) * 1.5));
    }
    const tubo = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.02 + i * 0.006, 8, true), matTubo);
    tubo.userData.vel = 0.04 + i * 0.015;
    tubos.add(tubo);
  }
  escena.add(tubos);

  // ---------- Túnel de entrada: estelas, partículas y anillos hexagonales ----------
  // La cámara viaja de Z_INICIO a Z_FIN; el túnel se desvanece al salir frente al orbe.
  const Z_INICIO = 70, Z_FIN = 6;
  const velocidad = { value: 0 }, camZ = { value: Z_INICIO };
  const fundido = /* glsl */`
    uniform float camZ; varying float vNiebla;
    float niebla(vec3 p){ float d = camZ - p.z; return smoothstep(-1., 3., d) * smoothstep(45., 8., d); }`;

  // Estelas: segmentos que se estiran con la velocidad
  const N = 1400, posE = new Float32Array(N * 6), ext = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = 1.4 + Math.random() * 4.5, z = 8 + Math.random() * 68;
    for (let k = 0; k < 2; k++) { posE.set([Math.cos(a) * r, Math.sin(a) * r, z], i * 6 + k * 3); ext[i * 2 + k] = k; }
  }
  const geoE = new THREE.BufferGeometry();
  geoE.setAttribute('position', new THREE.BufferAttribute(posE, 3));
  geoE.setAttribute('extremo', new THREE.BufferAttribute(ext, 1));
  const estelas = new THREE.LineSegments(geoE, new THREE.ShaderMaterial({
    uniforms: { velocidad, camZ },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: fundido + /* glsl */`
      uniform float velocidad; attribute float extremo;
      void main(){
        vec3 p = position; p.z += extremo * (0.15 + velocidad * 3.5);
        vNiebla = niebla(p);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: /* glsl */`
      varying float vNiebla;
      void main(){ gl_FragColor = vec4(vec3(.45, 1., .3) * vNiebla, 1.); }`,
  }));
  escena.add(estelas);

  // Partículas brillantes (puntos redondos)
  const M = 2600, posP = new Float32Array(M * 3), tamP = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 6;
    posP.set([Math.cos(a) * r, Math.sin(a) * r, -4 + Math.random() * 80], i * 3);
    tamP[i] = 0.5 + Math.random() * 1.5;
  }
  const geoP = new THREE.BufferGeometry();
  geoP.setAttribute('position', new THREE.BufferAttribute(posP, 3));
  geoP.setAttribute('tam', new THREE.BufferAttribute(tamP, 1));
  const particulas = new THREE.Points(geoP, new THREE.ShaderMaterial({
    uniforms: { tiempo, camZ },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: fundido + /* glsl */`
      uniform float tiempo; attribute float tam;
      void main(){
        vec3 p = position; p.xy += 0.15 * vec2(sin(tiempo * .7 + p.z), cos(tiempo * .5 + p.z * 1.3));
        vNiebla = niebla(p);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = tam * 26. / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vNiebla;
      void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d);
        gl_FragColor = vec4(vec3(.55, 1., .4) * a * a * vNiebla, 1.); }`,
  }));
  escena.add(particulas);

  // Anillos hexagonales a lo largo del túnel
  const anillos = new THREE.Group();
  const hexPts = Array.from({ length: 7 }, (_, k) => { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; return new THREE.Vector3(Math.cos(a), Math.sin(a), 0); });
  const geoHex = new THREE.BufferGeometry().setFromPoints(hexPts);
  for (let i = 0; i < 16; i++) {
    const anillo = new THREE.Line(geoHex, new THREE.ShaderMaterial({
      uniforms: { camZ },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: fundido + `void main(){ vec4 w = modelMatrix * vec4(position,1.); vNiebla = niebla(w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying float vNiebla; void main(){ gl_FragColor = vec4(vec3(.3,1.,.15) * vNiebla * .8, 1.); }`,
    }));
    anillo.position.z = 12 + i * 4;
    anillo.scale.setScalar(2.2 + (i % 3) * 0.35);
    anillos.add(anillo);
  }
  escena.add(anillos);

  const suave = (x) => x * x * (3 - 2 * x);
  const mira = new THREE.Vector3();

  return {
    escena, camara,
    // viaje: 0 = entrando por el túnel, 1 = frente al orbe con el menú
    actualizar(t, mx, my, viaje = 1) {
      tiempo.value = t;
      orbe.rotation.y = t * 0.2;
      tubos.children.forEach((tb, i) => { tb.rotation.z = t * tb.userData.vel * (i % 2 ? 1 : -1); tb.rotation.y = Math.sin(t * 0.1 + i) * 0.2; });
      anillos.children.forEach((a, i) => (a.rotation.z = t * 0.15 * (i % 2 ? 1 : -1) + i * 0.3));

      const v = suave(viaje);
      camZ.value = Z_INICIO + (Z_FIN - Z_INICIO) * v;
      velocidad.value = Math.sin(Math.PI * Math.min(1, viaje * 1.15));
      camara.position.z = camZ.value;
      camara.position.x += (mx * 0.5 * v - camara.position.x) * 0.08;
      camara.position.y += (-my * 0.35 * v - camara.position.y) * 0.08;
      // Durante el viaje mira de frente y gira un poco; al llegar mira al orbe
      mira.set(0, 0.3 * v, camZ.value - 10 + 8 * v);
      camara.up.set(Math.sin((1 - v) * 0.6 + t * 0.2 * (1 - v)) * (1 - v) * 0.4, 1, 0).normalize();
      camara.lookAt(mira);
      camara.fov = 50 + velocidad.value * 22;
      camara.updateProjectionMatrix();
    },
  };
}

// ---------- Sonidos sintetizados (originales) ----------
function crearSonidos() {
  let ctx = null, activo = false;
  const tono = (f0, f1, dur, tipo = 'sine', vol = 0.12, retraso = 0) => {
    if (!activo) return;
    ctx ??= new AudioContext();
    const t = ctx.currentTime + retraso;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  return {
    set activo(v) { activo = v; if (v) { ctx ??= new AudioContext(); ctx.resume(); } },
    get activo() { return activo; },
    mover() { tono(880, 1320, 0.09, 'triangle', 0.08); },
    elegir() { tono(220, 660, 0.35, 'sawtooth', 0.05); tono(440, 1320, 0.45, 'sine', 0.1, 0.05); tono(660, 1760, 0.5, 'sine', 0.06, 0.12); },
    entrar() { tono(60, 900, 0.9, 'sawtooth', 0.05); tono(1200, 300, 0.6, 'square', 0.02, 0.2); },
  };
}

// ---------- Menú de portadas ----------
export function crearMenu() {
  const dash = document.getElementById('dash');
  const cajas = [...document.querySelectorAll('.caja')];
  const infoTitulo = document.getElementById('infoTitulo');
  const infoDesc = document.getElementById('infoDesc');
  const cargando = document.getElementById('cargando');
  const cargandoTxt = document.getElementById('cargandoTxt');
  const aviso = document.getElementById('aviso');
  const btnSonido = document.getElementById('sonido');
  const sonidos = crearSonidos();
  const movil = matchMedia('(max-width:760px)');
  let idx = 0, activo = false, ocupado = false;

  function pintar(conSonido = true) {
    cajas.forEach((c, i) => {
      const d = i - idx;
      c.setAttribute('aria-selected', String(d === 0));
      c.tabIndex = d === 0 ? 0 : -1;
      if (!movil.matches) {
        c.style.setProperty('--giro', `${d * -14}deg`);
        c.style.setProperty('--z', `${-Math.abs(d) * 50 + (d === 0 ? 40 : 0)}px`);
      }
    });
    infoTitulo.textContent = cajas[idx].dataset.titulo;
    infoDesc.textContent = cajas[idx].dataset.desc;
    if (conSonido) sonidos.mover();
  }

  function elegir(i, conSonido = true) {
    const n = (i + cajas.length) % cajas.length;
    if (n === idx) return;
    idx = n; pintar(conSonido);
    if (movil.matches) cajas[idx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function avisar(txt) {
    aviso.textContent = txt; aviso.hidden = false;
    clearTimeout(avisar.t); avisar.t = setTimeout(() => (aviso.hidden = true), 2200);
  }

  async function jugar(i = idx) {
    if (ocupado) return;
    ocupado = true;
    const caja = cajas[i];
    sonidos.elegir();
    cargandoTxt.textContent = `Cargando ${caja.dataset.titulo}…`;
    cargando.hidden = false;
    let existe = false;
    try { existe = (await fetch(caja.href, { method: 'HEAD' })).ok; } catch { existe = false; }
    await new Promise((r) => setTimeout(r, 900));
    if (existe) { location.href = caja.href; return; }
    cargando.hidden = true; ocupado = false;
    avisar('Próximamente');
  }

  cajas.forEach((c, i) => {
    c.addEventListener('mouseenter', () => activo && !movil.matches && elegir(i));
    c.addEventListener('focus', () => elegir(i, false));
    c.addEventListener('click', (e) => { e.preventDefault(); if (i !== idx) elegir(i); else jugar(i); });
  });

  addEventListener('keydown', (e) => {
    if (!activo) return;
    if (e.key === 'ArrowRight') { elegir(idx + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { elegir(idx - 1); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') { if (e.target.closest?.('button')) return; jugar(); e.preventDefault(); }
  });

  btnSonido.addEventListener('click', () => {
    sonidos.activo = !sonidos.activo;
    btnSonido.setAttribute('aria-pressed', String(sonidos.activo));
    btnSonido.textContent = `Sonido: ${sonidos.activo ? 'sí' : 'no'}`;
    if (sonidos.activo) sonidos.mover();
  });

  // En celular la portada centrada en el carrusel es la elegida
  const carrusel = document.getElementById('carrusel');
  carrusel.addEventListener('scroll', () => {
    if (!movil.matches) return;
    const centro = carrusel.scrollLeft + carrusel.clientWidth / 2;
    let mejor = 0, dist = Infinity;
    cajas.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - centro); if (d < dist) { dist = d; mejor = i; } });
    if (mejor !== idx) { idx = mejor; pintar(false); }
  }, { passive: true });

  // Reloj
  const reloj = document.getElementById('reloj');
  const tic = () => (reloj.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
  tic(); setInterval(tic, 30000);

  // Control (Gamepad API): cruceta/stick para elegir, A para jugar
  let ultimo = 0, aAntes = false;
  function leerControl(ahora) {
    if (!activo) return;
    const gp = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (!gp) return;
    const x = gp.axes[0] || 0;
    const izq = x < -0.5 || gp.buttons[14]?.pressed, der = x > 0.5 || gp.buttons[15]?.pressed;
    if ((izq || der) && ahora - ultimo > 220) { elegir(idx + (der ? 1 : -1)); ultimo = ahora; }
    const a = !!gp.buttons[0]?.pressed;
    if (a && !aAntes) jugar();
    aAntes = a;
  }

  pintar(false);

  return {
    sonidos,
    leerControl,
    mostrar(v) {
      if (v === activo) return;
      activo = v;
      dash.hidden = false;
      dash.classList.toggle('activo', v);
      if (v) sonidos.entrar();
    },
  };
}
