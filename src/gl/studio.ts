import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  HalfFloatType,
  HemisphereLight,
  Mesh,
  OrthographicCamera,
  PMREMGenerator,
  RawShaderMaterial,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import type { FlowerBounds, Point3 } from "@/src/core/model";

export const STUDIO_LIGHT = Object.freeze({
  bounceIntensity: 0.2,
  faceFillIntensity: 0.38,
  hemisphereIntensity: 0.5,
  keyAperture: 0.72,
  keyIntensity: 1.59,
  rimIntensity: 0.12,
  skyIntensity: 0.72,
  skyShadowIntensity: 0.3,
});

const QUAD_VERTEX = `
precision highp float;
attribute vec3 position;
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const ACCUMULATE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D prevTex;
uniform sampler2D frameTex;
uniform float weight;
void main() {
  gl_FragColor = mix(texture2D(prevTex, vUv), texture2D(frameTex, vUv), weight);
}`;

const PRESENT_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D accTex;
uniform float exposure;
uniform float saturation;
uniform float knee;
void main() {
  vec4 acc = texture2D(accTex, vUv);
  vec3 c = acc.a > 1e-4 ? acc.rgb / acc.a : vec3(0.0);
  c *= exposure;
  // Preserve contrast below the HDR shoulder.
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // GLSL ES 1.0 has no tanh.
  float x = (L - knee) / (1.0 - knee);
  float e = exp(2.0 * x);
  float Ls = L <= knee ? L : knee + (1.0 - knee) * (e - 1.0) / (e + 1.0);
  c *= L > 1e-5 ? Ls / L : 1.0;
  // Compress out-of-gamut chroma without normalizing highlights.
  float peak = max(c.r, max(c.g, c.b));
  if (peak > 1.0) {
    float mappedLuma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float chromaScale = max(0.0, (1.0 - mappedLuma) / (peak - mappedLuma));
    c = vec3(mappedLuma) + (c - vec3(mappedLuma)) * chromaScale;
  }
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, saturation);
  c = clamp(c, 0.0, 1.0);
  gl_FragColor = vec4(c * acc.a, acc.a);
}`;

export const PLUMERIA_GL_RENDER_CONTRACT = Object.freeze({
  accumulationFragment: ACCUMULATE_FRAGMENT,
  environment: Object.freeze({
    cool: Object.freeze([0xdf, 0xe6, 0xf2] as const),
    height: 64,
    warm: Object.freeze([0xf2, 0xdf, 0xc8] as const),
    width: 4,
  }),
  jitterNamespace: "studio",
  pixelCeiling: 1536,
  pixelScale: 2,
  presentation: Object.freeze({
    knee: 0.9,
    luminousExposure: 1.45,
    luminousSaturation: 1.11,
    softExposure: 1.34,
    softSaturation: 1.1,
  }),
  presentationFragment: PRESENT_FRAGMENT,
  quad: Object.freeze([-1, -1, 0, 3, -1, 0, -1, 3, 0] as const),
  quadVertex: QUAD_VERTEX,
  sampledLights: Object.freeze({
    bounceColor: "#fffaf5",
    bounceDistance: 3,
    shadowExtent: 1.7,
    shadowFar: 8,
    shadowMapSize: 1024,
    shadowNear: 0.5,
    shadowNormalBias: 0.022,
    skyColor: "#dfe6f2",
    skyDistance: 3.2,
  }),
});

export const BOTANICAL_STUDIO_SAMPLES = 4;

export type BotanicalStudio = Readonly<{
  sample(random: () => number): void;
}>;

export type BotanicalPresentation = Readonly<{
  dispose(): void;
  present(scene: Scene, camera: Camera): void;
}>;

type BotanicalStudioOptions = Readonly<{
  bounds: FlowerBounds;
  keyLight: Point3;
  look: "luminous" | "soft";
  scene: Scene;
}>;

function perpendicularBasis(axis: Vector3): readonly [Vector3, Vector3] {
  const reference =
    Math.abs(axis.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const first = new Vector3().crossVectors(reference, axis).normalize();
  return [first, new Vector3().crossVectors(axis, first).normalize()];
}

function cosineHemisphere(
  axis: Vector3,
  first: number,
  second: number
): Vector3 {
  const radius = Math.sqrt(first);
  const angle = 2 * Math.PI * second;
  const [tangent, bitangent] = perpendicularBasis(axis);
  return new Vector3()
    .addScaledVector(tangent, radius * Math.cos(angle))
    .addScaledVector(bitangent, radius * Math.sin(angle))
    .addScaledVector(axis, Math.sqrt(1 - first));
}

export function createBotanicalStudio({
  bounds,
  keyLight,
  look,
  scene,
}: BotanicalStudioOptions): BotanicalStudio {
  const { maximum, minimum } = bounds;
  const center = new Vector3(
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2
  );
  const spans = new Vector3(
    maximum[0] - minimum[0],
    maximum[1] - minimum[1],
    maximum[2] - minimum[2]
  );
  const extent = Math.max(spans.x, spans.y, spans.z);
  const luminous = look === "luminous";
  const direction = new Vector3(...keyLight).normalize();
  const keyDistance = 2.7 * extent;
  const keyBase = center.clone().addScaledVector(direction, keyDistance);
  const key = new SpotLight(
    "#fffaf3",
    STUDIO_LIGHT.keyIntensity * (luminous ? 1.04 : 0.92),
    0,
    0.58,
    0.9,
    0
  );
  key.position.copy(keyBase);
  key.target.position.copy(center);
  key.castShadow = false;

  const hemisphere = new HemisphereLight(
    "#f5f8ff",
    "#fff2e8",
    STUDIO_LIGHT.hemisphereIntensity * (luminous ? 1.06 : 1)
  );
  const face = new DirectionalLight(
    "#fffdf9",
    STUDIO_LIGHT.faceFillIntensity * (luminous ? 1.15 : 1)
  );
  face.position.copy(center).add(new Vector3(0, 0, extent * 2.4));
  face.target.position.copy(center);
  const rim = new DirectionalLight(
    "#ffffff",
    STUDIO_LIGHT.rimIntensity * (luminous ? 1.25 : 1)
  );
  rim.position.copy(center).add(new Vector3(0, 0, -extent * 1.8));
  rim.target.position.copy(center);

  const sampled = PLUMERIA_GL_RENDER_CONTRACT.sampledLights;
  const sky = new DirectionalLight(
    sampled.skyColor,
    STUDIO_LIGHT.skyIntensity * (luminous ? 1.04 : 1)
  );
  sky.castShadow = true;
  sky.shadow.mapSize.set(sampled.shadowMapSize, sampled.shadowMapSize);
  const shadow = sky.shadow.camera;
  const shadowExtent = 0.55 * sampled.shadowExtent * extent;
  shadow.left = shadow.bottom = -shadowExtent;
  shadow.right = shadow.top = shadowExtent;
  shadow.near = sampled.shadowNear * extent;
  shadow.far = sampled.shadowFar * extent;
  shadow.updateProjectionMatrix();
  sky.shadow.normalBias = 0.003 * extent;
  sky.shadow.intensity = STUDIO_LIGHT.skyShadowIntensity;
  sky.target.position.copy(center);

  const bounce = new DirectionalLight(
    sampled.bounceColor,
    STUDIO_LIGHT.bounceIntensity * (luminous ? 1.06 : 1)
  );
  bounce.target.position.copy(center);

  const skyAxis = new Vector3(0, 0, 1);
  const bounceAxis = new Vector3(0, 0, -1);
  sky.position
    .copy(center)
    .addScaledVector(
      new Vector3(-0.24, 0.16, 1).normalize(),
      sampled.skyDistance * extent
    );
  bounce.position
    .copy(center)
    .addScaledVector(bounceAxis, sampled.bounceDistance * extent);
  scene.add(
    key,
    key.target,
    hemisphere,
    face,
    face.target,
    rim,
    rim.target,
    sky,
    sky.target,
    bounce,
    bounce.target
  );

  const keyAxis = center.clone().sub(keyBase).normalize();
  const [keyU, keyV] = perpendicularBasis(keyAxis);
  return Object.freeze({
    sample(random: () => number) {
      const radius = STUDIO_LIGHT.keyAperture * extent * Math.sqrt(random());
      const angle = 2 * Math.PI * random();
      key.position
        .copy(keyBase)
        .addScaledVector(keyU, radius * Math.cos(angle))
        .addScaledVector(keyV, radius * Math.sin(angle));
      sky.position
        .copy(center)
        .addScaledVector(
          cosineHemisphere(skyAxis, random(), random()),
          sampled.skyDistance * extent
        );
      bounce.position
        .copy(center)
        .addScaledVector(
          cosineHemisphere(bounceAxis, 0.35 * random(), random()),
          sampled.bounceDistance * extent
        );
    },
  });
}

export function createBotanicalEnvironment(
  renderer: WebGLRenderer
): WebGLRenderTarget {
  const { cool, height, warm, width } = PLUMERIA_GL_RENDER_CONTRACT.environment;
  const data = new Uint8Array(width * height * 4);
  for (const y of Array(height).keys()) {
    const progress = y / (height - 1);
    for (const x of Array(width).keys()) {
      const offset = 4 * (y * width + x);
      for (const channel of [0, 1, 2])
        data[offset + channel] = Math.round(
          warm[channel] + (cool[channel] - warm[channel]) * progress
        );
      data[offset + 3] = 255;
    }
  }
  const source = new DataTexture(data, width, height);
  source.colorSpace = SRGBColorSpace;
  source.mapping = EquirectangularReflectionMapping;
  source.needsUpdate = true;
  const generator = new PMREMGenerator(renderer);
  try {
    return generator.fromEquirectangular(source);
  } finally {
    source.dispose();
    generator.dispose();
  }
}

export function createBotanicalPresentation(
  renderer: WebGLRenderer,
  pixelSize: number,
  look: "luminous" | "soft"
): BotanicalPresentation {
  const frameTarget = new WebGLRenderTarget(pixelSize, pixelSize, {
    type: HalfFloatType,
  });
  const accumulationTargets = [
    new WebGLRenderTarget(pixelSize, pixelSize, {
      depthBuffer: false,
      type: HalfFloatType,
    }),
    new WebGLRenderTarget(pixelSize, pixelSize, {
      depthBuffer: false,
      type: HalfFloatType,
    }),
  ] as const;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(PLUMERIA_GL_RENDER_CONTRACT.quad), 3)
  );
  const accumulationMaterial = new RawShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fragmentShader: PLUMERIA_GL_RENDER_CONTRACT.accumulationFragment,
    uniforms: {
      frameTex: { value: null },
      prevTex: { value: null },
      weight: { value: 1 },
    },
    vertexShader: PLUMERIA_GL_RENDER_CONTRACT.quadVertex,
  });
  const presentation = PLUMERIA_GL_RENDER_CONTRACT.presentation;
  const presentationMaterial = new RawShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fragmentShader: PLUMERIA_GL_RENDER_CONTRACT.presentationFragment,
    uniforms: {
      accTex: { value: null },
      exposure: {
        value:
          look === "luminous"
            ? presentation.luminousExposure
            : presentation.softExposure,
      },
      knee: { value: presentation.knee },
      saturation: {
        value:
          look === "luminous"
            ? presentation.luminousSaturation
            : presentation.softSaturation,
      },
    },
    vertexShader: PLUMERIA_GL_RENDER_CONTRACT.quadVertex,
  });
  const accumulationScene = new Scene();
  accumulationScene.add(new Mesh(geometry, accumulationMaterial));
  const presentationScene = new Scene();
  presentationScene.add(new Mesh(geometry, presentationMaterial));
  const camera = new OrthographicCamera();
  let current = 0;
  let frame = 0;
  let disposed = false;

  for (const target of accumulationTargets) {
    renderer.setRenderTarget(target);
    renderer.clear();
  }
  renderer.setRenderTarget(null);

  return Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      frameTarget.dispose();
      for (const target of accumulationTargets) target.dispose();
      accumulationMaterial.dispose();
      presentationMaterial.dispose();
      geometry.dispose();
      accumulationScene.clear();
      presentationScene.clear();
    },
    present(scene: Scene, sceneCamera: Camera) {
      if (disposed) throw new Error("botanical presentation is disposed");
      const previous = accumulationTargets[current];
      const nextIndex = current === 0 ? 1 : 0;
      const next = accumulationTargets[nextIndex];
      renderer.setRenderTarget(frameTarget);
      renderer.render(scene, sceneCamera);
      accumulationMaterial.uniforms.prevTex.value = previous.texture;
      accumulationMaterial.uniforms.frameTex.value = frameTarget.texture;
      accumulationMaterial.uniforms.weight.value = 1 / (frame + 1);
      renderer.setRenderTarget(next);
      renderer.render(accumulationScene, camera);
      presentationMaterial.uniforms.accTex.value = next.texture;
      renderer.setRenderTarget(null);
      renderer.render(presentationScene, camera);
      current = nextIndex;
      frame += 1;
    },
  });
}
