export const BRAND = "along 翻译";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="logo-mark" aria-hidden="true">
      <defs>
        <linearGradient id="logoG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#logoG)" />
      <path
        d="M14 13h16a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-3l-5 4v-4h-8a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4z"
        fill="#ffffff"
        opacity="0.96"
      />
      <circle cx="18" cy="21" r="1.7" fill="#6366f1" />
      <circle cx="23" cy="21" r="1.7" fill="#7c5cf0" />
      <circle cx="28" cy="21" r="1.7" fill="#a855f7" />
    </svg>
  );
}

/** Logo + tên thương hiệu. */
export function Brand({ size = 40 }: { size?: number }) {
  return (
    <div className="brand">
      <Logo size={size} />
      <span className="brand-name">
        along <b>翻译</b>
      </span>
    </div>
  );
}
