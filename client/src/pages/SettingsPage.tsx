import { useSettingsStore } from "@/stores/settingsStore";
import type { Theme, AccentColor, ChatDensity, FontSize } from "@/stores/settingsStore";

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

export default function SettingsPage() {
  const settings = useSettingsStore();

  return (
    <div className="flex h-full">
      <div className="w-60 border-r border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-4 text-lg font-bold text-white">Settings</h2>
        <nav className="space-y-1">
          <SectionLink label="Appearance" />
          <SectionLink label="Chat" />
          <SectionLink label="Privacy" />
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
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
                    settings.accentColor === a.value
                      ? "border-white/30 bg-white/5"
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
          </section>

          <section>
            <h3 className="mb-4 text-lg font-bold text-white">Chat</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Density
                </label>
                <div className="flex gap-2">
                  {(["comfortable", "compact"] as ChatDensity[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => settings.setChatDensity(d)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        settings.chatDensity === d
                          ? "bg-accent-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:text-white"
                      }`}
                    >
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Font Size
                </label>
                <div className="flex gap-2">
                  {(["small", "default", "large"] as FontSize[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => settings.setFontSize(s)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        settings.fontSize === s
                          ? "bg-accent-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:text-white"
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
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
