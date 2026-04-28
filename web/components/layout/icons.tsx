import React from "react";

type IconProps = { className?: string };

function Svg({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconSparkles({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 2l1.2 4.2L17 7.4l-3.8 1.2L12 12l-1.2-3.4L7 7.4l3.8-1.2L12 2Z" />
      <path d="M19 14l.8 2.7L22 17.5l-2.2.8L19 21l-.8-2.7L16 17.5l2.2-.8L19 14Z" />
    </Svg>
  );
}

export function IconGrid({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    </Svg>
  );
}

export function IconCalendarCheck({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="m9 14 2 2 4-4" />
    </Svg>
  );
}

export function IconClipboardList({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 4h6" />
      <path d="M9 2h6" />
      <rect x="4" y="4" width="16" height="18" rx="2" />
      <path d="m8 11 2 2 4-4" />
      <path d="M8 17h8" />
    </Svg>
  );
}

export function IconWallet({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
      <path d="M17 11h6v6h-6a3 3 0 0 1 0-6Z" />
      <path d="M20 7l-2-2H4v4" />
    </Svg>
  );
}

export function IconBarChart({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 20V10" />
      <path d="M6 20V4" />
      <path d="M18 20V14" />
      <path d="M3 20h18" />
    </Svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-1.7 2.9-.1-.1a1.8 1.8 0 0 0-2.2-.6 1.8 1.8 0 0 0-1 1.9V23H10v-.7a1.8 1.8 0 0 0-1-1.9 1.8 1.8 0 0 0-2.2.6l-.1.1-1.7-2.9.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.7-1H2V9h.7a1.8 1.8 0 0 0 1.7-1 1.8 1.8 0 0 0-.4-2l-.1-.1 1.7-2.9.1.1a1.8 1.8 0 0 0 2.2.6 1.8 1.8 0 0 0 1-1.9V1h4v.7a1.8 1.8 0 0 0 1 1.9 1.8 1.8 0 0 0 2.2-.6l.1-.1 1.7 2.9-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.7 1H22v5h-.7a1.8 1.8 0 0 0-1.9 1Z" />
    </Svg>
  );
}

export function IconBell({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  );
}

export function IconSun({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.9 4.9l1.4 1.4" />
      <path d="M17.7 17.7l1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.9 19.1l1.4-1.4" />
      <path d="M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function IconMoon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M21 12.6A8.5 8.5 0 0 1 11.4 3a7 7 0 1 0 9.6 9.6Z" />
    </Svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

export function IconLogOut({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 3h-8a2 2 0 0 0-2 2v4" />
      <path d="M21 21h-8a2 2 0 0 1-2-2v-4" />
    </Svg>
  );
}

