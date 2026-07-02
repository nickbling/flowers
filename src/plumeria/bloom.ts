// The bloom is presentation, not the flower, and the SVG is always a
// still: turning the animation on (`bloom: true`) only labels the joints.
// Each petal group carries a data attribute with its origin and delay, and
// the exported BLOOM_CSS, injected once anywhere a stylesheet lives, plays
// the entrance for every hooked flower on the page. Petals open in scale
// only (any per-petal rotation would open a dark sliver of backdrop between
// neighbours mid-flight); the rotary feel comes from one shared twist of
// the whole corolla. They climb the stack from the bottom up, petal 0
// first, each laid over the one before, and the hub fades in with the last
// petal as the corolla closes. A consumer who wants a different entrance
// overrides the nbf-* keyframes, or ignores BLOOM_CSS and drives the hooks
// with their own rules.

export type Bloom = {
  petal: (i: number) => string;
  fade: string;
  openTag: string;
  closeTag: string;
};

// Each petal enters 60ms after the one before, 30ms off the top, so the
// contact shadows and the closing wedge can ride their caster's delay.
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
    openTag: `<g data-corolla style="${origin}">`,
    closeTag: "</g>",
  };
}
