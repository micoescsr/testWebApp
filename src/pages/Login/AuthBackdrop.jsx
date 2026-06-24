/**
 * Shared animated backdrop for the auth screens (Login + 2FA).
 *
 * Keeps the existing dark-blue gradient identity and adds subtle, GPU-friendly
 * idle motion (gradient drift + slowly floating glow orbs + soft light sweep).
 * All animation is CSS-only and disabled under `prefers-reduced-motion`.
 *
 * `aria-hidden` because the layers are purely decorative.
 */
function AuthBackdrop() {
  return (
    <div className="login-backdrop" aria-hidden="true">
      <div className="login-glow login-glow--one" />
      <div className="login-glow login-glow--two" />
      <div className="login-sweep" />
    </div>
  );
}

export default AuthBackdrop;
