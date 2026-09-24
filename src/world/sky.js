// Sky dome with gradient + sun glow, drifting cloud billboards and a distant mountain ring
import * as THREE from 'three';
import { tex } from '../core/textures.js';
import { mulberry32, makeFbm } from '../core/utils.js';

export class Sky {
  constructor(scene, sunDir) {
    this.group = new THREE.Group();
    this.group.name = 'sky';
    scene.add(this.group);

    const skyGeo = new THREE.SphereGeometry(900, 48, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#3f8fe6') },
        mid: { value: new THREE.Color('#8cc4f5') },
        horizon: { value: new THREE.Color('#dff0ff') },
        sunDir: { value: sunDir.clone().normalize() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top, mid, horizon, sunDir; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.75, h));
          float s = max(dot(vDir, sunDir), 0.0);
          c += vec3(1.0, 0.92, 0.7) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.25);
          c = mix(c, horizon * 0.95, smoothstep(0.0, -0.25, h));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(skyGeo, skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // clouds
    const rng = mulberry32(99);
    const cloudTex = tex('cloud');
    this.clouds = [];
    for (let i = 0; i < 28; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.75 + rng() * 0.25 });
      const s = new THREE.Sprite(m);
      const a = rng() * Math.PI * 2, r = 380 + rng() * 280;
      s.position.set(Math.cos(a) * r, 110 + rng() * 120, Math.sin(a) * r);
      const sc = 160 + rng() * 180;
      s.scale.set(sc, sc * 0.5, 1);
      s.userData.speed = 1.5 + rng() * 2;
      this.group.add(s);
      this.clouds.push(s);
    }

    // distant mountain ring for depth
    const fb = makeFbm(4321, 4);
    const seg = 160;
    const ring = new THREE.CylinderGeometry(560, 560, 1, seg, 6, true);
    const pos = ring.attributes.position;
    const colors = [];
    const near = new THREE.Color('#6f9a8a'), far = new THREE.Color('#9fbfd6'), snow = new THREE.Color('#e8f0f8');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), yN = pos.getY(i) + 0.5; // 0..1
      const a = Math.atan2(z, x);
      const hgt = 60 + fb(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5) * 170;
      pos.setY(i, -20 + yN * hgt);
      const c = far.clone().lerp(near, 1 - yN * 0.8);
      if (yN > 0.85 && hgt > 150) c.lerp(snow, 0.6);
      colors.push(c.r, c.g, c.b);
    }
    ring.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    ring.computeVertexNormals();
    const ringMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, transparent: true, opacity: 0.95 });
    this.mountains = new THREE.Mesh(ring, ringMat);
    this.group.add(this.mountains);
  }

  update(dt, camPos) {
    this.group.position.set(camPos.x, 0, camPos.z);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 700) c.position.x -= 1400;
    }
  }
}
