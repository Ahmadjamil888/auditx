export function LogoMark({ size = 32, fill = "#192837" }: { size?: number; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d={"M24 232 L112 24 L144 24 L232 232 L184 232 L128 92 L72 232 Z"} fill={fill} />
      <path d={"M96 168 L160 168 L180 216 L76 216 Z"} fill={fill} opacity={0.55} />
    </svg>
  );
}

export function Logo({ fill = "#192837" }: { fill?: string }) {
  return (
    <span className="flex items-center gap-2" style={{ color: fill }}>
      <LogoMark fill={fill} />
      <span className="text-lg font-semibold lowercase tracking-tight">auditx</span>
    </span>
  );
}
