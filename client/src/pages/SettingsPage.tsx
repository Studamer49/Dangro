import { useSettingsStore } from "@/stores/settingsStore";
import { useAuthStore } from "@/stores/authStore";
import EditProfileForm from "@/components/profile/EditProfileForm";
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
      <div className="w-60 border-r border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-4 text-lg font-bold text-white">Settings</h2>
        <nav className="space-y-1">
          <SectionLink label="Account" />
          <SectionLink label="Appearance" />
          <SectionLink label="Chat" />
          <SectionLink label="Privacy" />
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          <section>
            <h3 className="mb-4 text-lg font-bold text-white">Account</h3>
            <div className="space-y-4">
              <div className="rounded-xl bg-gray-800 p-4">
                <p className="font-medium text-white">Email</p>
                <p className="mt-1 text-sm text-gray-300">{currentUser?.email ?? "—"}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Your email address is used to sign in and cannot be changed here.
                </p>
              </div>
              {currentUser ? (
                <EditProfileForm user={currentUser} />
              ) : (
                <p className="text-sm text-gray-400">Sign in to edit your profile.</p>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-lg font-bold text-white">Theme</h3>
            <div className="grid grid-cols-3 gap-3">
              {themes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => settings.setTheme(t.value)}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    settings.theme === t.value
                      ? "border-accent-500 bg-accent-600/10"
                      : "border-gray-700 bg-gray-800 hover:border-gray-600"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className={`h-4 w-4 rounded-full border-2 ${
                        settings.theme === t.value
                          ? "border-accent-500 bg-accent-500"
                          : "border-gray-600"
                      }`}
                    >
                      {settings.theme === t.value && (
                        <div className="flex h-full items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-white" />
                        </div>
                      )}
                    </div>
                    <span className="font-medium text-white">{t.label}</span>
                  </div>
                  <p className="text-xs text-gray-400">{t.description}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-lg font-bold text-white">Accent Color</h3>
            <div className="grid grid-cols-5 gap-3">
              {accents.map((a) => (
                <button
                  key={a.value}
                  onClick={() => settings.setAccentColor(a.value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                    settings.accentColor === a.value && !settings.customAccent
                      ? "border-accent-500 bg-accent-600/10"
                      : "border-gray-700 bg-gray-800 hover:border-gray-600"
                  }`}
                >
                  <div
                    className="h-8 w-8 rounded-full"
                    style={{ backgroundColor: accentSwatches[a.value] }}
                  />
                  <span className="text-xs text-gray-300">{a.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-gray-800 p-4">
              <input
                type="color"
                value={settings.customAccent || accentSwatches[settings.accentColor]}
                onChange={(e) => settings.setCustomAccent(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-gray-700 bg-gray-900"
              />
              <div>
                <p className="text-sm font-medium text-white">Custom accent</p>
                <p className="text-xs text-gray-400">
                  Pick any color to override the accent everywhere.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-lg font-bold text-white">Custom Colors</h3>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { key: "bg", label: "Background" },
                  { key: "surface", label: "Cards & overlays" },
                  { key: "border", label: "Borders" },
                  { key: "text", label: "Text" },
                ] as { key: keyof CustomColors; label: string }[]
              ).map(({ key, label }) => (
                <div key={key} className="rounded-xl bg-gray-800 p-4">
                  <p className="mb-2 text-sm font-medium text-white">{label}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.customColors[key] || "#000000"}
                      onChange={(e) => settings.setCustomColor(key, e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-lg border border-gray-700 bg-gray-900"
                    />
                    {settings.customColors[key] && (
                      <button
                        onClick={() => settings.setCustomColor(key, "")}
                        className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:text-white"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Leave unset to use the theme&apos;s {key}.
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-lg font-bold text-white">Text Size</h3>
            <div className="rounded-xl bg-gray-800 p-4">
              <div className="mb-3 flex gap-2">
                {fontPresets.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => settings.setBaseFontSize(p.value)}
                    className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                      settings.baseFontSize === p.value
                        ? "bg-accent-600 text-white"
                        : "bg-gray-900 text-gray-400 hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <Slider
                label={`Global size — ${settings.baseFontSize}px`}
                min={FONT_MIN}
                max={FONT_MAX}
                value={settings.baseFontSize}
                onChange={settings.setBaseFontSize}
              />
              <p className="mt-1 text-xs text-gray-500">
                Scales text across the entire website.
              </p>
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-lg font-bold text-white">Shapes</h3>
            <div className="rounded-xl bg-gray-800 p-4">
              <Slider
                label={`Corner radius — ${settings.radius}px`}
                min={4}
                max={28}
                value={settings.radius}
                onChange={settings.setRadius}
              />
              <p className="mt-1 text-xs text-gray-500">
                Controls how round buttons, cards, and input boxes are.
              </p>
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-lg font-bold text-white">Chat</h3>
            <div className="space-y-4">
              <div className="rounded-xl bg-gray-800 p-4">
                <p className="mb-3 text-sm font-medium text-gray-300">
                  Density
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {DENSITIES.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => settings.setChatDensity(d.value)}
                      className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                        settings.chatDensity === d.value
                          ? "border-accent-500 bg-accent-600/10 text-white"
                          : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
                      }`}
                    >
                      <span className="block font-medium">{d.label}</span>
                      <span className="block text-xs text-gray-500">{d.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <ToggleRow
                label="Animations"
                description="Enable smooth animations throughout the app"
                enabled={settings.animationsEnabled}
                onToggle={settings.toggleAnimations}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-lg font-bold text-white">Privacy</h3>
            <div className="space-y-4">
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

function SectionLink({ label }: { label: string }) {
  return (
    <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white">
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
      <p className="mb-1 text-sm font-medium text-gray-300">{label}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-[rgb(var(--accent-500-rgb))]"
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
    <div className="flex items-center justify-between rounded-xl bg-gray-800 p-4">
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          enabled ? "bg-accent-600" : "bg-gray-600"
        }`}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}