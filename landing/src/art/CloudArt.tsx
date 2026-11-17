import cloud from "@/assets/art/cloud.webp";

/**
 * The page for companies: a cloud, on a glow in the baby blue and the pink.
 * The cloud is Microsoft's Fluent Emoji (MIT), from @lobehub/fluent-emoji-3d.
 * Decoration only.
 */
export function CloudArt() {
  return (
    <div
      aria-hidden
      className="relative flex size-72 items-center justify-center"
    >
      <img
        src={cloud}
        alt=""
        width={256}
        height={256}
        className="relative w-64 drop-shadow-xl"
      />
    </div>
  );
}
