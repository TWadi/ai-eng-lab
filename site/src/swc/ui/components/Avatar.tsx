import type { Profile } from "../../../bsw/supabase";

interface Props {
  readonly member: Profile | undefined;
  readonly size?: number;
  readonly color?: string;
}

/** Round avatar with a thick colored ring; falls back to initials. */
export function Avatar({ member, size = 40, color }: Props) {
  const name = member?.display_name || member?.github_username || "?";
  const style = { width: size, height: size, ["--ring" as string]: color ?? "var(--edge)" };
  return member?.avatar_url ? (
    <img className="avatar" src={member.avatar_url} alt="" width={size} height={size} style={style} />
  ) : (
    <span className="avatar avatar-initials" style={{ ...style, fontSize: size * 0.4 }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
