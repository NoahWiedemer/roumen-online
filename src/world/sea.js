// Large animated sea surface with depth colouring and shoreline foam (samples the terrain heightmap)
import * as THREE from 'three';
import { tex } from '../core/textures.js';
import { SEA_LEVEL } from './layout.js';

export function createSea(terrain, sunDir) {
  const size = 1400;
  const g = new THREE.PlaneGeometry(size, size, 1, 1);
  g.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    depthWrite: false,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uNormal: { value: tex('waterNormal') },
      uHeights: { value: terrain.heightTexture() },
      uWorld: { value: terrain.size },
      uDeep: { value: new THREE.Color('#1f6fae') },
      uMid: { value: new THREE.Color('#2f9fd0') },
      uShallow: { value: new THREE.Color('#7fe0e6') },
      uSun: { value: sunDir.clone().normalize() },
    },
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime, uWorld; uniform sampler2D uNormal, uHeights; uniform vec3 uDeep, uMid, uShallow, uSun; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        vec2 huv = (vW.xz + uWorld * 0.5) / uWorld;
        float ground = (huv.x < 0.0 || huv.y < 0.0 || huv.x > 1.0 || huv.y > 1.0) ? -12.0 : texture2D(uHeights, huv).r;
        float depth = vW.y - ground;
        if (depth < 0.0) discard;
        vec2 p = vW.xz * 0.08;
        vec3 n1 = texture2D(uNormal, p + vec2(uTime*0.02, uTime*0.013)).xyz*2.0-1.0;
        vec3 n2 = texture2D(uNormal, p*1.9 - vec2(uTime*0.017, -uTime*0.021)).xyz*2.0-1.0;
        vec3 n = normalize(vec3(n1.x+n2.x, 3.2, n1.y+n2.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col = mix(uShallow, uMid, smoothstep(0.2, 2.5, depth));
        col = mix(col, uDeep, smoothstep(2.5, 9.0, depth));
        vec3 H = normalize(uSun + V);
        float spec = pow(max(dot(n, H), 0.0), 160.0) * 2.2;
        col = mix(col, vec3(0.82,0.92,1.0), fres*0.45) + spec;
        // shoreline foam bands
        float foamLine = sin(depth * 9.0 - uTime * 1.6 + n.x * 3.0) * 0.5 + 0.5;
        float foam = (1.0 - smoothstep(0.0, 0.7, depth)) * (0.55 + 0.45 * foamLine);
        foam += smoothstep(0.35, 0.0, depth) * 0.6;
        col = mix(col, vec3(0.97, 0.99, 1.0), clamp(foam, 0.0, 1.0) * 0.85);
        float alpha = mix(0.55, 0.92, smoothstep(0.0, 3.0, depth));
        alpha = max(alpha, clamp(foam, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.y = SEA_LEVEL;
  mesh.renderOrder = 1;
  mesh.name = 'sea';
  return { mesh, update(t) { mat.uniforms.uTime.value = t; } };
}
