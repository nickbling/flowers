type Attributes = Readonly<Record<string, number | string>>;

export type Bloom = Readonly<{
  corolla: Attributes;
  fade: Attributes;
  petal(index: number): Attributes;
}>;

const delay = (index: number) => 30 + index * 60;
const EMPTY = Object.freeze({});

export const still: Bloom = Object.freeze({
  corolla: EMPTY,
  fade: EMPTY,
  petal: () => EMPTY,
});

export const BLOOM_CSS =
  "@keyframes nbf-petal{from{opacity:0;transform:scale(.93)}45%{opacity:1}to{opacity:1;transform:none}}" +
  "@keyframes nbf-swirl{from{transform:rotate(-6deg)}to{transform:none}}" +
  "@keyframes nbf-fade{from{opacity:0}to{opacity:1}}" +
  "[data-petal]{animation:nbf-petal .7s cubic-bezier(.3,.8,.35,1) both;animation-delay:var(--nbf-d)}" +
  "[data-corolla]{animation:nbf-swirl .95s cubic-bezier(.25,.8,.3,1) both}" +
  "[data-fade]{animation:nbf-fade .4s ease-out both;animation-delay:var(--nbf-d)}" +
  "@media (prefers-reduced-motion:reduce){[data-petal],[data-corolla],[data-fade]{animation:none}}";

export function bloom(center: number, cy: number, petals: number): Bloom {
  const origin = `transform-origin:${center}px ${cy}px`;
  return Object.freeze({
    corolla: Object.freeze({ "data-corolla": "", style: origin }),
    fade: Object.freeze({
      "data-fade": "",
      style: `--nbf-d:${delay(petals - 1)}ms`,
    }),
    petal: (index: number) =>
      Object.freeze({
        "data-petal": index,
        style: `${origin};--nbf-d:${delay(index)}ms`,
      }),
  });
}
