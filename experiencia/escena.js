// Cuarto con la tele, la consola y el control.
// Carga modelos/portada.glb (exportado de Blender). Si no existe, arma un cuarto provisional con cajas.
// Nombres que la web busca dentro del .glb:
//   "Pantalla"     → malla del vidrio de la tele (se reemplaza por el shader CRT)
//   "Camara_POV"   → cámara con una animación; el scroll recorre su línea de tiempo de inicio a fin
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Recorrido provisional de la cámara (se usa si el .glb no trae Camara_POV)
const RUTA = [
  // p, posición, punto al que mira
  [0.00, [0.40, 0.66, 1.95], [-0.05, 0.40, 0.0]],
  [0.35, [0.25, 0.72, 1.70], [0.0, 0.72, 0.0]],
  [0.70, [0.05, 0.79, 0.90], [0.0, 0.80, 0.0]],
  [1.00, [0.00, 0.804, 0.37], [0.0, 0.804, -1.0]],
];

export async function crearCuarto(alProgreso) {
  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x05060a);
  escena.fog = new THREE.Fog(0x05060a, 3.5, 8);
  const camara = new THREE.PerspectiveCamera(50, 1, 0.02, 30);

  // Luces: casi de noche, una lámpara cálida y el brillo de la tele
  escena.add(new THREE.HemisphereLight(0x3a4a7a, 0x0a0806, 0.6));
  const lampara = new THREE.PointLight(0xffa860, 6, 5, 1.6);
  lampara.position.set(1.15, 1.25, -0.25);
  escena.add(lampara);
  const luzTele = new THREE.PointLight(0xbfffd0, 0, 4, 1.4);
  luzTele.position.set(0, 0.82, 0.7);
  escena.add(luzTele);

  let pantalla = null, mixer = null, accion = null, duracion = 1, camGLB = null;

  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync('modelos/portada.glb', (e) => {
      if (e.total) alProgreso(e.loaded / e.total);
    });
    escena.add(gltf.scene);
    pantalla = gltf.scene.getObjectByName('Pantalla');
    camGLB = gltf.cameras.find((c) => c.name.startsWith('Camara_POV') || c.parent?.name.startsWith('Camara_POV')) || null;
    const clip = gltf.animations.find((a) => /camara/i.test(a.name)) || gltf.animations[0];
    if (camGLB && clip) {
      mixer = new THREE.AnimationMixer(gltf.scene);
      accion = mixer.clipAction(clip); accion.play(); accion.paused = true;
      duracion = clip.duration;
    }
    // Las luces de Blender suelen venir muy fuertes; las sustituimos por las nuestras
    gltf.scene.traverse((o) => { if (o.isLight) o.visible = false; });
  } catch {
    pantalla = armarProvisional(escena);
    alProgreso(1);
  }
  if (!pantalla) pantalla = armarProvisional(escena);

  // Recorrido de cámara
  const pos = new THREE.Vector3(), mira = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  function colocarCamara(p) {
    if (mixer && camGLB) {
      accion.time = p * duracion * 0.9999;
      mixer.update(0);
      camGLB.updateWorldMatrix(true, false);
      camGLB.matrixWorld.decompose(camara.position, camara.quaternion, a);
      return;
    }
    let i = 0;
    while (i < RUTA.length - 2 && p > RUTA[i + 1][0]) i++;
    const [p0, pos0, mira0] = RUTA[i], [p1, pos1, mira1] = RUTA[i + 1];
    const t = THREE.MathUtils.smootherstep(p, p0, p1);
    pos.lerpVectors(a.fromArray(pos0), b.fromArray(pos1), t);
    mira.lerpVectors(a.fromArray(mira0), b.fromArray(mira1), t);
    camara.position.copy(pos);
    camara.lookAt(mira);
  }

  return { escena, camara, pantalla, luzTele, colocarCamara };
}

// ---------- Cuarto provisional (cajas) ----------
function armarProvisional(escena) {
  const g = new THREE.Group(); g.name = 'Provisional';
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const caja = (w, h, d, m, x, y, z, nombre) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z); o.name = nombre; g.add(o); return o;
  };

  // Arquitectura
  caja(7, 0.02, 7, mat(0x3b2a20), 0, -0.01, 1.2, 'Piso');
  caja(7, 3, 0.05, mat(0x2a3346), 0, 1.5, -0.65, 'Muro_Fondo');
  caja(0.05, 3, 7, mat(0x262e40), -2.3, 1.5, 1.2, 'Muro_Izq');
  const alfombra = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), mat(0x5a2a3a));
  alfombra.rotation.x = -Math.PI / 2; alfombra.position.set(0.1, 0.002, 1.5); g.add(alfombra);
  // Póster en el muro
  caja(0.5, 0.7, 0.01, mat(0x6c3b8a, { emissive: 0x1a0a22 }), -1.2, 1.5, -0.62, 'Poster');

  // Mueble de la tele
  caja(0.55, 0.55, 0.45, mat(0x8a5a30), 0, 0.275, 0, 'Mueble_TV');
  caja(0.5, 0.02, 0.42, mat(0x3d2614), 0, 0.27, 0.03, 'Repisa');

  // Tele de bulbo: frente gris, parte trasera más angosta
  const plastico = mat(0x2b2b2e, { roughness: 0.55 });
  caja(0.4, 0.41, 0.24, plastico, 0, 0.755, 0.0, 'Tele_Frente');
  caja(0.32, 0.32, 0.12, plastico, 0, 0.75, -0.17, 'Tele_Atras');
  caja(0.38, 0.05, 0.01, mat(0x9a9a9a, { metalness: 0.5 }), 0, 0.6, 0.122, 'Tele_Bocina');
  for (let i = 0; i < 2; i++) caja(0.03, 0.03, 0.02, mat(0x888888, { metalness: 0.6 }), 0.12 + i * 0.04, 0.6, 0.13, 'Perilla');
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.235), mat(0x050505));
  pantalla.position.set(0, 0.804, 0.1245); pantalla.name = 'Pantalla'; g.add(pantalla);

  // Consola (diseño propio): caja robusta negra con un orbe verde
  const consola = caja(0.33, 0.1, 0.29, mat(0x121214, { roughness: 0.4 }), 0, 0, 0, 'Consola');
  consola.position.set(-0.38, 0.05, 0.42); consola.rotation.y = 0.25;
  const tapa = caja(0.3, 0.012, 0.22, mat(0x1f3d17, { emissive: 0x0b2a05 }), 0, 0, 0, 'Consola_Tapa');
  tapa.position.set(-0.38, 0.106, 0.42); tapa.rotation.y = 0.25;
  const orbe = new THREE.Mesh(new THREE.SphereGeometry(0.035, 24, 16), mat(0x7cff3a, { emissive: 0x3cff10, emissiveIntensity: 1.6 }));
  orbe.scale.y = 0.45; orbe.position.set(-0.38, 0.115, 0.42); orbe.name = 'Consola_Orbe'; g.add(orbe);

  // Control con cable
  const control = new THREE.Group(); control.name = 'Control';
  const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.11, 6, 12), mat(0x1a1a1c, { roughness: 0.5 }));
  cuerpo.rotation.z = Math.PI / 2; control.add(cuerpo);
  for (const [x, c] of [[0.035, 0x7cff3a], [0.055, 0xff4a4a], [0.045, 0x4aa8ff]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), mat(c, { emissive: c, emissiveIntensity: 0.4 }));
    b.position.set(x, 0.03, x === 0.045 ? -0.01 : 0.008); control.add(b);
  }
  control.position.set(0.22, 0.035, 1.0); control.rotation.y = -0.4; g.add(control);
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.32, 0.03, 0.52), new THREE.Vector3(-0.2, 0.01, 0.75),
    new THREE.Vector3(0.28, 0.01, 0.8), new THREE.Vector3(0.2, 0.02, 0.95),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 40, 0.005, 6), mat(0x111111)));

  // Lámpara de piso
  caja(0.04, 1.2, 0.04, mat(0x333333, { metalness: 0.5 }), 1.15, 0.6, -0.25, 'Lampara_Poste');
  const pantallaLampara = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.22, 20, 1, true),
    mat(0xffd9a8, { emissive: 0xff9a40, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
  pantallaLampara.position.set(1.15, 1.28, -0.25); g.add(pantallaLampara);

  // Juegos apilados en el piso
  for (let i = 0; i < 3; i++) {
    const j = caja(0.14, 0.018, 0.19, mat([0x2d7a1f, 0x7a1f4a, 0x1f4a7a][i]), 0, 0, 0, 'Juego');
    j.position.set(-0.9 + i * 0.01, 0.01 + i * 0.019, 0.9); j.rotation.y = i * 0.3;
  }

  escena.add(g);
  return pantalla;
}
