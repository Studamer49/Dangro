import { useSettingsStore } from "@/stores/settingsStore";
import { useAuthStore } from "@/stores/authStore";
import EditProfileForm from "@/components/profile/EditProfileForm";
import EmailVerificationCard from "@/components/account/EmailVerificationCard";
import ChangePasswordCard from "@/components/account/ChangePasswordCard";
import ChangeEmailCard from "@/components/account/ChangeEmailCard";
import type {
  Theme,
  AccentColor,
  ChatDensity,
  CustomColors,
} from "@/stores/settingsStore";

const themes: { value: Theme; label: string; description: string }[] = [
  { value: "dark", label: "Dark", description: "Easy on the eyes" },
  { value: "light", label: "Light", description: "Bright and clean" },
  { value: "amoled", label: "AMOLED", description: "True black, saves battery" },
];

const accents: { value: AccentColor; label: string }[] = [
  { value: "indigo", label: "Indigo" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "pink", label: "Pink" },
  { value: "purple", label: "Purple" },
  { value: "cyan", label: "Cyan" },
  { value: "yellow", label: "Yellow" },
  { value: "teal", label: "Teal" },
];

const accentSwatches: Record<AccentColor, string> = {
  indigo: "#6366f1", blue: "#3b82f6", green: "#22c55e", red: "#ef4444",
  orange: "#f97316", pink: "#ec4899", purple: "#a855f7", cyan: "#06b6d4",
  yellow: "#eab308", teal: "#14b8a6",
};

const DENSITIES: { value: ChatDensity; label: string; description: string }[] = [
  { value: "cozy", label: "Cozy", description: "Extra breathing room" },
  { value: "comfortable", label: "Comfortable", description: "Balanced spacing" },
  { value: "compact", label: "Compact", description: "More messages on screen" },
];

const fontPresets = [
  { label: "Small", value: 14 },
  { label: "Default", value: 16 },
  { label: "Large", value: 18 },
];

const FONT_MIN = 13;
const FONT_MAX = 20;

export default function SettingsPage() {
  const settings = useSettingsStore();
  const currentUser = useAuthStore((s) => s.user);

  return (
    <div className="flex h-full">
      <div className="glass w-60 shrink-0 overflow-y-auto border-r p-4">
        <h2 className="mb-4 text-base font-semibold tracking-tight text-white">Settings</h2>
        <nav className="space-y-1">
          <SectionLink label="Account" target="settings-account" />
          <SectionLink label="Appearance" target="settings-appearance" />
          <SectionLink label="Chat" target="settings-chat" />
          <SectionLink label="Privacy" target="settings-privacy" />
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <section id="settings-account" className="glass-panel scroll-mt-6 rounded-2xl p-6 animate-fade-up">
            <h3 className="eyebrow">Account</h3>
            <div className="mt-4 space-y-4">
              {/* Verification first: an unconfirmed address is the one thing
                  here that blocks the others working at all. */}
              {currentUser ? (
                <EmailVerificationCard />
              ) : (
                <p className="text-sm text-gray-400">Sign in to manage your account.</p>
              )}

              {currentUser && <ChangeEmailCard currentEmail={currentUser.email} />}

              {currentUser ? (
                <ChangePasswordCard />
              ) : (
                <p className="text-sm text-gray-400">Sign in to change your password.</p>
              )}

              <div className="glass-card rounded-2xl p-4">
                <p className="text-sm font-semibold tracking-tight text-white">Profile</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  Your username, bio, avatar and banner.
                </p>
                {currentUser ? (
                  <div className="mt-4">
                    <EditProfileForm user={currentUser} />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-400">Sign in to edit your profile.</p>
                )}
              </div>
            </div>
          </section>

          <section id="settings-appearance" className="glass-panel scroll-mt-6 rounded-2xl p-6 animate-fade-up">
            <h3 className="eyebrow">Theme</h3>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {themes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => settings.setTheme(t.value)}
                  aria-pressed={settings.theme === t.value}
                  className={`glass-card rounded-2xl p-4 text-left transition-all duration-200 ease-out ${
                    settings.theme === t.value ? "row-active" : "hover:shadow-elev2"
                  }`}
                >
                  <div className="mb-3 flex items-center gap-2.5">
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                        settings.theme === t.value
                          ? "border-accent-400 bg-accent-400 shadow-glow"
                          : "border-gray-600"
                      }`}
                    >
                      {settings.theme === t.value && (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="text-sm font-semibold tracking-tight text-white">
                      {t.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{t.description}</p>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <ToggleRow
                label="Glass effect"
                description="Frosted, translucent panels. Turn off for solid surfaces."
                enabled={settings.glassEffect}
                onToggle={settings.toggleGlassEffect}
              />
            </div>
          </section>

          <section className="glass-panel rounded-2xl p-6 animate-fade-up">
            <h3 className="eyebrow">Accent Color</h3>
            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {accents.map((a) => (
                <button
                  key={a.value}
                  onClick={() => settings.setAccentColor(a.value)}
                  aria-pressed={settings.accentColor === a.value && !settings.customAccent}
                  className={`glass-card flex flex-col items-center gap-2.5 rounded-2xl px-2 py-3.5 transition-all duration-200 ease-out ${
                    settings.accentColor === a.value && !settings.customAccent
                      ? "row-active"
                      : "hover:shadow-elev2"
                  }`}
                >
                  <div
                    className="h-8 w-8 rounded-full shadow-elev1"
                    style={{ backgroundColor: accentSwatches[a.value] }}
                  />
                  <span className="text-xs font-medium text-gray-300">{a.label}</span>
                </button>
              ))}
            </div>
            <div className="glass-card mt-4 flex items-center gap-4 rounded-2xl p-4">
              <input
                type="color"
                value={settings.customAccent || accentSwatches[settings.accentColor]}
                onChange={(e) => settings.setCustomAccent(e.target.value)}
                aria-label="Custom accent color"
                className="h-10 w-14 shrink-0 cursor-pointer rounded-xl border border-gray-700/70 bg-gray-900/50 p-1 transition-shadow duration-200 ease-out hover:shadow-glow"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight text-white">Custom accent</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Pick any color to override the accent everywhere.
                </p>
              </div>
            </div>
          </section>

          <section className="glass-panel rounded-2xl p-6 animate-fade-up">
            <h3 className="eyebrow">Custom Colors</h3>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  { key: "bg", label: "Background" },
                  { key: "surface", label: "Cards & overlays" },
                  { key: "border", label: "Borders" },
                  { key: "text", label: "Text" },
                ] as { key: keyof CustomColors; label: string }[]
              ).map(({ key, label }) => (
                <div key={key} className="glass-card rounded-2xl p-4">
                  <p className="mb-3 text-sm font-semibold tracking-tight text-white">{label}</p>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={settings.customColors[key] || "#000000"}
                      onChange={(e) => settings.setCustomColor(key, e.target.value)}
                      aria-label={`${label} color`}
                      className="h-10 w-14 shrink-0 cursor-pointer rounded-xl border border-gray-700/70 bg-gray-900/50 p-1 transition-shadow duration-200 ease-out hover:shadow-glow"
                    />
                    {settings.customColors[key] && (
                      <button
                        onClick={() => settings.setCustomColor(key, "")}
                        className="rounded-lg border border-gray-700/70 px-2.5 py-1.5 text-xs font-semibold text-gray-400 transition-all duration-200 ease-out hover:border-gray-600 hover:text-white"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    Leave unset to use the theme&apos;s {key}.
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-2xl p-6 animate-fade-up">
            <h3 className="eyebrow">Text Size</h3>
            <div className="glass-card mt-4 rounded-2xl p-5">
              <div className="segment">
                {fontPresets.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => settings.setBaseFontSize(p.value)}
                    data-active={settings.baseFontSize === p.value}
                    className="segment-item"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="mt-5">
                <Slider
                  label={`Global size — ${settings.baseFontSize}px`}
                  min={FONT_MIN}
                  max={FONT_MAX}
                  value={settings.baseFontSize}
                  onChange={settings.setBaseFontSize}
                />
              </div>
              <p className="mt-3 text-xs text-gray-500">Scales text across the entire website.</p>
            </div>
          </section>

          <section className="glass-panel rounded-2xl p-6 animate-fade-up">
            <h3 className="eyebrow">Shapes</h3>
            <div className="glass-card mt-4 rounded-2xl p-5">
              <Slider
                label={`Corner radius — ${settings.radius}px`}
                min={4}
                max={28}
                value={settings.radius}
                onChange={settings.setRadius}
              />
              <p className="mt-3 text-xs text-gray-500">
                Controls how round buttons, cards, and input boxes are.
              </p>
            </div>
          </section>

          <section id="settings-chat" className="glass-panel scroll-mt-6 rounded-2xl p-6 animate-fade-up">
            <h3 className="eyebrow">Chat</h3>
            <div className="mt-4 space-y-3">
              <div className="glass-card rounded-2xl p-5">
                <p className="mb-3 text-sm font-semibold tracking-tight text-white">Density</p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {DENSITIES.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => settings.setChatDensity(d.value)}
                      aria-pressed={settings.chatDensity === d.value}
                      className={`rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ease-out ${
                        settings.chatDensity === d.value
                          ? "row-active"
                          : "border-gray-700/60 text-gray-400 hover:border-gray-600 hover:text-white hover:shadow-elev2"
                      }`}
                    >
                      <span className="block text-sm font-semibold tracking-tight">{d.label}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{d.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <ToggleRow
                label="Stop animated avatars & banners"
                description="Freeze GIFs and videos used for avatars and banners"
                enabled={!settings.animateAvatars}
                onToggle={settings.toggleAnimateAvatars}
              />
              <ToggleRow
                label="Animations"
                description="Enable smooth animations throughout the app"
                enabled={settings.animationsEnabled}
                onToggle={settings.toggleAnimations}
              />
            </div>
          </section>

          <section id="settings-privacy" className="glass-panel scroll-mt-6 rounded-2xl p-6 animate-fade-up">
            <h3 className="eyebrow">Privacy</h3>
            <div className="mt-4 space-y-3">
              <ToggleRow
                label="Online Status"
                description="Show when you are online"
                enabled={settings.showOnlineStatus}
                onToggle={settings.toggleOnlineStatus}
              />
              <ToggleRow
                label="Notifications"
                description="Receive notification sounds and badges"
                enabled={settings.notificationsEnabled}
                onToggle={settings.toggleNotifications}
              />
              <ToggleRow
                label="Developer Mode"
                description="Enable developer tools and debug info"
                enabled={settings.developerMode}
                onToggle={settings.toggleDeveloperMode}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionLink({ label, target }: { label: string; target: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-400 transition-all duration-200 ease-out hover:bg-white/5 hover:text-white"
    >
      {label}
    </button>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="tabular mb-2.5 text-sm font-medium text-gray-300">{label}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-accent-500 hover:accent-accent-400"
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="glass-card flex items-center justify-between gap-4 rounded-2xl p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight text-white">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400">{description}</p>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-all duration-200 ease-out ${
          enabled ? "bg-accent-500 shadow-glow" : "bg-gray-700"
        }`}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-elev1 transition-transform duration-200 ease-out ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}