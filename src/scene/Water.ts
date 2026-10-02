import * as THREE from 'three';

/** Shared clock for every water surface. */
const uTime = { value: 0 };

export function tickWater(t: number): void {
  uTime.value = t;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec3 p = position;
    // Plane is in XY before being laid flat; z is "up" once rotated.
    p.z += sin(p.x * 7.0 + uTime * 1.6) * 0.012 + cos(p.y * 6.0 - uTime * 1.3) * 0.012;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform float uOpacity;
  uniform float uScale;
  varying vec2 vUv;
  varying vec3 vWorld;

  // Bright wobbly lines where a sum of drifting waves crosses zero: a cheap
  // caustic web that slowly swims around.
  float web(vec2 p, float t) {
    // Two wave pairs at odd angles so the cells don't line up with the axes.
    vec2 q = vec2(p.x * 0.92 - p.y * 0.39, p.x * 0.39 + p.y * 0.92);
    vec2 s = vec2(p.x * 0.57 + p.y * 0.82, -p.x * 0.82 + p.y * 0.57);
    float v = sin(q.x * 2.6 + t * 0.8) + sin(q.y * 2.3 - t * 0.6)
            + sin(s.x * 2.0 + t * 0.5) + sin(s.y * 2.2 - t * 0.7);
    return 1.0 - smoothstep(0.0, 0.5, abs(v));
  }

  void main() {
    vec2 p = vWorld.xz * uScale;
    float c1 = web(p, uTime);
    float c2 = web(p * 1.6 + vec2(3.1, 1.7), uTime * 1.25);
    vec2 d = (vUv - 0.5) * 2.0;
    float r = length(d);
    vec3 col = mix(uShallow, uDeep, smoothstep(0.1, 0.9, 1.0 - r));
    col += vec3(0.75, 0.85, 0.95) * (c1 * 0.55 + c2 * 0.35);
    float ang = atan(d.y, d.x);
    float foamEdge = 0.84 + sin(ang * 9.0 + uTime * 1.4) * 0.025 + sin(ang * 17.0 - uTime * 2.1) * 0.015;
    float foam = smoothstep(foamEdge, foamEdge + 0.08, r);
    float foamLine = smoothstep(foamEdge - 0.06, foamEdge - 0.03, r) * (1.0 - smoothstep(foamEdge - 0.03, foamEdge, r));
    col = mix(col, vec3(1.0), clamp(foam * 0.95 + foamLine * 0.5, 0.0, 1.0));
    float alpha = mix(uOpacity, 1.0, foam);
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Stylised shallow water: caustic highlights, gentle swell, foam at the rim.
 * Colors are given as sRGB hex and converted to linear for the composer.
 */
export function createWaterMaterial(shallow: number, deep: number, opacity = 0.9, scale = 2.4): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uOpacity: { value: opacity },
      uScale: { value: scale },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
}
