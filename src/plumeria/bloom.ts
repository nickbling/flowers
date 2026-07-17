export type Bloom = {
  petal: (i: number) => string;
  fade: string;
  openTag: string;
  closeTag: string;
};

// Staggering preserves contact-shadow order while the petals open.
const delayOf = (i: number) => 30 + i * 60;

export const still: Bloom = {
  petal: () => "",
  fade: "",
  openTag: "",
  closeTag: "",
};

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

  return {
    petal: (i) =>
      ` data-petal="${i}" style="${origin};--nbf-d:${delayOf(i)}ms"`,
    fade: ` data-fade="" style="--nbf-d:${delayOf(petals - 1)}ms"`,
    openTag: `<g data-corolla="" style="${origin}">`,
    closeTag: "</g>",
  };
}
