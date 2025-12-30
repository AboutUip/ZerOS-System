import { animate, createTimer, createTimeline, utils, engine, stagger } from '../../../../dist/modules/index.js';

import {
  Object3D,
  Vector3,
  Color,
  PerspectiveCamera,
  BoxGeometry,
  SphereGeometry,
  MeshPhongMaterial, // Changed from MeshBasicMaterial for light interaction
  InstancedMesh,
  AmbientLight,
  DirectionalLight,
  Scene,
  WebGLRenderer,
  Mesh,
  PCFSoftShadowMap,
  Matrix4,
  Euler,
  Quaternion,
  MathUtils,
} from '../../../node_modules/three/build/three.module.min.js';

const { random, cos, sin, sqrt, PI } = Math;

const $particlesContainer = document.querySelector('#particles-container');

const count = 2500;
const duration = 3000;
const colors = [new Color('#FF4B4B'), new Color('#9F3A39'), new Color('#CF4242')];

let containerRect = $particlesContainer.getBoundingClientRect();
let containerW = containerRect.width;
let containerH = containerRect.height;
let W = 20;
let H = 10;

const target = { x: 0, y: 0, r: W * .25 };

class InstancedMeshProxy {
  constructor(instancedMesh, initialIndex = 0) {
    this._mesh = instancedMesh;
    this._currentIndex = initialIndex;
    this._matrix = new Matrix4();
    this._position = new Vector3();
    this._rotation = new Euler();
    this._quaternion = new Quaternion();
    this._scale = new Vector3(1, 1, 1);
    this._dummyMatrix = new Matrix4();
    this.theta = utils.random(0, 1, 5) * PI * 2;
    this.radius = (W * .1) * sqrt(utils.random(0, 1, 5));
  }

  set index(value) {
    if (value < 0 || value >= this._mesh.count) {
      throw new Error(`Index ${value} is out of bounds for InstancedMesh with count ${this._mesh.count}`);
    }
    this._currentIndex = value;
    this._mesh.getMatrixAt(this._currentIndex, this._dummyMatrix);
    this._dummyMatrix.decompose(this._position, this._quaternion, this._scale);
    this._rotation.setFromQuaternion(this._quaternion);
  }

  get index() {
    return this._currentIndex;
  }

  set x(value) {
    this._position.x = value;
    this._updateMatrix();
  }

  set y(value) {
    this._position.y = value;
    this._updateMatrix();
  }

  set z(value) {
    this._position.z = value;
    this._updateMatrix();
  }

  get x() { return this._position.x; }
  get y() { return this._position.y; }
  get z() { return this._position.z; }

  set rotateX(value) {
    this._rotation.x = MathUtils.degToRad(value);
    this._updateMatrix();
  }

  set rotateY(value) {
    this._rotation.y = MathUtils.degToRad(value);
    this._updateMatrix();
  }

  set rotateZ(value) {
    this._rotation.z = MathUtils.degToRad(value);
    this._updateMatrix();
  }

  get rotateX() { return MathUtils.radToDeg(this._rotation.x); }
  get rotateY() { return MathUtils.radToDeg(this._rotation.y); }
  get rotateZ() { return MathUtils.radToDeg(this._rotation.z); }

  set scale(value) {
    this._scale.set(value, value, value);
    this._updateMatrix();
  }

  get scale() { return this._scale.x; }

  _updateMatrix() {
    this._quaternion.setFromEuler(this._rotation);
    this._matrix.compose(this._position, this._quaternion, this._scale);
    this._mesh.setMatrixAt(this._currentIndex, this._matrix);
    this._mesh.instanceMatrix.needsUpdate = true;
  }
}

const dummy = new Object3D();

const camera = new PerspectiveCamera(60, containerW / containerH, 1, 400);
camera.position.set(0, 0, -100);
camera.lookAt(0, 0, 0);

const geometry = new BoxGeometry(1, 1, 1);
const material = new MeshPhongMaterial({
  color: 0xffffff,
  shininess: 60,
  specular: 0x004488,
});

const mesh = new InstancedMesh(geometry, material, count);
mesh.castShadow = true;
mesh.receiveShadow = true;
const meshProxy = new InstancedMeshProxy(mesh);

const meshes = [];

for (let i = 0; i < count; i++) {
  meshes.push(new InstancedMeshProxy(mesh, i));
}

// Create ground plane to receive shadows
const groundGeometry = new BoxGeometry(200, 200, 1);
const groundMaterial = new MeshPhongMaterial({ color: 0x808080 });
const ground = new Mesh(groundGeometry, groundMaterial);
ground.rotation.x = Math.PI / 2;
ground.position.y = -50;
ground.receiveShadow = true;

const scene = new Scene();
scene.add(mesh);
scene.add(ground);

// Add lighting
const ambientLight = new AmbientLight(0x404040, 0.5);
scene.add(ambientLight);

// Add main directional light with shadow
const mainLight = new DirectionalLight(0xffffff, 1);
mainLight.position.set(50, 50, 50);
mainLight.castShadow = true;
mainLight.shadow.camera.near = 1;
mainLight.shadow.camera.far = 200;
mainLight.shadow.camera.left = -50;
mainLight.shadow.camera.right = 50;
mainLight.shadow.camera.top = 50;
mainLight.shadow.camera.bottom = -50;
mainLight.shadow.mapSize.width = 2048;
mainLight.shadow.mapSize.height = 2048;
mainLight.shadow.bias = -0.001;
scene.add(mainLight);

// Add fill light
const fillLight = new DirectionalLight(0x8080ff, 0.5);
fillLight.position.set(-50, 20, -50);
scene.add(fillLight);

const renderer = new WebGLRenderer({
  antialias: false, // Enabled antialiasing for better quality
  powerPreference: 'high-performance',
});

// renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(containerW, containerH);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

$particlesContainer.appendChild(renderer.domElement);

const renderLoop = createTimer({
  onUpdate: () => {
    renderer.render(scene, camera);
  },
  autoplay: false
});

const screenCoords = new Vector3();
const worldCoords = new Vector3();

// animate(meshes, {
//   x: () => utils.random(-100, 100),
//   y: () => utils.random(-100, 100),
//   z: () => utils.random(-100, 100),
//   rotateX: () => utils.random(-180, 180),
//   rotateY: () => utils.random(-180, 180),
//   rotateZ: () => utils.random(-180, 180),
//   scale: () => utils.random(1, 3, 2),
//   loop: true,
//   duration: 5000,
//   delay: stagger([0, count]),
//   onLoop: self => self.refresh().restart()
// })

const tl = createTimeline({
  defaults: {
    loop: true,
    ease: 'inOut(1.3)',
    onLoop: self => self.refresh(),
  },
});

tl.add(meshes, {
  x: m => target.x + (m.radius * cos(m.theta)),
  y: m => target.y + (m.radius * sin(m.theta)),
  duration: () => duration + utils.random(-100, 100),
  ease: 'inOut(1.5)',
  onLoop: self => {
    const t = self.targets[0];
    // t.theta = random() * PI * 2;
    // t.radius = target.r * sqrt(random());
    self.refresh();
  },
}, stagger((duration / count) * 1.125))
.add(target, {
  r: () => W * utils.random(.05, .5, 2),
  duration: 1250,
}, 0)
.add(target, {
  x: () => utils.random(-W * .1, W * .1),
  modifier: x => x + sin(tl.currentTime * .0007) * (W * .1),
  duration: 2800,
}, 0)
.add(target, {
  y: () => utils.random(-H * .1, H * .1),
  modifier: y => y + cos(tl.currentTime * .00012) * (H * .1),
  duration: 1800,
}, 0)
.add(target, {
  z: () => utils.random(-W * .1, W * .1),
  modifier: x => x + sin(tl.currentTime * .0007) * (W * .1),
  duration: 2800,
}, 0)

renderLoop.play();

function onResize() {
  containerRect = $particlesContainer.getBoundingClientRect();
  containerW = containerRect.width;
  containerH = containerRect.height;
  camera.aspect = containerW / containerH;
  camera.updateProjectionMatrix();
  renderer.setSize(containerW, containerH);
  screenCoords.set(2, 2, .5);
  screenCoords.unproject(camera);
  screenCoords.sub(camera.position).normalize();
  worldCoords.copy(camera.position).add(screenCoords.multiplyScalar(-camera.position.z / screenCoords.z));
  W = worldCoords.x;
  H = worldCoords.y;
}

onResize();

window.onresize = onResize;